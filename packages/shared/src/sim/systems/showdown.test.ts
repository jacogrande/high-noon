import { describe, expect, test, beforeEach } from 'bun:test'
import { addComponent, addEntity } from 'bitecs'
import { createGameWorld, type GameWorld } from '../world'
import { spawnPlayer, NO_TARGET } from '../prefabs'
import { showdownSystem } from './showdown'
import { Button, createInputState, type InputState } from '../../net/input'
import {
  Player,
  Showdown,
  Position,
  Velocity,
  Speed,
  Enemy,
  Health,
  Dead,
  Roll,
  Collider,
  EnemyAI,
  Detection,
  AttackConfig,
  Steering,
  PlayerState,
  PlayerStateType,
} from '../components'
import {
  SHOWDOWN_DURATION,
  SHOWDOWN_COOLDOWN,
  SHOWDOWN_KILL_REFUND,
  SHOWDOWN_SPEED_BONUS,
  SHOWDOWN_MARK_RANGE,
} from '../content/weapons'

/** Spawn a minimal enemy at (x, y) with given HP */
function spawnTestEnemy(world: GameWorld, x: number, y: number, hp = 10): number {
  const eid = addEntity(world)
  addComponent(world, Position, eid)
  addComponent(world, Velocity, eid)
  addComponent(world, Speed, eid)
  addComponent(world, Collider, eid)
  addComponent(world, Health, eid)
  addComponent(world, Enemy, eid)
  addComponent(world, EnemyAI, eid)
  addComponent(world, Detection, eid)
  addComponent(world, AttackConfig, eid)
  addComponent(world, Steering, eid)
  Position.x[eid] = x
  Position.y[eid] = y
  Health.current[eid] = hp
  Health.max[eid] = hp
  return eid
}

function abilityInput(cursorX = 0, cursorY = 0): InputState {
  const input = createInputState()
  input.buttons |= Button.ABILITY
  input.cursorWorldX = cursorX
  input.cursorWorldY = cursorY
  return input
}

