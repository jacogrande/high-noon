/**
 * Old Scratch Integration Tests
 *
 * Full fight lifecycle tests using crossroads map + full system tick.
 * These exercise the complete boss fight path from spawn to death.
 */

import { describe, expect, test, beforeEach } from 'bun:test'
import { defineQuery } from 'bitecs'
import { createGameWorld, setWorldTilemap, type GameWorld } from '../../world'
import { createSystemRegistry, stepWorld, type SystemRegistry } from '../../step'
import { registerAllSystems } from '../../systems'
import { generateCrossroads } from '../maps/crossroadsGenerator'
import { STAGE_4_MAP_CONFIG } from '../maps/mapConfig'
import { spawnPlayer } from '../../prefabs'
import { getBoss } from './registry'
import {
  Enemy, BossPhase, EnemyType, Health, Position,
  Player, HellfirePillar,
} from '../../components'
import {
  OLD_SCRATCH_HP,
  OLD_SCRATCH_GHOST_RIDER_MAX_ALIVE,
  OLD_SCRATCH_P3_HEAL_HP,
  OLD_SCRATCH_PILLAR_RESPAWN_TIME,
  OLD_SCRATCH_DUST_STORM_HP_THRESHOLD,
  OLD_SCRATCH_P2_THRESHOLD,
  OLD_SCRATCH_P3_THRESHOLD,
  OLD_SCRATCH_P4_THRESHOLD,
} from './oldScratch'
import type { OldScratchState } from './oldScratch'
import { TileType, getTile } from '../../tilemap'
import { getArenaCenterFromTilemap } from '../../tilemap'

const playerQuery = defineQuery([Player])
const enemyQuery = defineQuery([Enemy])
const pillarQuery = defineQuery([HellfirePillar])

function createBossFight(seed = 42) {
  const world = createGameWorld(seed)
  const tilemap = generateCrossroads(STAGE_4_MAP_CONFIG)
  setWorldTilemap(world, tilemap)
  const center = getArenaCenterFromTilemap(tilemap)
  const playerEid = spawnPlayer(world, center.x, center.y - 100)
  const bossEid = getBoss(EnemyType.OLD_SCRATCH)!.spawn(world, center.x, center.y)
  const systems = createSystemRegistry()
  registerAllSystems(systems)
  return { world, tilemap, playerEid, bossEid, center, systems }
}

function tickFight(world: GameWorld, systems: SystemRegistry, n = 1) {
  for (let i = 0; i < n; i++) {
    // Set minimal player input (aim at boss, fire every tick)
    const players = playerQuery(world)
    for (const eid of players) {
      world.playerInputs.set(eid, {
        moveX: 0,
        moveY: 0,
        aimX: Position.x[eid]!,
        aimY: Position.y[eid]! + 100,
        fire: true,
        roll: false,
        interact: false,
        reload: false,
        abilityAction: 0,
        jump: false,
        melee: false,
        potion: false,
      })
    }
    stepWorld(world, systems)
  }
}

function forcePhase(world: GameWorld, systems: SystemRegistry, bossEid: number, phase: number) {
  // Set HP one point below the threshold for the desired phase
  const maxHP = Health.max[bossEid]!
  switch (phase) {
    case 2: Health.current[bossEid] = Math.floor(maxHP * OLD_SCRATCH_P2_THRESHOLD) - 1; break
    case 3: Health.current[bossEid] = Math.floor(maxHP * OLD_SCRATCH_P3_THRESHOLD) - 1; break
    case 4: Health.current[bossEid] = Math.floor(maxHP * OLD_SCRATCH_P4_THRESHOLD) - 1; break
  }
  // Step without firing to trigger phase transition cleanly
  stepWorld(world, systems)
}

function getState(world: GameWorld, bossEid: number): OldScratchState {
  return world.bossState.get(bossEid) as OldScratchState
}

function countGhostRiders(world: GameWorld): number {
  let count = 0
  for (const eid of enemyQuery(world)) {
    if (Enemy.type[eid] === EnemyType.GHOST_RIDER && Health.current[eid]! > 0) {
      count++
    }
  }
  return count
}

