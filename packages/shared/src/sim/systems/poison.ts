/**
 * Poison System
 *
 * Applies damage-over-time to poisoned entities.
 * Poison bypasses i-frames (setIframes: false).
 * Runs before enemySteeringSystem.
 */

import { hasComponent, addComponent, removeComponent, defineQuery } from 'bitecs'
import type { GameWorld } from '../world'
import { Poison, Health } from '../components'
import { applyDamage } from './applyDamage'

const poisonedQuery = defineQuery([Poison, Health])

/**
 * Apply poison to a target entity.
 * If already poisoned: refresh duration to max, take stronger DPS.
 */
export function applyPoison(world: GameWorld, targetEid: number, dps: number, duration: number): void {
  if (!hasComponent(world, Poison, targetEid)) {
    addComponent(world, Poison, targetEid)
    Poison.dps[targetEid] = dps
    Poison.duration[targetEid] = duration
  } else {
    // Take stronger DPS
    if (dps > Poison.dps[targetEid]!) {
      Poison.dps[targetEid] = dps
    }
    // Refresh duration to max
    Poison.duration[targetEid] = Math.max(Poison.duration[targetEid]!, duration)
  }
}

export function poisonSystem(world: GameWorld, dt: number): void {
  const poisoned = poisonedQuery(world)

  for (const eid of poisoned) {
    // Apply DOT damage (bypasses i-frames)
    applyDamage(world, eid, {
      amount: Poison.dps[eid]! * dt,
      setIframes: false,
    })

    // Decrement duration
    Poison.duration[eid]! -= dt

    if (Poison.duration[eid]! <= 0) {
      removeComponent(world, Poison, eid)
    }
  }
}
