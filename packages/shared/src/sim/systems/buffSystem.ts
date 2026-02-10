/**
 * Buff System
 *
 * Ticks timed buff state on UpgradeState (e.g., Last Stand, Deadweight).
 * Stat bonuses are applied idempotently in writeStatsToECS, not here.
 *
 * Runs after healthSystem so buff activation from onHealthChanged
 * is already set for this tick.
 */

import type { GameWorld } from '../world'
import { Health } from '../components'
import { applySlow } from './slowDebuff'
import { forEachAliveEnemyInRadius } from './damageHelpers'

export function buffSystem(world: GameWorld, dt: number): void {
  const us = world.upgradeState

  // --- Tremor reset ---
  world.tremorThisTick = false

  // --- Consecutive swing combo timeout (Prospector) ---
  if (us.consecutiveSwingTimer > 0) {
    us.consecutiveSwingTimer -= dt
    if (us.consecutiveSwingTimer <= 0) {
      us.consecutiveSwings = 0
      us.consecutiveSwingTimer = 0
    }
  }

  // --- Last Stand timer ---
  if (us.lastStandActive) {
    us.lastStandTimer -= dt
    if (us.lastStandTimer <= 0) {
      us.lastStandActive = false
      us.lastStandTimer = 0
    }
  }

  // --- Deadweight buff timer (Undertaker) ---
  if (us.deadweightBuffTimer > 0) {
    us.deadweightBuffTimer -= dt
    if (us.deadweightBuffTimer <= 0) {
      us.deadweightBuffTimer = 0
    }
  }

  // --- Corpse Harvest cooldown timer (Undertaker) ---
  if (us.corpseHarvestCooldownTimer > 0) {
    us.corpseHarvestCooldownTimer -= dt
    if (us.corpseHarvestCooldownTimer <= 0) {
      us.corpseHarvestCooldownTimer = 0
    }
  }

  // --- Open Casket cooldown timer (Undertaker) ---
  if (us.openCasketCooldownTimer > 0) {
    us.openCasketCooldownTimer -= dt
    if (us.openCasketCooldownTimer <= 0) {
      us.openCasketCooldownTimer = 0
      us.openCasketAvailable = true
    }
  }

  // --- Rockslide shockwaves (Prospector) ---
  for (let i = world.rockslideShockwaves.length - 1; i >= 0; i--) {
    const shock = world.rockslideShockwaves[i]!
    if (!shock.processed) {
      shock.processed = true
      forEachAliveEnemyInRadius(world, shock.x, shock.y, shock.radius, (enemyEid) => {
        Health.current[enemyEid] = Health.current[enemyEid]! - shock.damage
        applySlow(world, enemyEid, shock.slow, shock.slowDuration)
      })
    }
    // Remove after processing (one-shot)
    world.rockslideShockwaves.splice(i, 1)
  }
}
