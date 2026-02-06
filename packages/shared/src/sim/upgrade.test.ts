import { describe, expect, test, beforeEach } from 'bun:test'
import {
  initUpgradeState,
  awardXP,
  recomputePlayerStats,
  applyUpgrade,
  writeStatsToECS,
  generateUpgradeChoices,
  type UpgradeState,
} from './upgrade'
import {
  UpgradeId,
  UpgradeRarity,
  UPGRADES,
  CHOICES_PER_LEVEL,
} from './content/upgrades'
import {
  PLAYER_SPEED,
  PLAYER_HP,
  PLAYER_IFRAME_DURATION,
  ROLL_DURATION,
  ROLL_IFRAME_RATIO,
  ROLL_SPEED_MULTIPLIER,
} from './content/player'
import {
  PISTOL_FIRE_RATE,
  PISTOL_BULLET_SPEED,
  PISTOL_BULLET_DAMAGE,
  PISTOL_RANGE,
} from './content/weapons'
import { LEVEL_THRESHOLDS, MAX_LEVEL, getLevelForXP } from './content/xp'
import { SeededRng } from '../math/rng'
import { createGameWorld, type GameWorld } from './world'
import { spawnPlayer } from './prefabs'
import { Weapon, Speed, Health } from './components'

describe('initUpgradeState', () => {
  test('base values match player constants', () => {
    const state = initUpgradeState()
    expect(state.xp).toBe(0)
    expect(state.level).toBe(0)
    expect(state.pendingChoices).toEqual([])
    expect(state.acquired.size).toBe(0)
    expect(state.killCounter).toBe(0)
    expect(state.fireRate).toBe(PISTOL_FIRE_RATE)
    expect(state.bulletDamage).toBe(PISTOL_BULLET_DAMAGE)
    expect(state.bulletSpeed).toBe(PISTOL_BULLET_SPEED)
    expect(state.range).toBe(PISTOL_RANGE)
    expect(state.speed).toBe(PLAYER_SPEED)
    expect(state.maxHP).toBe(PLAYER_HP)
    expect(state.iframeDuration).toBe(PLAYER_IFRAME_DURATION)
    expect(state.rollDuration).toBe(ROLL_DURATION)
    expect(state.rollIframeRatio).toBe(ROLL_IFRAME_RATIO)
    expect(state.rollSpeedMultiplier).toBe(ROLL_SPEED_MULTIPLIER)
  })
})

describe('getLevelForXP', () => {
  test('level 0 at 0 XP', () => {
    expect(getLevelForXP(0)).toBe(0)
  })

  test('level 0 just below level 1 threshold', () => {
    expect(getLevelForXP(LEVEL_THRESHOLDS[1]! - 1)).toBe(0)
  })

  test('level 1 at exact threshold', () => {
    expect(getLevelForXP(LEVEL_THRESHOLDS[1]!)).toBe(1)
  })

  test('correct at each threshold boundary', () => {
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
      expect(getLevelForXP(LEVEL_THRESHOLDS[i]!)).toBe(i)
    }
  })

  test('caps at MAX_LEVEL for very high XP', () => {
    expect(getLevelForXP(999999)).toBe(MAX_LEVEL)
  })
})

describe('awardXP', () => {
  let state: UpgradeState

  beforeEach(() => {
    state = initUpgradeState()
  })

  test('returns false below threshold', () => {
    expect(awardXP(state, 5)).toBe(false)
    expect(state.xp).toBe(5)
    expect(state.level).toBe(0)
  })

  test('returns true at level boundary', () => {
    expect(awardXP(state, LEVEL_THRESHOLDS[1]!)).toBe(true)
    expect(state.level).toBe(1)
  })

  test('accumulates XP across multiple awards', () => {
    awardXP(state, 3)
    awardXP(state, 4)
    expect(state.xp).toBe(7)
    expect(state.level).toBe(0)

    awardXP(state, 3) // total 10 = level 1 threshold
    expect(state.xp).toBe(10)
    expect(state.level).toBe(1)
  })

  test('handles multi-level jumps', () => {
    // Jump from 0 XP to 50 XP → level 3
    expect(awardXP(state, LEVEL_THRESHOLDS[3]!)).toBe(true)
    expect(state.level).toBe(3)
  })

  test('returns false when XP increases but level does not', () => {
    state.xp = LEVEL_THRESHOLDS[1]!
    state.level = 1
    expect(awardXP(state, 1)).toBe(false)
    expect(state.level).toBe(1)
  })
})

