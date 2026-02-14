/**
 * NPC Movement System
 *
 * Updates discovery NPC positions based on their movement pattern.
 * Runs every tick. NPCs move slowly — this is flavor, not gameplay.
 *
 * Patterns:
 * - NONE: No movement. Position stays at home.
 * - PACE: Walk back and forth along X axis within range of home.
 *         Pause briefly at each end.
 * - WANDER: Pick a random point within range of home, walk to it,
 *           pause, pick a new point. Uses world.rng for determinism.
 */

import { defineQuery } from 'bitecs'
import type { GameWorld } from '../world'
import { Position, Velocity, Speed, Npc, NpcMovement, NpcMovementType } from '../components'

const npcMoveQuery = defineQuery([Npc, NpcMovement, Position, Velocity, Speed])

const PACE_PAUSE_TIME = 1.5
const WANDER_PAUSE_MIN = 2.0
const WANDER_PAUSE_MAX = 4.0
const ARRIVAL_DIST = 4

export function npcMovementSystem(world: GameWorld, dt: number): void {
  for (const eid of npcMoveQuery(world)) {
    const pattern = NpcMovement.pattern[eid]!

    if (pattern === NpcMovementType.NONE) {
      Velocity.x[eid] = 0
      Velocity.y[eid] = 0
      continue
    }

    // Handle pause
    const pause = NpcMovement.pauseTimer[eid]!
    if (pause > 0) {
      NpcMovement.pauseTimer[eid] = pause - dt
      Velocity.x[eid] = 0
      Velocity.y[eid] = 0
      continue
    }

    const speed = Speed.current[eid]!
    const homeX = NpcMovement.homeX[eid]!
    const homeY = NpcMovement.homeY[eid]!
    const range = NpcMovement.range[eid]!
    const x = Position.x[eid]!
    const y = Position.y[eid]!

    if (pattern === NpcMovementType.PACE) {
      const dir = NpcMovement.paceDir[eid]!
      const targetX = dir === 0 ? homeX + range : homeX - range

      const dx = targetX - x
      if (Math.abs(dx) < ARRIVAL_DIST) {
        // Reached end — flip direction and pause
        NpcMovement.paceDir[eid] = dir === 0 ? 1 : 0
        NpcMovement.pauseTimer[eid] = PACE_PAUSE_TIME
        Velocity.x[eid] = 0
        Velocity.y[eid] = 0
      } else {
        Velocity.x[eid] = Math.sign(dx) * speed
        Velocity.y[eid] = 0
      }
    } else if (pattern === NpcMovementType.WANDER) {
      const tx = NpcMovement.targetX[eid]!
      const ty = NpcMovement.targetY[eid]!
      const dx = tx - x
      const dy = ty - y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < ARRIVAL_DIST) {
        // Reached target — pick new target and pause
        const angle = world.rng.nextRange(0, Math.PI * 2)
        const r = world.rng.nextRange(range * 0.3, range)
        NpcMovement.targetX[eid] = homeX + Math.cos(angle) * r
        NpcMovement.targetY[eid] = homeY + Math.sin(angle) * r
        NpcMovement.pauseTimer[eid] = world.rng.nextRange(WANDER_PAUSE_MIN, WANDER_PAUSE_MAX)
        Velocity.x[eid] = 0
        Velocity.y[eid] = 0
      } else {
        // Move toward target
        const nx = dx / dist
        const ny = dy / dist
        Velocity.x[eid] = nx * speed
        Velocity.y[eid] = ny * speed
      }
    }
  }
}
