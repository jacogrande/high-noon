/**
 * Debug Spawn System
 *
 * Spawns test enemy bullets when DEBUG_SPAWN button is pressed.
 * Uses edge detection so bullets spawn on key-down, not every held tick.
 * This keeps debug spawning in shared so it works identically in
 * single-player and multiplayer (server runs the same system).
 */

import { defineQuery } from 'bitecs'
import type { GameWorld } from '../world'
import { Player, Position } from '../components'
import { spawnBullet, CollisionLayer, NO_OWNER } from '../prefabs'
import { type InputState, Button, hasButton } from '../../net/input'

const playerQuery = defineQuery([Player, Position])

/** Track previous tick's button state for edge detection */
let wasDown = false

export function debugSpawnSystem(world: GameWorld, _dt: number, input?: InputState): void {
  if (!input) return

  const isDown = hasButton(input, Button.DEBUG_SPAWN)
  const justPressed = isDown && !wasDown
  wasDown = isDown

  if (!justPressed) return

  const players = playerQuery(world)
  for (const eid of players) {
    spawnBullet(world, {
      x: Position.x[eid]! + 100,
      y: Position.y[eid]!,
      vx: -300,
      vy: 0,
      damage: 1,
      range: 500,
      ownerId: NO_OWNER,
      layer: CollisionLayer.ENEMY_BULLET,
    })
  }
}
