/**
 * Revive System
 *
 * Manages the downed→revived and downed→dead transitions in co-op.
 * Runs after healthSystem (which adds Downed) and before collisionSystem.
 *
 * - Decrements bleedTimer for downed players
 * - Checks if an alive, non-downed ally is within range and holding INTERACT
 * - Increments/decays reviveProgress accordingly
 * - On full progress: revive at 30% HP with brief invulnerability
 * - On bleed-out: transition to permanent Dead
 * - Sets "Hold [E]: Revive" prompt for nearby alive players
 */

import { defineQuery, hasComponent, addComponent, removeComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { Downed, Dead, Player, Position, Health, Poison } from '../components'
import { Button, hasButton } from '../../net/input'
import { NO_TARGET } from '../prefabs'
import { getAlivePlayers } from '../queries'
import { getOrCreatePlayerStats } from '../stats'

/** Seconds of bleed-out before permanent death */
export const BLEED_TIMER = 10.0
/** Seconds of holding INTERACT to complete a revive */
export const REVIVE_DURATION = 3.0
/** Pixels: how close the reviver must be */
export const REVIVE_RANGE = 48
/** HP fraction restored on revive */
export const REVIVE_HP_PERCENT = 0.3
/** Seconds of invulnerability after being revived */
export const REVIVE_INVULN = 2.0
/** Progress decay rate per second when reviver leaves range or stops holding INTERACT */
const REVIVE_DECAY_RATE = 0.15

const downedQuery = defineQuery([Downed, Player, Position])
const alivePlayerQuery = defineQuery([Player, Position, Health])

const REVIVE_RANGE_SQ = REVIVE_RANGE * REVIVE_RANGE

export function reviveSystem(world: GameWorld, dt: number): void {
  const downed = downedQuery(world)
  if (downed.length === 0) return

  const alivePlayers = alivePlayerQuery(world)

  for (const eid of downed) {
    // Decrement bleed timer
    Downed.bleedTimer[eid] = Downed.bleedTimer[eid]! - dt

    // Bleed out → permanent death
    if (Downed.bleedTimer[eid]! <= 0) {
      removeComponent(world, Downed, eid)
      addComponent(world, Dead, eid)
      continue
    }

    const px = Position.x[eid]!
    const py = Position.y[eid]!
    let bestReviverEid = NO_TARGET
    let bestDistSq = REVIVE_RANGE_SQ

    // Find closest alive, non-downed, non-dead ally holding INTERACT
    for (const candidateEid of alivePlayers) {
      if (candidateEid === eid) continue
      if (hasComponent(world, Dead, candidateEid)) continue
      if (hasComponent(world, Downed, candidateEid)) continue
      if (Health.current[candidateEid]! <= 0) continue

      const dx = Position.x[candidateEid]! - px
      const dy = Position.y[candidateEid]! - py
      const distSq = dx * dx + dy * dy
      if (distSq > REVIVE_RANGE_SQ) continue

      // Check INTERACT button
      const input = world.playerInputs.get(candidateEid)
      if (!input || !hasButton(input, Button.INTERACT)) continue

      if (distSq < bestDistSq) {
        bestDistSq = distSq
        bestReviverEid = candidateEid
      }
    }

    if (bestReviverEid !== NO_TARGET) {
      // Actively being revived
      Downed.reviverEid[eid] = bestReviverEid
      Downed.reviveProgress[eid] = Math.min(
        1.0,
        Downed.reviveProgress[eid]! + dt / REVIVE_DURATION,
      )

      // Revive complete
      if (Downed.reviveProgress[eid]! >= 1.0) {
        removeComponent(world, Downed, eid)
        Health.current[eid] = Math.ceil(Health.max[eid]! * REVIVE_HP_PERCENT)
        // Clear poison so it doesn't immediately re-down the freshly revived player
        if (hasComponent(world, Poison, eid)) {
          removeComponent(world, Poison, eid)
        }
        // Grant brief invulnerability via damage i-frames.
        // This protects against bullets, hitscan, dynamite, and enemy attacks
        // (all check Health.iframes > 0 before dealing damage).
        Health.iframes[eid] = REVIVE_INVULN
        // Per-player stats: reviver credit
        getOrCreatePlayerStats(world.playerStats, bestReviverEid).revivesGiven++
      }
    } else {
      // No reviver in range — decay progress slowly
      Downed.reviverEid[eid] = NO_TARGET
      if (Downed.reviveProgress[eid]! > 0) {
        Downed.reviveProgress[eid] = Math.max(
          0,
          Downed.reviveProgress[eid]! - REVIVE_DECAY_RATE * dt,
        )
      }
    }
  }

  // --- All-players-downed check ---
  // Re-query after the loop above (some entities may have bled out → Dead or
  // been revived → no longer Downed). bitECS queries reflect immediate changes.
  const stillDowned = downedQuery(world)
  if (stillDowned.length === 0) return

  // If no alive (non-Dead, non-Downed) players remain, nobody can revive anyone.
  // Transition all remaining Downed → Dead to trigger game-over.
  const alive = getAlivePlayers(world)
  if (alive.length === 0) {
    for (const eid of stillDowned) {
      removeComponent(world, Downed, eid)
      addComponent(world, Dead, eid)
    }
    return
  }

  // --- Revive prompt pass ---
  // Show "Hold [E]: Revive" for alive players near any downed ally.
  // Runs after interactionSystem so this prompt overrides NPC interaction prompts.
  for (const candidateEid of alive) {
    let nearestDownedDistSq = Infinity
    for (const downedEid of stillDowned) {
      const dx = Position.x[candidateEid]! - Position.x[downedEid]!
      const dy = Position.y[candidateEid]! - Position.y[downedEid]!
      const distSq = dx * dx + dy * dy
      if (distSq < nearestDownedDistSq) nearestDownedDistSq = distSq
    }

    if (nearestDownedDistSq <= REVIVE_RANGE_SQ) {
      world.interactionPromptByPlayer.set(candidateEid, 'Hold [E]: Revive')
    }
  }
}
