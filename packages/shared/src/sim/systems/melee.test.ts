import { describe, expect, test, beforeEach } from 'bun:test'
import { hasComponent, addComponent, defineQuery } from 'bitecs'
import { createGameWorld, type GameWorld } from '../world'
import { spawnPlayer, spawnSwarmer } from '../prefabs'
import { meleeSystem, isInArc } from './melee'
import { weaponSystem } from './weapon'
import { buffSystem } from './buffSystem'
import { PROSPECTOR } from '../content/characters/prospector'
import { Button, createInputState, setButton, type InputState } from '../../net/input'
import {
  Player, Position, MeleeWeapon, Health, Roll,
  PlayerState, PlayerStateType, Knockback, Enemy,
} from '../components'
import { createSpatialHash, rebuildSpatialHash } from '../SpatialHash'
import {
  PICKAXE_SWING_DAMAGE, PICKAXE_SWING_RATE, PICKAXE_REACH,
  PICKAXE_CHARGE_MULTIPLIER, PICKAXE_CHARGE_TIME,
} from '../content/weapons'

/** Query for all entities with Position (players + enemies) */
const positionQuery = defineQuery([Position])

function createProspectorWorld(): GameWorld {
  return createGameWorld(42, PROSPECTOR)
}

/** Spawn enemy at position and rebuild spatial hash */
function placeEnemy(world: GameWorld, x: number, y: number): number {
  const eid = spawnSwarmer(world, x, y)
  rebuildHash(world)
  return eid
}

/** Create/rebuild spatial hash using ECS query (safe across test files) */
function rebuildHash(world: GameWorld): void {
  if (!world.spatialHash) {
    world.spatialHash = createSpatialHash(2000, 2000, 64)
  }
  const eids = Array.from(positionQuery(world))
  rebuildSpatialHash(world.spatialHash, eids, Position.x, Position.y)
}

function createShootInput(aimAngle = 0): InputState {
  const input = createInputState()
  input.buttons = setButton(input.buttons, Button.SHOOT)
  input.aimAngle = aimAngle
  return input
}

/**
 * Perform a quick click: press on tick 1 (starts charging),
 * then release on tick 2 (fires the swing).
 * This simulates the real melee flow.
 */
function doQuickSwing(world: GameWorld, eid: number, aimAngle = 0): void {
  Player.aimAngle[eid] = aimAngle

  // Tick 1: press shoot (starts charging)
  MeleeWeapon.shootWasDown[eid] = 0
  world.playerInputs.set(eid, createShootInput(aimAngle))
  meleeSystem(world, 1 / 60)

  // Tick 2: release shoot (fires the swing)
  MeleeWeapon.shootWasDown[eid] = 1
  const releaseInput = createInputState()
  releaseInput.aimAngle = aimAngle
  world.playerInputs.set(eid, releaseInput)
  rebuildHash(world)
  meleeSystem(world, 1 / 60)
}

describe('isInArc', () => {
  test('enemy directly ahead within reach returns true', () => {
    expect(isInArc(0, 0, 0, Math.PI / 4, 60, 30, 0)).toBe(true)
  })

  test('enemy outside reach returns false', () => {
    expect(isInArc(0, 0, 0, Math.PI / 4, 60, 100, 0)).toBe(false)
  })

  test('enemy outside arc angle returns false', () => {
    // Aim right (angle=0), arc=PI/4 half => ±45°
    // Enemy at 90° (directly above)
    expect(isInArc(0, 0, 0, Math.PI / 4, 60, 0, 30)).toBe(false)
  })

  test('enemy at edge of arc returns true', () => {
    const dist = 50
    const angle = Math.PI / 4 - 0.01
    const ex = dist * Math.cos(angle)
    const ey = dist * Math.sin(angle)
    expect(isInArc(0, 0, 0, Math.PI / 4, 60, ex, ey)).toBe(true)
  })

  test('works with non-zero player position', () => {
    expect(isInArc(100, 100, 0, Math.PI / 4, 60, 130, 100)).toBe(true)
  })

  test('wraps angles correctly around PI boundary', () => {
    expect(isInArc(0, 0, Math.PI, Math.PI / 4, 60, -30, 0)).toBe(true)
  })
})

