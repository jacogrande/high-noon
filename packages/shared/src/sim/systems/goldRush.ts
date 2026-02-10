/**
 * Gold Rush System (universal gold + Prospector passive)
 *
 * Handles gold nugget pickups and Gold Fever stack management.
 * Gold nuggets are spawned by healthSystem (on enemy kill) via world hooks.
 * This system handles: pickup detection, Gold Fever stacking, timer tick.
 *
 * Runs for all characters (gold is universal), but only the Prospector
 * gets Gold Fever damage stacks.
 */

import { defineQuery } from 'bitecs'
import type { GameWorld } from '../world'
import { Player, Position } from '../components'
import { GOLD_FEVER_MAX_STACKS, GOLD_PICKUP_RADIUS } from '../content/weapons'

const playerQuery = defineQuery([Player, Position])

/** Nugget lifetime before despawning (seconds) */
export const GOLD_NUGGET_LIFETIME = 10

export function goldRushSystem(world: GameWorld, dt: number): void {
  const us = world.upgradeState

  // Reset per-tick melee kill flag
  world.lastKillWasMelee = false

  // Tick Gold Fever timer
  if (us.goldFeverTimer > 0) {
    us.goldFeverTimer -= dt
    if (us.goldFeverTimer <= 0) {
      us.goldFeverStacks = 0
      us.goldFeverTimer = 0
    }
  }

  // Tick nugget lifetimes and remove expired
  for (let i = world.goldNuggets.length - 1; i >= 0; i--) {
    const nugget = world.goldNuggets[i]!
    nugget.lifetime -= dt
    if (nugget.lifetime <= 0) {
      world.goldNuggets.splice(i, 1)
    }
  }

  // Check player pickup
  const players = playerQuery(world)
  for (const eid of players) {
    const px = Position.x[eid]!
    const py = Position.y[eid]!

    for (let i = world.goldNuggets.length - 1; i >= 0; i--) {
      const nugget = world.goldNuggets[i]!
      const dx = nugget.x - px
      const dy = nugget.y - py
      if (dx * dx + dy * dy <= GOLD_PICKUP_RADIUS * GOLD_PICKUP_RADIUS) {
        // Collect
        world.goldCollected += nugget.value
        world.goldNuggets.splice(i, 1)

        // Prospector: add Gold Fever stack
        if (us.characterDef.id === 'prospector') {
          us.goldFeverStacks = Math.min(us.goldFeverStacks + 1, GOLD_FEVER_MAX_STACKS)
          us.goldFeverTimer = us.goldFeverDuration
        }
      }
    }
  }
}
