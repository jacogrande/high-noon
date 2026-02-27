/**
 * Disconnected Player AI System
 *
 * Drives player entities whose client has disconnected but are still within
 * the reconnect window. The AI:
 * - Follows the nearest alive, connected ally
 * - Dodges nearby enemy bullets with a reactive roll
 * - Does NOT shoot (prevents unintended damage / ammo waste)
 *
 * Runs before playerInputSystem so synthetic inputs are ready for movement.
 *
 * NOTE: world.spatialHash is rebuilt by spatialHashSystem which runs AFTER
 * this system. Bullet positions used for dodge detection are one tick stale.
 * This is the same intentional trade-off as floorSpeedMul — the single-tick
 * lag is imperceptible. On the first tick after a map transition (spatialHash
 * null), dodge is simply skipped.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import {
  Player,
  Position,
  Velocity,
  Health,
  Dead,
  Downed,
  Disconnected,
  Bullet,
  Collider,
  Roll,
} from '../components'
import { CollisionLayer } from '../prefabs'
import { Button, setButton } from '../../net/input'
import type { NetworkInput } from '../../net/input'
import { forEachInRadius } from '../SpatialHash'

const disconnectedQuery = defineQuery([Player, Disconnected, Position, Health])
// Includes Dead/Downed entities — filtered out manually in the loop below.
// bitECS doesn't support Not() query constraints, so we check components in-line.
const alivePlayerQuery = defineQuery([Player, Position, Health])

/** Distance at which disconnected player starts following an ally (px) */
const FOLLOW_DIST = 64
/** Radius to scan for incoming enemy bullets (px) */
const DODGE_SCAN_RADIUS = 80
/** How close a bullet's path must pass to trigger a dodge (px) */
const DODGE_THREAT_DIST = 20
/** Max flight time (seconds) for a bullet to be considered a threat */
const DODGE_MAX_FLIGHT_TIME_S = 0.5

export function disconnectedPlayerAISystem(world: GameWorld, _dt: number): void {
  const disconnected = disconnectedQuery(world)
  if (disconnected.length === 0) return

  for (const eid of disconnected) {
    if (hasComponent(world, Dead, eid) || hasComponent(world, Downed, eid)) continue

    const px = Position.x[eid]!
    const py = Position.y[eid]!

    // --- Find nearest alive, connected ally ---
    // If no connected allies are found (all players disconnected),
    // the entity stands still. Without a reference point, any movement
    // heuristic would be arbitrary.
    let nearestEid = -1
    let nearestDistSq = Infinity

    for (const otherEid of alivePlayerQuery(world)) {
      if (otherEid === eid) continue
      if (hasComponent(world, Dead, otherEid) || hasComponent(world, Downed, otherEid)) continue
      if (hasComponent(world, Disconnected, otherEid)) continue

      const dx = Position.x[otherEid]! - px
      const dy = Position.y[otherEid]! - py
      const distSq = dx * dx + dy * dy
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq
        nearestEid = otherEid
      }
    }

    let moveX = 0
    let moveY = 0
    let buttons = 0

    // Move toward nearest ally if beyond follow distance
    if (nearestEid >= 0 && nearestDistSq > FOLLOW_DIST * FOLLOW_DIST) {
      const dx = Position.x[nearestEid]! - px
      const dy = Position.y[nearestEid]! - py
      const dist = Math.sqrt(nearestDistSq)
      moveX = dx / dist
      moveY = dy / dist
    }

    // --- Reactive dodge: pick the closest threatening bullet ---
    const isRolling = hasComponent(world, Roll, eid)

    if (!isRolling && world.spatialHash) {
      let bestThreatDx = 0
      let bestThreatDy = 0
      let bestDistSq = Infinity

      forEachInRadius(world.spatialHash, px, py, DODGE_SCAN_RADIUS, (candidateEid) => {
        if (!hasComponent(world, Bullet, candidateEid)) return
        if (Collider.layer[candidateEid] !== CollisionLayer.ENEMY_BULLET) return

        // Check if bullet is heading toward us
        const bx = Position.x[candidateEid]!
        const by = Position.y[candidateEid]!
        const bvx = Velocity.x[candidateEid]!
        const bvy = Velocity.y[candidateEid]!
        const speed = Math.sqrt(bvx * bvx + bvy * bvy)
        if (speed <= 0) return

        // Closest point on bullet ray to player
        const dx = px - bx
        const dy = py - by
        const t = (dx * bvx + dy * bvy) / (speed * speed)
        // t < 0: bullet already past us. t > DODGE_MAX_FLIGHT_TIME_S: bullet is too
        // far away (200-300px at typical speeds, well beyond DODGE_SCAN_RADIUS).
        if (t < 0 || t > DODGE_MAX_FLIGHT_TIME_S) return

        const closestX = bx + bvx * t
        const closestY = by + bvy * t
        const cdx = px - closestX
        const cdy = py - closestY
        const closestDistSq = cdx * cdx + cdy * cdy

        if (closestDistSq < DODGE_THREAT_DIST * DODGE_THREAT_DIST && closestDistSq < bestDistSq) {
          bestDistSq = closestDistSq

          // Dodge perpendicular to bullet — pick the side that moves away
          // from the bullet's origin (heuristically safer)
          const leftPerpX = -bvy / speed
          const leftPerpY = bvx / speed
          const dot = dx * leftPerpX + dy * leftPerpY
          if (dot >= 0) {
            bestThreatDx = leftPerpX
            bestThreatDy = leftPerpY
          } else {
            bestThreatDx = bvy / speed
            bestThreatDy = -bvx / speed
          }
        }
      })

      if (bestDistSq < Infinity) {
        buttons = setButton(buttons, Button.ROLL)
        moveX = bestThreatDx
        moveY = bestThreatDy
      }
    }

    // Build synthetic input — no shooting, no abilities.
    // seq/shootSeq are 0 because AI inputs are injected directly into
    // world.playerInputs inside the sim step, never enqueued by client.
    const input: NetworkInput = {
      seq: 0,
      clientTick: world.tick,
      clientTimeMs: 0,
      estimatedServerTimeMs: 0,
      viewInterpDelayMs: 0,
      shootSeq: 0,
      buttons,
      aimAngle: (moveX !== 0 || moveY !== 0) ? Math.atan2(moveY, moveX) : 0,
      moveX,
      moveY,
      cursorWorldX: px,
      cursorWorldY: py,
    }

    world.playerInputs.set(eid, input)
  }
}
