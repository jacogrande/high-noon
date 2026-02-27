/**
 * Boss Module Registry
 *
 * Provides a plug-and-play interface for boss definitions.
 * Each boss module is self-contained: spawn, phase transitions, and attack logic.
 */

import type { GameWorld } from '../../world'

export interface BossModule {
  /** EnemyType enum value */
  readonly type: number
  /** Display name for HUD HP bar */
  readonly displayName: string
  /** Collider radius */
  readonly radius: number
  /** Item drop chance on death (0-1) */
  readonly dropChance: number
  /** Show world-space health bars per entity (for multi-entity bosses) */
  readonly showIndividualBars?: boolean
  /** How many entities this boss spawns. Default 1. Used by setEncounter for threat count. */
  readonly spawnCount?: number

  /** Create the boss entity at (x, y) */
  spawn(world: GameWorld, x: number, y: number): number
  /** Phase transition logic — called every tick for alive bosses */
  tick(world: GameWorld, eid: number, dt: number): void
  /** Attack execution — called every tick while in ATTACK state */
  attack(world: GameWorld, eid: number, dt: number): void
}

const registry = new Map<number, BossModule>()

export function registerBoss(mod: BossModule): void {
  if (registry.has(mod.type)) return // idempotent — safe to call multiple times
  registry.set(mod.type, mod)
}

/** Returns true if any bosses have been registered. */
export function isBossRegistryInitialized(): boolean {
  return registry.size > 0
}

export function getBoss(type: number): BossModule | undefined {
  return registry.get(type)
}

export function isBoss(type: number): boolean {
  return registry.has(type)
}

export function allBosses(): Iterable<BossModule> {
  return registry.values()
}
