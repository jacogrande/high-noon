/**
 * Map Obstacle System
 *
 * Clears per-tick obstacle event arrays (destruction + hit events).
 * Runs early each tick so client-consumed events are fresh.
 * Same pattern as trapZoneSystem clearing trapDetonations.
 */

import type { GameWorld } from '../world'

export function mapObstacleSystem(world: GameWorld, _dt: number): void {
  world.obstacleDestructions.length = 0
  world.obstacleHits.length = 0
}
