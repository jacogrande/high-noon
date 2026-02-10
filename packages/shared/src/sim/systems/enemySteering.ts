/**
 * Enemy Steering System
 *
 * Computes velocity for enemies based on AI state.
 * Combines flow field seek, separation, and preferred-range orbiting.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { EnemyAI, AIState, Steering, Position, Velocity, Speed, Enemy } from '../components'
import { NO_TARGET } from '../prefabs'
import { getFloorTileTypeAt, isSolidAt, TileType, worldToTile } from '../tilemap'
import { forEachInRadius } from '../SpatialHash'

const steeringQuery = defineQuery([EnemyAI, Steering, Position, Velocity, Speed, Enemy])

/** Hysteresis band around preferredRange for flee/orbit/seek transitions */
const ORBIT_MARGIN = 30
const UNREACHABLE = 0xFFFF
const LAVA_PROBE_TILES = 0.5

const SAFE_NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
]

/** Golden angle in radians (~137.5°) — maximally distributes overlapping entities */
const GOLDEN_ANGLE = 2.399

function findNonLavaDirection(world: GameWorld, ex: number, ey: number): { x: number; y: number } | null {
  const tilemap = world.tilemap
  const ff = world.flowField
  if (!tilemap) return null

  const { tileX, tileY } = worldToTile(tilemap, ex, ey)
  const halfTile = tilemap.tileSize / 2
  let bestX = 0
  let bestY = 0
  let bestDist = UNREACHABLE
  let fallbackX = 0
  let fallbackY = 0
  let hasFallback = false

  for (const [dx, dy] of SAFE_NEIGHBOR_OFFSETS) {
    const nx = tileX + dx
    const ny = tileY + dy
    if (nx < 0 || nx >= tilemap.width || ny < 0 || ny >= tilemap.height) continue

    const worldX = nx * tilemap.tileSize + halfTile
    const worldY = ny * tilemap.tileSize + halfTile
    if (isSolidAt(tilemap, worldX, worldY)) continue
    if (getFloorTileTypeAt(tilemap, worldX, worldY) === TileType.LAVA) continue

    const dirX = worldX - ex
    const dirY = worldY - ey
    const len = Math.sqrt(dirX * dirX + dirY * dirY)
    if (len === 0) continue
    const nxDir = dirX / len
    const nyDir = dirY / len

    if (!hasFallback) {
      fallbackX = nxDir
      fallbackY = nyDir
      hasFallback = true
    }

    if (ff && nx < ff.width && ny < ff.height) {
      const dist = ff.dist[ny * ff.width + nx]!
      if (dist < bestDist) {
        bestDist = dist
        bestX = nxDir
        bestY = nyDir
      }
    }
  }

  if (bestDist < UNREACHABLE) {
    return { x: bestX, y: bestY }
  }
  if (hasFallback) {
    return { x: fallbackX, y: fallbackY }
  }
  return null
}

export function enemySteeringSystem(world: GameWorld, _dt: number): void {
  const enemies = steeringQuery(world)

  for (const eid of enemies) {
    const state = EnemyAI.state[eid]!

    // Non-CHASE states: stop movement (except ATTACK, managed by enemyAttackSystem)
    if (state !== AIState.CHASE && state !== AIState.ATTACK) {
      Velocity.x[eid] = 0
      Velocity.y[eid] = 0
      continue
    }
    if (state === AIState.ATTACK) continue

    const targetEid = EnemyAI.targetEid[eid]!
    const hasTarget = targetEid !== NO_TARGET

    // Read target position
    const targetX = hasTarget ? Position.x[targetEid]! : 0
    const targetY = hasTarget ? Position.y[targetEid]! : 0

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

    // Fall back to direct seek toward assigned target
    if (seekX === 0 && seekY === 0 && hasTarget) {
      const dx = targetX - ex
      const dy = targetY - ey
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len > 0) {
        seekX = dx / len
        seekY = dy / len
      }
    }

    // b) Shooter preferred-range orbiting (relative to assigned target)
    const preferredRange = Steering.preferredRange[eid]!
    if (preferredRange > 0 && hasTarget) {
      const dx = targetX - ex
      const dy = targetY - ey
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist > 0) {
        if (dist < preferredRange - ORBIT_MARGIN) {
          // Too close → flee (reverse seek)
          seekX = -seekX
          seekY = -seekY
        } else if (dist <= preferredRange + ORBIT_MARGIN) {
          // Sweet spot → orbit (perpendicular to target direction)
          const nx = dx / dist
          const ny = dy / dist
          seekX = -ny
          seekY = nx
        }
        // else: too far → keep current seek direction
      }
    }

    // No target → stop moving entirely (skip separation too)
    if (!hasTarget) {
      Velocity.x[eid] = 0
      Velocity.y[eid] = 0
      continue
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

    // Avoid entering lava when there is a non-lava alternative direction.
    if (tilemap && desiredLen > 0) {
      const currentFloor = getFloorTileTypeAt(tilemap, ex, ey)
      if (currentFloor !== TileType.LAVA) {
        const probeDistance = tilemap.tileSize * LAVA_PROBE_TILES
        const probeX = ex + desiredX * probeDistance
        const probeY = ey + desiredY * probeDistance
        if (getFloorTileTypeAt(tilemap, probeX, probeY) === TileType.LAVA) {
          const reroute = findNonLavaDirection(world, ex, ey)
          if (reroute) {
            desiredX = reroute.x
            desiredY = reroute.y
          }
        }
      }
    }

    Velocity.x[eid] = desiredX * speed
    Velocity.y[eid] = desiredY * speed
  }
}
