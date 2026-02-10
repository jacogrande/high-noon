import { describe, expect, test, beforeEach } from 'bun:test'
import { createGameWorld, type GameWorld } from '../world'
import { spawnPlayer } from '../prefabs'
import { goldRushSystem, GOLD_NUGGET_LIFETIME } from './goldRush'
import { PROSPECTOR } from '../content/characters/prospector'
import { SHERIFF } from '../content/characters/sheriff'
import { Position } from '../components'
import { GOLD_FEVER_MAX_STACKS } from '../content/weapons'

describe('goldRushSystem', () => {
  let world: GameWorld
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42, PROSPECTOR)
    playerEid = spawnPlayer(world, 100, 100)
  })

  describe('gold nugget pickup', () => {
    test('player picks up nearby gold nuggets', () => {
      world.goldNuggets.push({ x: 110, y: 100, value: 1, lifetime: 10 })

      goldRushSystem(world, 1 / 60)

      expect(world.goldNuggets).toHaveLength(0)
      expect(world.goldCollected).toBe(1)
    })

    test('player does not pick up distant nuggets', () => {
      world.goldNuggets.push({ x: 500, y: 500, value: 1, lifetime: 10 })

      goldRushSystem(world, 1 / 60)

      expect(world.goldNuggets).toHaveLength(1)
      expect(world.goldCollected).toBe(0)
    })

    test('picks up multiple nuggets in one tick', () => {
      world.goldNuggets.push({ x: 105, y: 100, value: 1, lifetime: 10 })
      world.goldNuggets.push({ x: 100, y: 105, value: 1, lifetime: 10 })

      goldRushSystem(world, 1 / 60)

      expect(world.goldNuggets).toHaveLength(0)
      expect(world.goldCollected).toBe(2)
    })
  })

  describe('nugget lifetime', () => {
    test('nuggets despawn after lifetime expires', () => {
      world.goldNuggets.push({ x: 500, y: 500, value: 1, lifetime: 0.1 })

      goldRushSystem(world, 0.2)

      expect(world.goldNuggets).toHaveLength(0)
    })

    test('GOLD_NUGGET_LIFETIME exported correctly', () => {
      expect(GOLD_NUGGET_LIFETIME).toBe(10)
    })
  })

  describe('Gold Fever (Prospector)', () => {
    test('picking up gold adds Gold Fever stack for Prospector', () => {
      world.goldNuggets.push({ x: 110, y: 100, value: 1, lifetime: 10 })

      goldRushSystem(world, 1 / 60)

      expect(world.upgradeState.goldFeverStacks).toBe(1)
      expect(world.upgradeState.goldFeverTimer).toBe(world.upgradeState.goldFeverDuration)
    })

    test('Gold Fever stacks cap at max', () => {
      world.upgradeState.goldFeverStacks = GOLD_FEVER_MAX_STACKS - 1
      world.goldNuggets.push({ x: 110, y: 100, value: 1, lifetime: 10 })
      world.goldNuggets.push({ x: 105, y: 100, value: 1, lifetime: 10 })

      goldRushSystem(world, 1 / 60)

      expect(world.upgradeState.goldFeverStacks).toBe(GOLD_FEVER_MAX_STACKS)
    })

    test('Gold Fever timer resets on each pickup', () => {
      world.upgradeState.goldFeverStacks = 2
      world.upgradeState.goldFeverTimer = 1.0 // partially expired

      world.goldNuggets.push({ x: 110, y: 100, value: 1, lifetime: 10 })
      goldRushSystem(world, 1 / 60)

      expect(world.upgradeState.goldFeverTimer).toBe(world.upgradeState.goldFeverDuration)
    })

    test('Gold Fever stacks reset when timer expires', () => {
      world.upgradeState.goldFeverStacks = 3
      world.upgradeState.goldFeverTimer = 0.05

      goldRushSystem(world, 0.1)

      expect(world.upgradeState.goldFeverStacks).toBe(0)
      expect(world.upgradeState.goldFeverTimer).toBe(0)
    })
  })

  describe('non-Prospector characters', () => {
    test('Sheriff does not get Gold Fever stacks', () => {
      const sheriffWorld = createGameWorld(42, SHERIFF)
      const sheriffEid = spawnPlayer(sheriffWorld, 100, 100)

      sheriffWorld.goldNuggets.push({ x: 110, y: 100, value: 1, lifetime: 10 })
      goldRushSystem(sheriffWorld, 1 / 60)

      // Gold collected, but no fever stacks
      expect(sheriffWorld.goldCollected).toBe(1)
      expect(sheriffWorld.upgradeState.goldFeverStacks).toBe(0)
    })
  })

  describe('per-tick reset', () => {
    test('resets lastKillWasMelee flag each tick', () => {
      world.lastKillWasMelee = true

      goldRushSystem(world, 1 / 60)

      expect(world.lastKillWasMelee).toBe(false)
    })
  })
})
