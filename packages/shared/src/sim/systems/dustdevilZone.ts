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
import { forEachAliveEnemyInRadius } from './damageHelpers'
import { JUMP_AIRBORNE_THRESHOLD } from '../content/jump'

/** Enemies take this fraction of the zone's DPS. */
export const ZONE_ENEMY_DPS_MUL = 0.5

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

    // Damage enemies inside the zone (friendly fire — including the caster).
    // Uses zone.radius without adding enemy collider radius (unlike the player
    // path above which uses zone.radius + pr). This is intentional: enemies
    // need to be center-within the zone to take damage, making zones slightly
    // less punishing to large enemies as an implicit tier advantage.
    const enemyDmg = zone.dps * ZONE_ENEMY_DPS_MUL * dt
    forEachAliveEnemyInRadius(world, zone.x, zone.y, zone.radius, (enemyEid) => {
      // Airborne enemies are safe
      if (hasComponent(world, ZPosition, enemyEid) && ZPosition.z[enemyEid]! >= JUMP_AIRBORNE_THRESHOLD) return
      applyDamage(world, enemyEid, { amount: enemyDmg, setIframes: false, ownerPlayerEid: null })
    })
  }
}
