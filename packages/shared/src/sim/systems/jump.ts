/**
 * Jump system.
 *
 * Handles airborne arc simulation, landing lockout, half-wall landing pushout,
 * and landing stomp damage.
 */

import { defineQuery, hasComponent, removeComponent } from 'bitecs'
import type { GameWorld } from '../world'
import {
  Jump,
  ZPosition,
  PlayerState,
  PlayerStateType,
  Position,
  Collider,
  Health,
  Enemy,
} from '../components'
import {
  JUMP_GRAVITY_UP,
  JUMP_GRAVITY_DOWN_MULT,
  JUMP_LANDING_DURATION,
  JUMP_STOMP_RADIUS,
  JUMP_STOMP_DAMAGE,
} from '../content/jump'
import { forEachInRadius } from '../SpatialHash'
import { getSolidTileTypeAt, TileType, worldToTile, isSolidAt, type Tilemap } from '../tilemap'
import { applyDamage } from './applyDamage'

const jumpQuery = defineQuery([Jump, ZPosition, PlayerState, Position])

const NEIGHBOR_OFFSETS = [
  { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 },
  { dx: 1, dy: -1 }, { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 },
]

function findLandingPosition(
  map: Tilemap,
  worldX: number,
  worldY: number,
): { x: number; y: number } | null {
  const solidType = getSolidTileTypeAt(map, worldX, worldY)
  if (solidType !== TileType.HALF_WALL) return null

  const { tileX, tileY } = worldToTile(map, worldX, worldY)
  const halfTile = map.tileSize / 2

  for (let ring = 1; ring <= 3; ring++) {
    for (const { dx, dy } of NEIGHBOR_OFFSETS) {
      const nx = tileX + dx * ring
      const ny = tileY + dy * ring
      const wx = nx * map.tileSize + halfTile
      const wy = ny * map.tileSize + halfTile
      if (!isSolidAt(map, wx, wy)) return { x: wx, y: wy }
    }
  }

  return null
}

export function jumpSystem(world: GameWorld, dt: number): void {
  world.jumpStompThisTick = false

  const entities = jumpQuery(world)
  for (const eid of entities) {
    if (world.simulationScope === 'local-player' && world.localPlayerEid >= 0 && eid !== world.localPlayerEid) {
      continue
    }

    if (Jump.landed[eid] === 1) {
      Jump.landingTimer[eid] = Jump.landingTimer[eid]! - dt
      if (Jump.landingTimer[eid]! <= 0) {
        removeComponent(world, Jump, eid)
        PlayerState.state[eid] = PlayerStateType.IDLE
      }
      continue
    }

    const z = ZPosition.z[eid]!
    let zVelocity = ZPosition.zVelocity[eid]!
    const gravity = zVelocity > 0 ? JUMP_GRAVITY_UP : JUMP_GRAVITY_UP * JUMP_GRAVITY_DOWN_MULT
    zVelocity -= gravity * dt
    const newZ = z + zVelocity * dt

    if (newZ <= 0) {
      ZPosition.z[eid] = 0
      ZPosition.zVelocity[eid] = 0

      if (world.tilemap) {
        const pushout = findLandingPosition(world.tilemap, Position.x[eid]!, Position.y[eid]!)
        if (pushout) {
          Position.x[eid] = pushout.x
          Position.y[eid] = pushout.y
        }
      }

      Jump.landed[eid] = 1
      Jump.landingTimer[eid] = JUMP_LANDING_DURATION
      PlayerState.state[eid] = PlayerStateType.LANDING
      world.jumpStompThisTick = true

      if (!world.spatialHash) continue
      const px = Position.x[eid]!
      const py = Position.y[eid]!
      forEachInRadius(world.spatialHash, px, py, JUMP_STOMP_RADIUS, (targetEid) => {
        if (targetEid === eid) return
        if (!hasComponent(world, Enemy, targetEid)) return
        if (!hasComponent(world, Health, targetEid)) return
        if (!hasComponent(world, Position, targetEid)) return
        if (!hasComponent(world, Collider, targetEid)) return

        const dx = Position.x[targetEid]! - px
        const dy = Position.y[targetEid]! - py
        const maxDist = JUMP_STOMP_RADIUS + Collider.radius[targetEid]!
        if (dx * dx + dy * dy < maxDist * maxDist) {
          applyDamage(world, targetEid, {
            amount: JUMP_STOMP_DAMAGE,
            ownerPlayerEid: eid,
          })
        }
      })
    } else {
      ZPosition.z[eid] = newZ
      ZPosition.zVelocity[eid] = zVelocity
    }
  }
}
