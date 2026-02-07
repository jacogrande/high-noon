/**
 * Node Effect Definitions
 *
 * Maps skill node IDs to behavioral effect handlers (hooks).
 * These effects are registered when a node is taken and complement
 * the existing StatMod system for non-numeric effects.
 */

import type { GameWorld } from '../world'
import type { HookRegistry, BulletHitResult } from '../hooks'
import { Health, Bullet, Player, Position, Weapon, Cylinder } from '../components'
import { spawnBullet } from '../prefabs'

// ============================================================================
// Effect registration functions (one per behavioral node)
// ============================================================================

/**
 * Piercing Rounds — bullets pass through one additional enemy.
 * Uses the onBulletHit transform hook to set pierce = true on
 * the first non-showdown hit per bullet.
 *
 * Pierce count is tracked on world.hookPierceCount to avoid memory leaks
 * (cleaned up alongside bulletPierceHits when bullets are removed).
 */
function registerPiercingRounds(hooks: HookRegistry): void {
  hooks.register('onBulletHit', 'piercing_rounds', (
    world: GameWorld,
    bulletEid: number,
    _targetEid: number,
    damage: number,
  ): BulletHitResult => {
    const count = world.hookPierceCount.get(bulletEid) ?? 0
    if (count < 1) {
      world.hookPierceCount.set(bulletEid, count + 1)
      return { damage, pierce: true }
    }
    // Already pierced once — let bullet be removed
    world.hookPierceCount.delete(bulletEid)
    return { damage, pierce: false }
  })
}

/**
 * Judge, Jury & Executioner — last round in cylinder deals massive bonus damage.
 *
 * onBulletHit: if cylinder has 0 rounds after this shot, apply 2x damage bonus.
 */
const JJE_LAST_ROUND_BONUS = 2.0

function registerJJE(hooks: HookRegistry): void {
  hooks.register('onBulletHit', 'jje_last_round', (
    world: GameWorld,
    bulletEid: number,
    _targetEid: number,
    damage: number,
  ): BulletHitResult => {
    // Check if the bullet owner's cylinder is empty (this was the last round)
    const ownerId = Bullet.ownerId[bulletEid]!
    if (Cylinder.rounds[ownerId] === 0) {
      return { damage: Math.min(255, Math.round(damage * JJE_LAST_ROUND_BONUS)), pierce: false }
    }
    return { damage, pierce: false }
  }, 10) // higher priority = runs after pierce
}

/**
 * Second Wind — heal 1 HP when rolling through an enemy projectile.
 */
function registerSecondWind(hooks: HookRegistry): void {
  hooks.register('onRollDodge', 'second_wind', (
    world: GameWorld,
    playerEid: number,
    _dodgedBulletEid: number,
  ) => {
    const current = Health.current[playerEid]!
    const max = Health.max[playerEid]!
    if (current < max) {
      Health.current[playerEid] = Math.min(current + 1, max)
    }
  })
}

/**
 * Dead Man's Hand — emptying the cylinder triggers a 3-shot burst spread.
 */
const DEAD_MANS_HAND_COUNT = 3
const DEAD_MANS_HAND_SPREAD = Math.PI / 6 // 30° total spread

function registerDeadMansHand(hooks: HookRegistry): void {
  hooks.register('onCylinderEmpty', 'dead_mans_hand', (
    world: GameWorld,
    playerEid: number,
  ) => {
    const aimAngle = Player.aimAngle[playerEid]!
    // Offset spawn point forward along aim direction to avoid self-collision
    const spawnOffset = 6
    const x = Position.x[playerEid]! + Math.cos(aimAngle) * spawnOffset
    const y = Position.y[playerEid]! + Math.sin(aimAngle) * spawnOffset
    const bulletSpeed = Weapon.bulletSpeed[playerEid]!
    const bulletDamage = Weapon.bulletDamage[playerEid]!
    const bulletRange = Weapon.range[playerEid]!

    const halfSpread = DEAD_MANS_HAND_SPREAD / 2
    const step = DEAD_MANS_HAND_COUNT > 1
      ? DEAD_MANS_HAND_SPREAD / (DEAD_MANS_HAND_COUNT - 1)
      : 0

    for (let i = 0; i < DEAD_MANS_HAND_COUNT; i++) {
      const angle = aimAngle - halfSpread + step * i
      const vx = Math.cos(angle) * bulletSpeed
      const vy = Math.sin(angle) * bulletSpeed

      spawnBullet(world, {
        x,
        y,
        vx,
        vy,
        damage: bulletDamage,
        range: bulletRange,
        ownerId: playerEid,
      })
    }
  })
}

/**
 * Last Stand — at 1 HP, gain +50% damage and +20% speed for 5 seconds.
 * Uses timed buff pattern via onHealthChanged hook.
 */
const LAST_STAND_DURATION = 5.0 // seconds

function registerLastStand(hooks: HookRegistry): void {
  hooks.register('onHealthChanged', 'last_stand', (
    world: GameWorld,
    playerEid: number,
    oldHP: number,
    newHP: number,
  ) => {
    // Activate when dropping to 1 HP
    if (newHP === 1 && oldHP > 1) {
      world.upgradeState.lastStandActive = true
      world.upgradeState.lastStandTimer = LAST_STAND_DURATION
    }
    // Deactivate if healed above 1 HP
    if (newHP > 1 && world.upgradeState.lastStandActive) {
      world.upgradeState.lastStandActive = false
      world.upgradeState.lastStandTimer = 0
    }
  })
}

// ============================================================================
// Node Effect Registry
// ============================================================================

/** Map of node ID → registration function */
type EffectRegistrar = (hooks: HookRegistry) => void

const NODE_EFFECT_REGISTRY: Record<string, EffectRegistrar> = {
  piercing_rounds: registerPiercingRounds,
  judge_jury_executioner: registerJJE,
  second_wind: registerSecondWind,
  dead_mans_hand: registerDeadMansHand,
  last_stand: registerLastStand,
}

/**
 * Apply a node's behavioral effect (if any) by registering hooks.
 * Called from takeNode() after stat mods are applied.
 */
export function applyNodeEffect(world: GameWorld, nodeId: string): void {
  const registrar = NODE_EFFECT_REGISTRY[nodeId]
  if (registrar) {
    registrar(world.hooks)
  }
}

