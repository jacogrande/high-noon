import { describe, expect, test, beforeEach } from 'bun:test'
import { defineQuery } from 'bitecs'
import { createGameWorld, setWorldTilemap, setEncounter, type GameWorld } from '../world'
import { createTestArena } from '../content/maps/testArena'
import { Enemy, EnemyType, EnemyTier, Position, Health } from '../components'
import { waveSpawnerSystem, pickSpawnPosition } from './waveSpawner'
import { healthSystem } from './health'
import { spawnPlayer } from '../prefabs'
import { SeededRng } from '../../math/rng'
import { STAGE_1_ENCOUNTER, type StageEncounter, type WaveDefinition } from '../content/waves'
import { STAGE_1_MAP_CONFIG } from '../content/maps/mapConfig'

const TEST_SEED = 12345

const enemyQuery = defineQuery([Enemy, Position])

/** Create a minimal 1-wave encounter for testing */
function makeEncounter(wave: Partial<WaveDefinition>): StageEncounter {
  return {
    mapConfig: STAGE_1_MAP_CONFIG,
    waves: [{
      fodderBudget: wave.fodderBudget ?? 0,
      fodderPool: wave.fodderPool ?? [{ type: EnemyType.SWARMER, weight: 1 }],
      maxFodderAlive: wave.maxFodderAlive ?? 10,
      threats: wave.threats ?? [],
      spawnDelay: wave.spawnDelay ?? 0,
      threatClearRatio: wave.threatClearRatio ?? 1.0,
    }],
  }
}

