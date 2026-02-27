/**
 * Enemy Registry
 *
 * Centralized registry for all non-boss enemy type definitions.
 * Each enemy type is described by an EnemyDefinition that contains
 * all stats, attack config, steering, rendering metadata, and drop data.
 *
 * Adding a new enemy = one registerEnemy() call with a complete definition.
 * All consumers (spawner, attack system, renderer, asset loader) read from here.
 */

import type { BulletSpriteIdValue } from './weapons'

/** How an enemy deals damage */
export type AttackStyle = 'projectile' | 'melee' | 'rush' | 'custom'

export interface EnemyDefinition {
  // Identity
  readonly type: number              // EnemyType enum value
  readonly name: string              // Display name
  readonly tier: number              // EnemyTier value

  // Stats
  readonly speed: number             // Movement speed (px/s)
  readonly radius: number            // Collider radius (px)
  readonly hp: number                // Max health
  readonly budgetCost: number        // Fodder budget cost (0 for non-spawner types)
  readonly dropChance: number        // Item drop probability on death (0-1)

  // Detection
  readonly aggroRange: number        // Distance to detect player
  readonly attackRange: number       // Distance to begin attack sequence
  readonly losRequired: boolean      // Requires line-of-sight for aggro?

  // Attack timing
  readonly telegraphDuration: number // Seconds in TELEGRAPH state
  readonly recoveryDuration: number  // Seconds in RECOVERY state
  readonly cooldown: number          // Seconds between attack cycles
  readonly damage: number            // Damage dealt per attack

  // Attack behavior
  readonly attackStyle: AttackStyle

  // Projectile config (attackStyle = 'projectile')
  readonly projectileSpeed?: number
  readonly projectileAccel?: number
  readonly projectileDrag?: number
  readonly projectileCount?: number
  readonly spreadAngle?: number
  readonly bulletSpriteId?: BulletSpriteIdValue

  // Melee config (attackStyle = 'melee')
  readonly meleeReach?: number
  readonly attackDuration?: number
  readonly knockbackSpeed?: number
  readonly knockbackDuration?: number

  // Rush config (attackStyle = 'rush')
  readonly rushSpeed?: number
  readonly rushDuration?: number

  // Steering
  readonly preferredRange: number    // Orbit distance (0 = rush to target)
  readonly separationRadius: number  // Minimum spacing from allies

  // Spawn timing
  readonly initialDelayMin: number   // Min initial delay on spawn (seconds)
  readonly initialDelayMax: number   // Max initial delay on spawn (seconds)

}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const registry = new Map<number, EnemyDefinition>()

/** Register an enemy definition. Idempotent — skips if type already registered. */
export function registerEnemy(def: EnemyDefinition): void {
  if (registry.has(def.type)) return
  registry.set(def.type, def)
}

/** Look up an enemy definition by EnemyType value. */
export function getEnemyDef(type: number): EnemyDefinition | undefined {
  return registry.get(type)
}

/** Iterate all registered enemy definitions. */
export function allEnemyDefs(): Iterable<EnemyDefinition> {
  return registry.values()
}

/** Check if a type is registered in the enemy registry. */
export function isRegisteredEnemy(type: number): boolean {
  return registry.has(type)
}

/** Returns true if any enemies have been registered. */
export function isEnemyRegistryInitialized(): boolean {
  return registry.size > 0
}
