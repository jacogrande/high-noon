import { describe, expect, test, beforeEach } from 'bun:test'
import { hasComponent, addComponent, defineQuery } from 'bitecs'
import { createGameWorld, type GameWorld } from '../world'
import { spawnPlayer } from '../prefabs'
import { weaponSystem } from './weapon'
import { Button, createInputState, setButton, type InputState } from '../../net/input'
import { Weapon, Cylinder, Roll, PlayerState, PlayerStateType, Bullet, Position, Velocity, Player } from '../components'
import { PISTOL_HOLD_FIRE_RATE, PISTOL_MIN_FIRE_INTERVAL, PISTOL_CYLINDER_SIZE, PISTOL_LAST_ROUND_MULTIPLIER, PISTOL_BULLET_DAMAGE } from '../content/weapons'

const bulletQuery = defineQuery([Bullet])

/** Set per-entity input on world.playerInputs */
function setInput(world: GameWorld, eid: number, input: InputState): void {
  world.playerInputs.set(eid, input)
}

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

      setInput(world, playerEid, createShootInput())
      weaponSystem(world, 1 / 60)

      expect(countBullets(world)).toBe(0)
    })

    test('always sets hold-rate cooldown after firing', () => {
      Player.shootWasDown[playerEid] = 0
      setInput(world, playerEid, createShootInput())
      weaponSystem(world, 1 / 60)

      const expectedCooldown = 1 / PISTOL_HOLD_FIRE_RATE
      expect(Cylinder.fireCooldown[playerEid]).toBeCloseTo(expectedCooldown)
    })

    test('fresh click: fires through remaining cooldown if minFireInterval elapsed', () => {
      // Simulate: previous shot set 200ms cooldown, 100ms has passed -> 100ms remains
      // elapsed = 200ms - 100ms = 100ms >= 75ms -> should fire
      Player.shootWasDown[playerEid] = 0
      const holdCooldown = 1 / PISTOL_HOLD_FIRE_RATE
      Cylinder.fireCooldown[playerEid] = holdCooldown - 0.1 // 100ms elapsed

      setInput(world, playerEid, createShootInput())
      weaponSystem(world, 1 / 60)

      expect(countBullets(world)).toBe(1)
    })

    test('fresh click: blocked if less than minFireInterval elapsed', () => {
      // Simulate: previous shot set 200ms cooldown, only 50ms passed -> 150ms remains
      // elapsed = 200ms - 150ms = 50ms < 75ms -> should NOT fire
      Player.shootWasDown[playerEid] = 0
      const holdCooldown = 1 / PISTOL_HOLD_FIRE_RATE
      Cylinder.fireCooldown[playerEid] = holdCooldown - 0.05 // only 50ms elapsed

      setInput(world, playerEid, createShootInput())
      weaponSystem(world, 1 / 60)

      expect(countBullets(world)).toBe(0)
    })
  })

  describe('firing', () => {
    test('spawns bullet when shoot pressed and cooldown is zero', () => {
      setInput(world, playerEid, createShootInput())
      weaponSystem(world, 1 / 60)

      const bullets = countBullets(world)
      expect(bullets).toBe(1)
    })

    test('does not spawn bullet without shoot input', () => {
      setInput(world, playerEid, createInputState())
      weaponSystem(world, 1 / 60)

      const bullets = countBullets(world)
      expect(bullets).toBe(0)
    })

    test('bullet spawns at player position', () => {
      setInput(world, playerEid, createShootInput())
      weaponSystem(world, 1 / 60)

      const bulletEid = findBulletEntity(world)
      expect(bulletEid).not.toBeNull()
      expect(Position.x[bulletEid!]).toBe(100)
      expect(Position.y[bulletEid!]).toBe(100)
    })

    test('bullet velocity matches aim direction', () => {
      const aimAngle = Math.PI / 4 // 45 degrees
      // Set player aim angle directly (normally done by playerInputSystem)
      Player.aimAngle[playerEid] = aimAngle

      setInput(world, playerEid, createShootInput(aimAngle))
      weaponSystem(world, 1 / 60)

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

      setInput(world, playerEid, createShootInput())
      weaponSystem(world, 1 / 60)

      const bullets = countBullets(world)
      expect(bullets).toBe(0)
    })

    test('cannot fire while in ROLLING state', () => {
      PlayerState.state[playerEid] = PlayerStateType.ROLLING

      setInput(world, playerEid, createShootInput())
      weaponSystem(world, 1 / 60)

      const bullets = countBullets(world)
      expect(bullets).toBe(0)
    })

    test('can fire after roll ends', () => {
      // Player not rolling
      PlayerState.state[playerEid] = PlayerStateType.IDLE

      setInput(world, playerEid, createShootInput())
      weaponSystem(world, 1 / 60)

      const bullets = countBullets(world)
      expect(bullets).toBe(1)
    })
  })

  describe('cylinder interaction', () => {
    test('firing decrements cylinder rounds', () => {
      Cylinder.rounds[playerEid] = 6

      setInput(world, playerEid, createShootInput())
      weaponSystem(world, 1 / 60)

      expect(Cylinder.rounds[playerEid]).toBe(5)
    })

    test('cannot fire with 0 rounds', () => {
      Cylinder.rounds[playerEid] = 0

      setInput(world, playerEid, createShootInput())
      weaponSystem(world, 1 / 60)

      expect(countBullets(world)).toBe(0)
    })

    test('last round applies damage multiplier', () => {
      Cylinder.rounds[playerEid] = 1 // exactly 1 round left

      setInput(world, playerEid, createShootInput())
      weaponSystem(world, 1 / 60)

      const bulletEid = findBulletEntity(world)
      expect(bulletEid).not.toBeNull()

      const expectedDamage = Math.min(
        255,
        Math.round(PISTOL_BULLET_DAMAGE * PISTOL_LAST_ROUND_MULTIPLIER),
      )
      expect(Bullet.damage[bulletEid!]).toBe(expectedDamage)
    })

    test('non-last round does not apply multiplier', () => {
      Cylinder.rounds[playerEid] = 2

      setInput(world, playerEid, createShootInput())
      weaponSystem(world, 1 / 60)

      const bulletEid = findBulletEntity(world)
      expect(bulletEid).not.toBeNull()
      expect(Bullet.damage[bulletEid!]).toBe(PISTOL_BULLET_DAMAGE)
    })

    test('fires onCylinderEmpty hook when last round consumed', () => {
      Cylinder.rounds[playerEid] = 1
      let hookFired = false
      world.hooks.register('onCylinderEmpty', 'test', () => {
        hookFired = true
      })

      setInput(world, playerEid, createShootInput())
      weaponSystem(world, 1 / 60)

      expect(Cylinder.rounds[playerEid]).toBe(0)
      expect(hookFired).toBe(true)
    })

    test('does not fire onCylinderEmpty when rounds remain', () => {
      Cylinder.rounds[playerEid] = 2
      let hookFired = false
      world.hooks.register('onCylinderEmpty', 'test', () => {
        hookFired = true
      })

      setInput(world, playerEid, createShootInput())
      weaponSystem(world, 1 / 60)

      expect(Cylinder.rounds[playerEid]).toBe(1)
      expect(hookFired).toBe(false)
    })

    test('resets firstShotAfterReload on fire', () => {
      Cylinder.firstShotAfterReload[playerEid] = 1
      Cylinder.rounds[playerEid] = 3

      setInput(world, playerEid, createShootInput())
      weaponSystem(world, 1 / 60)

      expect(Cylinder.firstShotAfterReload[playerEid]).toBe(0)
    })
  })

  describe('no input', () => {
    test('does nothing without input state', () => {
      // playerInputs is empty — no input for this entity
      weaponSystem(world, 1 / 60)

      const bullets = countBullets(world)
      expect(bullets).toBe(0)
    })
  })
})

// Helper to count bullet entities (uses bitECS query for cross-test safety)
function countBullets(world: GameWorld): number {
  return bulletQuery(world).length
}

// Helper to find a bullet entity (uses bitECS query for cross-test safety)
function findBulletEntity(world: GameWorld): number | null {
  const bullets = bulletQuery(world)
  return bullets.length > 0 ? bullets[0]! : null
}
