/**
 * Dustdevil Zone System
 *
 * Ticks down lingering dust zones created by Dustdevil enemies.
 * Zones deal damage-over-time to grounded players standing inside them
 * and expire after their duration elapses.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { Player, Position, Collider, Health, Dead, Downed, Invincible, ZPosition } from '../components'
import { applyDamage } from './applyDamage'
import { JUMP_AIRBORNE_THRESHOLD } from '../content/jump'

const playerQuery = defineQuery([Player, Position, Health])

export function dustdevilZoneSystem(world: GameWorld, dt: number): void {
  const players = playerQuery(world)

  // Tick down each zone and apply damage
  for (let i = world.dustZones.length - 1; i >= 0; i--) {
    const zone = world.dustZones[i]!
    zone.remaining -= dt

    // Remove expired zones
    if (zone.remaining <= 0) {
      world.dustZones.splice(i, 1)
      continue
    }

    // Check each player for overlap
    for (const peid of players) {
      if (hasComponent(world, Dead, peid) || hasComponent(world, Downed, peid)) continue
      if (hasComponent(world, Invincible, peid)) continue
      if (Health.iframes[peid]! > 0) continue

      // Airborne players are safe (jumped over the zone)
      if (ZPosition.z[peid]! >= JUMP_AIRBORNE_THRESHOLD) continue

      const dx = Position.x[peid]! - zone.x
      const dy = Position.y[peid]! - zone.y
      const pr = Collider.radius[peid]!
      const dist2 = dx * dx + dy * dy
      const triggerDist = zone.radius + pr

      if (dist2 <= triggerDist * triggerDist) {
        applyDamage(world, peid, {
          amount: zone.dps * dt,
          setIframes: false,
        })
      }
    }
  }
}
