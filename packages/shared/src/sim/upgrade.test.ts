import { describe, expect, test, beforeEach } from 'bun:test'
import {
  initUpgradeState,
  awardXP,
  recomputePlayerStats,
  writeStatsToECS,
  canTakeNode,
  takeNode,
  findNode,
  type UpgradeState,
} from './upgrade'
import { SHERIFF } from './content/characters'
import { LEVEL_THRESHOLDS, MAX_LEVEL, getLevelForXP } from './content/xp'
import { createGameWorld, type GameWorld } from './world'
import { spawnPlayer } from './prefabs'
import { Weapon, Speed, Health, Cylinder } from './components'

describe('initUpgradeState', () => {
  test('base values match SHERIFF baseStats', () => {
    const state = initUpgradeState(SHERIFF)
    expect(state.xp).toBe(0)
    expect(state.level).toBe(0)
    expect(state.pendingPoints).toBe(0)
    expect(state.nodesTaken.size).toBe(0)
    expect(state.characterDef).toBe(SHERIFF)

    // Spot-check computed stats match base
    for (const [key, value] of Object.entries(SHERIFF.baseStats)) {
      expect((state as any)[key]).toBe(value)
    }
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
    state = initUpgradeState(SHERIFF)
  })

  test('returns false below threshold', () => {
    expect(awardXP(state, 5)).toBe(false)
    expect(state.xp).toBe(5)
    expect(state.level).toBe(0)
    expect(state.pendingPoints).toBe(0)
  })

  test('returns true at level boundary and grants pendingPoints', () => {
    expect(awardXP(state, LEVEL_THRESHOLDS[1]!)).toBe(true)
    expect(state.level).toBe(1)
    expect(state.pendingPoints).toBe(1)
  })

  test('accumulates XP across multiple awards', () => {
    awardXP(state, 3)
    awardXP(state, 4)
    expect(state.xp).toBe(7)
    expect(state.level).toBe(0)
    expect(state.pendingPoints).toBe(0)

    awardXP(state, 3) // total 10 = level 1 threshold
    expect(state.xp).toBe(10)
    expect(state.level).toBe(1)
    expect(state.pendingPoints).toBe(1)
  })

  test('handles multi-level jumps — grants correct pending points', () => {
    // Jump from 0 XP to level 3 threshold
    expect(awardXP(state, LEVEL_THRESHOLDS[3]!)).toBe(true)
    expect(state.level).toBe(3)
    expect(state.pendingPoints).toBe(3)
  })

  test('returns false when XP increases but level does not', () => {
    state.xp = LEVEL_THRESHOLDS[1]!
    state.level = 1
    state.pendingPoints = 1
    expect(awardXP(state, 1)).toBe(false)
    expect(state.level).toBe(1)
    expect(state.pendingPoints).toBe(1) // unchanged
  })
})

describe('findNode', () => {
  test('finds node by ID', () => {
    const result = findNode(SHERIFF, 'tin_star')
    expect(result).not.toBeNull()
    expect(result!.node.name).toBe('Tin Star')
    expect(result!.branch.id).toBe('lawman')
  })

  test('returns null for unknown ID', () => {
    expect(findNode(SHERIFF, 'nonexistent_node')).toBeNull()
  })
})

describe('canTakeNode', () => {
  let state: UpgradeState

  beforeEach(() => {
    state = initUpgradeState(SHERIFF)
    state.pendingPoints = 3
  })

  test('returns true for T1 node with pendingPoints', () => {
    expect(canTakeNode(state, 'steady_hand')).toBe(true)
    expect(canTakeNode(state, 'tin_star')).toBe(true)
  })

  test('returns false with 0 pendingPoints', () => {
    state.pendingPoints = 0
    expect(canTakeNode(state, 'steady_hand')).toBe(false)
  })

  test('returns false for already-taken node', () => {
    state.nodesTaken.add('steady_hand')
    expect(canTakeNode(state, 'steady_hand')).toBe(false)
  })

  test('returns false for unimplemented node', () => {
    // Override a node to be unimplemented for this test
    const node = state.characterDef.branches
      .flatMap(b => b.nodes)
      .find(n => n.id === 'steady_hand')!
    const origImpl = node.implemented
    node.implemented = false
    expect(canTakeNode(state, 'steady_hand')).toBe(false)
    node.implemented = origImpl
  })

  test('returns false when prerequisite not met', () => {
    // piercing_rounds is T2, requires T1 (steady_hand) taken
    expect(canTakeNode(state, 'piercing_rounds')).toBe(false)
  })

  test('returns true when prerequisite is met', () => {
    state.nodesTaken.add('steady_hand')
    expect(canTakeNode(state, 'piercing_rounds')).toBe(true)
  })

  test('returns false for unknown node ID', () => {
    expect(canTakeNode(state, 'nonexistent')).toBe(false)
  })
})

