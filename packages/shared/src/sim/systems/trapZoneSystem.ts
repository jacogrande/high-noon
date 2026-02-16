/**
 * Trap Zone System
 *
 * Processes generic trap zones each tick:
 * - Bear traps: trigger on player proximity → damage + immobilize (zero-speed slow)
 * - Caltrops: continuous slow zone that expires over time
 *
 * Traps with `hp` can be destroyed by player bullets (checked in bulletCollision).
 * This system is boss-agnostic — any entity can push traps into world.trapZones.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { Player, Position, Collider, Health, Dead, Invincible, BossPhase } from '../components'
import { applySlow } from './slowDebuff'
import { applyDamage } from './applyDamage'

const playerQuery = defineQuery([Player, Position, Health])

export function trapZoneSystem(world: GameWorld, dt: number): void {
  // Clear per-tick detonation events
  world.trapDetonations.length = 0

  const players = playerQuery(world)

  for (let i = world.trapZones.length - 1; i >= 0; i--) {
    const trap = world.trapZones[i]!

    switch (trap.kind) {
      case 'bearTrap': {
        // Check if any player enters trigger radius
        let triggered = false
        for (const peid of players) {
          if (hasComponent(world, Dead, peid)) continue
          if (hasComponent(world, Invincible, peid)) continue
          if (Health.iframes[peid]! > 0) continue

          const dx = Position.x[peid]! - trap.x
          const dy = Position.y[peid]! - trap.y
          const pr = Collider.radius[peid]!
          const dist2 = dx * dx + dy * dy
          const triggerDist = trap.radius + pr
          if (dist2 > triggerDist * triggerDist) continue

          // Trap triggered!
          applyDamage(world, peid, {
            amount: trap.damage,
            attackerEid: trap.ownerEid,
            setIframes: true,
          })

          // Immobilize: apply a zero-speed slow for the immobilize duration
          if (trap.immobilizeDuration && trap.immobilizeDuration > 0) {
            applySlow(world, peid, 0.0, trap.immobilizeDuration)
          }

          // Store hit direction (trap center → player)
          const dist = Math.sqrt(dist2)
          if (dist > 0) {
            world.lastPlayerHitDir.set(peid, { x: dx / dist, y: dy / dist })
          }

          // Push detonation event for VFX
          world.trapDetonations.push({
            kind: 'bearTrap',
            x: trap.x,
            y: trap.y,
            radius: trap.radius,
          })

          triggered = true
          break // bear trap triggers once
        }

        if (triggered) {
          world.trapZones.splice(i, 1)
        }
        break
      }

      case 'caltrop': {
        // Tick down duration
        if (trap.duration !== undefined) {
          trap.duration -= dt
          if (trap.duration <= 0) {
            world.trapZones.splice(i, 1)
            continue
          }
        }

        // Apply slow to players inside radius (re-applied each tick)
        for (const peid of players) {
          if (hasComponent(world, Dead, peid)) continue

          const dx = Position.x[peid]! - trap.x
          const dy = Position.y[peid]! - trap.y
          const pr = Collider.radius[peid]!
          const dist2 = dx * dx + dy * dy
          const effectDist = trap.radius + pr
          if (dist2 > effectDist * effectDist) continue

          // Short-duration slow, continuously re-applied while in zone
          applySlow(world, peid, trap.slowMultiplier ?? 0.3, 0.15)
        }
        break
      }
    }
  }
}
