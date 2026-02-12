import { describe, expect, test, beforeEach } from 'bun:test'
import { hasComponent, defineQuery } from 'bitecs'
import { createGameWorld, type GameWorld } from '../world'
import { spawnPlayer, spawnSwarmer } from '../prefabs'
import { dynamiteSystem } from './dynamite'
import { PROSPECTOR } from '../content/characters/prospector'
import { Button, createInputState, setButton, type InputState } from '../../net/input'
import {
  Player, Position, Showdown, Health, Knockback,
} from '../components'
import { createSpatialHash, rebuildSpatialHash } from '../SpatialHash'
import {
  DYNAMITE_DAMAGE, DYNAMITE_RADIUS, DYNAMITE_FUSE,
  DYNAMITE_COOLDOWN, DYNAMITE_THROW_RANGE,
} from '../content/weapons'

const positionQuery = defineQuery([Position])

function createProspectorWorld(): GameWorld {
  return createGameWorld(42, PROSPECTOR)
}

function rebuildHash(world: GameWorld): void {
  if (!world.spatialHash) {
    world.spatialHash = createSpatialHash(2000, 2000, 64)
  }
  const eids = Array.from(positionQuery(world))
  rebuildSpatialHash(world.spatialHash, eids, Position.x, Position.y)
}

function createAbilityInput(cursorX = 200, cursorY = 100): InputState {
  const input = createInputState()
  input.buttons = setButton(input.buttons, Button.ABILITY)
  input.cursorWorldX = cursorX
  input.cursorWorldY = cursorY
  return input
}