describe('takeNode', () => {
  let state: UpgradeState

  beforeEach(() => {
    state = initUpgradeState(SHERIFF)
    state.pendingPoints = 5
  })

  test('takes T1 successfully', () => {
    expect(takeNode(state, 'steady_hand')).toBe(true)
    expect(state.nodesTaken.has('steady_hand')).toBe(true)
    expect(state.pendingPoints).toBe(4)
  })

  test('Tin Star adds +2 maxHP', () => {
    const baseMHP = state.maxHP
    takeNode(state, 'tin_star')
    expect(state.maxHP).toBe(baseMHP + 2)
  })

  test('Quick Reload reduces reload time by 40%', () => {
    const baseReloadTime = state.reloadTime
    takeNode(state, 'tin_star') // T1 prerequisite
    takeNode(state, 'quick_reload')
    expect(state.reloadTime).toBeCloseTo(baseReloadTime * 0.6)
  })

  test('Called Shot adds showdown stats', () => {
    const baseDuration = state.showdownDuration
    const baseDmgMul = state.showdownDamageMultiplier
    takeNode(state, 'steady_hand')   // T1
    takeNode(state, 'piercing_rounds') // T2
    takeNode(state, 'called_shot')    // T3
    expect(state.showdownDuration).toBeCloseTo(baseDuration + 2)
    expect(state.showdownDamageMultiplier).toBeCloseTo(baseDmgMul + 0.5)
  })

  test('Iron Will adds iframeDuration and roll speed', () => {
    const baseIframe = state.iframeDuration
    const baseRollSpeed = state.rollSpeedMultiplier
    takeNode(state, 'tin_star')
    takeNode(state, 'quick_reload')
    takeNode(state, 'iron_will')
    expect(state.iframeDuration).toBeCloseTo(baseIframe + 0.3)
    expect(state.rollSpeedMultiplier).toBeCloseTo(baseRollSpeed * 1.25)
  })

  test('fails for invalid node', () => {
    expect(takeNode(state, 'nonexistent')).toBe(false)
    expect(state.pendingPoints).toBe(5) // unchanged
  })

  test('fails when prerequisites not met', () => {
    expect(takeNode(state, 'piercing_rounds')).toBe(false) // T2 without T1
    expect(state.pendingPoints).toBe(5)
  })

  test('prerequisite chain: T1 → T2 works', () => {
    expect(takeNode(state, 'piercing_rounds')).toBe(false)
    expect(takeNode(state, 'steady_hand')).toBe(true)
    expect(takeNode(state, 'piercing_rounds')).toBe(true)
    expect(state.pendingPoints).toBe(3)
  })

  test('unimplemented node blocks taking', () => {
    // Override a node to be unimplemented for this test
    const node = state.characterDef.branches
      .flatMap(b => b.nodes)
      .find(n => n.id === 'steady_hand')!
    const origImpl = node.implemented
    node.implemented = false
    expect(takeNode(state, 'steady_hand')).toBe(false)
    node.implemented = origImpl
  })
})

