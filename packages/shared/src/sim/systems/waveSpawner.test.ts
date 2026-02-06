import { describe, expect, test, beforeEach } from 'bun:test'
import { defineQuery } from 'bitecs'
import { createGameWorld, setWorldTilemap, setEncounter, type GameWorld } from '../world'
import { createTestArena } from '../content/maps/testArena'
import { Enemy, EnemyType, EnemyTier, Position } from '../components'
import { waveSpawnerSystem, pickSpawnPosition } from './waveSpawner'
import { spawnPlayer } from '../prefabs'
import { SeededRng } from '../../math/rng'
import type { StageEncounter, WaveDefinition } from '../content/waves'

const TEST_SEED = 12345

const enemyQuery = defineQuery([Enemy, Position])

/** Create a minimal 1-wave encounter for testing */
function makeEncounter(wave: Partial<WaveDefinition>): StageEncounter {
  return {
    waves: [{
      fodderBudget: wave.fodderBudget ?? 0,
      fodderPool: wave.fodderPool ?? [{ type: EnemyType.SWARMER, weight: 1 }],
      maxFodderAlive: wave.maxFodderAlive ?? 10,
      threats: wave.threats ?? [],
      spawnDelay: wave.spawnDelay ?? 0,
    }],
  }
}

/** Create a 2-wave encounter */
function makeTwoWaveEncounter(
  wave1: Partial<WaveDefinition>,
  wave2: Partial<WaveDefinition>,
): StageEncounter {
  return {
    waves: [
      {
        fodderBudget: wave1.fodderBudget ?? 0,
        fodderPool: wave1.fodderPool ?? [{ type: EnemyType.SWARMER, weight: 1 }],
        maxFodderAlive: wave1.maxFodderAlive ?? 10,
        threats: wave1.threats ?? [],
        spawnDelay: wave1.spawnDelay ?? 0,
      },
      {
        fodderBudget: wave2.fodderBudget ?? 0,
        fodderPool: wave2.fodderPool ?? [{ type: EnemyType.SWARMER, weight: 1 }],
        maxFodderAlive: wave2.maxFodderAlive ?? 10,
        threats: wave2.threats ?? [],
        spawnDelay: wave2.spawnDelay ?? 3,
      },
    ],
  }
}

/** Count enemies by tier */
function countByTier(world: GameWorld) {
  const enemies = enemyQuery(world)
  let fodder = 0
  let threat = 0
  for (const eid of enemies) {
    if (Enemy.tier[eid] === EnemyTier.FODDER) fodder++
    else threat++
  }
  return { fodder, threat, total: enemies.length }
}

/** Count enemies by type */
function countByType(world: GameWorld) {
  const enemies = enemyQuery(world)
  const counts: Record<number, number> = {}
  for (const eid of enemies) {
    const t = Enemy.type[eid]!
    counts[t] = (counts[t] ?? 0) + 1
  }
  return counts
}

