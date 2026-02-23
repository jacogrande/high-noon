/**
 * Buff System
 *
 * Ticks timed buff state on UpgradeState (e.g., Last Stand, Deadweight).
 * Stat bonuses are applied idempotently in writeStatsToECS, not here.
 *
 * Runs after healthSystem so buff activation from onHealthChanged
 * is already set for this tick.
 */

import { defineQuery } from 'bitecs'
import type { GameWorld } from '../world'
import { Player, Health } from '../components'
import { getUpgradeStateForPlayer, HANGMANS_NOOSE_ID } from '../upgrade'
import { applySlow } from './slowDebuff'
import { forEachAliveEnemyInRadius } from './damageHelpers'
import { applyDamage } from './applyDamage'

const playerHealthQuery = defineQuery([Player, Health])

/** Hangman's Noose drains 1 HP every this many seconds. */
const NOOSE_DRAIN_INTERVAL_S = 5.0

export function buffSystem(world: GameWorld, dt: number): void {
  const states = world.playerUpgradeStates.size > 0
    ? Array.from(world.playerUpgradeStates.values())
    : [world.upgradeState]

  // --- Tremor reset ---
  world.tremorThisTick = false

  // --- Consecutive swing combo timeout (Prospector) ---
  for (const us of states) {
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

    // --- Moonshine Flask cooldown timer (Item) ---
    if (us.moonshineFlaskCooldown > 0) {
      us.moonshineFlaskCooldown -= dt
      if (us.moonshineFlaskCooldown <= 0) {
        us.moonshineFlaskCooldown = 0
      }
    }

    // --- Witching Hour timer (Item) ---
    if (us.witchingHourActive) {
      us.witchingHourTimer -= dt
      if (us.witchingHourTimer <= 0) {
        us.witchingHourActive = false
        us.witchingHourTimer = 0
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
  }

  // --- Rockslide shockwaves (Prospector) ---
  for (let i = world.rockslideShockwaves.length - 1; i >= 0; i--) {
    const shock = world.rockslideShockwaves[i]!
    if (!shock.processed) {
      shock.processed = true
      forEachAliveEnemyInRadius(world, shock.x, shock.y, shock.radius, (enemyEid) => {
        applyDamage(world, enemyEid, {
          amount: shock.damage,
          ownerPlayerEid: shock.ownerEid,
        })
        applySlow(world, enemyEid, shock.slow, shock.slowDuration)
      })
    }
    // Remove after processing (one-shot)
    world.rockslideShockwaves.splice(i, 1)
  }

  // --- Hangman's Noose HP drain (downside; upside heal-on-kill is in itemEffects.ts) ---
  const phPlayers = playerHealthQuery(world)
  for (const eid of phPlayers) {
    const us = getUpgradeStateForPlayer(world, eid)
    const nooseStacks = us.items.get(HANGMANS_NOOSE_ID) ?? 0
    if (nooseStacks <= 0) {
      us.hangmansNooseDrainTimer = 0
      continue
    }
    us.hangmansNooseDrainTimer += dt
    while (us.hangmansNooseDrainTimer >= NOOSE_DRAIN_INTERVAL_S) {
      us.hangmansNooseDrainTimer -= NOOSE_DRAIN_INTERVAL_S
      const hp = Health.current[eid]!
      if (hp > 1) {
        Health.current[eid] = hp - 1
      }
    }
  }
}