describe('applyUpgrade', () => {
  let state: UpgradeState

  beforeEach(() => {
    state = initUpgradeState()
  })

  test('increments stack count', () => {
    applyUpgrade(state, UpgradeId.QUICK_DRAW)
    expect(state.acquired.get(UpgradeId.QUICK_DRAW)).toBe(1)

    applyUpgrade(state, UpgradeId.QUICK_DRAW)
    expect(state.acquired.get(UpgradeId.QUICK_DRAW)).toBe(2)
  })

  test('respects maxStacks (no-op at max)', () => {
    const def = UPGRADES[UpgradeId.GUNSLINGER] // maxStacks: 1
    // Apply once
    applyUpgrade(state, UpgradeId.GUNSLINGER)
    expect(state.acquired.get(UpgradeId.GUNSLINGER)).toBe(1)

    // Try to exceed
    const statsBefore = state.fireRate
    applyUpgrade(state, UpgradeId.GUNSLINGER)
    expect(state.acquired.get(UpgradeId.GUNSLINGER)).toBe(1) // unchanged
    expect(state.fireRate).toBe(statsBefore) // stats unchanged
  })

  test('triggers recomputePlayerStats', () => {
    const baseFR = state.fireRate
    applyUpgrade(state, UpgradeId.QUICK_DRAW) // +20% fire rate (mul 1.2)
    expect(state.fireRate).toBeCloseTo(baseFR * 1.2)
  })
})

describe('recomputePlayerStats', () => {
  let state: UpgradeState

  beforeEach(() => {
    state = initUpgradeState()
  })

  test('additive mods applied correctly', () => {
    // THICK_SKIN: +1 maxHP (additive), maxStacks 3
    state.acquired.set(UpgradeId.THICK_SKIN, 2)
    recomputePlayerStats(state)
    expect(state.maxHP).toBe(PLAYER_HP + 2)
  })

  test('multiplicative mods applied correctly', () => {
    // QUICK_DRAW: fireRate mul 1.2, maxStacks 3
    state.acquired.set(UpgradeId.QUICK_DRAW, 1)
    recomputePlayerStats(state)
    expect(state.fireRate).toBeCloseTo(PISTOL_FIRE_RATE * 1.2)
  })

  test('multiplicative stacking uses exponentiation', () => {
    // 3 stacks of QUICK_DRAW (1.2^3 = 1.728)
    state.acquired.set(UpgradeId.QUICK_DRAW, 3)
    recomputePlayerStats(state)
    expect(state.fireRate).toBeCloseTo(PISTOL_FIRE_RATE * 1.2 ** 3)
  })

  test('additive before multiplicative ordering', () => {
    // THICK_SKIN: +1 maxHP (add), JUGGERNAUT: +2 maxHP (add) and speed mul 0.9
    // With 1 stack each: maxHP = (5 + 1 + 2) * 1 = 8
    state.acquired.set(UpgradeId.THICK_SKIN, 1)
    state.acquired.set(UpgradeId.JUGGERNAUT, 1)
    recomputePlayerStats(state)
    expect(state.maxHP).toBe(PLAYER_HP + 1 + 2) // 8
    expect(state.speed).toBeCloseTo(PLAYER_SPEED * 0.9) // JUGGERNAUT -10%
  })

  test('multiple upgrades affecting same stat combine correctly', () => {
    // QUICK_DRAW (mul 1.2) + QUICK_RELOAD (mul 1.15) both affect fireRate
    state.acquired.set(UpgradeId.QUICK_DRAW, 1)
    state.acquired.set(UpgradeId.QUICK_RELOAD, 1)
    recomputePlayerStats(state)
    expect(state.fireRate).toBeCloseTo(PISTOL_FIRE_RATE * 1.2 * 1.15)
  })

  test('no upgrades returns base values', () => {
    recomputePlayerStats(state)
    expect(state.fireRate).toBe(PISTOL_FIRE_RATE)
    expect(state.speed).toBe(PLAYER_SPEED)
    expect(state.maxHP).toBe(PLAYER_HP)
  })
})

describe('writeStatsToECS', () => {
  let world: GameWorld
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    playerEid = spawnPlayer(world, 100, 100)
  })

  test('writes all weapon stats', () => {
    world.upgradeState.fireRate = 10
    world.upgradeState.bulletDamage = 20
    world.upgradeState.bulletSpeed = 800
    world.upgradeState.range = 500

    writeStatsToECS(world, playerEid)

    expect(Weapon.fireRate[playerEid]).toBe(10)
    expect(Weapon.bulletDamage[playerEid]).toBe(20)
    expect(Weapon.bulletSpeed[playerEid]).toBe(800)
    expect(Weapon.range[playerEid]).toBe(500)
  })

  test('writes speed stats', () => {
    world.upgradeState.speed = 300

    writeStatsToECS(world, playerEid)

    expect(Speed.max[playerEid]).toBe(300)
    expect(Speed.current[playerEid]).toBe(300)
  })

  test('writes health max and heals delta', () => {
    // Player starts with PLAYER_HP (5) current and max
    const oldMax = Health.max[playerEid]!
    world.upgradeState.maxHP = oldMax + 2

    writeStatsToECS(world, playerEid)

    expect(Health.max[playerEid]).toBe(oldMax + 2)
    // Should heal by the delta (2), capped at new max
    expect(Health.current[playerEid]).toBe(oldMax + 2)
  })

  test('does not overheal when current HP is below max', () => {
    Health.current[playerEid] = 3 // damaged
    const oldMax = Health.max[playerEid]! // 5
    world.upgradeState.maxHP = oldMax + 1 // new max 6

    writeStatsToECS(world, playerEid)

    // 3 + delta(1) = 4, which is below new max 6
    expect(Health.current[playerEid]).toBe(4)
  })

  test('does not heal when maxHP did not increase', () => {
    Health.current[playerEid] = 3 // damaged
    world.upgradeState.maxHP = PLAYER_HP // same as current max

    writeStatsToECS(world, playerEid)

    expect(Health.current[playerEid]).toBe(3) // unchanged
  })

  test('writes i-frame duration', () => {
    world.upgradeState.iframeDuration = 1.0

    writeStatsToECS(world, playerEid)

    expect(Health.iframeDuration[playerEid]).toBeCloseTo(1.0)
  })

  test('clamps bulletDamage to 255 for Uint8Array', () => {
    world.upgradeState.bulletDamage = 300

    writeStatsToECS(world, playerEid)

    expect(Weapon.bulletDamage[playerEid]).toBe(255)
  })
})

