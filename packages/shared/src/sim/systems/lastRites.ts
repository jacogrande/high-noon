/**
 * Last Rites System (Undertaker ability)
 *
 * Place a cursed zone at the cursor. Enemies that die inside trigger
 * death pulses that chain to nearby enemies.
 *
 * Runs in the same slot as showdownSystem (ability system).
 *
 * Reuses the Showdown ECS component for active/cooldown/duration lifecycle.
 * Zone-specific spatial data (x, y, radius, chainCount) lives on world.lastRites.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { hasButton, Button } from '../../net/input'
import {
  Player,
  Showdown,
  Position,
  Speed,
  Health,
  Dead,
  Enemy,
  Roll,
} from '../components'
import { forEachInRadius } from '../SpatialHash'

const lastRitesPlayerQuery = defineQuery([Player, Showdown, Position])
const aliveEnemyQuery = defineQuery([Enemy, Position, Health])

/** Safety cap on pulse processing iterations */
const MAX_PULSE_ITERATIONS = 20

export function lastRitesSystem(world: GameWorld, dt: number): void {
  // Reset per-tick flags
  world.lastRitesPulseThisTick = false
  world.lastRitesActivatedThisTick = false
  world.lastRitesExpiredThisTick = false
  world.overkillProcessed.clear()

  // Process pending death pulses from previous tick's kills
  if (world.lastRites?.active && world.lastRites.pendingPulses.length > 0) {
    // Find the zone owner (active player) for cooldown refund
    const activePlayers = lastRitesPlayerQuery(world)
    let zoneOwner = -1
    for (const pid of activePlayers) {
      if (Showdown.active[pid] === 1) { zoneOwner = pid; break }
    }
    processDeathPulses(world, zoneOwner)
  }

  const players = lastRitesPlayerQuery(world)

  for (const eid of players) {
    const us = world.upgradeState

    // Decrement cooldown
    if (Showdown.cooldown[eid]! > 0) {
      Showdown.cooldown[eid] = Math.max(0, Showdown.cooldown[eid]! - dt)
    }

    // --- Active zone: check expiry ---
    if (Showdown.active[eid] === 1 && world.lastRites?.active) {
      world.lastRites.timeRemaining -= dt

      if (world.lastRites.timeRemaining <= 0) {
        // Expired
        Showdown.active[eid] = 0
        Showdown.duration[eid] = 0

        // Overtime: 5+ chain kills fully refunds cooldown
        const hasOvertime = us.nodesTaken.has('undertakers_overtime')
        if (hasOvertime && world.lastRites.chainCount >= 5) {
          Showdown.cooldown[eid] = 0
        } else {
          Showdown.cooldown[eid] = us.showdownCooldown
        }

        world.lastRites.active = false
        world.lastRitesExpiredThisTick = true
      } else {
        Showdown.duration[eid] = world.lastRites.timeRemaining
      }

      // Consecrated Ground: tick DPS on enemies inside zone
      // Accumulates fractional damage and only applies whole-number ticks
      // so the renderer sees clean "1" damage indicators ~3 times/sec.
      if (world.lastRites.active && us.nodesTaken.has('consecrated_ground') && world.spatialHash) {
        const zone = world.lastRites
        const accum = zone.consecratedAccum
        const dpsIncrement = 3 * dt
        forEachInRadius(world.spatialHash, zone.x, zone.y, zone.radius, (enemyEid) => {
          if (!hasComponent(world, Enemy, enemyEid)) return
          if (!hasComponent(world, Health, enemyEid)) return
          if (hasComponent(world, Dead, enemyEid)) return
          if (Health.current[enemyEid]! <= 0) return
          if (Health.iframes[enemyEid]! > 0) return

          const dx = Position.x[enemyEid]! - zone.x
          const dy = Position.y[enemyEid]! - zone.y
          if (dx * dx + dy * dy > zone.radius * zone.radius) return

          const accumulated = (accum.get(enemyEid) ?? 0) + dpsIncrement
          const wholeDamage = Math.floor(accumulated)
          if (wholeDamage >= 1) {
            Health.current[enemyEid] = Health.current[enemyEid]! - wholeDamage
            accum.set(enemyEid, accumulated - wholeDamage)
          } else {
            accum.set(enemyEid, accumulated)
          }
        })
      }
    }

    // --- Activation (rising edge, not active, off cooldown) ---
    const input = world.playerInputs.get(eid)
    if (input) {
      const wantsAbility = hasButton(input, Button.ABILITY)
      const wasDown = Player.abilityWasDown[eid] === 1

      if (
        wantsAbility &&
        !wasDown &&
        Showdown.active[eid] === 0 &&
        Showdown.cooldown[eid]! <= 0
      ) {
        // Place zone at cursor, clamped to placement range
        const px = Position.x[eid]!
        const py = Position.y[eid]!
        const cx = input.cursorWorldX
        const cy = input.cursorWorldY

        let zx = cx
        let zy = cy
        const dx = cx - px
        const dy = cy - py
        const distSq = dx * dx + dy * dy
        const maxRange = us.showdownMarkRange
        if (distSq > maxRange * maxRange) {
          const dist = Math.sqrt(distSq)
          zx = px + (dx / dist) * maxRange
          zy = py + (dy / dist) * maxRange
        }

        // Create zone
        world.lastRites = {
          active: true,
          x: zx,
          y: zy,
          radius: us.zoneRadius,
          timeRemaining: us.showdownDuration,
          chainCount: 0,
          chainDamageBonus: 0,
          pendingPulses: [],
          consecratedAccum: new Map(),
        }

        Showdown.active[eid] = 1
        Showdown.duration[eid] = us.showdownDuration
        world.lastRitesActivatedThisTick = true
      }

      Player.abilityWasDown[eid] = wantsAbility ? 1 : 0
    } else {
      Player.abilityWasDown[eid] = 0
    }
  }
}

