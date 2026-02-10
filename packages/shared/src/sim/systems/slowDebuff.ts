/**
 * Slow Debuff System
 *
 * Applies and ticks movement speed debuffs on enemies.
 * Also manages dust clouds from Grave Dust node.
 *
 * Runs before enemySteeringSystem.
 */

import { hasComponent, addComponent, removeComponent, defineQuery } from 'bitecs'
import type { GameWorld } from '../world'
import { SlowDebuff, Speed, Enemy, Position, Health, Dead } from '../components'
import { forEachInRadius } from '../SpatialHash'

const slowedEntitiesQuery = defineQuery([Speed, SlowDebuff])

/**
 * Apply a slow debuff to a target entity.
 * If target already has a weaker slow, override. Refresh duration to max.
 */
export function applySlow(world: GameWorld, targetEid: number, multiplier: number, duration: number): void {
  if (!hasComponent(world, SlowDebuff, targetEid)) {
    addComponent(world, SlowDebuff, targetEid)
    SlowDebuff.multiplier[targetEid] = multiplier
    SlowDebuff.duration[targetEid] = duration
  } else {
    // Override if new slow is stronger (lower multiplier = more slow)
    if (multiplier < SlowDebuff.multiplier[targetEid]!) {
      SlowDebuff.multiplier[targetEid] = multiplier
    }
    // Refresh duration to max of existing and new
    SlowDebuff.duration[targetEid] = Math.max(SlowDebuff.duration[targetEid]!, duration)
  }
}

export function slowDebuffSystem(world: GameWorld, dt: number): void {
  // --- Tick dust clouds ---
  for (let i = world.dustClouds.length - 1; i >= 0; i--) {
    const cloud = world.dustClouds[i]!
    cloud.duration -= dt
    if (cloud.duration <= 0) {
      world.dustClouds.splice(i, 1)
      continue
    }

    // Apply slow to enemies inside cloud
    if (world.spatialHash) {
      forEachInRadius(world.spatialHash, cloud.x, cloud.y, cloud.radius, (eid) => {
        if (!hasComponent(world, Enemy, eid)) return
        if (!hasComponent(world, Health, eid)) return
        if (hasComponent(world, Dead, eid)) return

        const dx = Position.x[eid]! - cloud.x
        const dy = Position.y[eid]! - cloud.y
        if (dx * dx + dy * dy > cloud.radius * cloud.radius) return

        // Short duration so slow expires quickly when enemy leaves the cloud;
        // continuously re-applied each tick while enemy remains inside.
        applySlow(world, eid, cloud.slow, 0.1)
      })
    }
  }

  // --- Tick existing slow debuffs ---
  const slowedEntities = slowedEntitiesQuery(world)
  for (const eid of slowedEntities) {
    // Decrement duration
    SlowDebuff.duration[eid]! -= dt

    // Check if expired
    if (SlowDebuff.duration[eid]! <= 0) {
      removeComponent(world, SlowDebuff, eid)
      // Restore speed to max
      Speed.current[eid] = Speed.max[eid]!
    } else {
      // Apply slow multiplier
      Speed.current[eid] = Speed.max[eid]! * SlowDebuff.multiplier[eid]!
    }
  }
}