describe('waveSpawnerSystem', () => {
  let world: GameWorld

  beforeEach(() => {
    world = createGameWorld(TEST_SEED)
    setWorldTilemap(world, createTestArena())
    spawnPlayer(world, 800, 600)
  })

  describe('wave activation', () => {
    test('spawns threats immediately on wave activation', () => {
      const encounter = makeEncounter({
        threats: [{ type: EnemyType.SHOOTER, count: 2 }],
        spawnDelay: 0,
      })
      setEncounter(world, encounter)

      // spawnDelay=0, so first tick activates the wave
      waveSpawnerSystem(world, 1 / 60)

      const counts = countByTier(world)
      expect(counts.threat).toBe(2)
    })

    test('spawns initial fodder burst on wave activation', () => {
      const encounter = makeEncounter({
        fodderBudget: 20,
        maxFodderAlive: 6,
        fodderPool: [{ type: EnemyType.SWARMER, weight: 1 }],
        spawnDelay: 0,
      })
      setEncounter(world, encounter)

      waveSpawnerSystem(world, 1 / 60)

      // Initial burst = floor(maxFodderAlive / 2) = 3
      const counts = countByTier(world)
      expect(counts.fodder).toBe(3)
    })

    test('waits for spawnDelay before activating', () => {
      const encounter = makeEncounter({
        threats: [{ type: EnemyType.SHOOTER, count: 1 }],
        spawnDelay: 2,
      })
      setEncounter(world, encounter)

      // Tick with small dt — wave should not activate yet
      waveSpawnerSystem(world, 1.0)
      expect(countByTier(world).total).toBe(0)

      // Another second — wave should activate
      waveSpawnerSystem(world, 1.1)
      expect(countByTier(world).threat).toBe(1)
    })
  })

  describe('fodder reinforcement', () => {
    test('spawns fodder when below maxFodderAlive', () => {
      const encounter = makeEncounter({
        fodderBudget: 20,
        maxFodderAlive: 8,
        fodderPool: [{ type: EnemyType.SWARMER, weight: 1 }],
        spawnDelay: 0,
      })
      setEncounter(world, encounter)

      // Activate wave (burst spawns floor(8/2) = 4 swarmers)
      waveSpawnerSystem(world, 1 / 60)
      const afterActivation = countByTier(world).fodder
      expect(afterActivation).toBe(4)

      // Simulate enough time for reinforcements (3/sec rate)
      // 1 second = 3 potential spawns, but capped by maxFodderAlive
      waveSpawnerSystem(world, 1.0)
      const afterReinforcement = countByTier(world).fodder
      expect(afterReinforcement).toBeGreaterThan(afterActivation)
      expect(afterReinforcement).toBeLessThanOrEqual(8)
    })

    test('stops spawning when budget exhausted', () => {
      const encounter = makeEncounter({
        fodderBudget: 3, // Only 3 swarmers (cost 1 each)
        maxFodderAlive: 10,
        fodderPool: [{ type: EnemyType.SWARMER, weight: 1 }],
        spawnDelay: 0,
      })
      setEncounter(world, encounter)

      // Activate and keep ticking
      waveSpawnerSystem(world, 1 / 60) // burst
      waveSpawnerSystem(world, 5.0) // lots of time for reinforcements

      // Should never exceed budget
      const counts = countByTier(world)
      expect(counts.fodder).toBeLessThanOrEqual(3)
      expect(world.encounter!.fodderBudgetRemaining).toBe(0)
    })

    test('falls back to cheaper fodder type when budget is insufficient for picked type', () => {
      // Pool: grunts (cost 2) listed first with high weight, swarmers (cost 1) listed second
      // Budget of 1 means the system will pick a grunt, fail the cost check,
      // then fall back to a swarmer from the pool scan
      const encounter = makeEncounter({
        fodderBudget: 1,
        maxFodderAlive: 10,
        // Grunt weight is very high — almost always picked first by RNG
        fodderPool: [
          { type: EnemyType.GRUNT, weight: 100 },
          { type: EnemyType.SWARMER, weight: 1 },
        ],
        spawnDelay: 0,
      })
      setEncounter(world, encounter)

      // Activate — burst of floor(10/2)=5 but only 1 budget
      // Burst loop: picks grunt (cost 2), can't afford → continue
      // Then reinforcement loop picks grunt → can't afford → fallback finds swarmer (cost 1)
      waveSpawnerSystem(world, 1 / 60)
      waveSpawnerSystem(world, 1.0) // reinforcement tick

      // Should have spawned exactly 1 swarmer via fallback
      const types = countByType(world)
      expect(types[EnemyType.SWARMER] ?? 0).toBe(1)
      expect(types[EnemyType.GRUNT] ?? 0).toBe(0)
      expect(world.encounter!.fodderBudgetRemaining).toBe(0)
    })

    test('stops spawning when no affordable type exists', () => {
      // Only grunts (cost 2) in pool, budget of 1
      const encounter = makeEncounter({
        fodderBudget: 1,
        maxFodderAlive: 10,
        fodderPool: [{ type: EnemyType.GRUNT, weight: 1 }],
        spawnDelay: 0,
      })
      setEncounter(world, encounter)

      waveSpawnerSystem(world, 1 / 60)
      waveSpawnerSystem(world, 5.0)

      // Can't afford any grunt — no fodder spawned
      expect(countByTier(world).fodder).toBe(0)
      // Budget remains unspent
      expect(world.encounter!.fodderBudgetRemaining).toBe(1)
    })
  })

  describe('wave clear', () => {
    test('clears wave when threats dead and fodder budget spent and no fodder alive', () => {
      // Wave with no threats and no fodder budget = immediate clear
      const encounter = makeEncounter({
        fodderBudget: 0,
        threats: [],
        spawnDelay: 0,
      })
      setEncounter(world, encounter)

      waveSpawnerSystem(world, 1 / 60)

      // With 0 budget, 0 threats, wave activates and immediately clears
      expect(world.encounter!.completed).toBe(true)
    })
  })

  describe('multi-wave progression', () => {
    test('next wave starts after spawnDelay', () => {
      // Two waves: first has no enemies (instant clear), second has a threat
      const encounter = makeTwoWaveEncounter(
        { fodderBudget: 0, threats: [], spawnDelay: 0 },
        { fodderBudget: 0, threats: [{ type: EnemyType.SHOOTER, count: 1 }], spawnDelay: 3 },
      )
      setEncounter(world, encounter)

      // Activate wave 1 — instantly clears
      waveSpawnerSystem(world, 1 / 60)
      expect(world.encounter!.currentWave).toBe(1)
      expect(world.encounter!.waveActive).toBe(false)

      // Tick 1 second — not enough delay for wave 2
      waveSpawnerSystem(world, 1.0)
      expect(world.encounter!.waveActive).toBe(false)
      expect(countByTier(world).total).toBe(0)

      // Tick another 2.1 seconds — delay complete (3.0 total >= 3)
      waveSpawnerSystem(world, 2.1)
      expect(world.encounter!.waveActive).toBe(true)
      expect(countByTier(world).threat).toBe(1)
    })

    test('encounter completes after final wave', () => {
      const encounter = makeEncounter({
        fodderBudget: 0,
        threats: [],
        spawnDelay: 0,
      })
      setEncounter(world, encounter)

      waveSpawnerSystem(world, 1 / 60)
      expect(world.encounter!.completed).toBe(true)
      expect(world.encounter!.currentWave).toBe(1)
    })
  })

  describe('spawn positioning', () => {
    test('spawn positions are within playable bounds', () => {
      const rng = new SeededRng(42)
      for (let i = 0; i < 50; i++) {
        const pos = pickSpawnPosition(rng, 800, 600, null)
        // Playable bounds: 32..1568, 32..1184
        // Spawn inset: 48px from walls
        expect(pos.x).toBeGreaterThanOrEqual(48)
        expect(pos.x).toBeLessThanOrEqual(1552)
        expect(pos.y).toBeGreaterThanOrEqual(48)
        expect(pos.y).toBeLessThanOrEqual(1168)
      }
    })

    test('spawn positions respect minimum distance from player', () => {
      const rng = new SeededRng(42)
      const playerX = 800
      const playerY = 600
      const minDist = 200

      for (let i = 0; i < 100; i++) {
        const pos = pickSpawnPosition(rng, playerX, playerY, null, minDist)
        const dx = pos.x - playerX
        const dy = pos.y - playerY
        const dist = Math.sqrt(dx * dx + dy * dy)
        // Player at center is far from edges — all spawns should respect minDist
        expect(dist).toBeGreaterThanOrEqual(minDist)
      }
    })
  })

  describe('encounter state', () => {
    test('does nothing when encounter is null', () => {
      // No encounter set
      waveSpawnerSystem(world, 1 / 60)
      expect(countByTier(world).total).toBe(0)
    })

    test('does nothing when encounter is completed', () => {
      const encounter = makeEncounter({ spawnDelay: 0, fodderBudget: 0, threats: [] })
      setEncounter(world, encounter)

      // Complete the encounter
      waveSpawnerSystem(world, 1 / 60)
      expect(world.encounter!.completed).toBe(true)

      // Further ticks should be no-ops
      const prevTotal = countByTier(world).total
      waveSpawnerSystem(world, 1 / 60)
      expect(countByTier(world).total).toBe(prevTotal)
    })
  })

  describe('weighted pool selection', () => {
    test('pool with single type always selects that type', () => {
      const encounter = makeEncounter({
        fodderBudget: 10,
        maxFodderAlive: 10,
        fodderPool: [{ type: EnemyType.GRUNT, weight: 1 }],
        spawnDelay: 0,
      })
      setEncounter(world, encounter)

      waveSpawnerSystem(world, 1 / 60)

      const enemies = enemyQuery(world)
      for (const eid of enemies) {
        expect(Enemy.type[eid]).toBe(EnemyType.GRUNT)
      }
    })
  })

  describe('determinism', () => {
    test('same seed produces identical spawns', () => {
      const encounter = makeEncounter({
        fodderBudget: 10,
        maxFodderAlive: 6,
        fodderPool: [
          { type: EnemyType.SWARMER, weight: 2 },
          { type: EnemyType.GRUNT, weight: 1 },
        ],
        threats: [{ type: EnemyType.SHOOTER, count: 1 }],
        spawnDelay: 0,
      })

      // Run 1
      const world1 = createGameWorld(999)
      setWorldTilemap(world1, createTestArena())
      spawnPlayer(world1, 800, 600)
      setEncounter(world1, encounter)
      waveSpawnerSystem(world1, 1 / 60)
      waveSpawnerSystem(world1, 0.5)

      // Run 2 — same seed
      const world2 = createGameWorld(999)
      setWorldTilemap(world2, createTestArena())
      spawnPlayer(world2, 800, 600)
      setEncounter(world2, encounter)
      waveSpawnerSystem(world2, 1 / 60)
      waveSpawnerSystem(world2, 0.5)

      // Both runs should produce identical enemy positions and types
      const enemies1 = enemyQuery(world1)
      const enemies2 = enemyQuery(world2)
      expect(enemies1.length).toBe(enemies2.length)

      for (let i = 0; i < enemies1.length; i++) {
        const e1 = enemies1[i]!
        const e2 = enemies2[i]!
        expect(Enemy.type[e1]).toBe(Enemy.type[e2])
        expect(Position.x[e1]).toBe(Position.x[e2])
        expect(Position.y[e1]).toBe(Position.y[e2])
      }
    })
  })
})