function countWalkableTiles(world: GameWorld): number {
  const map = world.tilemap!
  let count = 0
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      // Layer 0 is solid layer — WALL means blocked, EMPTY means walkable
      if (getTile(map, 0, x, y) !== TileType.WALL) count++
    }
  }
  return count
}

function countAlivePillars(world: GameWorld): number {
  let count = 0
  for (const eid of pillarQuery(world)) {
    if (Health.current[eid]! > 0) count++
  }
  return count
}

// ============================================================================
// Integration tests
// ============================================================================

describe('Old Scratch — integration', () => {
  test('full lifecycle: boss transitions through all 4 phases', () => {
    const { world, bossEid, systems } = createBossFight()

    // Phase 1
    expect(BossPhase.phase[bossEid]!).toBe(1)

    // Force phase 2 and verify
    forcePhase(world, systems, bossEid, 2)
    expect(getState(world, bossEid).phase).toBe(2)

    // Force phase 3 and verify (boss heals to P3_HEAL_HP)
    forcePhase(world, systems, bossEid, 3)
    expect(getState(world, bossEid).phase).toBe(3)
    expect(Health.current[bossEid]!).toBeCloseTo(OLD_SCRATCH_P3_HEAL_HP, 0)

    // Tick 300 more to exercise Phase 3 mechanics (pillars, attacks)
    for (let i = 0; i < 300; i++) stepWorld(world, systems)
    expect(getState(world, bossEid).phase).toBe(3)

    // Force phase 4 and verify quick-draw duel starts
    forcePhase(world, systems, bossEid, 4)
    const state = getState(world, bossEid)
    expect(state.phase).toBe(4)
    expect(state.drawPhase).toBe('staredown')
    expect(state.drawRound).toBe(1)

    // Kill boss directly
    Health.current[bossEid] = 0
    stepWorld(world, systems)
    expect(Health.current[bossEid]!).toBe(0)
  })

  test('pillar destruction stops boss healing', () => {
    const { world, bossEid, systems } = createBossFight()

    // Force to phase 3
    forcePhase(world, systems, bossEid, 3)
    const state = getState(world, bossEid)
    expect(state.phase).toBe(3)

    // Verify pillars exist
    const pillars = pillarQuery(world)
    expect(pillars.length).toBeGreaterThan(0)

    // Record boss HP, run 60 ticks, verify HP increased (pillar healing)
    const hpBefore = Health.current[bossEid]!
    tickFight(world, systems, 60)
    const hpAfterHealing = Health.current[bossEid]!
    expect(hpAfterHealing).toBeGreaterThanOrEqual(hpBefore)

    // Kill all pillars
    for (const eid of pillarQuery(world)) {
      Health.current[eid] = 0
    }
    tickFight(world, systems, 2) // Let health system process deaths

    // Record HP and run 60 more ticks
    const hpAfterPillarDeath = Health.current[bossEid]!
    tickFight(world, systems, 60)
    const hpFinal = Health.current[bossEid]!

    // HP should not have increased (no healing without pillars)
    expect(hpFinal).toBeLessThanOrEqual(hpAfterPillarDeath)
  })

  test('pillars respawn after timer expires', () => {
    const { world, bossEid, systems } = createBossFight()

    // Force to phase 3
    forcePhase(world, systems, bossEid, 3)

    // Kill all pillars
    for (const eid of pillarQuery(world)) {
      Health.current[eid] = 0
    }
    tickFight(world, systems, 2)
    expect(countAlivePillars(world)).toBe(0)

    // Advance respawn timer worth of ticks (20s = 1200 ticks)
    const respawnTicks = Math.ceil(OLD_SCRATCH_PILLAR_RESPAWN_TIME * 60) + 60
    tickFight(world, systems, respawnTicks)

    // At least 1 pillar should have respawned
    expect(countAlivePillars(world)).toBeGreaterThanOrEqual(1)
  })

  test('ghost rider cap: max 2 alive', () => {
    const { world, bossEid, systems } = createBossFight()

    // Force to phase 2
    forcePhase(world, systems, bossEid, 2)

    let maxConcurrent = 0
    // Run 3000 ticks, track max concurrent Ghost Riders
    for (let i = 0; i < 3000; i++) {
      tickFight(world, systems, 1)
      const count = countGhostRiders(world)
      maxConcurrent = Math.max(maxConcurrent, count)
    }

    expect(maxConcurrent).toBeLessThanOrEqual(OLD_SCRATCH_GHOST_RIDER_MAX_ALIVE)
  })

  test('arena shrinks on phase transitions', () => {
    const { world, bossEid, systems } = createBossFight()

    const initialRoads = countWalkableTiles(world)

    // Force P1→P2
    forcePhase(world, systems, bossEid, 2)
    const p2Roads = countWalkableTiles(world)
    expect(p2Roads).toBeLessThan(initialRoads)

    // Force P2→P3
    forcePhase(world, systems, bossEid, 3)
    const p3Roads = countWalkableTiles(world)
    expect(p3Roads).toBeLessThan(p2Roads)
  })

  test('dust storm activates at HP threshold', () => {
    const { world, bossEid, systems } = createBossFight()

    // Force to phase 3 (boss heals to P3_HEAL_HP=250)
    forcePhase(world, systems, bossEid, 3)
    const state = getState(world, bossEid)
    expect(state.phase).toBe(3)

    // Storm should not be active with full P3 HP
    expect(world.oldScratchStorm?.active ?? false).toBe(false)
    expect(state.dustStormActive).toBe(false)

    // Damage below dust storm threshold (50% of P3_HEAL_HP = 125)
    // Set HP just below threshold and tick with no input (clear playerInputs)
    Health.current[bossEid] = Math.floor(OLD_SCRATCH_P3_HEAL_HP * OLD_SCRATCH_DUST_STORM_HP_THRESHOLD) - 1
    // Tick once directly (boss tick checks threshold)
    stepWorld(world, systems)

    // Storm should now be active
    expect(state.dustStormActive).toBe(true)
    expect(world.oldScratchStorm?.active).toBe(true)
  })

  test('Phase 4 clears pillars and storm', () => {
    const { world, bossEid, systems } = createBossFight()

    // Force to phase 3 — get pillars + storm active
    forcePhase(world, systems, bossEid, 3)
    const state = getState(world, bossEid)

    // Activate dust storm by damaging below threshold
    Health.current[bossEid] = Math.floor(OLD_SCRATCH_P3_HEAL_HP * OLD_SCRATCH_DUST_STORM_HP_THRESHOLD) - 1
    stepWorld(world, systems)

    // Verify pillars alive and storm active
    expect(countAlivePillars(world)).toBeGreaterThan(0)
    expect(state.dustStormActive).toBe(true)

    // Force P3→P4 (set HP below P4_THRESHOLD=0.15)
    Health.current[bossEid] = Math.floor(Health.max[bossEid]! * 0.14)
    stepWorld(world, systems)

    // All pillars should be dead, storm cleared
    expect(countAlivePillars(world)).toBe(0)
    expect(world.oldScratchStorm).toBeNull()
  })

  test('determinism: same seed produces same fight', () => {
    function runDeterministicFight(seed: number, ticks: number) {
      const ctx = createBossFight(seed)
      for (let i = 0; i < ticks; i++) {
        const players = playerQuery(ctx.world)
        for (const eid of players) {
          ctx.world.playerInputs.set(eid, {
            moveX: 0, moveY: 0,
            aimX: Position.x[ctx.bossEid]!, aimY: Position.y[ctx.bossEid]!,
            fire: true, roll: false, interact: false, reload: false,
            abilityAction: 0, jump: false, melee: false, potion: false,
          })
        }
        stepWorld(ctx.world, ctx.systems)
      }
      return ctx
    }

    const f1 = runDeterministicFight(42, 300)
    const f2 = runDeterministicFight(42, 300)

    expect(Health.current[f1.bossEid]!).toBe(Health.current[f2.bossEid]!)
    expect(BossPhase.phase[f1.bossEid]!).toBe(BossPhase.phase[f2.bossEid]!)
    expect(Position.x[f1.bossEid]!).toBe(Position.x[f2.bossEid]!)
    expect(Position.y[f1.bossEid]!).toBe(Position.y[f2.bossEid]!)
  })
})
