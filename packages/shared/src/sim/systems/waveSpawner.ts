/**
 * Wave Spawner System
 *
 * Director-Wave hybrid that spawns enemies in escalating blended waves.
 * Fodder reinforces continuously (up to maxFodderAlive) while threats
 * are finite and meaningful kills. Wave advances when enough threats
 * have been killed (per threatClearRatio). Surviving enemies carry over.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import type { SeededRng } from '../../math/rng'
import { Enemy, EnemyType, EnemyTier, Position, Dead } from '../components'
import { spawnSwarmer, spawnGrunt, spawnShooter, spawnCharger } from '../prefabs'
import { getPlayableBounds } from '../content/maps/testArena'
import { isSolidAt, type Tilemap } from '../tilemap'
import { playerQuery } from '../queries'
import {
  SWARMER_BUDGET_COST, GRUNT_BUDGET_COST,
} from '../content/enemies'
import type { FodderPool } from '../content/waves'

/** Fodder spawn rate in enemies per second */
const FODDER_SPAWN_RATE = 3.0

const enemyQuery = defineQuery([Enemy, Position])

/** Spawn function lookup by EnemyType */
const SPAWN_FN: Record<number, (world: GameWorld, x: number, y: number) => number> = {
  [EnemyType.SWARMER]: spawnSwarmer,
  [EnemyType.GRUNT]: spawnGrunt,
  [EnemyType.SHOOTER]: spawnShooter,
  [EnemyType.CHARGER]: spawnCharger,
}

/** Budget cost lookup by EnemyType (only fodder types have costs) */
const BUDGET_COST: Record<number, number> = {
  [EnemyType.SWARMER]: SWARMER_BUDGET_COST,
  [EnemyType.GRUNT]: GRUNT_BUDGET_COST,
}

/** Cached spawn bounds — computed once from playable bounds with inset */
let cachedSpawnBounds: { left: number; right: number; top: number; bottom: number } | null = null

function getSpawnBounds() {
  if (!cachedSpawnBounds) {
    const bounds = getPlayableBounds()
    // Inset by 1.5 tiles to avoid spawning inside or adjacent to border walls
    const inset = 48
    cachedSpawnBounds = {
      left: bounds.minX + inset,
      right: bounds.maxX - inset,
      top: bounds.minY + inset,
      bottom: bounds.maxY - inset,
    }
  }
  return cachedSpawnBounds
}

/**
 * Pick a spawn position in the playable area that is:
 * - At least minDist pixels from the player
 * - Not inside a solid tile (wall/obstacle)
 *
 * When spawnRadius > 0, uses ring-based spawning: picks points at
 * spawnRadius ± radiusSpread from the player (just off-screen).
 * Falls back to uniform random if ring positions fail (e.g. player near edge).
 *
 * When spawnRadius = 0, uses uniform random (legacy behavior).
 */
export function pickSpawnPosition(
  rng: SeededRng,
  playerX: number,
  playerY: number,
  tilemap: Tilemap | null,
  minDist = 200,
  spawnRadius = 0,
  radiusSpread = 0,
): { x: number; y: number } {
  const { left, right, top, bottom } = getSpawnBounds()

  if (spawnRadius > 0) {
    // Ring-based spawning: pick points on a ring around the player
    for (let attempt = 0; attempt < 20; attempt++) {
      const angle = rng.next() * Math.PI * 2
      const dist = spawnRadius + rng.nextRange(-radiusSpread, radiusSpread)
      const x = Math.max(left, Math.min(right, playerX + Math.cos(angle) * dist))
      const y = Math.max(top, Math.min(bottom, playerY + Math.sin(angle) * dist))

      // Reject if inside a wall
      if (tilemap && isSolidAt(tilemap, x, y)) continue

      // Reject if clamping moved the point too close to the player
      const dx = x - playerX
      const dy = y - playerY
      if (dx * dx + dy * dy < minDist * minDist) continue

      return { x, y }
    }
  } else {
    // Uniform random spawning (legacy behavior)
    for (let attempt = 0; attempt < 20; attempt++) {
      const x = rng.nextRange(left, right)
      const y = rng.nextRange(top, bottom)

      if (tilemap && isSolidAt(tilemap, x, y)) continue

      const dx = x - playerX
      const dy = y - playerY
      if (dx * dx + dy * dy < minDist * minDist) continue

      return { x, y }
    }
  }

  // Relaxed fallback — drop minDist requirement, still avoid walls
  for (let attempt = 0; attempt < 10; attempt++) {
    const x = rng.nextRange(left, right)
    const y = rng.nextRange(top, bottom)

    if (tilemap && isSolidAt(tilemap, x, y)) continue
    return { x, y }
  }

  // Final fallback — just pick a random open position
  return {
    x: rng.nextRange(left, right),
    y: rng.nextRange(top, bottom),
  }
}

/**
 * Pick a fodder type from the weighted pool
 */
function pickFromPool(rng: SeededRng, pool: FodderPool[]): number {
  let totalWeight = 0
  for (const entry of pool) {
    totalWeight += entry.weight
  }
  let roll = rng.next() * totalWeight
  for (const entry of pool) {
    roll -= entry.weight
    if (roll <= 0) return entry.type
  }
  return pool[pool.length - 1]!.type
}

/**
 * Spawn an enemy of the given type at the given position
 */
function spawnEnemy(world: GameWorld, type: number, x: number, y: number): number {
  const fn = SPAWN_FN[type]
  if (!fn) throw new Error(`Unknown enemy type: ${type}`)
  return fn(world, x, y)
}

