/**
 * Enemy Steering System
 *
 * Computes velocity for enemies based on AI state.
 * Combines flow field seek, separation, and preferred-range orbiting.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { EnemyAI, AIState, Steering, Position, Velocity, Speed, Enemy } from '../components'
import { worldToTile } from '../tilemap'
import { forEachInRadius } from '../SpatialHash'
import { playerQuery } from '../queries'

const steeringQuery = defineQuery([EnemyAI, Steering, Position, Velocity, Speed, Enemy])

/** Hysteresis band around preferredRange for flee/orbit/seek transitions */
const ORBIT_MARGIN = 30

/** Golden angle in radians (~137.5°) — maximally distributes overlapping entities */
const GOLDEN_ANGLE = 2.399

export function enemySteeringSystem(world: GameWorld, _dt: number): void {
  const enemies = steeringQuery(world)
  const players = playerQuery(world)

  const hasPlayer = players.length > 0
  const playerEid = hasPlayer ? players[0]! : 0
  const playerX = hasPlayer ? Position.x[playerEid]! : 0
  const playerY = hasPlayer ? Position.y[playerEid]! : 0

  for (const eid of enemies) {
    const state = EnemyAI.state[eid]!

    // Non-CHASE states: stop movement (except ATTACK, managed by enemyAttackSystem)
    if (state !== AIState.CHASE && state !== AIState.ATTACK) {
      Velocity.x[eid] = 0
      Velocity.y[eid] = 0
      continue
    }
    if (state === AIState.ATTACK) continue

    const ex = Position.x[eid]!
    const ey = Position.y[eid]!
    const speed = Speed.current[eid]!

    // a) Compute seek direction
    let seekX = 0
    let seekY = 0

    // Try flow field first
    const ff = world.flowField
    const tilemap = world.tilemap
    if (ff && tilemap) {
      const { tileX, tileY } = worldToTile(tilemap, ex, ey)
      if (tileX >= 0 && tileX < ff.width && tileY >= 0 && tileY < ff.height) {
        const idx = tileY * ff.width + tileX
        seekX = ff.dirX[idx]!
        seekY = ff.dirY[idx]!
      }
    }

    // Fall back to direct seek if flow field direction is zero
    if (seekX === 0 && seekY === 0 && hasPlayer) {
      const dx = playerX - ex
      const dy = playerY - ey
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len > 0) {
        seekX = dx / len
        seekY = dy / len
      }
    }

    // b) Shooter preferred-range orbiting
    const preferredRange = Steering.preferredRange[eid]!
    if (preferredRange > 0 && hasPlayer) {
      const dx = playerX - ex
      const dy = playerY - ey
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist > 0) {
        if (dist < preferredRange - ORBIT_MARGIN) {
          // Too close → flee (reverse seek)
          seekX = -seekX
          seekY = -seekY
        } else if (dist <= preferredRange + ORBIT_MARGIN) {
          // Sweet spot → orbit (perpendicular to player direction)
          const nx = dx / dist
          const ny = dy / dist
          seekX = -ny
          seekY = nx
        }
        // else: too far → keep current seek direction
      }
    }

    // c) Separation force
    let sepX = 0
    let sepY = 0
    const sepRadius = Steering.separationRadius[eid]!
    const sepRadiusSq = sepRadius * sepRadius

    if (world.spatialHash) {
      forEachInRadius(world.spatialHash, ex, ey, sepRadius, (other) => {
        if (other === eid) return
        if (!hasComponent(world, Enemy, other)) return

        const ox = Position.x[other]!
        const oy = Position.y[other]!
        const dx = ex - ox
        const dy = ey - oy
        const distSq = dx * dx + dy * dy

        if (distSq >= sepRadiusSq) return

        if (distSq === 0) {
          const angle = (eid * GOLDEN_ANGLE) % (Math.PI * 2)
          sepX += Math.cos(angle) * 0.5
          sepY += Math.sin(angle) * 0.5
        } else {
          const d = Math.sqrt(distSq)
          const weight = (sepRadius - d) / sepRadius
          sepX += (dx / d) * weight
          sepY += (dy / d) * weight
        }
      })
    }

    // d) Combine and set velocity
    const seekWeight = Steering.seekWeight[eid]!
    const separationWeight = Steering.separationWeight[eid]!

    let desiredX = seekX * seekWeight + sepX * separationWeight
    let desiredY = seekY * seekWeight + sepY * separationWeight

    const desiredLen = Math.sqrt(desiredX * desiredX + desiredY * desiredY)
    if (desiredLen > 0) {
      desiredX /= desiredLen
      desiredY /= desiredLen
    }

    Velocity.x[eid] = desiredX * speed
    Velocity.y[eid] = desiredY * speed
  }
}
