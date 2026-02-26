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
import { Player, Position, Collider, Health, Dead, Downed, Invincible, BossPhase } from '../components'
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
          if (hasComponent(world, Dead, peid) || hasComponent(world, Downed, peid)) continue
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
          if (hasComponent(world, Dead, peid) || hasComponent(world, Downed, peid)) continue

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

      case 'tripwire': {
        // Point-to-line-segment distance collision
        const x1 = trap.x
        const y1 = trap.y
        const x2 = trap.x2 ?? trap.x
        const y2 = trap.y2 ?? trap.y
        const wireThickness = trap.wireThickness ?? 6

        let triggered = false
        for (const peid of players) {
          if (hasComponent(world, Dead, peid) || hasComponent(world, Downed, peid)) continue
          if (hasComponent(world, Invincible, peid)) continue
          if (Health.iframes[peid]! > 0) continue

          const px = Position.x[peid]!
          const py = Position.y[peid]!
          const pr = Collider.radius[peid]!

          // Project player center onto line segment, clamp t to [0,1]
          const segDx = x2 - x1
          const segDy = y2 - y1
          const segLenSq = segDx * segDx + segDy * segDy
          let t = 0
          if (segLenSq > 0) {
            t = Math.max(0, Math.min(1, ((px - x1) * segDx + (py - y1) * segDy) / segLenSq))
          }
          const closestX = x1 + t * segDx
          const closestY = y1 + t * segDy
          const dx = px - closestX
          const dy = py - closestY
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist > wireThickness + pr) continue

          // Tripwire triggered! Explosion at midpoint
          const midX = (x1 + x2) / 2
          const midY = (y1 + y2) / 2
          const explosionR = trap.explosionRadius ?? 60

          // Damage all players in explosion radius
          for (const hitPeid of players) {
            if (hasComponent(world, Dead, hitPeid) || hasComponent(world, Downed, hitPeid)) continue
            if (hasComponent(world, Invincible, hitPeid)) continue
            if (Health.iframes[hitPeid]! > 0) continue

            const hdx = Position.x[hitPeid]! - midX
            const hdy = Position.y[hitPeid]! - midY
            const hpr = Collider.radius[hitPeid]!
            const hDist2 = hdx * hdx + hdy * hdy
            const hitDist = explosionR + hpr
            if (hDist2 > hitDist * hitDist) continue

            applyDamage(world, hitPeid, {
              amount: trap.damage,
              attackerEid: trap.ownerEid,
              setIframes: true,
            })

            const hDist = Math.sqrt(hDist2)
            if (hDist > 0) {
              world.lastPlayerHitDir.set(hitPeid, { x: hdx / hDist, y: hdy / hDist })
            }
          }

          world.trapDetonations.push({
            kind: 'tripwire',
            x: midX,
            y: midY,
            radius: explosionR,
          })

          triggered = true
          break
        }

        if (triggered) {
          world.trapZones.splice(i, 1)
        }
        break
      }
    }
  }
}
