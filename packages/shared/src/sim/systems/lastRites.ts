/**
 * Last Rites System (Undertaker ability)
 *
 * Place a cursed zone at the cursor. Enemies that die inside trigger
 * death pulses that chain to nearby enemies.
 *
 * Reuses the Showdown ECS component for active/cooldown/duration lifecycle.
 * Zone-specific spatial data lives on world.lastRitesZones per owning player.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld, LastRitesState } from '../world'
import { hasButton, Button } from '../../net/input'
import {
  Player,
  Showdown,
  Position,
  Health,
  Dead,
  Enemy,
} from '../components'
import { forEachInRadius } from '../SpatialHash'
import { getCharacterIdForPlayer, getUpgradeStateForPlayer } from '../upgrade'
import { applyDamage } from './applyDamage'

const lastRitesPlayerQuery = defineQuery([Player, Showdown, Position])

/** Safety cap on pulse processing iterations */
const MAX_PULSE_ITERATIONS = 20

export function lastRitesSystem(world: GameWorld, dt: number): void {
  const hadLastRitesAlias = world.lastRites !== null

  // Reset per-tick flags.
  world.lastRitesPulseThisTick = false
  world.lastRitesActivatedThisTick = false
  world.lastRitesExpiredThisTick = false
  world.overkillProcessed.clear()

  // Process queued pulses from prior kills.
  for (const [ownerEid, zone] of world.lastRitesZones) {
    if (world.simulationScope === 'local-player' && world.localPlayerEid >= 0 && ownerEid !== world.localPlayerEid) {
      continue
    }
    if (zone.active && zone.pendingPulses.length > 0) {
      processDeathPulses(world, ownerEid, zone)
    }
  }

  const players = lastRitesPlayerQuery(world)

  for (const eid of players) {
    if (world.simulationScope === 'local-player' && world.localPlayerEid >= 0 && eid !== world.localPlayerEid) {
      continue
    }
    if (getCharacterIdForPlayer(world, eid) !== 'undertaker') continue

    const us = getUpgradeStateForPlayer(world, eid)

    // Decrement cooldown.
    if (Showdown.cooldown[eid]! > 0) {
      Showdown.cooldown[eid] = Math.max(0, Showdown.cooldown[eid]! - dt)
    }

    const zone = world.lastRitesZones.get(eid)

    // Keep zone lifecycle aligned with Showdown toggle (test/reset compatibility).
    if (Showdown.active[eid] === 0 && zone?.active) {
      zone.active = false
    }

    // Active zone lifecycle.
    if (Showdown.active[eid] === 1 && zone?.active) {
      zone.timeRemaining -= dt

      if (zone.timeRemaining <= 0) {
        Showdown.active[eid] = 0
        Showdown.duration[eid] = 0

        const hasOvertime = us.nodesTaken.has('undertakers_overtime')
        if (hasOvertime && zone.chainCount >= 5) {
          Showdown.cooldown[eid] = 0
        } else {
          Showdown.cooldown[eid] = us.showdownCooldown
        }

        zone.active = false
        zone.pendingPulses.length = 0
        world.lastRitesExpiredThisTick = true
      } else {
        Showdown.duration[eid] = zone.timeRemaining
      }

      // Consecrated Ground DPS in-zone with whole-number accumulation.
      if (zone.active && us.nodesTaken.has('consecrated_ground') && world.spatialHash) {
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
            applyDamage(world, enemyEid, {
              amount: wholeDamage,
              ownerPlayerEid: eid,
            })
            accum.set(enemyEid, accumulated - wholeDamage)
          } else {
            accum.set(enemyEid, accumulated)
          }
        })
      }
    }

    // Activation (rising-edge ability press).
    const input = world.playerInputs.get(eid)
    if (!input) {
      Player.abilityWasDown[eid] = 0
      continue
    }

    const wantsAbility = hasButton(input, Button.ABILITY)
    const wasDown = Player.abilityWasDown[eid] === 1

    if (
      wantsAbility &&
      !wasDown &&
      Showdown.active[eid] === 0 &&
      Showdown.cooldown[eid]! <= 0
    ) {
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

      const createdZone: LastRitesState = {
        ownerEid: eid,
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
      world.lastRitesZones.set(eid, createdZone)
      Showdown.active[eid] = 1
      Showdown.duration[eid] = us.showdownDuration
      world.lastRitesActivatedThisTick = true
    }

    Player.abilityWasDown[eid] = wantsAbility ? 1 : 0
  }

  // Backwards-compatible alias used by some callers/tests.
  if (world.simulationScope === 'local-player' && world.localPlayerEid >= 0) {
    world.lastRites = world.lastRitesZones.get(world.localPlayerEid) ?? null
  } else {
    world.lastRites = null
    for (const zone of world.lastRitesZones.values()) {
      if (zone.active) {
        world.lastRites = zone
        break
      }
    }
    if (world.lastRites === null && hadLastRitesAlias) {
      for (const zone of world.lastRitesZones.values()) {
        world.lastRites = zone
        break
      }
    }
  }
}

function processDeathPulses(world: GameWorld, zoneOwnerEid: number, zone: LastRitesState): void {
  const us = getUpgradeStateForPlayer(world, zoneOwnerEid)

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

        const dx = Position.x[enemyEid]! - pulse.x
        const dy = Position.y[enemyEid]! - pulse.y
        if (dx * dx + dy * dy > us.pulseRadius * us.pulseRadius) return

        const hit = applyDamage(world, enemyEid, {
          amount: pulse.damage,
          ownerPlayerEid: zoneOwnerEid,
        })

        if (hit.killed && zone.chainCount < effectiveChainLimit) {
          const ex = Position.x[enemyEid]!
          const ey = Position.y[enemyEid]!
          const zdx = ex - zone.x
          const zdy = ey - zone.y
          if (zdx * zdx + zdy * zdy <= zone.radius * zone.radius) {
            zone.chainCount++
            if (hasOvertime) zone.chainDamageBonus += 3

            zone.pendingPulses.push({
              x: ex,
              y: ey,
              damage: us.pulseDamage + zone.chainDamageBonus,
            })

            Showdown.cooldown[zoneOwnerEid] = Math.max(
              0,
              Showdown.cooldown[zoneOwnerEid]! - us.showdownKillRefund,
            )
          }
        }
      })
    }
  }
}
