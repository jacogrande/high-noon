import { describe, expect, test, beforeEach } from 'bun:test'
import { hasComponent, addComponent } from 'bitecs'
import { createGameWorld, type GameWorld } from '../world'
import { spawnPlayer } from '../prefabs'
import { weaponSystem } from './weapon'
import { Button, createInputState, setButton, type InputState } from '../../net/input'
import { Weapon, Roll, PlayerState, PlayerStateType, Bullet, Position, Velocity, Player } from '../components'
import { PISTOL_FIRE_RATE } from '../content/weapons'

describe('weaponSystem', () => {
  let world: GameWorld
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld()
    playerEid = spawnPlayer(world, 100, 100)
  })

  function createShootInput(aimAngle = 0): InputState {
    const input = createInputState()
    input.buttons = setButton(input.buttons, Button.SHOOT)
    input.aimAngle = aimAngle
    return input
  }

  describe('cooldown', () => {
    test('decrements cooldown each tick', () => {
      // Set initial cooldown
      Weapon.cooldown[playerEid] = 0.5

      // Run system without shooting
      const input = createInputState()
      weaponSystem(world, 0.1, input)

      expect(Weapon.cooldown[playerEid]).toBeCloseTo(0.4)
    })

    test('cooldown does not go below zero', () => {
      Weapon.cooldown[playerEid] = 0.05

      const input = createInputState()
      weaponSystem(world, 0.1, input)

      expect(Weapon.cooldown[playerEid]).toBe(0)
    })

    test('cannot fire while on cooldown', () => {
      Weapon.cooldown[playerEid] = 0.5

      const input = createShootInput()
      weaponSystem(world, 1 / 60, input)

      // No bullet should be spawned - count entities with Bullet component
      const bullets = countBullets(world)
      expect(bullets).toBe(0)
    })

    test('sets cooldown after firing', () => {
      const input = createShootInput()
      weaponSystem(world, 1 / 60, input)

      const expectedCooldown = 1 / PISTOL_FIRE_RATE
      expect(Weapon.cooldown[playerEid]).toBeCloseTo(expectedCooldown)
    })
  })

  describe('firing', () => {
    test('spawns bullet when shoot pressed and cooldown is zero', () => {
      const input = createShootInput()
      weaponSystem(world, 1 / 60, input)

      const bullets = countBullets(world)
      expect(bullets).toBe(1)
    })

    test('does not spawn bullet without shoot input', () => {
      const input = createInputState()
      weaponSystem(world, 1 / 60, input)

      const bullets = countBullets(world)
      expect(bullets).toBe(0)
    })

    test('bullet spawns at player position', () => {
      const input = createShootInput()
      weaponSystem(world, 1 / 60, input)

      const bulletEid = findBulletEntity(world)
      expect(bulletEid).not.toBeNull()
      expect(Position.x[bulletEid!]).toBe(100)
      expect(Position.y[bulletEid!]).toBe(100)
    })

    test('bullet velocity matches aim direction', () => {
      const aimAngle = Math.PI / 4 // 45 degrees
      // Set player aim angle directly (normally done by playerInputSystem)
      Player.aimAngle[playerEid] = aimAngle

      const input = createShootInput(aimAngle)
      weaponSystem(world, 1 / 60, input)

      const bulletEid = findBulletEntity(world)
      expect(bulletEid).not.toBeNull()

      const bulletSpeed = Weapon.bulletSpeed[playerEid]!
      const expectedVx = Math.cos(aimAngle) * bulletSpeed
      const expectedVy = Math.sin(aimAngle) * bulletSpeed

      expect(Velocity.x[bulletEid!]).toBeCloseTo(expectedVx)
      expect(Velocity.y[bulletEid!]).toBeCloseTo(expectedVy)
    })
  })

  describe('roll interaction', () => {
    test('cannot fire while rolling (Roll component)', () => {
      // Add Roll component to simulate rolling
      addComponent(world, Roll, playerEid)
      Roll.duration[playerEid] = 0.3
      Roll.elapsed[playerEid] = 0.1

      const input = createShootInput()
      weaponSystem(world, 1 / 60, input)

      const bullets = countBullets(world)
      expect(bullets).toBe(0)
    })

    test('cannot fire while in ROLLING state', () => {
      PlayerState.state[playerEid] = PlayerStateType.ROLLING

      const input = createShootInput()
      weaponSystem(world, 1 / 60, input)

      const bullets = countBullets(world)
      expect(bullets).toBe(0)
    })

    test('can fire after roll ends', () => {
      // Player not rolling
      PlayerState.state[playerEid] = PlayerStateType.IDLE

      const input = createShootInput()
      weaponSystem(world, 1 / 60, input)

      const bullets = countBullets(world)
      expect(bullets).toBe(1)
    })
  })

  describe('no input', () => {
    test('does nothing without input state', () => {
      weaponSystem(world, 1 / 60, undefined)

      const bullets = countBullets(world)
      expect(bullets).toBe(0)
    })
  })
})

// Helper to count bullet entities
function countBullets(world: GameWorld): number {
  let count = 0
  // Check entities starting from 1 (entity 0 is often reserved)
  for (let eid = 0; eid < 100; eid++) {
    if (hasComponent(world, Bullet, eid)) {
      count++
    }
  }
  return count
}

// Helper to find a bullet entity
function findBulletEntity(world: GameWorld): number | null {
  for (let eid = 0; eid < 100; eid++) {
    if (hasComponent(world, Bullet, eid)) {
      return eid
    }
  }
  return null
}