/** Create a 2-wave encounter */
function makeTwoWaveEncounter(
  wave1: Partial<WaveDefinition>,
  wave2: Partial<WaveDefinition>,
): StageEncounter {
  return {
    mapConfig: STAGE_1_MAP_CONFIG,
    waves: [
      {
        fodderBudget: wave1.fodderBudget ?? 0,
        fodderPool: wave1.fodderPool ?? [{ type: EnemyType.SWARMER, weight: 1 }],
        maxFodderAlive: wave1.maxFodderAlive ?? 10,
        threats: wave1.threats ?? [],
        spawnDelay: wave1.spawnDelay ?? 0,
        threatClearRatio: wave1.threatClearRatio ?? 1.0,
      },
      {
        fodderBudget: wave2.fodderBudget ?? 0,
        fodderPool: wave2.fodderPool ?? [{ type: EnemyType.SWARMER, weight: 1 }],
        maxFodderAlive: wave2.maxFodderAlive ?? 10,
        threats: wave2.threats ?? [],
        spawnDelay: wave2.spawnDelay ?? 3,
        threatClearRatio: wave2.threatClearRatio ?? 1.0,
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

/** Get threat entity IDs */
function getThreatEids(world: GameWorld): number[] {
  const enemies = enemyQuery(world)
  const threats: number[] = []
  for (const eid of enemies) {
    if (Enemy.tier[eid] === EnemyTier.THREAT) threats.push(eid)
  }
  return threats
}

/** Kill an enemy by zeroing its HP and running healthSystem */
function killEnemy(world: GameWorld, eid: number): void {
  Health.current[eid] = 0
  healthSystem(world, 1 / 60)
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
        threats: [{ type: EnemyType.SHOOTER, count: 1 }], // keeps wave active
        spawnDelay: 0,
      })
      setEncounter(world, encounter)

      // Activate wave (burst spawns floor(8/2) = 4 swarmers + 1 threat)
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
        threats: [{ type: EnemyType.SHOOTER, count: 1 }], // keeps wave active
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
        threats: [{ type: EnemyType.SHOOTER, count: 1 }], // keeps wave active
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
        threats: [{ type: EnemyType.SHOOTER, count: 1 }], // keeps wave active
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
    test('clears wave with 0 threats immediately', () => {
      const encounter = makeEncounter({
        fodderBudget: 0,
        threats: [],
        spawnDelay: 0,
      })
      setEncounter(world, encounter)

      waveSpawnerSystem(world, 1 / 60)

      // 0 threats → killsNeeded = 0 → instantly clears
      expect(world.encounter!.completed).toBe(true)
    })

    test('advances wave when enough threats killed (threshold, not all)', () => {
      // 4 threats, ratio 0.5 → need to kill ceil(4 * 0.5) = 2
      const encounter = makeEncounter({
        fodderBudget: 10,
        threats: [{ type: EnemyType.SHOOTER, count: 4 }],
        spawnDelay: 0,
        threatClearRatio: 0.5,
      })
      setEncounter(world, encounter)

      // Activate wave — 4 threats spawn
      waveSpawnerSystem(world, 1 / 60)
      const threats = getThreatEids(world)
      expect(threats.length).toBe(4)
      expect(world.encounter!.waveActive).toBe(true)

      // Kill 1 threat — not enough
      killEnemy(world, threats[0]!)
      waveSpawnerSystem(world, 1 / 60)
      expect(world.encounter!.waveActive).toBe(true)
      expect(world.encounter!.threatKilledThisWave).toBe(1)

      // Kill 2nd threat — now at threshold (2 kills >= ceil(4 * 0.5))
      killEnemy(world, threats[1]!)
      waveSpawnerSystem(world, 1 / 60)
      expect(world.encounter!.completed).toBe(true)
    })

    test('surviving threats carry over into next wave', () => {
      // Wave 1: 2 threats, ratio 0.5 → kill 1 to advance
      // Wave 2: 1 new threat
      const encounter = makeTwoWaveEncounter(
        {
          fodderBudget: 0,
          threats: [{ type: EnemyType.SHOOTER, count: 2 }],
          spawnDelay: 0,
          threatClearRatio: 0.5,
        },
        {
          fodderBudget: 0,
          threats: [{ type: EnemyType.CHARGER, count: 1 }],
          spawnDelay: 0,
          threatClearRatio: 1.0,
        },
      )
      setEncounter(world, encounter)

      // Activate wave 1
      waveSpawnerSystem(world, 1 / 60)
      expect(countByTier(world).threat).toBe(2)

      // Kill 1 threat → wave advances
      const threats = getThreatEids(world)
      killEnemy(world, threats[0]!)
      waveSpawnerSystem(world, 1 / 60)
      expect(world.encounter!.currentWave).toBe(1)

      // Wave 2 activates (spawnDelay 0) — 1 new threat + 1 carryover = 2
      waveSpawnerSystem(world, 1 / 60)
      expect(countByTier(world).threat).toBe(2)
    })

    test('carryover threat kills do not count toward next wave clear ratio', () => {
      // Wave 1: 2 shooters, ratio 0.5 -> kill 1 to advance (1 shooter carries over)
      // Wave 2: 2 chargers, ratio 1.0 -> must kill both chargers to clear
      const encounter = makeTwoWaveEncounter(
        {
          fodderBudget: 0,
          threats: [{ type: EnemyType.SHOOTER, count: 2 }],
          spawnDelay: 0,
          threatClearRatio: 0.5,
        },
        {
          fodderBudget: 0,
          threats: [{ type: EnemyType.CHARGER, count: 2 }],
          spawnDelay: 0,
          threatClearRatio: 1.0,
        },
      )
      setEncounter(world, encounter)

      // Activate wave 1 and kill one shooter to advance.
      waveSpawnerSystem(world, 1 / 60)
      const wave1Threats = getThreatEids(world)
      killEnemy(world, wave1Threats[0]!)
      waveSpawnerSystem(world, 1 / 60)
      expect(world.encounter!.currentWave).toBe(1)

      // Activate wave 2: 1 carryover shooter + 2 spawned chargers.
      waveSpawnerSystem(world, 1 / 60)
      const allThreats = getThreatEids(world)
      const carryoverShooter = allThreats.find(eid => Enemy.type[eid] === EnemyType.SHOOTER)
      const wave2Chargers = allThreats.filter(eid => Enemy.type[eid] === EnemyType.CHARGER)
      expect(carryoverShooter).toBeDefined()
      expect(wave2Chargers).toHaveLength(2)

      // Kill carryover threat: should NOT progress wave 2 kill counter.
      killEnemy(world, carryoverShooter!)
      waveSpawnerSystem(world, 1 / 60)
      expect(world.encounter!.threatKilledThisWave).toBe(0)
      expect(world.encounter!.waveActive).toBe(true)

      // Kill one wave-2 threat: still not enough for ratio 1.0.
      killEnemy(world, wave2Chargers[0]!)
      waveSpawnerSystem(world, 1 / 60)
      expect(world.encounter!.threatKilledThisWave).toBe(1)
      expect(world.encounter!.waveActive).toBe(true)

      // Kill second wave-2 threat: now final wave can complete.
      killEnemy(world, wave2Chargers[1]!)
      waveSpawnerSystem(world, 1 / 60)
      expect(world.encounter!.completed).toBe(true)
    })

    test('fodder does not block wave progression', () => {
      // Wave with threats + lots of fodder alive, ratio 1.0
      const encounter = makeEncounter({
        fodderBudget: 20,
        maxFodderAlive: 10,
        threats: [{ type: EnemyType.SHOOTER, count: 1 }],
        spawnDelay: 0,
        threatClearRatio: 1.0,
      })
      setEncounter(world, encounter)

      // Activate — spawns 1 threat + fodder burst
      waveSpawnerSystem(world, 1 / 60)
      expect(countByTier(world).fodder).toBeGreaterThan(0)

      // Kill the threat — wave should clear even with fodder still alive
      const threats = getThreatEids(world)
      killEnemy(world, threats[0]!)
      waveSpawnerSystem(world, 1 / 60)

      expect(world.encounter!.completed).toBe(true)
      expect(countByTier(world).fodder).toBeGreaterThan(0) // fodder still alive
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

    test('stage 1 final wave includes the boomstick test boss', () => {
      setEncounter(world, STAGE_1_ENCOUNTER)

      // Wave 1 activate + clear
      waveSpawnerSystem(world, 1 / 60)
      for (const eid of getThreatEids(world)) killEnemy(world, eid)
      waveSpawnerSystem(world, 1 / 60)

      // Wave 2 activates after delay
      waveSpawnerSystem(world, 3.1)
      const types = countByType(world)
      expect(world.encounter!.currentWave).toBe(1)
      expect(types[EnemyType.BOOMSTICK] ?? 0).toBe(1)
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

    test('ring spawn positions cluster near spawnRadius', () => {
      const rng = new SeededRng(42)
      const playerX = 800
      const playerY = 600
      const spawnRadius = 300
      const radiusSpread = 50

      for (let i = 0; i < 100; i++) {
        const pos = pickSpawnPosition(rng, playerX, playerY, null, 200, spawnRadius, radiusSpread)
        const dx = pos.x - playerX
        const dy = pos.y - playerY
        const dist = Math.sqrt(dx * dx + dy * dy)
        // Player is centered — no clamping needed, all spawns should be within ring
        expect(dist).toBeGreaterThanOrEqual(spawnRadius - radiusSpread)
        expect(dist).toBeLessThanOrEqual(spawnRadius + radiusSpread)
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
