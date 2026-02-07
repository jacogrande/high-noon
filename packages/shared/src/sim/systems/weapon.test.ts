import { describe, expect, test, beforeEach } from 'bun:test'
import { hasComponent, addComponent } from 'bitecs'
import { createGameWorld, type GameWorld } from '../world'
import { spawnPlayer } from '../prefabs'
import { weaponSystem } from './weapon'
import { Button, createInputState, setButton, type InputState } from '../../net/input'
import { Weapon, Cylinder, Roll, PlayerState, PlayerStateType, Bullet, Position, Velocity, Player } from '../components'
import { PISTOL_HOLD_FIRE_RATE, PISTOL_MIN_FIRE_INTERVAL } from '../content/weapons'

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
    test('hold: cannot fire while cooldown is positive', () => {
      Player.shootWasDown[playerEid] = 1
      Cylinder.fireCooldown[playerEid] = 0.1

      const input = createShootInput()
      weaponSystem(world, 1 / 60, input)

      expect(countBullets(world)).toBe(0)
    })

    test('always sets hold-rate cooldown after firing', () => {
      Player.shootWasDown[playerEid] = 0
      const input = createShootInput()
      weaponSystem(world, 1 / 60, input)

      const expectedCooldown = 1 / PISTOL_HOLD_FIRE_RATE
      expect(Cylinder.fireCooldown[playerEid]).toBeCloseTo(expectedCooldown)
    })

    test('fresh click: fires through remaining cooldown if minFireInterval elapsed', () => {
      // Simulate: previous shot set 200ms cooldown, 100ms has passed → 100ms remains
      // elapsed = 200ms - 100ms = 100ms >= 75ms → should fire
      Player.shootWasDown[playerEid] = 0
      const holdCooldown = 1 / PISTOL_HOLD_FIRE_RATE
      Cylinder.fireCooldown[playerEid] = holdCooldown - 0.1 // 100ms elapsed

      const input = createShootInput()
      weaponSystem(world, 1 / 60, input)

      expect(countBullets(world)).toBe(1)
    })

    test('fresh click: blocked if less than minFireInterval elapsed', () => {
      // Simulate: previous shot set 200ms cooldown, only 50ms passed → 150ms remains
      // elapsed = 200ms - 150ms = 50ms < 75ms → should NOT fire
      Player.shootWasDown[playerEid] = 0
      const holdCooldown = 1 / PISTOL_HOLD_FIRE_RATE
      Cylinder.fireCooldown[playerEid] = holdCooldown - 0.05 // only 50ms elapsed

      const input = createShootInput()
      weaponSystem(world, 1 / 60, input)

      expect(countBullets(world)).toBe(0)
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
