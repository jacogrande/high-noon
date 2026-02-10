/**
 * Showdown System
 *
 * The Sheriff's core ability: mark a single enemy for bonus damage,
 * pierce-to-target, speed boost, and cooldown refund on kill.
 *
 * Runs after rollSystem, before cylinderSystem.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { hasButton, Button } from '../../net/input'
import {
  Player,
  Showdown,
  Position,
  Velocity,
  Speed,
  Enemy,
  Health,
  Dead,
  Roll,
} from '../components'
import { NO_TARGET } from '../prefabs'
import { getCharacterIdForPlayer, getUpgradeStateForPlayer } from '../upgrade'

const showdownPlayerQuery = defineQuery([Player, Showdown, Position, Velocity])
const aliveEnemyQuery = defineQuery([Enemy, Position, Health])

/**
 * Showdown system - manages ability activation, kill detection, speed bonus
 *
 * Each player entity reads its own input from world.playerInputs.
 *
 * @param world - The game world
 * @param dt - Delta time in seconds
 */
export function showdownSystem(
  world: GameWorld,
  dt: number,
): void {
  // Reset per-tick event flags
  world.showdownKillThisTick = false
  world.showdownActivatedThisTick = false
  world.showdownExpiredThisTick = false

  const players = showdownPlayerQuery(world)

  for (const eid of players) {
    if (world.simulationScope === 'local-player' && world.localPlayerEid >= 0 && eid !== world.localPlayerEid) {
      continue
    }

    const us = getUpgradeStateForPlayer(world, eid)
    if (getCharacterIdForPlayer(world, eid) !== 'sheriff') {
      continue
    }

    // Decrement cooldown
    if (Showdown.cooldown[eid]! > 0) {
      Showdown.cooldown[eid] = Math.max(0, Showdown.cooldown[eid]! - dt)
    }

    // --- Active Showdown: check kill / expiry ---
    if (Showdown.active[eid] === 1) {
      const targetEid = Showdown.targetEid[eid]!

      // Check if target is dead/gone
      const targetDead =
        !hasComponent(world, Health, targetEid) ||
        Health.current[targetEid]! <= 0 ||
        hasComponent(world, Dead, targetEid)

      if (targetDead) {
        // Kill -- grant cooldown refund, reset speed
        Showdown.active[eid] = 0
        Showdown.targetEid[eid] = NO_TARGET
        Showdown.duration[eid] = 0
        Showdown.cooldown[eid] = Math.max(0, us.showdownCooldown - us.showdownKillRefund)
        Speed.current[eid] = Speed.max[eid]!
        world.showdownKillThisTick = true
      } else {
        // Decrement duration
        Showdown.duration[eid] = Showdown.duration[eid]! - dt

        if (Showdown.duration[eid]! <= 0) {
          // Expired -- full cooldown, reset speed
          Showdown.active[eid] = 0
          Showdown.targetEid[eid] = NO_TARGET
          Showdown.duration[eid] = 0
          Showdown.cooldown[eid] = us.showdownCooldown
          Speed.current[eid] = Speed.max[eid]!
          world.showdownExpiredThisTick = true
        } else {
          // Speed bonus via Speed.current (skip during roll)
          if (!hasComponent(world, Roll, eid)) {
            Speed.current[eid] = Speed.max[eid]! * us.showdownSpeedBonus
          }
        }
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
        // Find closest enemy to cursor within range
        const cx = input.cursorWorldX
        const cy = input.cursorWorldY
        const maxDistSq = us.showdownMarkRange * us.showdownMarkRange

        let bestEid = NO_TARGET
        let bestDistSq = maxDistSq

        const enemies = aliveEnemyQuery(world)
        for (const eeid of enemies) {
          if (hasComponent(world, Dead, eeid)) continue
          if (Health.current[eeid]! <= 0) continue

          const dx = Position.x[eeid]! - cx
          const dy = Position.y[eeid]! - cy
          const distSq = dx * dx + dy * dy

          if (distSq < bestDistSq) {
            bestDistSq = distSq
            bestEid = eeid
          }
        }

        if (bestEid !== NO_TARGET) {
          Showdown.active[eid] = 1
          Showdown.targetEid[eid] = bestEid
          Showdown.duration[eid] = us.showdownDuration
          world.showdownActivatedThisTick = true
          world.hooks.fireShowdownActivate(world, eid)
        }
      }

      // Track button state for re-press detection
      Player.abilityWasDown[eid] = wantsAbility ? 1 : 0
    } else {
      Player.abilityWasDown[eid] = 0
    }
  }
}
