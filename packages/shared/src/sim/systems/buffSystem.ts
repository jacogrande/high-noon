/**
 * Buff System
 *
 * Ticks timed buff state on UpgradeState (e.g., Last Stand).
 * Stat bonuses are applied idempotently in writeStatsToECS, not here.
 *
 * Runs after healthSystem so buff activation from onHealthChanged
 * is already set for this tick.
 */

import type { GameWorld } from '../world'

export function buffSystem(world: GameWorld, dt: number): void {
  const us = world.upgradeState

  // --- Last Stand timer ---
  if (us.lastStandActive) {
    us.lastStandTimer -= dt
    if (us.lastStandTimer <= 0) {
      us.lastStandActive = false
      us.lastStandTimer = 0
    }
  }
}