describe('generateUpgradeChoices', () => {
  let state: UpgradeState

  beforeEach(() => {
    state = initUpgradeState()
  })

  test('returns correct count', () => {
    const rng = new SeededRng(42)
    const choices = generateUpgradeChoices(state, rng)
    expect(choices.length).toBe(CHOICES_PER_LEVEL)
  })

  test('no duplicates in a single choice set', () => {
    const rng = new SeededRng(42)
    const choices = generateUpgradeChoices(state, rng)
    const ids = choices.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('excludes maxed upgrades', () => {
    const rng = new SeededRng(42)
    // Max out QUICK_DRAW (maxStacks: 3)
    state.acquired.set(UpgradeId.QUICK_DRAW, 3)

    // Generate many sets to ensure QUICK_DRAW never appears
    for (let i = 0; i < 50; i++) {
      const choices = generateUpgradeChoices(state, new SeededRng(i))
      const ids = choices.map(c => c.id)
      expect(ids).not.toContain(UpgradeId.QUICK_DRAW)
    }
  })

  test('excludes upgrades with empty mods', () => {
    // VAMPIRIC_ROUNDS has empty mods array
    for (let i = 0; i < 50; i++) {
      const choices = generateUpgradeChoices(state, new SeededRng(i))
      const ids = choices.map(c => c.id)
      expect(ids).not.toContain(UpgradeId.VAMPIRIC_ROUNDS)
    }
  })

  test('deterministic with same seed', () => {
    const choices1 = generateUpgradeChoices(state, new SeededRng(123))
    const choices2 = generateUpgradeChoices(state, new SeededRng(123))
    expect(choices1.map(c => c.id)).toEqual(choices2.map(c => c.id))
  })

  test('different seeds produce different results', () => {
    const choices1 = generateUpgradeChoices(state, new SeededRng(1))
    const choices2 = generateUpgradeChoices(state, new SeededRng(9999))
    // Extremely unlikely to be identical with different seeds and 14 options
    const ids1 = choices1.map(c => c.id)
    const ids2 = choices2.map(c => c.id)
    expect(ids1).not.toEqual(ids2)
  })

  test('returns fewer when not enough non-maxed upgrades', () => {
    // Max out all but 2 upgrades (excluding VAMPIRIC_ROUNDS which is filtered)
    for (const def of Object.values(UPGRADES)) {
      if (def.mods.length === 0) continue
      state.acquired.set(def.id, def.maxStacks)
    }
    // Un-max two
    state.acquired.set(UpgradeId.QUICK_DRAW, 0)
    state.acquired.set(UpgradeId.HEAVY_ROUNDS, 0)

    const rng = new SeededRng(42)
    const choices = generateUpgradeChoices(state, rng)
    expect(choices.length).toBe(2) // only 2 available
  })

  test('returns empty when all upgrades maxed', () => {
    for (const def of Object.values(UPGRADES)) {
      state.acquired.set(def.id, def.maxStacks)
    }

    const rng = new SeededRng(42)
    const choices = generateUpgradeChoices(state, rng)
    expect(choices.length).toBe(0)
  })

  test('rarity fallback when one pool exhausted', () => {
    // Max out all rare upgrades (except VAMPIRIC_ROUNDS which is already filtered)
    state.acquired.set(UpgradeId.BULLET_STORM, 2)
    state.acquired.set(UpgradeId.JUGGERNAUT, 2)
    state.acquired.set(UpgradeId.GUNSLINGER, 1)
    state.acquired.set(UpgradeId.GHOST_ROLL, 1)

    // All choices should be common since rare pool is empty
    for (let i = 0; i < 20; i++) {
      const choices = generateUpgradeChoices(state, new SeededRng(i))
      for (const c of choices) {
        expect(c.rarity).toBe(UpgradeRarity.COMMON)
      }
    }
  })

  test('respects custom count parameter', () => {
    const rng = new SeededRng(42)
    const choices = generateUpgradeChoices(state, rng, 5)
    expect(choices.length).toBe(5)
  })
})
