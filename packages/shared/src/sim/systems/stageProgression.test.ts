import { describe, expect, test, beforeEach } from 'bun:test'
import { defineQuery } from 'bitecs'
import { createGameWorld, setWorldTilemap, startRun, type GameWorld } from '../world'
import { createTestArena } from '../content/maps/testArena'
import { Enemy, EnemyType, EnemyTier, Position, Health, Bullet, Player } from '../components'
import { stageProgressionSystem, clearAllEnemies, healAllPlayers } from './stageProgression'
import { waveSpawnerSystem } from './waveSpawner'
import { healthSystem } from './health'
import { spawnPlayer } from '../prefabs'
import type { StageEncounter, WaveDefinition } from '../content/waves'
import { STAGE_1_MAP_CONFIG } from '../content/maps/mapConfig'

const TEST_SEED = 54321
const DT = 1 / 60

const enemyQuery = defineQuery([Enemy, Position])
const bulletQuery = defineQuery([Bullet])
const playerQuery = defineQuery([Player, Health])

/** Create a minimal 1-wave encounter */
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
    expect(world.run!.transitionTimer).toBeCloseTo(0.5, 1)
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
    stageProgressionSystem(world, 0.2) // advance 0.2 seconds (still within 0.5s)
    expect(world.run!.transitionTimer).toBeCloseTo(initialTimer - 0.2, 1)
    expect(world.run!.transition).toBe('clearing')
  })

  test('clearing timer expires into camp phase (not directly to next stage)', () => {
    const stages = [
      makeEncounter({ threats: [{ type: EnemyType.SHOOTER, count: 1 }] }),
      makeEncounter({ threats: [{ type: EnemyType.SHOOTER, count: 1 }] }),
    ]
    startRun(world, stages)
    expect(world.run!.currentStage).toBe(0)

    completeCurrentEncounter(world)
    stageProgressionSystem(world, DT) // triggers clearing

    // Advance past the clearing timer (0.5s)
    stageProgressionSystem(world, 1.0)

    // Should be in camp — currentStage stays at the completed stage
    expect(world.run!.transition).toBe('camp')
    expect(world.run!.currentStage).toBe(0)
    expect(world.campComplete).toBe(false)
  })

  test('camp phase waits for campComplete signal then starts next stage', () => {
    const stages = [
      makeEncounter({ threats: [{ type: EnemyType.SHOOTER, count: 1 }] }),
      makeEncounter({ threats: [{ type: EnemyType.SHOOTER, count: 1 }] }),
    ]
    startRun(world, stages)

    completeCurrentEncounter(world)
    stageProgressionSystem(world, DT) // clearing
    stageProgressionSystem(world, 1.0) // -> camp

    expect(world.run!.transition).toBe('camp')

    // Ticking without campComplete should stay in camp
    stageProgressionSystem(world, DT)
    expect(world.run!.transition).toBe('camp')

    // Signal campComplete
    world.campComplete = true
    stageProgressionSystem(world, DT)

    expect(world.run!.transition).toBe('none')
    expect(world.run!.completed).toBe(false)
    expect(world.encounter).not.toBeNull()
    expect(world.encounter!.completed).toBe(false)
  })

  test('campComplete flag resets after use', () => {
    const stages = [
      makeEncounter({ threats: [{ type: EnemyType.SHOOTER, count: 1 }] }),
      makeEncounter({ threats: [{ type: EnemyType.SHOOTER, count: 1 }] }),
    ]
    startRun(world, stages)

    completeCurrentEncounter(world)
    stageProgressionSystem(world, DT) // clearing
    stageProgressionSystem(world, 1.0) // -> camp

    world.campComplete = true
    stageProgressionSystem(world, DT) // consume campComplete

    expect(world.campComplete).toBe(false)
  })

  test('camp entry heals all players to full HP', () => {
    const stages = [
      makeEncounter({ threats: [{ type: EnemyType.SHOOTER, count: 1 }] }),
      makeEncounter({ threats: [{ type: EnemyType.SHOOTER, count: 1 }] }),
    ]
    startRun(world, stages)

    // Damage the player
    const players = playerQuery(world)
    expect(players.length).toBeGreaterThan(0)
    const playerEid = players[0]!
    Health.current[playerEid] = 1
    expect(Health.current[playerEid]).toBe(1)

    completeCurrentEncounter(world)
    stageProgressionSystem(world, DT) // clearing
    stageProgressionSystem(world, 1.0) // -> camp (heals)

    // Player should be at full HP
    expect(Health.current[playerEid]).toBe(Health.max[playerEid]!)
  })

  test('no camp after final stage — goes straight to completed', () => {
    const stages = [
      makeEncounter({ threats: [{ type: EnemyType.SHOOTER, count: 1 }] }),
    ]
    startRun(world, stages)

    completeCurrentEncounter(world)
    stageProgressionSystem(world, DT) // clearing

    // Advance past clearing timer
    stageProgressionSystem(world, 1.0)

    expect(world.run!.completed).toBe(true)
    expect(world.run!.transition).toBe('none')
    // Should NOT be in camp
    expect(world.run!.currentStage).toBe(1) // past end
  })

  test('player state persists across stages (HP restored)', () => {
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
    const maxHP = Health.max[playerEid]!
    const posXBefore = Position.x[playerEid]!
    const posYBefore = Position.y[playerEid]!

    // Damage player
    Health.current[playerEid] = 1

    completeCurrentEncounter(world)
    stageProgressionSystem(world, DT) // clearing
    stageProgressionSystem(world, 1.0) // -> camp (heals)

    // Player should be at full HP after camp
    expect(Health.current[playerEid]).toBe(maxHP)
    expect(Position.x[playerEid]).toBe(posXBefore)
    expect(Position.y[playerEid]).toBe(posYBefore)

    // Signal campComplete to advance
    world.campComplete = true
    stageProgressionSystem(world, DT)

    // Player still exists
    expect(Health.current[playerEid]).toBe(maxHP)
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
    stageProgressionSystem(world, 1.0) // -> camp
    expect(world.run!.transition).toBe('camp')
    world.campComplete = true
    stageProgressionSystem(world, DT) // -> next stage

    // Stage 2 (final)
    expect(world.run!.currentStage).toBe(1)
    expect(world.run!.completed).toBe(false)

    completeCurrentEncounter(world)
    stageProgressionSystem(world, DT) // clearing
    stageProgressionSystem(world, 1.0) // -> completed (no camp on final)

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

  test('healAllPlayers heals all players', () => {
    const players = playerQuery(world)
    expect(players.length).toBeGreaterThan(0)
    for (const eid of players) {
      Health.current[eid] = 1
    }

    healAllPlayers(world)

    for (const eid of players) {
      expect(Health.current[eid]).toBe(Health.max[eid]!)
    }
  })
})
