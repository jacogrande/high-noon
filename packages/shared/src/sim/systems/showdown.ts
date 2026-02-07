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
import { hasButton, Button, type InputState } from '../../net/input'
import {
  Player,
  Showdown,
  Position,
  Velocity,
  Enemy,
  Health,
  Dead,
  Roll,
} from '../components'
import { NO_TARGET } from '../prefabs'

const showdownPlayerQuery = defineQuery([Player, Showdown, Position, Velocity])
const aliveEnemyQuery = defineQuery([Enemy, Position, Health])

/**
 * Showdown system - manages ability activation, kill detection, speed bonus
 *
 * @param world - The game world
 * @param dt - Delta time in seconds
 * @param input - Current input state
 */
export function showdownSystem(
  world: GameWorld,
  dt: number,
  input?: InputState,
): void {
  // Reset per-tick event flags
  world.showdownKillThisTick = false
  world.showdownActivatedThisTick = false

  const players = showdownPlayerQuery(world)

  for (const eid of players) {
    const us = world.upgradeState

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
        // Kill — grant cooldown refund
        Showdown.active[eid] = 0
        Showdown.targetEid[eid] = NO_TARGET
        Showdown.duration[eid] = 0
        Showdown.cooldown[eid] = Math.max(0, us.showdownCooldown - us.showdownKillRefund)
        world.showdownKillThisTick = true
      } else {
        // Decrement duration
        Showdown.duration[eid] = Showdown.duration[eid]! - dt

        if (Showdown.duration[eid]! <= 0) {
          // Expired — full cooldown
          Showdown.active[eid] = 0
          Showdown.targetEid[eid] = NO_TARGET
          Showdown.duration[eid] = 0
          Showdown.cooldown[eid] = us.showdownCooldown
        } else {
          // Speed bonus (skip during roll)
          if (!hasComponent(world, Roll, eid)) {
            Velocity.x[eid] = Velocity.x[eid]! * us.showdownSpeedBonus
            Velocity.y[eid] = Velocity.y[eid]! * us.showdownSpeedBonus
          }
        }
      }
    }

    // --- Activation (rising edge, not active, off cooldown) ---
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
        }
      }

      // Track button state for re-press detection
      Player.abilityWasDown[eid] = wantsAbility ? 1 : 0
    }
  }
}
