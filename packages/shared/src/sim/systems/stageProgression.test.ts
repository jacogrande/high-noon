import { describe, expect, test, beforeEach } from 'bun:test'
import { defineQuery } from 'bitecs'
import { createGameWorld, setWorldTilemap, startRun, type GameWorld } from '../world'
import { createTestArena } from '../content/maps/testArena'
import { Enemy, EnemyType, EnemyTier, Position, Health, Bullet } from '../components'
import { stageProgressionSystem, clearAllEnemies } from './stageProgression'
import { waveSpawnerSystem } from './waveSpawner'
import { healthSystem } from './health'
import { spawnPlayer } from '../prefabs'
import type { StageEncounter, WaveDefinition } from '../content/waves'

const TEST_SEED = 54321
const DT = 1 / 60

const enemyQuery = defineQuery([Enemy, Position])
const bulletQuery = defineQuery([Bullet])

/** Create a minimal 1-wave encounter */
function makeEncounter(wave: Partial<WaveDefinition>): StageEncounter {
  return {
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

/** Kill an enemy by zeroing HP and running healthSystem */
function killEnemy(world: GameWorld, eid: number): void {
  Health.current[eid] = 0
  healthSystem(world, DT)
}

/** Tick wave spawner only (not stage progression, so tests can control it) */
function tickWaveSpawner(world: GameWorld): void {
  waveSpawnerSystem(world, DT)
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

/** Kill all threats and tick wave spawner until encounter completes.
 * Does NOT run stageProgressionSystem — caller controls that. */
function completeCurrentEncounter(world: GameWorld): void {
  // Tick to activate wave and spawn threats
  for (let i = 0; i < 10; i++) tickWaveSpawner(world)

  const enc = world.encounter!
  let safety = 0
  while (!enc.completed && safety < 500) {
    const threats = getThreatEids(world)
    for (const eid of threats) {
      killEnemy(world, eid)
    }
    // Kill all remaining fodder
    for (const eid of enemyQuery(world)) {
      killEnemy(world, eid)
    }
    tickWaveSpawner(world)
    safety++
  }
  if (!enc.completed) throw new Error('Failed to complete encounter')
}

describe('stageProgressionSystem', () => {
  let world: GameWorld

  beforeEach(() => {
    world = createGameWorld(TEST_SEED)
    setWorldTilemap(world, createTestArena())
    spawnPlayer(world, 800, 600)
  })

  test('no-ops when world.run is null', () => {
    stageProgressionSystem(world, DT)
    // Nothing should happen - no crash
    expect(world.run).toBeNull()
  })

  test('no-ops when run is completed', () => {
    const stages = [makeEncounter({ threats: [{ type: EnemyType.SHOOTER, count: 1 }] })]
    startRun(world, stages)
    world.run!.completed = true
    stageProgressionSystem(world, DT)
    // Should remain completed, no transition
    expect(world.run!.completed).toBe(true)
    expect(world.run!.transition).toBe('none')
  })

  test('encounter completion triggers clearing phase', () => {
    const stages = [
      makeEncounter({ threats: [{ type: EnemyType.SHOOTER, count: 1 }] }),
      makeEncounter({ threats: [{ type: EnemyType.SHOOTER, count: 1 }] }),
    ]
    startRun(world, stages)

    // Complete the encounter (wave spawner only)
    completeCurrentEncounter(world)
    expect(world.encounter!.completed).toBe(true)

    // Now run stage progression to detect completion
    stageProgressionSystem(world, DT)

    expect(world.run!.transition).toBe('clearing')
    expect(world.run!.transitionTimer).toBeCloseTo(3.0, 1)
    expect(world.stageCleared).toBe(true)
  })

  test('stageCleared flag is only true on the clearing tick', () => {
    const stages = [
      makeEncounter({ threats: [{ type: EnemyType.SHOOTER, count: 1 }] }),
      makeEncounter({ threats: [{ type: EnemyType.SHOOTER, count: 1 }] }),
    ]
    startRun(world, stages)

    // Complete encounter
    completeCurrentEncounter(world)
    stageProgressionSystem(world, DT) // triggers clearing
    expect(world.stageCleared).toBe(true)

    // On the next tick, flag should reset
    stageProgressionSystem(world, DT)
    expect(world.stageCleared).toBe(false)
  })

  test('enemies cleared on stage clear', () => {
    const stages = [
      makeEncounter({
        fodderBudget: 10,
        maxFodderAlive: 5,
        threats: [{ type: EnemyType.SHOOTER, count: 1 }],
      }),
      makeEncounter({ threats: [{ type: EnemyType.SHOOTER, count: 1 }] }),
    ]
    startRun(world, stages)

    // Tick to spawn some enemies
    for (let i = 0; i < 20; i++) tickWaveSpawner(world)

    // Complete the encounter
    completeCurrentEncounter(world)
    stageProgressionSystem(world, DT) // triggers clearing + clearAllEnemies

    // All enemies should be gone
    expect(enemyQuery(world).length).toBe(0)
  })

  test('clearing timer counts down', () => {
    const stages = [
      makeEncounter({ threats: [{ type: EnemyType.SHOOTER, count: 1 }] }),
      makeEncounter({ threats: [{ type: EnemyType.SHOOTER, count: 1 }] }),
    ]
    startRun(world, stages)

    completeCurrentEncounter(world)
    stageProgressionSystem(world, DT) // triggers clearing

    const initialTimer = world.run!.transitionTimer
    stageProgressionSystem(world, 1.0) // advance 1 second
    expect(world.run!.transitionTimer).toBeCloseTo(initialTimer - 1.0, 1)
    expect(world.run!.transition).toBe('clearing')
  })

  test('next stage starts after clearing timer expires', () => {
    const stages = [
      makeEncounter({ threats: [{ type: EnemyType.SHOOTER, count: 1 }] }),
      makeEncounter({ threats: [{ type: EnemyType.SHOOTER, count: 1 }] }),
    ]
    startRun(world, stages)
    expect(world.run!.currentStage).toBe(0)

    completeCurrentEncounter(world)
    stageProgressionSystem(world, DT) // triggers clearing

    // Advance past the clearing timer (3s)
    stageProgressionSystem(world, 4.0)

    expect(world.run!.currentStage).toBe(1)
    expect(world.run!.transition).toBe('none')
    expect(world.run!.completed).toBe(false)
    // New encounter should be active
    expect(world.encounter).not.toBeNull()
    expect(world.encounter!.completed).toBe(false)
  })

  test('run completes after final stage', () => {
    const stages = [
      makeEncounter({ threats: [{ type: EnemyType.SHOOTER, count: 1 }] }),
    ]
    startRun(world, stages)

    completeCurrentEncounter(world)
    stageProgressionSystem(world, DT) // triggers clearing

    // Advance past clearing timer
    stageProgressionSystem(world, 4.0)

    expect(world.run!.completed).toBe(true)
    expect(world.run!.transition).toBe('none')
    expect(world.run!.currentStage).toBe(1) // past end
  })

  test('player state persists across stages', () => {
    const stages = [
      makeEncounter({ threats: [{ type: EnemyType.SHOOTER, count: 1 }] }),
      makeEncounter({ threats: [{ type: EnemyType.SHOOTER, count: 1 }] }),
    ]
    startRun(world, stages)

    // Get player state before transition
    const playerEids = defineQuery([Position, Health])(world)
      .filter(eid => !Enemy.type[eid])
    expect(playerEids.length).toBeGreaterThan(0)
    const playerEid = playerEids[0]!
    const hpBefore = Health.current[playerEid]!
    const posXBefore = Position.x[playerEid]!
    const posYBefore = Position.y[playerEid]!

    completeCurrentEncounter(world)
    stageProgressionSystem(world, DT) // clearing
    stageProgressionSystem(world, 4.0) // advance to stage 2

    // Player should still exist with same state
    expect(Health.current[playerEid]).toBe(hpBefore)
    expect(Position.x[playerEid]).toBe(posXBefore)
    expect(Position.y[playerEid]).toBe(posYBefore)
  })

  test('full 2-stage run integration', () => {
    const stages = [
      makeEncounter({ threats: [{ type: EnemyType.SHOOTER, count: 1 }] }),
      makeEncounter({ threats: [{ type: EnemyType.SHOOTER, count: 1 }] }),
    ]
    startRun(world, stages)

    // Stage 1
    expect(world.run!.currentStage).toBe(0)
    completeCurrentEncounter(world)
    stageProgressionSystem(world, DT) // clearing
    stageProgressionSystem(world, 4.0) // advance

    // Stage 2
    expect(world.run!.currentStage).toBe(1)
    expect(world.run!.completed).toBe(false)

    completeCurrentEncounter(world)
    stageProgressionSystem(world, DT) // clearing
    stageProgressionSystem(world, 4.0) // advance

    // Run complete
    expect(world.run!.completed).toBe(true)
  })

  test('clearAllEnemies removes enemies and bullets', () => {
    const stages = [makeEncounter({
      fodderBudget: 10,
      maxFodderAlive: 5,
      threats: [{ type: EnemyType.SHOOTER, count: 1 }],
    })]
    startRun(world, stages)

    // Tick to spawn enemies
    for (let i = 0; i < 30; i++) tickWaveSpawner(world)
    expect(enemyQuery(world).length).toBeGreaterThan(0)

    clearAllEnemies(world)

    expect(enemyQuery(world).length).toBe(0)
    expect(bulletQuery(world).length).toBe(0)
    expect(world.flowField).toBeNull()
    expect(world.spatialHash).toBeNull()
    expect(world.goldNuggets.length).toBe(0)
    expect(world.dustClouds.length).toBe(0)
    expect(world.dynamites.length).toBe(0)
    expect(world.rockslideShockwaves.length).toBe(0)
  })
})