describe('dynamiteSystem', () => {
  let world: GameWorld
  let playerEid: number

  beforeEach(() => {
    world = createProspectorWorld()
    playerEid = spawnPlayer(world, 100, 100)
  })

  describe('cooking', () => {
    test('pressing ability starts cooking', () => {
      Player.abilityWasDown[playerEid] = 0
      world.playerInputs.set(playerEid, createAbilityInput())
      dynamiteSystem(world, 1 / 60)

      expect(world.upgradeState.dynamiteCooking).toBe(true)
      expect(world.upgradeState.dynamiteCookTimer).toBe(0)
    })

    test('holding ability continues cooking', () => {
      world.upgradeState.dynamiteCooking = true
      world.upgradeState.dynamiteCookTimer = 0.5

      Player.abilityWasDown[playerEid] = 1
      world.playerInputs.set(playerEid, createAbilityInput())
      dynamiteSystem(world, 1 / 60)

      expect(world.upgradeState.dynamiteCookTimer).toBeCloseTo(0.5 + 1 / 60)
    })

    test('cannot start cooking while on cooldown', () => {
      Showdown.cooldown[playerEid] = 5.0

      Player.abilityWasDown[playerEid] = 0
      world.playerInputs.set(playerEid, createAbilityInput())
      dynamiteSystem(world, 1 / 60)

      expect(world.upgradeState.dynamiteCooking).toBe(false)
    })
  })

  describe('throwing', () => {
    test('releasing button throws dynamite at cursor position', () => {
      world.upgradeState.dynamiteCooking = true
      world.upgradeState.dynamiteCookTimer = 0.3

      Player.abilityWasDown[playerEid] = 1
      const releaseInput = createInputState()
      releaseInput.cursorWorldX = 200
      releaseInput.cursorWorldY = 100
      world.playerInputs.set(playerEid, releaseInput)
      dynamiteSystem(world, 1 / 60)

      expect(world.dynamites).toHaveLength(1)
      expect(world.dynamites[0]!.x).toBe(200)
      expect(world.dynamites[0]!.y).toBe(100)
    })

    test('remaining fuse = dynamiteFuse - cookTimer (minus fuse tick)', () => {
      const cookTime = 0.5
      const dt = 1 / 60
      world.upgradeState.dynamiteCooking = true
      world.upgradeState.dynamiteCookTimer = cookTime

      Player.abilityWasDown[playerEid] = 1
      const releaseInput = createInputState()
      releaseInput.cursorWorldX = 200
      releaseInput.cursorWorldY = 100
      world.playerInputs.set(playerEid, releaseInput)
      dynamiteSystem(world, dt)

      // Fuse is also ticked by dt in the same system call
      expect(world.dynamites[0]!.fuseRemaining).toBeCloseTo(DYNAMITE_FUSE - cookTime - dt)
    })

    test('throw range is clamped to max range', () => {
      world.upgradeState.dynamiteCooking = true
      world.upgradeState.dynamiteCookTimer = 0.1

      Player.abilityWasDown[playerEid] = 1
      const releaseInput = createInputState()
      // Cursor far away
      releaseInput.cursorWorldX = 100 + 1000
      releaseInput.cursorWorldY = 100
      world.playerInputs.set(playerEid, releaseInput)
      dynamiteSystem(world, 1 / 60)

      // Should clamp to throw range
      const dx = world.dynamites[0]!.x - 100
      const dy = world.dynamites[0]!.y - 100
      const dist = Math.sqrt(dx * dx + dy * dy)
      expect(dist).toBeCloseTo(DYNAMITE_THROW_RANGE, 0)
    })

    test('throwing sets cooldown', () => {
      world.upgradeState.dynamiteCooking = true
      world.upgradeState.dynamiteCookTimer = 0.1

      Player.abilityWasDown[playerEid] = 1
      world.playerInputs.set(playerEid, createInputState())
      dynamiteSystem(world, 1 / 60)

      expect(Showdown.cooldown[playerEid]).toBe(DYNAMITE_COOLDOWN)
    })
  })

  describe('self-detonation', () => {
    test('cooking past fuse time self-detonates immediately', () => {
      world.upgradeState.dynamiteCooking = true
      world.upgradeState.dynamiteCookTimer = DYNAMITE_FUSE - 0.01
      rebuildHash(world)

      Player.abilityWasDown[playerEid] = 1
      world.playerInputs.set(playerEid, createAbilityInput())
      // This tick pushes cook timer past fuse
      dynamiteSystem(world, 0.02)

      // Dynamite spawns with fuseRemaining=0 and detonates in the same tick
      expect(world.dynamites).toHaveLength(0)
      expect(world.dynamiteDetonatedThisTick).toBe(true)
      // Cooking state is reset
      expect(world.upgradeState.dynamiteCooking).toBe(false)
      expect(Showdown.cooldown[playerEid]).toBe(DYNAMITE_COOLDOWN)
    })
  })

  describe('fuse and detonation', () => {
    test('fuse ticks down each frame', () => {
      world.dynamites.push({
        x: 200, y: 200, fuseRemaining: 1.0,
        damage: DYNAMITE_DAMAGE, radius: DYNAMITE_RADIUS,
        knockback: 60, ownerId: playerEid,
      })

      dynamiteSystem(world, 0.1)

      expect(world.dynamites[0]!.fuseRemaining).toBeCloseTo(0.9)
    })

    test('dynamite detonates when fuse reaches 0', () => {
      world.dynamites.push({
        x: 200, y: 200, fuseRemaining: 0.05,
        damage: DYNAMITE_DAMAGE, radius: DYNAMITE_RADIUS,
        knockback: 60, ownerId: playerEid,
      })

      dynamiteSystem(world, 0.1)

      expect(world.dynamites).toHaveLength(0)
      expect(world.dynamiteDetonatedThisTick).toBe(true)
    })

    test('detonation damages enemies in blast radius', () => {
      const enemyEid = spawnSwarmer(world, 200, 200)
      rebuildHash(world)

      world.dynamites.push({
        x: 200, y: 200, fuseRemaining: 0.01,
        damage: DYNAMITE_DAMAGE, radius: DYNAMITE_RADIUS,
        knockback: 60, ownerId: playerEid,
      })

      const startHP = Health.current[enemyEid]!
      dynamiteSystem(world, 0.02)

      expect(Health.current[enemyEid]).toBe(startHP - DYNAMITE_DAMAGE)
    })

    test('detonation applies knockback to enemies', () => {
      const enemyEid = spawnSwarmer(world, 210, 200)
      rebuildHash(world)

      world.dynamites.push({
        x: 200, y: 200, fuseRemaining: 0.01,
        damage: DYNAMITE_DAMAGE, radius: DYNAMITE_RADIUS,
        knockback: 60, ownerId: playerEid,
      })

      dynamiteSystem(world, 0.02)

      expect(hasComponent(world, Knockback, enemyEid)).toBe(true)
      expect(Knockback.vx[enemyEid]).toBeGreaterThan(0) // pushed away from blast
    })

    test('detonation does not damage enemies outside radius', () => {
      const enemyEid = spawnSwarmer(world, 500, 500)
      rebuildHash(world)

      world.dynamites.push({
        x: 200, y: 200, fuseRemaining: 0.01,
        damage: DYNAMITE_DAMAGE, radius: DYNAMITE_RADIUS,
        knockback: 60, ownerId: playerEid,
      })

      const startHP = Health.current[enemyEid]!
      dynamiteSystem(world, 0.02)

      expect(Health.current[enemyEid]).toBe(startHP)
    })

    test('enemy-owned dynamite damages nearby player', () => {
      const enemyOwner = spawnSwarmer(world, 220, 100)
      rebuildHash(world)
      const startHP = Health.current[playerEid]!

      world.dynamites.push({
        x: 100, y: 100, fuseRemaining: 0.01,
        damage: 9, radius: 80,
        knockback: 60, ownerId: enemyOwner,
      })

      dynamiteSystem(world, 0.02)

      expect(Health.current[playerEid]).toBe(startHP - 9)
      expect(Health.iframes[playerEid]).toBeGreaterThan(0)
    })

    test('enemy-owned dynamite does not damage enemies', () => {
      const enemyOwner = spawnSwarmer(world, 220, 100)
      const nearbyEnemy = spawnSwarmer(world, 100, 100)
      rebuildHash(world)
      const nearbyEnemyHP = Health.current[nearbyEnemy]!

      world.dynamites.push({
        x: 100, y: 100, fuseRemaining: 0.01,
        damage: 9, radius: 80,
        knockback: 60, ownerId: enemyOwner,
      })

      dynamiteSystem(world, 0.02)

      expect(Health.current[nearbyEnemy]).toBe(nearbyEnemyHP)
    })
  })

  describe('self-damage', () => {
    test('player takes self-damage if in blast radius', () => {
      rebuildHash(world)
      const startHP = Health.current[playerEid]!

      world.dynamites.push({
        x: 100, y: 100, fuseRemaining: 0.01,
        damage: DYNAMITE_DAMAGE, radius: DYNAMITE_RADIUS,
        knockback: 60, ownerId: playerEid,
      })

      dynamiteSystem(world, 0.02)

      expect(Health.current[playerEid]).toBe(startHP - DYNAMITE_DAMAGE)
    })

    test('controlled_demolition skips self-damage', () => {
      world.upgradeState.nodesTaken.add('controlled_demolition')
      rebuildHash(world)
      const startHP = Health.current[playerEid]!

      world.dynamites.push({
        x: 100, y: 100, fuseRemaining: 0.01,
        damage: DYNAMITE_DAMAGE, radius: DYNAMITE_RADIUS,
        knockback: 60, ownerId: playerEid,
      })

      dynamiteSystem(world, 0.02)

      expect(Health.current[playerEid]).toBe(startHP)
    })
  })

  describe('cooldown', () => {
    test('cooldown decrements each tick', () => {
      Showdown.cooldown[playerEid] = 5.0
      world.playerInputs.set(playerEid, createInputState())
      dynamiteSystem(world, 1.0)

      expect(Showdown.cooldown[playerEid]).toBeCloseTo(4.0)
    })

    test('cooldown does not go below 0', () => {
      Showdown.cooldown[playerEid] = 0.05
      world.playerInputs.set(playerEid, createInputState())
      dynamiteSystem(world, 0.1)

      expect(Showdown.cooldown[playerEid]).toBe(0)
    })
  })

  describe('nitro secondary explosions', () => {
    test('nitro triggers secondary blast on kill', () => {
      world.upgradeState.nodesTaken.add('nitro')

      // Low-HP enemy that will die from blast
      const dyingEnemy = spawnSwarmer(world, 200, 200)
      Health.current[dyingEnemy] = 1

      // Nearby enemy far enough from blast center to avoid primary,
      // but within nitro secondary radius (40px) of the dying enemy
      const nearbyEnemy = spawnSwarmer(world, 200 + DYNAMITE_RADIUS + 10, 200)
      // Place within 40px of dying enemy but outside primary blast radius
      Position.x[nearbyEnemy] = 230
      Position.y[nearbyEnemy] = 200
      const nearbyHP = Health.current[nearbyEnemy]!
      rebuildHash(world)

      // Use small blast radius so nearby enemy is only hit by nitro
      world.dynamites.push({
        x: 200, y: 200, fuseRemaining: 0.01,
        damage: DYNAMITE_DAMAGE, radius: 20, // small primary radius
        knockback: 60, ownerId: playerEid,
      })

      dynamiteSystem(world, 0.02)

      // Dying enemy was within the 20px primary radius (dist=0)
      // Nearby enemy at 30px is outside 20px primary but within 40px nitro
      expect(Health.current[nearbyEnemy]).toBe(nearbyHP - 8) // only nitro damage
    })
  })
})
