/**
 * Enemy Detection System
 *
 * Handles aggro acquisition/loss with hysteresis and optional line-of-sight.
 * LOS checks are staggered across 5 ticks to distribute cost.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { Enemy, Detection, Position, EnemyAI, Player, Dead } from '../components'
import { NO_TARGET } from '../prefabs'
import type { Tilemap } from '../tilemap'
import { worldToTile, isSolidAt } from '../tilemap'
import { getAlivePlayers } from '../queries'

const enemyQuery = defineQuery([Enemy, Detection, Position, EnemyAI])

/**
 * Bresenham line-of-sight check between two world positions.
 * Returns true if no solid tile blocks the line (excluding start/end tiles).
 * On diagonal steps, checks both adjacent cardinal tiles to prevent
 * seeing through diagonal wall corners.
 */
function hasLineOfSight(
  tilemap: Tilemap,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): boolean {
  const start = worldToTile(tilemap, x0, y0)
  const end = worldToTile(tilemap, x1, y1)

  let tx = start.tileX
  let ty = start.tileY
  const ex = end.tileX
  const ey = end.tileY

  const dx = Math.abs(ex - tx)
  const dy = Math.abs(ey - ty)
  const sx = tx < ex ? 1 : -1
  const sy = ty < ey ? 1 : -1
  let err = dx - dy

  const halfTile = tilemap.tileSize / 2
  const isSolid = (cx: number, cy: number) =>
    isSolidAt(tilemap, cx * tilemap.tileSize + halfTile, cy * tilemap.tileSize + halfTile)

  while (tx !== ex || ty !== ey) {
    const e2 = 2 * err
    const stepX = e2 > -dy
    const stepY = e2 < dx

    if (stepX && stepY) {
      // Diagonal step — check both adjacent cardinal tiles
      // If both are solid, the diagonal is blocked (corner-cutting)
      if (isSolid(tx + sx, ty) && isSolid(tx, ty + sy)) {
        return false
      }
    }

    if (stepX) {
      err -= dy
      tx += sx
    }
    if (stepY) {
      err += dx
      ty += sy
    }

    // Skip the end tile itself
    if (tx === ex && ty === ey) break

    // Check if this intermediate tile is solid
    if (isSolid(tx, ty)) {
      return false
    }
  }

  return true
}

export function enemyDetectionSystem(world: GameWorld, _dt: number): void {
  const alivePlayers = getAlivePlayers(world)
  const enemies = enemyQuery(world)

  // No alive players → clear all targets
  if (alivePlayers.length === 0) {
    for (const eid of enemies) {
      EnemyAI.targetEid[eid] = NO_TARGET
    }
    return
  }

  const tilemap = world.tilemap

  for (const eid of enemies) {
    const ex = Position.x[eid]!
    const ey = Position.y[eid]!
    const aggroRange = Detection.aggroRange[eid]!
    const currentTarget = EnemyAI.targetEid[eid]!

    if (currentTarget !== NO_TARGET) {
      // Has target — validate it's still alive, present, and within leash
      if (
        hasComponent(world, Dead, currentTarget) ||
        !hasComponent(world, Player, currentTarget) ||
        !hasComponent(world, Position, currentTarget)
      ) {
        // Target dead, removed, or missing position → clear and fall through to acquire new one
        EnemyAI.targetEid[eid] = NO_TARGET
      } else {
        // Leash check: lose target at 2× aggro range from *assigned target*
        const tx = Position.x[currentTarget]!
        const ty = Position.y[currentTarget]!
        const dx = tx - ex
        const dy = ty - ey
        const distSq = dx * dx + dy * dy
        const leashRangeSq = (aggroRange * 2) * (aggroRange * 2)
        if (distSq > leashRangeSq) {
          EnemyAI.targetEid[eid] = NO_TARGET
        } else {
          // Current target still valid → keep it (stability)
          continue
        }
      }
    }

    // No target (or just cleared) — find nearest alive player within aggro range
    const aggroRangeSq = aggroRange * aggroRange
    let bestEid = NO_TARGET
    let bestDistSq = Infinity

    for (const pid of alivePlayers) {
      const dx = Position.x[pid]! - ex
      const dy = Position.y[pid]! - ey
      const dSq = dx * dx + dy * dy
      if (dSq < aggroRangeSq && dSq < bestDistSq) {
        bestDistSq = dSq
        bestEid = pid
      }
    }

    if (bestEid === NO_TARGET) continue

    // LOS check (staggered)
    const losReq = Detection.losRequired[eid]!
    if (losReq === 0) {
      EnemyAI.targetEid[eid] = bestEid
    } else if (tilemap && world.tick % 5 === Detection.staggerOffset[eid]!) {
      if (hasLineOfSight(tilemap, ex, ey, Position.x[bestEid]!, Position.y[bestEid]!)) {
        EnemyAI.targetEid[eid] = bestEid
      }
    }
  }
}
