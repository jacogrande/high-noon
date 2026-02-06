/**
 * Fixed Timestep Simulation
 *
 * The simulation runs at a fixed 60Hz tick rate, independent of render frame rate.
 * This ensures deterministic behavior across different machines.
 */

import type { GameWorld } from './world'
import type { InputState } from '../net/input'

// ============================================================================
// Constants
// ============================================================================

/** Simulation tick rate (ticks per second) */
export const TICK_RATE = 60

/** Time per tick in seconds */
export const TICK_S = 1 / TICK_RATE

/** Time per tick in milliseconds */
export const TICK_MS = 1000 / TICK_RATE

// ============================================================================
// System Execution
// ============================================================================

/**
 * System function signature
 * Systems take the world, delta time, and optionally input
 */
export type System = (world: GameWorld, dt: number, input?: InputState) => void

/**
 * Create a new system registry
 * Each game instance should have its own registry to avoid global state
 */
export function createSystemRegistry() {
  const systems: System[] = []

  return {
    /**
     * Register a system to run each tick
     * Systems run in registration order
     */
    register(system: System): void {
      systems.push(system)
    },

    /**
     * Clear all registered systems
     */
    clear(): void {
      systems.length = 0
    },

    /**
     * Get current system count
     */
    count(): number {
      return systems.length
    },

    /**
     * Get all systems (for stepping)
     */
    getSystems(): readonly System[] {
      return systems
    },
  }
}

export type SystemRegistry = ReturnType<typeof createSystemRegistry>

// ============================================================================
// Step Function
// ============================================================================

/**
 * Step the simulation forward by one tick
 *
 * @param world - The game world to update
 * @param systems - The system registry to use
 * @param input - Player input for this tick
 */
export function stepWorld(
  world: GameWorld,
  systems: SystemRegistry,
  input?: InputState
): void {
  // Run all registered systems
  for (const system of systems.getSystems()) {
    system(world, TICK_S, input)
  }

  // Increment tick counter
  world.tick++
  world.time += TICK_S
}
