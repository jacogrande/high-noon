import { describe, expect, test, beforeEach } from 'bun:test'
import { createGameWorld, type GameWorld } from '../world'
import { buffSystem } from './buffSystem'
import { spawnPlayer } from '../prefabs'
import { Health } from '../components'
import { getUpgradeStateForPlayer, HANGMANS_NOOSE_ID } from '../upgrade'

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

  describe("Hangman's Noose drain", () => {
    let playerEid: number

    beforeEach(() => {
      playerEid = spawnPlayer(world, 100, 100)
    })

    test('drains 1 HP after 5 seconds', () => {
      const us = getUpgradeStateForPlayer(world, playerEid)
      us.items.set(HANGMANS_NOOSE_ID, 1)
      Health.current[playerEid] = 10
      Health.max[playerEid] = 10

      // Single 5s tick for exact comparison (avoids FP accumulation)
      buffSystem(world, 5.0)

      expect(Health.current[playerEid]).toBe(9)
    })

    test('does not drain below 1 HP', () => {
      const us = getUpgradeStateForPlayer(world, playerEid)
      us.items.set(HANGMANS_NOOSE_ID, 1)
      Health.current[playerEid] = 1
      Health.max[playerEid] = 10

      for (let i = 0; i < 300; i++) {
        buffSystem(world, 1 / 60)
      }

      expect(Health.current[playerEid]).toBe(1)
    })

    test('drains multiple times for large dt', () => {
      const us = getUpgradeStateForPlayer(world, playerEid)
      us.items.set(HANGMANS_NOOSE_ID, 1)
      Health.current[playerEid] = 10
      Health.max[playerEid] = 10

      // 15 seconds = 3 drains
      buffSystem(world, 15.0)

      expect(Health.current[playerEid]).toBe(7)
    })

    test('timer resets when item is removed', () => {
      const us = getUpgradeStateForPlayer(world, playerEid)
      us.items.set(HANGMANS_NOOSE_ID, 1)
      Health.current[playerEid] = 10
      Health.max[playerEid] = 10

      // Tick 3 seconds — partial timer accumulation
      buffSystem(world, 3.0)
      expect(us.hangmansNooseDrainTimer).toBeCloseTo(3.0)

      // Remove item
      us.items.delete(HANGMANS_NOOSE_ID)
      buffSystem(world, 1 / 60)

      // Timer should be reset
      expect(us.hangmansNooseDrainTimer).toBe(0)

      // HP unchanged (no drain occurred in either step)
      expect(Health.current[playerEid]).toBe(10)
    })

    test('does not drain if player does not have the item', () => {
      Health.current[playerEid] = 10
      Health.max[playerEid] = 10

      buffSystem(world, 10.0)

      expect(Health.current[playerEid]).toBe(10)
    })

    test('accumulates partial ticks correctly', () => {
      const us = getUpgradeStateForPlayer(world, playerEid)
      us.items.set(HANGMANS_NOOSE_ID, 1)
      Health.current[playerEid] = 10
      Health.max[playerEid] = 10

      // 2.5s + 2.5s = 5s total → 1 drain
      buffSystem(world, 2.5)
      expect(Health.current[playerEid]).toBe(10) // Not yet

      buffSystem(world, 2.5)
      expect(Health.current[playerEid]).toBe(9) // Drained once
    })

    test('drain floors at 1 HP even with multiple drains', () => {
      const us = getUpgradeStateForPlayer(world, playerEid)
      us.items.set(HANGMANS_NOOSE_ID, 1)
      Health.current[playerEid] = 3
      Health.max[playerEid] = 10

      // 15 seconds = 3 drain attempts, but floor at 1
      buffSystem(world, 15.0)

      expect(Health.current[playerEid]).toBe(1)
    })
  })
})
