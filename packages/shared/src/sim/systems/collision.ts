/**
 * Collision System
 *
 * Handles collision detection and resolution for entities.
 * Uses separate X/Y resolution for smooth wall sliding.
 *
 * Best practices for top-down 2D:
 * - Resolve X and Y independently for diagonal sliding
 * - Use AABB for broad phase, circle for narrow phase
 * - Push-out resolution (not bounce)
 * - Deterministic - same results on client and server
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { Position, Velocity, Collider, Bullet, ZPosition } from '../components'
import { JUMP_AIRBORNE_THRESHOLD } from '../content/jump'
import { MAX_COLLIDER_RADIUS } from '../prefabs'
import type { Tilemap } from '../tilemap'
import { getTilesInCircle, getTileBounds, isSolidAt, getSolidTileTypeAt, TileType } from '../tilemap'
import { forEachInRadius } from '../SpatialHash'

// Note: bitECS queries are stateless and safe to share across multiple worlds.
// Each query call filters the specific world passed as argument.
const movingCollidableQuery = defineQuery([Position, Velocity, Collider])

/**
 * Check if a circle overlaps with an AABB (tile)
 *
 * Returns the penetration vector if overlapping, null otherwise.
 */
function circleAABBCollision(
  circleX: number,
  circleY: number,
  radius: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): { overlapX: number; overlapY: number } | null {
  // Find the closest point on the AABB to the circle center
  const closestX = Math.max(minX, Math.min(circleX, maxX))
  const closestY = Math.max(minY, Math.min(circleY, maxY))

  // Calculate distance from circle center to closest point
  const distX = circleX - closestX
  const distY = circleY - closestY
  const distSq = distX * distX + distY * distY

  // No collision if distance is greater than radius
  if (distSq >= radius * radius) {
    return null
  }

  // Handle the case where circle center is inside the AABB
  if (distSq === 0) {
    // Circle center is inside the tile, push out to nearest edge
    const toLeft = circleX - minX
    const toRight = maxX - circleX
    const toTop = circleY - minY
    const toBottom = maxY - circleY

    const minDist = Math.min(toLeft, toRight, toTop, toBottom)

    if (minDist === toLeft) {
      return { overlapX: -(toLeft + radius), overlapY: 0 }
    } else if (minDist === toRight) {
      return { overlapX: toRight + radius, overlapY: 0 }
    } else if (minDist === toTop) {
      return { overlapX: 0, overlapY: -(toTop + radius) }
    } else {
      return { overlapX: 0, overlapY: toBottom + radius }
    }
  }

  // Calculate penetration depth
  const dist = Math.sqrt(distSq)
  const penetration = radius - dist

  // Normalize the direction and scale by penetration
  const nx = distX / dist
  const ny = distY / dist

  return {
    overlapX: nx * penetration,
    overlapY: ny * penetration,
  }
}

/**
 * Resolve collision between a circle and the tilemap
 *
 * Uses separate X/Y resolution for smooth wall sliding.
 */
function resolveCircleTilemapCollision(
  map: Tilemap,
  x: number,
  y: number,
  radius: number,
  z = 0,
): { resolvedX: number; resolvedY: number } {
  let resolvedX = x
  let resolvedY = y

  // Iterate multiple times to handle corner cases
  const maxIterations = 4

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let totalOverlapX = 0
    let totalOverlapY = 0
    let collisionCount = 0

    // Get all tiles the circle might overlap
    const tiles = getTilesInCircle(map, resolvedX, resolvedY, radius)

    for (const { tileX, tileY } of tiles) {
      // Check if this tile is solid (check center of tile)
      const tileCenterX = tileX * map.tileSize + map.tileSize / 2
      const tileCenterY = tileY * map.tileSize + map.tileSize / 2
      if (!isSolidAt(map, tileCenterX, tileCenterY)) {
        continue
      }

      // Airborne entities pass over half walls but still collide with real walls.
      if (z > JUMP_AIRBORNE_THRESHOLD) {
        const tileType = getSolidTileTypeAt(map, tileCenterX, tileCenterY)
        if (tileType === TileType.HALF_WALL) continue
      }

      // Get tile bounds
      const bounds = getTileBounds(map, tileX, tileY)

      // Check for collision
      const collision = circleAABBCollision(
        resolvedX,
        resolvedY,
        radius,
        bounds.minX,
        bounds.minY,
        bounds.maxX,
        bounds.maxY
      )

      if (collision) {
        totalOverlapX += collision.overlapX
        totalOverlapY += collision.overlapY
        collisionCount++
      }
    }

    // If no collisions, we're done
    if (collisionCount === 0) {
      break
    }

    // Apply average push-out
    resolvedX += totalOverlapX / collisionCount
    resolvedY += totalOverlapY / collisionCount
  }

  return { resolvedX, resolvedY }
}

function getEntityZ(world: GameWorld, eid: number): number {
  if (!hasComponent(world, ZPosition, eid)) return 0
  return ZPosition.z[eid]!
}

/**
 * Check circle vs circle collision
 *
 * Returns penetration vector if colliding, null otherwise.
 */