describe('showdownSystem', () => {
  let world: GameWorld
  let playerEid: number
  const dt = 1 / 60

  beforeEach(() => {
    world = createGameWorld(42)
    playerEid = spawnPlayer(world, 100, 100)
  })

  describe('activation', () => {
    test('marks closest enemy to cursor within range', () => {
      const nearEnemy = spawnTestEnemy(world, 200, 100)
      const farEnemy = spawnTestEnemy(world, 500, 100)

      const input = abilityInput(200, 100)
      showdownSystem(world, dt, input)

      expect(Showdown.active[playerEid]).toBe(1)
      expect(Showdown.targetEid[playerEid]).toBe(nearEnemy)
      expect(Showdown.duration[playerEid]).toBeCloseTo(SHOWDOWN_DURATION)
    })

    test('ignores enemies beyond mark range', () => {
      spawnTestEnemy(world, 100 + SHOWDOWN_MARK_RANGE + 100, 100)

      const input = abilityInput(100, 100)
      showdownSystem(world, dt, input)

      expect(Showdown.active[playerEid]).toBe(0)
      expect(Showdown.targetEid[playerEid]).toBe(NO_TARGET)
    })

    test('blocked by cooldown', () => {
      spawnTestEnemy(world, 200, 100)
      Showdown.cooldown[playerEid] = 5.0

      const input = abilityInput(200, 100)
      showdownSystem(world, dt, input)

      expect(Showdown.active[playerEid]).toBe(0)
    })

    test('blocked when already active', () => {
      const enemy1 = spawnTestEnemy(world, 200, 100)
      const enemy2 = spawnTestEnemy(world, 300, 100)

      Showdown.active[playerEid] = 1
      Showdown.targetEid[playerEid] = enemy1
      Showdown.duration[playerEid] = 3.0

      const input = abilityInput(300, 100)
      showdownSystem(world, dt, input)

      // Still targeting enemy1, not enemy2
      expect(Showdown.targetEid[playerEid]).toBe(enemy1)
    })

    test('requires re-press (hold does not re-activate)', () => {
      spawnTestEnemy(world, 200, 100)

      // First press — activates
      const input1 = abilityInput(200, 100)
      showdownSystem(world, dt, input1)
      expect(Showdown.active[playerEid]).toBe(1)

      // Expire the showdown manually
      Showdown.active[playerEid] = 0
      Showdown.targetEid[playerEid] = NO_TARGET
      Showdown.duration[playerEid] = 0

      // Hold — should NOT re-activate (wasDown = 1)
      const input2 = abilityInput(200, 100)
      showdownSystem(world, dt, input2)
      expect(Showdown.active[playerEid]).toBe(0)
    })

    test('sets showdownActivatedThisTick', () => {
      spawnTestEnemy(world, 200, 100)

      const input = abilityInput(200, 100)
      showdownSystem(world, dt, input)

      expect(world.showdownActivatedThisTick).toBe(true)
    })

    test('does not set showdownActivatedThisTick when no enemy in range', () => {
      const input = abilityInput(200, 100)
      showdownSystem(world, dt, input)

      expect(world.showdownActivatedThisTick).toBe(false)
    })
  })

  describe('duration', () => {
    test('decrements while active', () => {
      const enemy = spawnTestEnemy(world, 200, 100)
      Showdown.active[playerEid] = 1
      Showdown.targetEid[playerEid] = enemy
      Showdown.duration[playerEid] = 3.0

      const input = createInputState()
      showdownSystem(world, 0.5, input)

      expect(Showdown.duration[playerEid]).toBeCloseTo(2.5)
    })

    test('deactivates on expiry', () => {
      const enemy = spawnTestEnemy(world, 200, 100)
      Showdown.active[playerEid] = 1
      Showdown.targetEid[playerEid] = enemy
      Showdown.duration[playerEid] = 0.01

      const input = createInputState()
      showdownSystem(world, 0.02, input)

      expect(Showdown.active[playerEid]).toBe(0)
      expect(Showdown.targetEid[playerEid]).toBe(NO_TARGET)
    })

    test('sets full cooldown on expiry', () => {
      const enemy = spawnTestEnemy(world, 200, 100)
      Showdown.active[playerEid] = 1
      Showdown.targetEid[playerEid] = enemy
      Showdown.duration[playerEid] = 0.01

      const input = createInputState()
      showdownSystem(world, 0.02, input)

      expect(Showdown.cooldown[playerEid]).toBeCloseTo(SHOWDOWN_COOLDOWN)
    })

    test('sets showdownExpiredThisTick on expiry', () => {
      const enemy = spawnTestEnemy(world, 200, 100)
      Showdown.active[playerEid] = 1
      Showdown.targetEid[playerEid] = enemy
      Showdown.duration[playerEid] = 0.01

      const input = createInputState()
      showdownSystem(world, 0.02, input)

      expect(world.showdownExpiredThisTick).toBe(true)
    })

    test('does not set showdownExpiredThisTick when still active', () => {
      const enemy = spawnTestEnemy(world, 200, 100)
      Showdown.active[playerEid] = 1
      Showdown.targetEid[playerEid] = enemy
      Showdown.duration[playerEid] = 3.0

      const input = createInputState()
      showdownSystem(world, dt, input)

      expect(world.showdownExpiredThisTick).toBe(false)
    })

    test('does not set showdownExpiredThisTick on kill (kill not expiry)', () => {
      const enemy = spawnTestEnemy(world, 200, 100, 5)
      Showdown.active[playerEid] = 1
      Showdown.targetEid[playerEid] = enemy
      Showdown.duration[playerEid] = 3.0

      Health.current[enemy] = 0

      const input = createInputState()
      showdownSystem(world, dt, input)

      expect(world.showdownKillThisTick).toBe(true)
      expect(world.showdownExpiredThisTick).toBe(false)
    })
  })

  describe('kill detection', () => {
    test('detects Health.current <= 0', () => {
      const enemy = spawnTestEnemy(world, 200, 100, 5)
      Showdown.active[playerEid] = 1
      Showdown.targetEid[playerEid] = enemy
      Showdown.duration[playerEid] = 3.0

      // Simulate damage from previous tick
      Health.current[enemy] = 0

      const input = createInputState()
      showdownSystem(world, dt, input)

      expect(Showdown.active[playerEid]).toBe(0)
      expect(world.showdownKillThisTick).toBe(true)
    })

    test('grants cooldown refund on kill', () => {
      const enemy = spawnTestEnemy(world, 200, 100, 5)
      Showdown.active[playerEid] = 1
      Showdown.targetEid[playerEid] = enemy
      Showdown.duration[playerEid] = 3.0

      Health.current[enemy] = 0

      const input = createInputState()
      showdownSystem(world, dt, input)

      expect(Showdown.cooldown[playerEid]).toBeCloseTo(SHOWDOWN_COOLDOWN - SHOWDOWN_KILL_REFUND)
    })

    test('deactivates and resets targetEid to NO_TARGET', () => {
      const enemy = spawnTestEnemy(world, 200, 100, 5)
      Showdown.active[playerEid] = 1
      Showdown.targetEid[playerEid] = enemy
      Showdown.duration[playerEid] = 3.0

      Health.current[enemy] = -5

      const input = createInputState()
      showdownSystem(world, dt, input)

      expect(Showdown.active[playerEid]).toBe(0)
      expect(Showdown.targetEid[playerEid]).toBe(NO_TARGET)
    })

    test('detects Dead component on target', () => {
      const enemy = spawnTestEnemy(world, 200, 100, 5)
      Showdown.active[playerEid] = 1
      Showdown.targetEid[playerEid] = enemy
      Showdown.duration[playerEid] = 3.0

      addComponent(world, Dead, enemy)

      const input = createInputState()
      showdownSystem(world, dt, input)

      expect(Showdown.active[playerEid]).toBe(0)
      expect(world.showdownKillThisTick).toBe(true)
    })
  })

  describe('speed bonus', () => {
    test('sets Speed.current to max * bonus while active', () => {
      const enemy = spawnTestEnemy(world, 200, 100)
      Showdown.active[playerEid] = 1
      Showdown.targetEid[playerEid] = enemy
      Showdown.duration[playerEid] = 3.0

      const input = createInputState()
      showdownSystem(world, dt, input)

      expect(Speed.current[playerEid]).toBeCloseTo(Speed.max[playerEid]! * SHOWDOWN_SPEED_BONUS)
    })

    test('does NOT scale during roll', () => {
      const enemy = spawnTestEnemy(world, 200, 100)
      Showdown.active[playerEid] = 1
      Showdown.targetEid[playerEid] = enemy
      Showdown.duration[playerEid] = 3.0

      const baseSpeed = Speed.current[playerEid]!
      addComponent(world, Roll, playerEid)
      Roll.duration[playerEid] = 0.3
      Roll.elapsed[playerEid] = 0.1

      const input = createInputState()
      showdownSystem(world, dt, input)

      expect(Speed.current[playerEid]).toBeCloseTo(baseSpeed)
    })

    test('resets Speed.current on kill', () => {
      const enemy = spawnTestEnemy(world, 200, 100, 5)
      Showdown.active[playerEid] = 1
      Showdown.targetEid[playerEid] = enemy
      Showdown.duration[playerEid] = 3.0

      Health.current[enemy] = 0

      const input = createInputState()
      showdownSystem(world, dt, input)

      expect(Speed.current[playerEid]).toBeCloseTo(Speed.max[playerEid]!)
    })

    test('resets Speed.current on expiry', () => {
      const enemy = spawnTestEnemy(world, 200, 100)
      Showdown.active[playerEid] = 1
      Showdown.targetEid[playerEid] = enemy
      Showdown.duration[playerEid] = 0.01

      const input = createInputState()
      showdownSystem(world, 0.02, input)

      expect(Speed.current[playerEid]).toBeCloseTo(Speed.max[playerEid]!)
    })
  })

  describe('cooldown', () => {
    test('decrements each tick', () => {
      Showdown.cooldown[playerEid] = 5.0

      const input = createInputState()
      showdownSystem(world, 1.0, input)

      expect(Showdown.cooldown[playerEid]).toBeCloseTo(4.0)
    })

    test('does not go below 0', () => {
      Showdown.cooldown[playerEid] = 0.005

      const input = createInputState()
      showdownSystem(world, dt, input)

      expect(Showdown.cooldown[playerEid]).toBe(0)
    })
  })

  describe('no input', () => {
    test('does nothing without input state (no activation)', () => {
      spawnTestEnemy(world, 200, 100)

      showdownSystem(world, dt)

      expect(Showdown.active[playerEid]).toBe(0)
    })

    test('still processes active showdown without input', () => {
      const enemy = spawnTestEnemy(world, 200, 100)
      Showdown.active[playerEid] = 1
      Showdown.targetEid[playerEid] = enemy
      Showdown.duration[playerEid] = 3.0

      showdownSystem(world, dt)

      // Speed bonus should still apply
      expect(Speed.current[playerEid]).toBeCloseTo(Speed.max[playerEid]! * SHOWDOWN_SPEED_BONUS)
      // Duration should still decrement
      expect(Showdown.duration[playerEid]).toBeCloseTo(3.0 - dt)
    })
  })
})
