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

import { defineQuery } from 'bitecs'
import type { GameWorld } from '../world'
import { Position, Velocity, Collider } from '../components'
import type { Tilemap } from '../tilemap'
import { getTilesInCircle, getTileBounds, isSolidAt } from '../tilemap'

// Query for all entities with collision
// Note: bitECS queries are stateless and safe to share across multiple worlds.
// Each query call filters the specific world passed as argument.
const collidableQuery = defineQuery([Position, Collider])
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
  radius: number
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
  // Get all moving collidable entities
  const movingEntities = movingCollidableQuery(world)

  // Resolve tilemap collisions for each moving entity
  const tilemap = world.tilemap
  if (tilemap) {
    for (const eid of movingEntities) {
      const x = Position.x[eid]!
      const y = Position.y[eid]!
      const radius = Collider.radius[eid]!

      const { resolvedX, resolvedY } = resolveCircleTilemapCollision(
        tilemap,
        x,
        y,
        radius
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
  const allCollidables = collidableQuery(world)

  for (const eid1 of movingEntities) {
    const x1 = Position.x[eid1]!
    const y1 = Position.y[eid1]!
    const r1 = Collider.radius[eid1]!
    const layer1 = Collider.layer[eid1]!

    for (const eid2 of allCollidables) {
      // Skip self
      if (eid1 === eid2) continue

      const x2 = Position.x[eid2]!
      const y2 = Position.y[eid2]!
      const r2 = Collider.radius[eid2]!
      const layer2 = Collider.layer[eid2]!

      // Skip if same layer (players don't collide with players, etc.)
      // This can be customized with a collision matrix later
      if (layer1 === layer2) continue

      const collision = circleCircleCollision(x1, y1, r1, x2, y2, r2)
      if (collision) {
        // Push out the moving entity
        Position.x[eid1] = x1 + collision.overlapX
        Position.y[eid1] = y1 + collision.overlapY
      }
    }
  }
}