describe('recomputePlayerStats', () => {
  let state: UpgradeState

  beforeEach(() => {
    state = initUpgradeState(SHERIFF)
  })

  test('no nodes taken returns base values', () => {
    recomputePlayerStats(state)
    for (const [key, value] of Object.entries(SHERIFF.baseStats)) {
      expect((state as any)[key]).toBe(value)
    }
  })

  test('additive mods applied correctly', () => {
    // tin_star: maxHP +2
    state.nodesTaken.add('tin_star')
    recomputePlayerStats(state)
    expect(state.maxHP).toBe(SHERIFF.baseStats.maxHP + 2)
  })

  test('multiplicative mods applied correctly', () => {
    // quick_reload: reloadTime mul 0.6
    state.nodesTaken.add('tin_star')
    state.nodesTaken.add('quick_reload')
    recomputePlayerStats(state)
    expect(state.reloadTime).toBeCloseTo(SHERIFF.baseStats.reloadTime * 0.6)
  })

  test('mixed add and mul on different stats', () => {
    // iron_will: iframeDuration +0.3, rollSpeedMultiplier mul 1.25
    state.nodesTaken.add('tin_star')
    state.nodesTaken.add('quick_reload')
    state.nodesTaken.add('iron_will')
    recomputePlayerStats(state)
    expect(state.iframeDuration).toBeCloseTo(SHERIFF.baseStats.iframeDuration + 0.3)
    expect(state.rollSpeedMultiplier).toBeCloseTo(SHERIFF.baseStats.rollSpeedMultiplier * 1.25)
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
    const oldMax = Health.max[playerEid]!
    world.upgradeState.maxHP = oldMax + 2

    writeStatsToECS(world, playerEid)

    expect(Health.max[playerEid]).toBe(oldMax + 2)
    expect(Health.current[playerEid]).toBe(oldMax + 2)
  })

  test('does not overheal when current HP is below max', () => {
    Health.current[playerEid] = 3
    const oldMax = Health.max[playerEid]!
    world.upgradeState.maxHP = oldMax + 1

    writeStatsToECS(world, playerEid)

    expect(Health.current[playerEid]).toBe(4)
  })

  test('does not heal when maxHP did not increase', () => {
    Health.current[playerEid] = 3
    world.upgradeState.maxHP = SHERIFF.baseStats.maxHP

    writeStatsToECS(world, playerEid)

    expect(Health.current[playerEid]).toBe(3)
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

  test('applies Last Stand damage bonus when active', () => {
    world.upgradeState.bulletDamage = 10
    world.upgradeState.lastStandActive = true
    world.upgradeState.lastStandTimer = 3.0

    writeStatsToECS(world, playerEid)

    // 10 * 1.5 = 15
    expect(Weapon.bulletDamage[playerEid]).toBe(15)
  })

  test('applies Last Stand speed bonus when active', () => {
    world.upgradeState.speed = 250
    world.upgradeState.lastStandActive = true
    world.upgradeState.lastStandTimer = 3.0

    writeStatsToECS(world, playerEid)

    // 250 * 1.2 = 300
    expect(Speed.max[playerEid]).toBe(300)
    expect(Speed.current[playerEid]).toBe(300)
  })

  test('does not apply Last Stand bonuses when inactive', () => {
    world.upgradeState.bulletDamage = 10
    world.upgradeState.speed = 250
    world.upgradeState.lastStandActive = false

    writeStatsToECS(world, playerEid)

    expect(Weapon.bulletDamage[playerEid]).toBe(10)
    expect(Speed.max[playerEid]).toBe(250)
  })

  test('Last Stand bonuses are idempotent across multiple calls', () => {
    world.upgradeState.bulletDamage = 10
    world.upgradeState.speed = 250
    world.upgradeState.lastStandActive = true
    world.upgradeState.lastStandTimer = 3.0

    // Call multiple times — should not compound
    writeStatsToECS(world, playerEid)
    writeStatsToECS(world, playerEid)
    writeStatsToECS(world, playerEid)

    expect(Weapon.bulletDamage[playerEid]).toBe(15) // still 10 * 1.5
    expect(Speed.max[playerEid]).toBe(300) // still 250 * 1.2
  })

  test('writes cylinder stats', () => {
    world.upgradeState.cylinderSize = 8
    world.upgradeState.reloadTime = 0.9

    writeStatsToECS(world, playerEid)

    expect(Cylinder.maxRounds[playerEid]).toBe(8)
    expect(Cylinder.reloadTime[playerEid]).toBeCloseTo(0.9)
  })
})

describe('full skill tree progression', () => {
  let state: UpgradeState

  beforeEach(() => {
    state = initUpgradeState(SHERIFF)
    state.pendingPoints = 15
  })

  test('taking all Marksman nodes applies cumulative stats', () => {
    // T1-T5 in Marksman
    takeNode(state, 'steady_hand')
    takeNode(state, 'piercing_rounds')
    takeNode(state, 'called_shot')
    takeNode(state, 'dead_to_rights')
    takeNode(state, 'judge_jury_executioner')

    expect(state.pendingPoints).toBe(10)
    expect(state.nodesTaken.size).toBe(5)
    // Called Shot: +2 showdownDuration, +0.5 showdownDamageMultiplier
    expect(state.showdownDuration).toBeCloseTo(SHERIFF.baseStats.showdownDuration + 2)
    expect(state.showdownDamageMultiplier).toBeCloseTo(SHERIFF.baseStats.showdownDamageMultiplier + 0.5)
    // Dead to Rights: +3 showdownKillRefund
    expect(state.showdownKillRefund).toBeCloseTo(SHERIFF.baseStats.showdownKillRefund + 3)
  })

  test('taking all Gunslinger nodes applies cumulative stats', () => {
    takeNode(state, 'fan_the_hammer')
    takeNode(state, 'speed_loader')
    takeNode(state, 'hot_lead')
    takeNode(state, 'drum_cylinder')
    takeNode(state, 'dead_mans_hand')

    expect(state.pendingPoints).toBe(10)
    // Fan the Hammer: holdFireRate * 1.3
    expect(state.holdFireRate).toBeCloseTo(SHERIFF.baseStats.holdFireRate * 1.3)
    // Speed Loader: reloadTime * 0.7
    expect(state.reloadTime).toBeCloseTo(SHERIFF.baseStats.reloadTime * 0.7)
    // Hot Lead: bulletDamage * 1.25, bulletSpeed * 0.85
    expect(state.bulletDamage).toBeCloseTo(SHERIFF.baseStats.bulletDamage * 1.25)
    expect(state.bulletSpeed).toBeCloseTo(SHERIFF.baseStats.bulletSpeed * 0.85)
    // Drum Cylinder: cylinderSize + 2
    expect(state.cylinderSize).toBe(SHERIFF.baseStats.cylinderSize + 2)
  })

  test('taking all Lawman nodes applies cumulative stats', () => {
    takeNode(state, 'tin_star')
    takeNode(state, 'quick_reload')
    takeNode(state, 'iron_will')
    takeNode(state, 'second_wind')
    takeNode(state, 'last_stand')

    expect(state.pendingPoints).toBe(10)
    // Tin Star: maxHP + 2
    expect(state.maxHP).toBe(SHERIFF.baseStats.maxHP + 2)
    // Quick Reload: reloadTime * 0.6
    expect(state.reloadTime).toBeCloseTo(SHERIFF.baseStats.reloadTime * 0.6)
    // Iron Will: iframeDuration + 0.3, rollSpeedMultiplier * 1.25
    expect(state.iframeDuration).toBeCloseTo(SHERIFF.baseStats.iframeDuration + 0.3)
    expect(state.rollSpeedMultiplier).toBeCloseTo(SHERIFF.baseStats.rollSpeedMultiplier * 1.25)
  })

  test('cross-branch progression works independently', () => {
    // Take T1 from each branch
    takeNode(state, 'steady_hand')
    takeNode(state, 'fan_the_hammer')
    takeNode(state, 'tin_star')

    expect(state.pendingPoints).toBe(12)
    expect(state.nodesTaken.size).toBe(3)

    // Stats from all three should be applied
    expect(state.holdFireRate).toBeCloseTo(SHERIFF.baseStats.holdFireRate * 1.3)
    expect(state.maxHP).toBe(SHERIFF.baseStats.maxHP + 2)
  })

  test('stacking reload mods from different branches', () => {
    // Quick Reload (Lawman T2): reloadTime * 0.6
    takeNode(state, 'tin_star')
    takeNode(state, 'quick_reload')
    // Speed Loader (Gunslinger T2): reloadTime * 0.7
    takeNode(state, 'fan_the_hammer')
    takeNode(state, 'speed_loader')

    // Both multiplicative: base * 0.6 * 0.7
    expect(state.reloadTime).toBeCloseTo(SHERIFF.baseStats.reloadTime * 0.6 * 0.7)
  })
})