describe('meleeSystem', () => {
  let world: GameWorld
  let playerEid: number

  beforeEach(() => {
    world = createProspectorWorld()
    playerEid = spawnPlayer(world, 100, 100)
  })

  describe('basic swing', () => {
    test('click-release triggers swing (swungThisTick)', () => {
      doQuickSwing(world, playerEid)
      expect(MeleeWeapon.swungThisTick[playerEid]).toBe(1)
    })

    test('swing sets cooldown based on swingRate', () => {
      doQuickSwing(world, playerEid)
      expect(MeleeWeapon.swingCooldown[playerEid]).toBeCloseTo(1 / PICKAXE_SWING_RATE)
    })

    test('cannot swing while on cooldown', () => {
      MeleeWeapon.swingCooldown[playerEid] = 0.5

      MeleeWeapon.shootWasDown[playerEid] = 0
      world.playerInputs.set(playerEid, createShootInput())
      meleeSystem(world, 1 / 60)

      expect(MeleeWeapon.swungThisTick[playerEid]).toBe(0)
    })

    test('first press starts charging', () => {
      MeleeWeapon.shootWasDown[playerEid] = 0
      world.playerInputs.set(playerEid, createShootInput())
      meleeSystem(world, 1 / 60)

      expect(MeleeWeapon.charging[playerEid]).toBe(1)
      expect(MeleeWeapon.chargeTimer[playerEid]).toBe(0)
    })

    test('weapon system and melee system can both run without consuming melee edges', () => {
      const enemyEid = placeEnemy(world, 130, 100)
      const startHP = Health.current[enemyEid]!

      // Tick 1: press
      MeleeWeapon.shootWasDown[playerEid] = 0
      world.playerInputs.set(playerEid, createShootInput(0))
      weaponSystem(world, 1 / 60)
      meleeSystem(world, 1 / 60)

      // Tick 2: release
      MeleeWeapon.shootWasDown[playerEid] = 1
      const releaseInput = createInputState()
      releaseInput.aimAngle = 0
      world.playerInputs.set(playerEid, releaseInput)
      weaponSystem(world, 1 / 60)
      meleeSystem(world, 1 / 60)

      expect(MeleeWeapon.swungThisTick[playerEid]).toBe(1)
      expect(Health.current[enemyEid]).toBe(startHP - PICKAXE_SWING_DAMAGE)
    })

    test('swing damages enemies in arc', () => {
      const enemyEid = placeEnemy(world, 130, 100)
      const startHP = Health.current[enemyEid]!

      doQuickSwing(world, playerEid, 0)

      expect(Health.current[enemyEid]).toBe(startHP - PICKAXE_SWING_DAMAGE)
    })

    test('swing still damages when spatial hash is unavailable', () => {
      const enemyEid = spawnSwarmer(world, 130, 100)
      const startHP = Health.current[enemyEid]!
      world.spatialHash = null

      doQuickSwing(world, playerEid, 0)

      expect(Health.current[enemyEid]).toBe(startHP - PICKAXE_SWING_DAMAGE)
    })

    test('local-player prediction ignores stale spatial hash and still damages', () => {
      const enemyEid = spawnSwarmer(world, 130, 100)
      world.simulationScope = 'local-player'
      world.localPlayerEid = playerEid

      // Build hash with enemy far away.
      Position.x[enemyEid] = 600
      Position.y[enemyEid] = 600
      rebuildHash(world)

      // Move enemy into range without rebuilding hash (stale broadphase).
      Position.x[enemyEid] = 130
      Position.y[enemyEid] = 100
      const startHP = Health.current[enemyEid]!

      doQuickSwing(world, playerEid, 0)

      expect(Health.current[enemyEid]).toBe(startHP - PICKAXE_SWING_DAMAGE)
    })

    test('swing does not damage enemies outside arc', () => {
      // Place enemy directly above (90° from aim direction of 0°)
      const enemyEid = placeEnemy(world, 100, 50)
      const startHP = Health.current[enemyEid]!

      doQuickSwing(world, playerEid, 0)

      expect(Health.current[enemyEid]).toBe(startHP)
    })

    test('swing does not damage enemies outside reach', () => {
      const enemyEid = placeEnemy(world, 300, 100)
      const startHP = Health.current[enemyEid]!

      doQuickSwing(world, playerEid, 0)

      expect(Health.current[enemyEid]).toBe(startHP)
    })
  })

  describe('knockback', () => {
    test('swing applies Knockback component to hit enemies', () => {
      const enemyEid = placeEnemy(world, 130, 100)

      doQuickSwing(world, playerEid, 0)

      expect(hasComponent(world, Knockback, enemyEid)).toBe(true)
      expect(Knockback.vx[enemyEid]).toBeGreaterThan(0) // pushed rightward
      expect(Knockback.duration[enemyEid]).toBeGreaterThan(0)
    })
  })

  describe('charge swing', () => {
    test('holding past chargeTime and releasing performs charged swing', () => {
      const enemyEid = placeEnemy(world, 130, 100)
      const startHP = Health.current[enemyEid]!

      Player.aimAngle[playerEid] = 0

      // Start charging
      MeleeWeapon.shootWasDown[playerEid] = 0
      world.playerInputs.set(playerEid, createShootInput(0))
      meleeSystem(world, 1 / 60)

      // Simulate holding past chargeTime
      MeleeWeapon.chargeTimer[playerEid] = PICKAXE_CHARGE_TIME + 0.01

      // Release
      MeleeWeapon.shootWasDown[playerEid] = 1
      const releaseInput = createInputState()
      releaseInput.aimAngle = 0
      world.playerInputs.set(playerEid, releaseInput)
      rebuildHash(world)
      meleeSystem(world, 1 / 60)

      expect(MeleeWeapon.wasChargedSwing[playerEid]).toBe(1)

      const expectedDamage = Math.round(PICKAXE_SWING_DAMAGE * PICKAXE_CHARGE_MULTIPLIER)
      expect(Health.current[enemyEid]).toBe(startHP - expectedDamage)
    })
  })

  describe('roll interaction', () => {
    test('cannot swing while rolling', () => {
      addComponent(world, Roll, playerEid)
      Roll.duration[playerEid] = 0.3
      Roll.elapsed[playerEid] = 0.1

      MeleeWeapon.shootWasDown[playerEid] = 0
      world.playerInputs.set(playerEid, createShootInput())
      meleeSystem(world, 1 / 60)

      expect(MeleeWeapon.swungThisTick[playerEid]).toBe(0)
    })

    test('cannot swing while in ROLLING state', () => {
      PlayerState.state[playerEid] = PlayerStateType.ROLLING

      MeleeWeapon.shootWasDown[playerEid] = 0
      world.playerInputs.set(playerEid, createShootInput())
      meleeSystem(world, 1 / 60)

      expect(MeleeWeapon.swungThisTick[playerEid]).toBe(0)
    })

    test('rolling cancels charge', () => {
      MeleeWeapon.charging[playerEid] = 1
      MeleeWeapon.chargeTimer[playerEid] = 0.3
      addComponent(world, Roll, playerEid)
      Roll.duration[playerEid] = 0.3

      world.playerInputs.set(playerEid, createShootInput())
      meleeSystem(world, 1 / 60)

      expect(MeleeWeapon.charging[playerEid]).toBe(0)
      expect(MeleeWeapon.chargeTimer[playerEid]).toBe(0)
    })
  })

  describe('consecutive swing counter + tremor', () => {
    test('consecutive swings increment counter', () => {
      const initialCount = world.upgradeState.consecutiveSwings

      doQuickSwing(world, playerEid)

      expect(world.upgradeState.consecutiveSwings).toBe(initialCount + 1)
    })

    test('tremor triggers on 4th swing with node taken', () => {
      world.upgradeState.nodesTaken.add('tremor')
      world.upgradeState.consecutiveSwings = 3 // next swing will be #4

      // Give enemy enough HP to survive the swing so tremor can also hit
      const enemyEid = placeEnemy(world, 140, 100)
      Health.current[enemyEid] = 50
      Health.max[enemyEid] = 50

      doQuickSwing(world, playerEid, 0)

      expect(world.tremorThisTick).toBe(true)
      const swingDmg = PICKAXE_SWING_DAMAGE
      const tremorDmg = Math.round(swingDmg * 0.5)
      expect(Health.current[enemyEid]).toBe(50 - swingDmg - tremorDmg)
    })

    test('tremor does not trigger without node taken', () => {
      world.upgradeState.consecutiveSwings = 3

      doQuickSwing(world, playerEid)

      expect(world.tremorThisTick).toBe(false)
    })

    test('consecutive swings reset after 2s idle (combo timeout)', () => {
      doQuickSwing(world, playerEid)
      expect(world.upgradeState.consecutiveSwings).toBe(1)
      expect(world.upgradeState.consecutiveSwingTimer).toBeGreaterThan(0)

      // Tick buffSystem for 2.1 seconds total to expire combo
      buffSystem(world, 2.1)

      expect(world.upgradeState.consecutiveSwings).toBe(0)
      expect(world.upgradeState.consecutiveSwingTimer).toBe(0)
    })
  })

  describe('gold fever bonus', () => {
    test('gold fever stacks increase swing damage', () => {
      world.upgradeState.goldFeverStacks = 3
      world.upgradeState.goldFeverTimer = 5

      const enemyEid = placeEnemy(world, 130, 100)
      const startHP = Health.current[enemyEid]!

      doQuickSwing(world, playerEid, 0)

      const feverBonus = 1 + 3 * world.upgradeState.goldFeverBonus
      const expectedDamage = Math.round(PICKAXE_SWING_DAMAGE * feverBonus)
      expect(Health.current[enemyEid]).toBe(startHP - expectedDamage)
    })
  })

  describe('tunnel through', () => {
    test('charged swing pulls enemies when tunnel_through is taken', () => {
      world.upgradeState.nodesTaken.add('tunnel_through')

      const enemyEid = placeEnemy(world, 140, 100)

      Player.aimAngle[playerEid] = 0

      // Start charging
      MeleeWeapon.shootWasDown[playerEid] = 0
      world.playerInputs.set(playerEid, createShootInput(0))
      meleeSystem(world, 1 / 60)

      // Set charge past threshold
      MeleeWeapon.chargeTimer[playerEid] = PICKAXE_CHARGE_TIME + 0.01

      // Release
      MeleeWeapon.shootWasDown[playerEid] = 1
      const releaseInput = createInputState()
      releaseInput.aimAngle = 0
      world.playerInputs.set(playerEid, releaseInput)
      rebuildHash(world)
      meleeSystem(world, 1 / 60)

      // Knockback should be negative (pull toward player)
      expect(Knockback.vx[enemyEid]).toBeLessThan(0)
    })

    test('charged kill resets swing cooldown when tunnel_through is taken', () => {
      world.upgradeState.nodesTaken.add('tunnel_through')

      // Low-HP enemy that will die from charged swing
      const enemyEid = placeEnemy(world, 130, 100)
      Health.current[enemyEid] = 1

      Player.aimAngle[playerEid] = 0

      // Start charging
      MeleeWeapon.shootWasDown[playerEid] = 0
      world.playerInputs.set(playerEid, createShootInput(0))
      meleeSystem(world, 1 / 60)

      // Set charge past threshold
      MeleeWeapon.chargeTimer[playerEid] = PICKAXE_CHARGE_TIME + 0.01

      // Release — charged swing kills the enemy
      MeleeWeapon.shootWasDown[playerEid] = 1
      const releaseInput = createInputState()
      releaseInput.aimAngle = 0
      world.playerInputs.set(playerEid, releaseInput)
      rebuildHash(world)
      meleeSystem(world, 1 / 60)

      // Swing cooldown should be reset to 0
      expect(MeleeWeapon.swingCooldown[playerEid]).toBe(0)
    })
  })

  describe('no input', () => {
    test('does nothing without input state', () => {
      meleeSystem(world, 1 / 60)
      expect(MeleeWeapon.swungThisTick[playerEid]).toBe(0)
    })
  })
})
