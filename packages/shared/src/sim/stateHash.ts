/**
 * Quick state hash for desync detection.
 *
 * Uses FNV-1a on quantized float values to produce deterministic hashes
 * of ECS state. Suitable for comparing client/server state at a given tick.
 */

import { defineQuery } from 'bitecs'
import { Player, Position, Health, Enemy, EnemyAI } from './components'
import type { GameWorld } from './world'

const playerQuery = defineQuery([Player, Position, Health])
const enemyQuery = defineQuery([Enemy, Position, Health])

// FNV-1a constants (32-bit)
const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193

function fnv1a(hash: number, value: number): number {
  // Quantize to 2 decimal places
  const q = Math.round(value * 100) | 0
  // Feed 4 bytes of the int32
  hash ^= q & 0xff
  hash = Math.imul(hash, FNV_PRIME) >>> 0
  hash ^= (q >>> 8) & 0xff
  hash = Math.imul(hash, FNV_PRIME) >>> 0
  hash ^= (q >>> 16) & 0xff
  hash = Math.imul(hash, FNV_PRIME) >>> 0
  hash ^= (q >>> 24) & 0xff
  hash = Math.imul(hash, FNV_PRIME) >>> 0
  return hash
}

export interface StateHashResult {
  full: number
  positions: number
  health: number
  enemies: number
  rng: number
}

/**
 * Compute a quick hash of the game world for desync detection.
 * Hashes player positions + HP, enemy positions + HP + AI state, tick, and RNG state.
 */
export function computeQuickHash(world: GameWorld): number {
  let hash = FNV_OFFSET

  // World tick
  hash = fnv1a(hash, world.tick)

  // RNG state
  hash = fnv1a(hash, world.rng.getState())

  // Players
  const players = playerQuery(world)
  for (const eid of players) {
    hash = fnv1a(hash, Position.x[eid]!)
    hash = fnv1a(hash, Position.y[eid]!)
    hash = fnv1a(hash, Health.current[eid]!)
  }

  // Enemies
  const enemies = enemyQuery(world)
  for (const eid of enemies) {
    hash = fnv1a(hash, Position.x[eid]!)
    hash = fnv1a(hash, Position.y[eid]!)
    hash = fnv1a(hash, Health.current[eid]!)
    hash = fnv1a(hash, EnemyAI.state[eid]!)
  }

  return hash
}

/**
 * Compute per-subsystem hashes for isolating desync sources.
 */
export function computeStateHash(world: GameWorld): StateHashResult {
  let posHash = FNV_OFFSET
  let hpHash = FNV_OFFSET
  let enemyHash = FNV_OFFSET
  let rngHash = FNV_OFFSET

  // Tick in all subsystem hashes
  posHash = fnv1a(posHash, world.tick)
  hpHash = fnv1a(hpHash, world.tick)
  enemyHash = fnv1a(enemyHash, world.tick)

  // RNG
  rngHash = fnv1a(rngHash, world.tick)
  rngHash = fnv1a(rngHash, world.rng.getState())

  // Players
  const players = playerQuery(world)
  for (const eid of players) {
    posHash = fnv1a(posHash, Position.x[eid]!)
    posHash = fnv1a(posHash, Position.y[eid]!)
    hpHash = fnv1a(hpHash, Health.current[eid]!)
    hpHash = fnv1a(hpHash, Health.max[eid]!)
  }

  // Enemies
  const enemies = enemyQuery(world)
  for (const eid of enemies) {
    posHash = fnv1a(posHash, Position.x[eid]!)
    posHash = fnv1a(posHash, Position.y[eid]!)
    hpHash = fnv1a(hpHash, Health.current[eid]!)
    enemyHash = fnv1a(enemyHash, Enemy.type[eid]!)
    enemyHash = fnv1a(enemyHash, EnemyAI.state[eid]!)
  }

  // Full hash combines all subsystems
  let full = FNV_OFFSET
  full = fnv1a(full, posHash)
  full = fnv1a(full, hpHash)
  full = fnv1a(full, enemyHash)
  full = fnv1a(full, rngHash)

  return { full, positions: posHash, health: hpHash, enemies: enemyHash, rng: rngHash }
}
