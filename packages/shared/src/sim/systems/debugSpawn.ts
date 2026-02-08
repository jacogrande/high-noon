/**
 * Debug Spawn System
 *
 * Spawns test enemy bullets when DEBUG_SPAWN button is pressed.
 * Uses edge detection so bullets spawn on key-down, not every held tick.
 * This keeps debug spawning in shared so it works identically in
 * single-player and multiplayer (server runs the same system).
 */

import type { GameWorld } from '../world'
import { Position } from '../components'
import { spawnBullet, CollisionLayer, NO_OWNER } from '../prefabs'
import { Button, hasButton } from '../../net/input'
import { playerQuery } from '../queries'

export function debugSpawnSystem(world: GameWorld, _dt: number): void {
  // Check if ANY player pressed debug spawn
  let isDown = false
  for (const [, input] of world.playerInputs) {
    if (hasButton(input, Button.DEBUG_SPAWN)) {
      isDown = true
      break
    }
  }

  const justPressed = isDown && !world.debugSpawnWasDown
  world.debugSpawnWasDown = isDown

  if (!justPressed) return

  const players = playerQuery(world)
  for (const eid of players) {
    // Spawn 50px away at 150px/s -> arrives in ~0.2s.
    // Roll i-frames last 0.15s, so rolling toward the bullet
    // (or rolling right as it arrives) should block damage.
    spawnBullet(world, {
      x: Position.x[eid]! + 50,
      y: Position.y[eid]!,
      vx: -150,
      vy: 0,
      damage: 1,
      range: 500,
      ownerId: NO_OWNER,
      layer: CollisionLayer.ENEMY_BULLET,
    })
  }
}