function circleCircleCollision(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number
): { overlapX: number; overlapY: number } | null {
  const dx = x2 - x1
  const dy = y2 - y1
  const distSq = dx * dx + dy * dy
  const minDist = r1 + r2

  if (distSq >= minDist * minDist) {
    return null
  }

  // Circles are overlapping
  if (distSq === 0) {
    // Circles are at same position, push in arbitrary direction
    return { overlapX: minDist, overlapY: 0 }
  }

  const dist = Math.sqrt(distSq)
  const penetration = minDist - dist
  const nx = dx / dist
  const ny = dy / dist

  return {
    overlapX: -nx * penetration * 0.5,
    overlapY: -ny * penetration * 0.5,
  }
}

/**
 * Collision system - detects and resolves collisions
 *
 * @param world - The game world (contains tilemap reference)
 * @param _dt - Delta time (unused)
 */
export function collisionSystem(world: GameWorld, _dt: number): void {
  const localOnly = world.simulationScope === 'local-player' && world.localPlayerEid >= 0

  if (localOnly) {
    const eid1 = world.localPlayerEid
    if (!hasComponent(world, Position, eid1) ||
        !hasComponent(world, Velocity, eid1) ||
        !hasComponent(world, Collider, eid1)) {
      return
    }

    // Tilemap collision only for local player in prediction/replay scope
    const tilemap = world.tilemap
    if (tilemap) {
      const x = Position.x[eid1]!
      const y = Position.y[eid1]!
      const radius = Collider.radius[eid1]!
      const z = getEntityZ(world, eid1)
      const { resolvedX, resolvedY } = resolveCircleTilemapCollision(tilemap, x, y, radius, z)
      if (resolvedX !== x || resolvedY !== y) {
        Position.x[eid1] = resolvedX
        Position.y[eid1] = resolvedY
      }
    }

    // Entity pushout for local player against nearby collidables.
    const x1 = Position.x[eid1]!
    const y1 = Position.y[eid1]!
    const r1 = Collider.radius[eid1]!
    const layer1 = Collider.layer[eid1]!

    // In local-player prediction/replay, remote entities can move between
    // authoritative hash rebuilds. Use direct ECS scan to avoid stale broadphase.
    const movingEntities = movingCollidableQuery(world)
    for (const eid2 of movingEntities) {
      if (eid1 === eid2) continue

      const layer2 = Collider.layer[eid2]!
      if (layer1 === layer2) continue
      if (hasComponent(world, Bullet, eid1) || hasComponent(world, Bullet, eid2)) continue
      if (getEntityZ(world, eid1) > JUMP_AIRBORNE_THRESHOLD || getEntityZ(world, eid2) > JUMP_AIRBORNE_THRESHOLD) {
        continue
      }

      const x2 = Position.x[eid2]!
      const y2 = Position.y[eid2]!
      const r2 = Collider.radius[eid2]!
      const collision = circleCircleCollision(x1, y1, r1, x2, y2, r2)
      if (collision) {
        Position.x[eid1] = x1 + collision.overlapX
        Position.y[eid1] = y1 + collision.overlapY
      }
    }
    return
  }

  // Get all moving collidable entities
  const movingEntities = movingCollidableQuery(world)

  // Resolve tilemap collisions for each moving entity
  const tilemap = world.tilemap
  if (tilemap) {
    for (const eid of movingEntities) {
      const x = Position.x[eid]!
      const y = Position.y[eid]!
      const radius = Collider.radius[eid]!
      const z = getEntityZ(world, eid)

      const { resolvedX, resolvedY } = resolveCircleTilemapCollision(
        tilemap,
        x,
        y,
        radius,
        z,
      )

      // Update position if changed
      if (resolvedX !== x || resolvedY !== y) {
        Position.x[eid] = resolvedX
        Position.y[eid] = resolvedY
      }
    }
  }

  // Entity vs Entity collisions (for future enemies, etc.)
  // Currently only handles player vs other collidables
  if (world.spatialHash) {
    for (const eid1 of movingEntities) {
      const x1 = Position.x[eid1]!
      const y1 = Position.y[eid1]!
      const r1 = Collider.radius[eid1]!
      const layer1 = Collider.layer[eid1]!

      const queryRadius = r1 + MAX_COLLIDER_RADIUS

      forEachInRadius(world.spatialHash, x1, y1, queryRadius, (eid2) => {
        if (eid1 === eid2) return

        const layer2 = Collider.layer[eid2]!

        // Skip if same layer (players don't collide with players, etc.)
        if (layer1 === layer2) return

        // Skip all bullet pairs — bullets are handled by bulletCollisionSystem.
        if (hasComponent(world, Bullet, eid1) || hasComponent(world, Bullet, eid2)) return
        if (getEntityZ(world, eid1) > JUMP_AIRBORNE_THRESHOLD || getEntityZ(world, eid2) > JUMP_AIRBORNE_THRESHOLD) {
          return
        }

        const x2 = Position.x[eid2]!
        const y2 = Position.y[eid2]!
        const r2 = Collider.radius[eid2]!

        const collision = circleCircleCollision(x1, y1, r1, x2, y2, r2)
        if (collision) {
          Position.x[eid1] = x1 + collision.overlapX
          Position.y[eid1] = y1 + collision.overlapY
        }
      })
    }
  }
}
