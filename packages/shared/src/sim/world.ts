/**
 * ECS World Management
 *
 * The world holds all entity state and is the main interface for the ECS.
 */

import { createWorld as bitCreateWorld, type IWorld } from 'bitecs'
import type { Tilemap } from './tilemap'

/**
 * Game world containing all ECS state
 */
export interface GameWorld extends IWorld {
  /** Current simulation tick number */
  tick: number
  /** Accumulated time for this tick (for debugging) */
  time: number
  /** Current tilemap for collision detection (optional) */
  tilemap: Tilemap | null
}

/**
 * Create a new game world
 */
export function createGameWorld(): GameWorld {
  const baseWorld = bitCreateWorld()

  return {
    ...baseWorld,
    tick: 0,
    time: 0,
    tilemap: null,
  }
}

/**
 * Set the tilemap for this world
 */
export function setWorldTilemap(world: GameWorld, tilemap: Tilemap): void {
  world.tilemap = tilemap
}

/**
 * Reset world state (for new game or replay)
 */
export function resetWorld(world: GameWorld): void {
  world.tick = 0
  world.time = 0
  world.tilemap = null
  // Note: bitECS entities persist - call removeEntity for each if needed
}