/**
 * Process pending death pulses (breadth-first, iterative).
 * Called at the start of each tick to process kills from the previous tick.
 *
 * @param zoneOwnerEid - Entity ID of the player who owns the zone (for cooldown refund).
 *                       -1 if no active owner found (pulses still fire, refund skipped).
 */
function processDeathPulses(world: GameWorld, zoneOwnerEid: number): void {
  const zone = world.lastRites!
  const us = world.upgradeState

  // Undertaker's Overtime: infinite chains + escalating damage
  const hasOvertime = us.nodesTaken.has('undertakers_overtime')
  const effectiveChainLimit = hasOvertime ? Infinity : us.chainLimit

  let iterations = 0

  while (zone.pendingPulses.length > 0 && iterations < MAX_PULSE_ITERATIONS) {
    iterations++
    const currentPulses = zone.pendingPulses.splice(0)
    world.lastRitesPulseThisTick = true

    for (const pulse of currentPulses) {
      if (!world.spatialHash) continue

      forEachInRadius(world.spatialHash, pulse.x, pulse.y, us.pulseRadius, (enemyEid) => {
        if (!hasComponent(world, Enemy, enemyEid)) return
        if (!hasComponent(world, Health, enemyEid)) return
        if (hasComponent(world, Dead, enemyEid)) return
        if (Health.current[enemyEid]! <= 0) return

        // Check within pulse radius
        const dx = Position.x[enemyEid]! - pulse.x
        const dy = Position.y[enemyEid]! - pulse.y
        if (dx * dx + dy * dy > us.pulseRadius * us.pulseRadius) return

        // Apply pulse damage
        Health.current[enemyEid] = Health.current[enemyEid]! - pulse.damage

        // If this kill is inside zone and we haven't exceeded chain limit, queue another pulse
        if (Health.current[enemyEid]! <= 0 && zone.chainCount < effectiveChainLimit) {
          const ex = Position.x[enemyEid]!
          const ey = Position.y[enemyEid]!
          const zdx = ex - zone.x
          const zdy = ey - zone.y
          if (zdx * zdx + zdy * zdy <= zone.radius * zone.radius) {
            zone.chainCount++

            // Overtime: +3 damage per chain
            if (hasOvertime) {
              zone.chainDamageBonus += 3
            }

            zone.pendingPulses.push({
              x: ex,
              y: ey,
              damage: us.pulseDamage + zone.chainDamageBonus,
            })

            // Refund cooldown per chain kill to the zone owner
            if (zoneOwnerEid >= 0) {
              Showdown.cooldown[zoneOwnerEid] = Math.max(0, Showdown.cooldown[zoneOwnerEid]! - us.showdownKillRefund)
            }
          }
        }
      })
    }
  }

  // Overtime: if 5+ chain kills, fully refund cooldown on deactivation
  // (tracked by zone.chainCount, applied when zone expires — handled in expiry above)
}
