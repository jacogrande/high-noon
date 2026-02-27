/**
 * Shared pre-apply damage modifier pipeline.
 *
 * Both the projectile path (bulletCollision.ts) and the hitscan path
 * (weapon.ts) apply the same set of damage transforms before calling
 * applyDamage(). This module canonicalizes the order so changes only
 * need to happen in one place.
 *
 * Canonical order:
 *   1. Friendly fire reduction
 *   2. FrontArmor reduction (projectile only — needs bullet velocity)
 *   3. Showdown bonus / pierce
 *   4. onBulletHit hook transforms / pierce
 *   5. Final Arrangement reduction
 */

import { hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { Player, Showdown, FrontArmor, Velocity } from '../components'
import { CollisionLayer, NO_TARGET } from '../prefabs'
import { clampDamage, FRIENDLY_FIRE_DAMAGE_SCALE } from '../damage'
import { getUpgradeStateForPlayer } from '../upgrade'

export interface DamageModifierParams {
  world: GameWorld
  baseDamage: number
  /** Real bullet EID (projectile) or virtual bullet ID (hitscan) */
  bulletId: number
  ownerEid: number
  targetEid: number
  isPlayerBullet: boolean
  /** Bullet layer for layer-based checks */
  bulletLayer: number
  /** Target layer for friendly fire detection */
  targetLayer: number
  /** Whether this is the authoritative server path (not local prediction) */
  authoritative: boolean
  /**
   * Supply real bullet EID to enable FrontArmor arc check (projectile path).
   * Omit for hitscan — hitscan rays have no Velocity component.
   */
  frontArmorBulletEid?: number
}

export interface DamageModifierResult {
  damage: number
  /** Showdown pierce: bullet owner has active Showdown but this target is not the marked target */
  showdownPierce: boolean
  /** Hook-requested pierce (onBulletHit returned pierce: true) */
  hookPierce: boolean
}

export function resolveDamageModifiers(params: DamageModifierParams): DamageModifierResult {
  const {
    world, ownerEid, targetEid, isPlayerBullet,
    bulletLayer, targetLayer, authoritative, bulletId,
  } = params
  let damage = params.baseDamage
  let showdownPierce = false
  let hookPierce = false

  // 1. Friendly fire damage reduction
  if (bulletLayer === CollisionLayer.PLAYER_BULLET &&
      targetLayer === CollisionLayer.PLAYER &&
      world.friendlyFireMode === 'reduced') {
    damage = clampDamage(damage * FRIENDLY_FIRE_DAMAGE_SCALE)
  }

  // 2. FrontArmor: reduce damage for frontal hits (projectile path only)
  if (params.frontArmorBulletEid !== undefined &&
      hasComponent(world, FrontArmor, targetEid) &&
      bulletLayer === CollisionLayer.PLAYER_BULLET) {
    const bEid = params.frontArmorBulletEid
    const bulletAngle = Math.atan2(Velocity.y[bEid]!, Velocity.x[bEid]!)
    const facingAngle = FrontArmor.facingAngle[targetEid]!
    // Bullet hits "from the front" when bullet direction ≈ opposite of facing
    let angleDiff = bulletAngle - (facingAngle + Math.PI)
    // Normalize to [-PI, PI]. +PI maps to -PI which is fine since
    // abs(-PI) > arcHalfAngle (PI/2) so armor won't trigger at the seam.
    angleDiff = ((angleDiff % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI
    if (Math.abs(angleDiff) <= FrontArmor.arcHalfAngle[targetEid]!) {
      damage = clampDamage(damage * FrontArmor.reductionMultiplier[targetEid]!)
    }
  }

  // 3. Showdown bonus / pierce
  const ownerHasShowdown =
    hasComponent(world, Showdown, ownerEid) && Showdown.active[ownerEid] === 1
  const showdownTarget = ownerHasShowdown ? Showdown.targetEid[ownerEid]! : NO_TARGET

  if (ownerHasShowdown && targetEid !== showdownTarget) {
    showdownPierce = true
  } else if (ownerHasShowdown && targetEid === showdownTarget) {
    const ownerState = getUpgradeStateForPlayer(world, ownerEid)
    damage = clampDamage(damage * ownerState.showdownDamageMultiplier)
  }

  // 4. onBulletHit hook transforms (server-authoritative only)
  if (authoritative && isPlayerBullet && world.hooks.hasHandlers('onBulletHit')) {
    const hookResult = world.hooks.fireBulletHit(world, bulletId, targetEid, damage)
    damage = hookResult.damage
    if (hookResult.pierce) {
      hookPierce = true
    }
  }

  // 5. Final Arrangement: 25% damage reduction when player is below 50% HP
  if (hasComponent(world, Player, targetEid) &&
      getUpgradeStateForPlayer(world, targetEid).finalArrangementActive) {
    damage = clampDamage(damage * 0.75)
  }

  return { damage, showdownPierce, hookPierce }
}
