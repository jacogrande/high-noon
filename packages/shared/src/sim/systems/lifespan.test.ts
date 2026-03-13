/**
 * Lifespan System Tests
 */

import { describe, expect, test, beforeEach } from 'bun:test'
import { addEntity, addComponent, hasComponent } from 'bitecs'
import { createGameWorld, type GameWorld } from '../world'
import { createTestArena } from '../content/maps/testArena'
import { setWorldTilemap } from '../world'
import { Lifespan, Dead, Health, Enemy, EnemyType } from '../components'
import { lifespanSystem } from './lifespan'
import { spawnGhostRider } from '../prefabs'
import { GHOST_RIDER_LIFESPAN } from '../content/enemies'
import { spawnPlayer } from '../prefabs'

describe('lifespanSystem', () => {
  let world: GameWorld

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
  })

  test('non-player entity with Lifespan is removed after remaining ticks to 0', () => {
    const eid = addEntity(world)
    addComponent(world, Lifespan, eid)
    Lifespan.remaining[eid] = 0.5

    // Tick 30 frames at 60Hz = 0.5s
    for (let i = 0; i < 30; i++) {
      lifespanSystem(world, 1 / 60)
    }

    // Non-player entities are removed directly (not tagged Dead)
    expect(hasComponent(world, Lifespan, eid)).toBe(false)
  })

  test('entity without Lifespan is unaffected', () => {
    const eid = addEntity(world)
    addComponent(world, Health, eid)
    Health.current[eid] = 100
    Health.max[eid] = 100

    for (let i = 0; i < 60; i++) {
      lifespanSystem(world, 1 / 60)
    }

    // Should NOT have Dead
    expect(hasComponent(world, Dead, eid)).toBe(false)
  })

  test('already Dead entities are not ticked again', () => {
    const eid = addEntity(world)
    addComponent(world, Lifespan, eid)
    addComponent(world, Dead, eid)
    Lifespan.remaining[eid] = 10.0

    lifespanSystem(world, 1 / 60)

    // Remaining should not decrease
    expect(Lifespan.remaining[eid]!).toBe(10.0)
  })
})

describe('Ghost Rider lifespan', () => {
  let world: GameWorld

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    spawnPlayer(world, 800, 600)
  })

  test('spawnGhostRider creates entity with Lifespan component', () => {
    const eid = spawnGhostRider(world, 500, 500)
    expect(hasComponent(world, Lifespan, eid)).toBe(true)
    expect(Lifespan.remaining[eid]!).toBe(GHOST_RIDER_LIFESPAN)
  })

  test('Ghost Rider has correct type and tier', () => {
    const eid = spawnGhostRider(world, 500, 500)
    expect(Enemy.type[eid]!).toBe(EnemyType.GHOST_RIDER)
    expect(Enemy.tier[eid]!).toBe(1) // THREAT
  })

  test('Ghost Rider is removed after 8s of lifespanSystem ticks', () => {
    const eid = spawnGhostRider(world, 500, 500)

    // Tick 480 frames = 8s at 60Hz
    for (let i = 0; i < 480; i++) {
      lifespanSystem(world, 1 / 60)
    }

    // Non-player entities are removed directly (not tagged Dead)
    expect(hasComponent(world, Lifespan, eid)).toBe(false)
    expect(hasComponent(world, Enemy, eid)).toBe(false)
  })

  test('Ghost Rider alive before lifespan expires', () => {
    const eid = spawnGhostRider(world, 500, 500)

    // Tick 400 frames = ~6.67s (not yet at 8s)
    for (let i = 0; i < 400; i++) {
      lifespanSystem(world, 1 / 60)
    }

    expect(hasComponent(world, Dead, eid)).toBe(false)
  })
})
