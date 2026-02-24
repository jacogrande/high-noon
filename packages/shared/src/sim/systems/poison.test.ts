import { describe, expect, test, beforeEach } from 'bun:test'
import { addComponent, hasComponent } from 'bitecs'
import { createGameWorld, type GameWorld } from '../world'
import { spawnPlayer } from '../prefabs'
import { Poison, Health } from '../components'
import { poisonSystem, applyPoison } from './poison'
import { hpPotionUseSystem } from './hpPotionUse'
import { getUpgradeStateForPlayer } from '../upgrade'
import { Button } from '../../net/input'

describe('poisonSystem', () => {
  let world: GameWorld
  let eid: number

  beforeEach(() => {
    world = createGameWorld(42)
    eid = spawnPlayer(world, 100, 100)
  })

  test('ticks damage each frame', () => {
    addComponent(world, Poison, eid)
    Poison.dps[eid] = 10
    Poison.duration[eid] = 2.0
    const startHP = Health.current[eid]!

    poisonSystem(world, 0.1)

    // 10 dps * 0.1s = 1 damage
    expect(Health.current[eid]).toBeCloseTo(startHP - 1, 1)
  })

  test('poison expires and removes component', () => {
    addComponent(world, Poison, eid)
    Poison.dps[eid] = 5
    Poison.duration[eid] = 0.05

    poisonSystem(world, 0.1)

    expect(hasComponent(world, Poison, eid)).toBe(false)
  })

  test('poison does not set i-frames', () => {
    addComponent(world, Poison, eid)
    Poison.dps[eid] = 10
    Poison.duration[eid] = 2.0
    Health.iframes[eid] = 0

    poisonSystem(world, 0.1)

    expect(Health.iframes[eid]).toBe(0)
  })
})

describe('applyPoison', () => {
  let world: GameWorld
  let eid: number

  beforeEach(() => {
    world = createGameWorld(42)
    eid = spawnPlayer(world, 100, 100)
  })

  test('adds Poison component with specified values', () => {
    applyPoison(world, eid, 5, 3.0)

    expect(hasComponent(world, Poison, eid)).toBe(true)
    expect(Poison.dps[eid]).toBe(5)
    expect(Poison.duration[eid]).toBe(3.0)
  })

  test('refreshes duration on re-application', () => {
    applyPoison(world, eid, 5, 3.0)

    // Tick to reduce duration
    poisonSystem(world, 1.0)
    expect(Poison.duration[eid]).toBeCloseTo(2.0)

    // Re-apply with same DPS
    applyPoison(world, eid, 5, 3.0)
    expect(Poison.duration[eid]).toBe(3.0)
  })

  test('takes stronger DPS on re-application', () => {
    applyPoison(world, eid, 3, 2.0)
    applyPoison(world, eid, 5, 1.0)

    expect(Poison.dps[eid]).toBe(5)
    // Duration should be max of existing and new
    expect(Poison.duration[eid]).toBe(2.0)
  })

  test('does not downgrade DPS on re-application', () => {
    applyPoison(world, eid, 5, 2.0)
    applyPoison(world, eid, 3, 3.0)

    expect(Poison.dps[eid]).toBe(5)
    expect(Poison.duration[eid]).toBe(3.0)
  })
})

describe('HP potion clears poison', () => {
  let world: GameWorld
  let eid: number

  beforeEach(() => {
    world = createGameWorld(42)
    eid = spawnPlayer(world, 100, 100)
  })

  test('using HP potion removes Poison component', () => {
    // Damage player and apply poison
    Health.current[eid] = Health.max[eid]! - 20
    applyPoison(world, eid, 5, 3.0)

    // Give potion
    const state = getUpgradeStateForPlayer(world, eid)
    state.hpPotionCount = 1

    // Simulate button press
    world.playerInputs.set(eid, {
      moveX: 0, moveY: 0, aimAngle: 0,
      buttons: Button.USE_HP_POTION,
      cursorWorldX: 0, cursorWorldY: 0,
    })

    hpPotionUseSystem(world, 1 / 60)

    expect(hasComponent(world, Poison, eid)).toBe(false)
  })
})
