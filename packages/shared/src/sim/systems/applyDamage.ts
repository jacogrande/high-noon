import { hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { Bullet, Health, Player } from '../components'
import { getUpgradeStateForPlayer } from '../upgrade'

export interface ApplyDamageOptions {
  amount: number
  attackerEid?: number
  ownerPlayerEid?: number | null
  setIframes?: boolean
  fireHealthChanged?: boolean
  trackAttribution?: boolean
  melee?: boolean
  clampToZero?: boolean
}

export interface DamageResult {
  oldHP: number
  newHP: number
  applied: number
  killed: boolean
}

function resolveOwnerPlayerEid(world: GameWorld, options: ApplyDamageOptions): number | null {
  if (options.ownerPlayerEid !== undefined) return options.ownerPlayerEid

  const attackerEid = options.attackerEid
  if (attackerEid === undefined) return null

  if (hasComponent(world, Player, attackerEid)) return attackerEid

  if (hasComponent(world, Bullet, attackerEid)) {
    const ownerEid = Bullet.ownerId[attackerEid]!
    if (ownerEid >= 0 && hasComponent(world, Player, ownerEid)) return ownerEid
  }

  return null
}

/**
 * Apply damage to a health-bearing entity and run shared side effects:
 * - optional i-frame refresh
 * - onHealthChanged hook for player targets
 * - kill-attribution tracking for non-player targets
 */
export function applyDamage(world: GameWorld, targetEid: number, options: ApplyDamageOptions): DamageResult {
  const oldHP = Health.current[targetEid]!
  const amount = Number.isFinite(options.amount) ? Math.max(0, options.amount) : 0

  if (oldHP <= 0 || amount <= 0) {
    return { oldHP, newHP: oldHP, applied: 0, killed: false }
  }

  // Tin Star Badge block chance — only for player targets damaged by enemies
  // (not hazard tiles, which have no attackerEid)
  if (hasComponent(world, Player, targetEid) && options.attackerEid !== undefined) {
    const us = getUpgradeStateForPlayer(world, targetEid)
    if (us.blockChance > 0 && world.rng.next() < us.blockChance) {
      return { oldHP, newHP: oldHP, applied: 0, killed: false }
    }
  }

  const unclampedNewHP = oldHP - amount
  const newHP = options.clampToZero ? Math.max(0, unclampedNewHP) : unclampedNewHP
  const applied = oldHP - newHP

  if (applied <= 0) {
    return { oldHP, newHP: oldHP, applied: 0, killed: false }
  }

  Health.current[targetEid] = newHP

  if (options.setIframes) {
    Health.iframes[targetEid] = Health.iframeDuration[targetEid]!
  }

  const targetIsPlayer = hasComponent(world, Player, targetEid)
  if (targetIsPlayer && options.fireHealthChanged !== false) {
    world.hooks.fireHealthChanged(world, targetEid, oldHP, newHP)
  } else if (!targetIsPlayer && options.trackAttribution !== false) {
    const ownerPlayerEid = resolveOwnerPlayerEid(world, options)
    world.lastDamageByEntity.set(targetEid, {
      ownerPlayerEid,
      wasMelee: ownerPlayerEid !== null && options.melee === true,
    })
  }

  return {
    oldHP,
    newHP,
    applied,
    killed: oldHP > 0 && newHP <= 0,
  }
}
