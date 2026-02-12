/**
 * Hazard tile system.
 *
 * Applies damage-over-time and speed debuffs from hazard tiles to grounded entities.
 * Writes per-entity speed multipliers to world.floorSpeedMul for consumption by
 * playerInputSystem and enemySteeringSystem.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { Position, Health, Dead, ZPosition } from '../components'
import { JUMP_AIRBORNE_THRESHOLD } from '../content/jump'
import { LAVA_DPS, MUD_SPEED_MUL, BRAMBLE_DPS, BRAMBLE_SPEED_MUL } from '../content/hazards'
import { getFloorTileTypeAt, TileType } from '../tilemap'
import { applyDamage } from './applyDamage'

const hazardQuery = defineQuery([Position, Health])

export function hazardTileSystem(world: GameWorld, dt: number): void {
  const tilemap = world.tilemap
  if (!tilemap) return

  // Clear previous tick's speed multipliers
  world.floorSpeedMul.clear()

  const entities = hazardQuery(world)
  for (const eid of entities) {
    if (world.simulationScope === 'local-player' && world.localPlayerEid >= 0 && eid !== world.localPlayerEid) {
      continue
    }

    if (hasComponent(world, Dead, eid)) continue

    const z = hasComponent(world, ZPosition, eid) ? ZPosition.z[eid]! : 0
    if (z > JUMP_AIRBORNE_THRESHOLD) continue

    const tileType = getFloorTileTypeAt(tilemap, Position.x[eid]!, Position.y[eid]!)

    if (tileType === TileType.LAVA) {
      applyDamage(world, eid, { amount: LAVA_DPS * dt, ownerPlayerEid: null })
    } else if (tileType === TileType.MUD) {
      world.floorSpeedMul.set(eid, MUD_SPEED_MUL)
    } else if (tileType === TileType.BRAMBLE) {
      applyDamage(world, eid, { amount: BRAMBLE_DPS * dt, ownerPlayerEid: null })
      world.floorSpeedMul.set(eid, BRAMBLE_SPEED_MUL)
    }
  }
}