export function waveSpawnerSystem(world: GameWorld, dt: number): void {
  const enc = world.encounter
  if (!enc || enc.completed) return

  const rng = world.rng

  // Find player position for spawn distance checks
  const players = playerQuery(world)
  let playerX = 0
  let playerY = 0
  for (const pid of players) {
    if (!hasComponent(world, Dead, pid)) {
      playerX = Position.x[pid]!
      playerY = Position.y[pid]!
      break
    }
  }

  // Count alive enemies by tier (single query, used for both reinforcement and clear check)
  const allEnemies = enemyQuery(world)
  let fodderAlive = 0
  let threatAlive = 0
  for (const eid of allEnemies) {
    if (hasComponent(world, Dead, eid)) continue
    if (Enemy.tier[eid] === EnemyTier.FODDER) {
      fodderAlive++
    } else {
      threatAlive++
    }
  }
  enc.fodderAliveCount = fodderAlive
  enc.threatAliveCount = threatAlive

  // Detect threat deaths via tick-over-tick delta (before spawning new ones)
  const threatDeaths = enc.prevThreatAlive - threatAlive
  if (threatDeaths > 0) {
    enc.threatKilledThisWave += threatDeaths
  }

  // Track threats spawned this tick so we can update prevThreatAlive correctly
  let threatsSpawnedThisTick = 0

  // Pre-wave delay
  if (!enc.waveActive) {
    enc.waveTimer -= dt
    if (enc.waveTimer <= 0) {
      // Activate current wave
      const waveDef = enc.definition.waves[enc.currentWave]!
      enc.fodderBudgetRemaining = waveDef.fodderBudget
      enc.totalFodderSpawned = 0
      enc.fodderSpawnAccumulator = 0
      enc.threatKilledThisWave = 0

      // Spawn all threats at once — further out for reaction time
      let threatCount = 0
      for (const threat of waveDef.threats) {
        for (let i = 0; i < threat.count; i++) {
          const pos = pickSpawnPosition(rng, playerX, playerY, world.tilemap, 200, 400, 80)
          spawnEnemy(world, threat.type, pos.x, pos.y)
          threatsSpawnedThisTick++
          threatCount++
        }
      }
      enc.threatSpawnedThisWave = threatCount

      // Spawn initial fodder burst: half of maxFodderAlive, capped by budget
      const burstCount = Math.floor(waveDef.maxFodderAlive / 2)
      for (let i = 0; i < burstCount && enc.fodderBudgetRemaining > 0; i++) {
        const type = pickFromPool(rng, waveDef.fodderPool)
        const cost = BUDGET_COST[type] ?? 1
        if (enc.fodderBudgetRemaining < cost) continue
        const pos = pickSpawnPosition(rng, playerX, playerY, world.tilemap, 200, 280, 60)
        spawnEnemy(world, type, pos.x, pos.y)
        enc.fodderBudgetRemaining -= cost
        enc.totalFodderSpawned++
        fodderAlive++
      }

      enc.fodderAliveCount = fodderAlive
      enc.waveActive = true
    } else {
      enc.prevThreatAlive = threatAlive
      return
    }
  }

  // Wave is active — reinforcement spawning
  const waveDef = enc.definition.waves[enc.currentWave]!
  enc.fodderSpawnAccumulator += FODDER_SPAWN_RATE * dt

  while (
    enc.fodderSpawnAccumulator >= 1.0 &&
    fodderAlive < waveDef.maxFodderAlive &&
    enc.fodderBudgetRemaining > 0
  ) {
    const type = pickFromPool(rng, waveDef.fodderPool)
    const cost = BUDGET_COST[type] ?? 1
    if (enc.fodderBudgetRemaining < cost) {
      // Can't afford this type — try to find an affordable one
      let found = false
      for (const entry of waveDef.fodderPool) {
        const entryCost = BUDGET_COST[entry.type] ?? 1
        if (enc.fodderBudgetRemaining >= entryCost) {
          const pos = pickSpawnPosition(rng, playerX, playerY, world.tilemap, 200, 280, 60)
          spawnEnemy(world, entry.type, pos.x, pos.y)
          enc.fodderBudgetRemaining -= entryCost
          enc.totalFodderSpawned++
          fodderAlive++
          found = true
          break
        }
      }
      if (!found) break
    } else {
      const pos = pickSpawnPosition(rng, playerX, playerY, world.tilemap, 200, 280, 60)
      spawnEnemy(world, type, pos.x, pos.y)
      enc.fodderBudgetRemaining -= cost
      enc.totalFodderSpawned++
      fodderAlive++
    }
    enc.fodderSpawnAccumulator -= 1.0
  }

  enc.fodderAliveCount = fodderAlive

  // Update threat alive for display (includes carryover + newly spawned)
  const totalThreatsAlive = threatAlive + threatsSpawnedThisTick
  enc.threatAliveCount = totalThreatsAlive

  // Update prevThreatAlive for next tick's death detection
  enc.prevThreatAlive = totalThreatsAlive

  // Wave clear: enough of this wave's threats killed (fodder irrelevant)
  // Survivors carry over into the next wave
  const killsNeeded = Math.ceil(enc.threatSpawnedThisWave * waveDef.threatClearRatio)

  if (enc.threatKilledThisWave >= killsNeeded) {
    enc.waveActive = false
    enc.currentWave++
    if (enc.currentWave >= enc.definition.waves.length) {
      enc.completed = true
    } else {
      enc.waveTimer = enc.definition.waves[enc.currentWave]!.spawnDelay
    }
  }
}
