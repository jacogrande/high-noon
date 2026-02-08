import { describe, expect, test, beforeEach } from 'bun:test'
import { addComponent } from 'bitecs'
import { createGameWorld, type GameWorld } from '../world'
import { spawnPlayer } from '../prefabs'
import { cylinderSystem } from './cylinder'
import { Button, createInputState, setButton, type InputState } from '../../net/input'
import { Cylinder, Roll, PlayerState, PlayerStateType } from '../components'
import { PISTOL_CYLINDER_SIZE, PISTOL_RELOAD_TIME } from '../content/weapons'

/** Set per-entity input on world.playerInputs */
function setInput(world: GameWorld, eid: number, input: InputState): void {
  world.playerInputs.set(eid, input)
}

describe('cylinderSystem', () => {
  let world: GameWorld
  let playerEid: number
  const dt = 1 / 60

  beforeEach(() => {
    world = createGameWorld()
    playerEid = spawnPlayer(world, 100, 100)
  })

  describe('fire cooldown', () => {
    test('decrements fireCooldown each tick', () => {
      Cylinder.fireCooldown[playerEid] = 0.5

      setInput(world, playerEid, createInputState())
      cylinderSystem(world, 0.1)

      expect(Cylinder.fireCooldown[playerEid]).toBeCloseTo(0.4)
    })

    test('does not go below zero', () => {
      Cylinder.fireCooldown[playerEid] = 0.005

      setInput(world, playerEid, createInputState())
      cylinderSystem(world, dt)

      expect(Cylinder.fireCooldown[playerEid]).toBe(0)
    })
  })

  describe('roll cancels reload', () => {
    test('cancels active reload when rolling (Roll component)', () => {
      Cylinder.reloading[playerEid] = 1
      Cylinder.reloadTimer[playerEid] = 0.5

      addComponent(world, Roll, playerEid)
      Roll.duration[playerEid] = 0.3
      Roll.elapsed[playerEid] = 0.1

      setInput(world, playerEid, createInputState())
      cylinderSystem(world, dt)

      expect(Cylinder.reloading[playerEid]).toBe(0)
      expect(Cylinder.reloadTimer[playerEid]).toBe(0)
    })

    test('cancels active reload when in ROLLING state', () => {
      Cylinder.reloading[playerEid] = 1
      Cylinder.reloadTimer[playerEid] = 0.8

      PlayerState.state[playerEid] = PlayerStateType.ROLLING

      setInput(world, playerEid, createInputState())
      cylinderSystem(world, dt)

      expect(Cylinder.reloading[playerEid]).toBe(0)
      expect(Cylinder.reloadTimer[playerEid]).toBe(0)
    })

    test('does not cancel reload when not rolling', () => {
      Cylinder.reloading[playerEid] = 1
      Cylinder.reloadTimer[playerEid] = 0.5
      PlayerState.state[playerEid] = PlayerStateType.IDLE

      setInput(world, playerEid, createInputState())
      cylinderSystem(world, dt)

      expect(Cylinder.reloading[playerEid]).toBe(1)
      expect(Cylinder.reloadTimer[playerEid]).toBeGreaterThan(0.5)
    })

    test('rounds unchanged when roll cancels reload', () => {
      Cylinder.rounds[playerEid] = 2
      Cylinder.reloading[playerEid] = 1
      Cylinder.reloadTimer[playerEid] = 0.5

      addComponent(world, Roll, playerEid)
      Roll.duration[playerEid] = 0.3
      Roll.elapsed[playerEid] = 0.1

      setInput(world, playerEid, createInputState())
      cylinderSystem(world, dt)

      expect(Cylinder.rounds[playerEid]).toBe(2)
    })
  })

  describe('reload timer', () => {
    test('advances reload timer while reloading', () => {
      Cylinder.reloading[playerEid] = 1
      Cylinder.reloadTimer[playerEid] = 0

      setInput(world, playerEid, createInputState())
      cylinderSystem(world, 0.1)

      expect(Cylinder.reloadTimer[playerEid]).toBeCloseTo(0.1)
    })

    test('completes reload after reloadTime elapses', () => {
      Cylinder.rounds[playerEid] = 0
      Cylinder.reloading[playerEid] = 1
      Cylinder.reloadTimer[playerEid] = PISTOL_RELOAD_TIME - 0.01

      setInput(world, playerEid, createInputState())
      cylinderSystem(world, 0.05)

      expect(Cylinder.reloading[playerEid]).toBe(0)
      expect(Cylinder.reloadTimer[playerEid]).toBe(0)
      expect(Cylinder.rounds[playerEid]).toBe(PISTOL_CYLINDER_SIZE)
    })

    test('sets firstShotAfterReload on completion', () => {
      Cylinder.rounds[playerEid] = 0
      Cylinder.reloading[playerEid] = 1
      Cylinder.reloadTimer[playerEid] = PISTOL_RELOAD_TIME - 0.01
      Cylinder.firstShotAfterReload[playerEid] = 0

      setInput(world, playerEid, createInputState())
      cylinderSystem(world, 0.05)

      expect(Cylinder.firstShotAfterReload[playerEid]).toBe(1)
    })

    test('does not complete reload before reloadTime', () => {
      Cylinder.rounds[playerEid] = 0
      Cylinder.reloading[playerEid] = 1
      Cylinder.reloadTimer[playerEid] = 0

      setInput(world, playerEid, createInputState())
      cylinderSystem(world, 0.5)

      expect(Cylinder.reloading[playerEid]).toBe(1)
      expect(Cylinder.rounds[playerEid]).toBe(0)
    })
  })

  describe('manual reload', () => {
    test('starts reload on R key when not full', () => {
      Cylinder.rounds[playerEid] = 3

      const input = createInputState()
      input.buttons = setButton(input.buttons, Button.RELOAD)
      setInput(world, playerEid, input)
      cylinderSystem(world, dt)

      expect(Cylinder.reloading[playerEid]).toBe(1)
      expect(Cylinder.reloadTimer[playerEid]).toBe(0)
    })

    test('does not start reload when cylinder is full', () => {
      Cylinder.rounds[playerEid] = PISTOL_CYLINDER_SIZE

      const input = createInputState()
      input.buttons = setButton(input.buttons, Button.RELOAD)
      setInput(world, playerEid, input)
      cylinderSystem(world, dt)

      expect(Cylinder.reloading[playerEid]).toBe(0)
    })

    test('does not restart reload when already reloading', () => {
      Cylinder.rounds[playerEid] = 0
      Cylinder.reloading[playerEid] = 1
      Cylinder.reloadTimer[playerEid] = 0.8

      const input = createInputState()
      input.buttons = setButton(input.buttons, Button.RELOAD)
      setInput(world, playerEid, input)
      cylinderSystem(world, dt)

      // Timer should advance, not reset
      expect(Cylinder.reloadTimer[playerEid]).toBeGreaterThan(0.8)
    })
  })

  describe('auto-reload', () => {
    test('triggers reload when rounds reach 0', () => {
      Cylinder.rounds[playerEid] = 0

      setInput(world, playerEid, createInputState())
      cylinderSystem(world, dt)

      expect(Cylinder.reloading[playerEid]).toBe(1)
      expect(Cylinder.reloadTimer[playerEid]).toBe(0)
    })

    test('does not trigger when rounds remain', () => {
      Cylinder.rounds[playerEid] = 1

      setInput(world, playerEid, createInputState())
      cylinderSystem(world, dt)

      expect(Cylinder.reloading[playerEid]).toBe(0)
    })
  })

  describe('no input', () => {
    test('still ticks cooldown without input state', () => {
      Cylinder.fireCooldown[playerEid] = 0.5
      // playerInputs is empty — no input for this entity
      cylinderSystem(world, dt)

      // fireCooldown should still decrement (input-independent)
      expect(Cylinder.fireCooldown[playerEid]).toBeCloseTo(0.5 - dt)
    })
  })
})
