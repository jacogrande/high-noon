import { describe, expect, test, beforeEach } from 'bun:test'
import { createGameWorld, type GameWorld } from '../world'
import { buffSystem } from './buffSystem'

describe('buffSystem', () => {
  let world: GameWorld

  beforeEach(() => {
    world = createGameWorld(42)
  })

  describe('Last Stand timer', () => {
    test('decrements timer while active', () => {
      world.upgradeState.lastStandActive = true
      world.upgradeState.lastStandTimer = 5.0

      buffSystem(world, 1.0)

      expect(world.upgradeState.lastStandTimer).toBeCloseTo(4.0)
      expect(world.upgradeState.lastStandActive).toBe(true)
    })

    test('deactivates when timer reaches zero', () => {
      world.upgradeState.lastStandActive = true
      world.upgradeState.lastStandTimer = 0.5

      buffSystem(world, 0.5)

      expect(world.upgradeState.lastStandActive).toBe(false)
      expect(world.upgradeState.lastStandTimer).toBe(0)
    })

    test('deactivates when timer would go negative', () => {
      world.upgradeState.lastStandActive = true
      world.upgradeState.lastStandTimer = 0.1

      buffSystem(world, 1.0)

      expect(world.upgradeState.lastStandActive).toBe(false)
      expect(world.upgradeState.lastStandTimer).toBe(0)
    })

    test('does nothing when not active', () => {
      world.upgradeState.lastStandActive = false
      world.upgradeState.lastStandTimer = 0

      buffSystem(world, 1.0)

      expect(world.upgradeState.lastStandActive).toBe(false)
      expect(world.upgradeState.lastStandTimer).toBe(0)
    })

    test('does not accidentally activate', () => {
      world.upgradeState.lastStandActive = false
      world.upgradeState.lastStandTimer = 5.0 // stale timer but inactive

      buffSystem(world, 1.0)

      // Should not tick a stale timer on an inactive buff
      expect(world.upgradeState.lastStandActive).toBe(false)
      expect(world.upgradeState.lastStandTimer).toBe(5.0)
    })

    test('handles exact boundary (timer equals dt)', () => {
      world.upgradeState.lastStandActive = true
      world.upgradeState.lastStandTimer = 1 / 60

      buffSystem(world, 1 / 60)

      expect(world.upgradeState.lastStandActive).toBe(false)
      expect(world.upgradeState.lastStandTimer).toBe(0)
    })

    test('multiple ticks drain timer correctly', () => {
      world.upgradeState.lastStandActive = true
      world.upgradeState.lastStandTimer = 3.0

      buffSystem(world, 1.0)
      buffSystem(world, 1.0)

      expect(world.upgradeState.lastStandTimer).toBeCloseTo(1.0)
      expect(world.upgradeState.lastStandActive).toBe(true)

      buffSystem(world, 1.0)

      expect(world.upgradeState.lastStandTimer).toBe(0)
      expect(world.upgradeState.lastStandActive).toBe(false)
    })
  })
})
