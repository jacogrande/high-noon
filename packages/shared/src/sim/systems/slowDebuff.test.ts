import { describe, expect, test, beforeEach } from 'bun:test'
import { addComponent, addEntity, hasComponent, defineQuery } from 'bitecs'
import { createGameWorld, type GameWorld } from '../world'
import { slowDebuffSystem, applySlow } from './slowDebuff'
import { Speed, SlowDebuff, Enemy, Position, Collider, Health, Dead } from '../components'
import { createSpatialHash, rebuildSpatialHash } from '../SpatialHash'

// Query for entities that should be in the spatial hash
const spatialQuery = defineQuery([Position, Collider])

describe('slowDebuffSystem', () => {
  let world: GameWorld

  beforeEach(() => {
    world = createGameWorld(42)
  })

  /**
   * Helper to spawn a basic entity with Speed component
   */
  function spawnSpeedEntity(world: GameWorld, speed = 100): number {
    const eid = addEntity(world)
    addComponent(world, Speed, eid)
    Speed.max[eid] = speed
    Speed.current[eid] = speed
    return eid
  }

  /**
   * Helper to spawn an enemy with Position, Collider, Health, Speed
   */
  function spawnEnemy(world: GameWorld, x: number, y: number, speed = 100): number {
    const eid = addEntity(world)
    addComponent(world, Enemy, eid)
    addComponent(world, Position, eid)
    addComponent(world, Collider, eid)
    addComponent(world, Health, eid)
    addComponent(world, Speed, eid)
    Position.x[eid] = x
    Position.y[eid] = y
    Collider.radius[eid] = 10
    Health.current[eid] = 10
    Health.max[eid] = 10
    Speed.max[eid] = speed
    Speed.current[eid] = speed
    return eid
  }

  describe('applySlow', () => {
    test('adds SlowDebuff component if not present', () => {
      const eid = spawnSpeedEntity(world, 100)

      applySlow(world, eid, 0.5, 2.0)

      expect(hasComponent(world, SlowDebuff, eid)).toBe(true)
      expect(SlowDebuff.multiplier[eid]).toBe(0.5)
      expect(SlowDebuff.duration[eid]).toBe(2.0)
    })

    test('sets multiplier and duration on new slow', () => {
      const eid = spawnSpeedEntity(world, 100)

      applySlow(world, eid, 0.7, 1.5)

      expect(SlowDebuff.multiplier[eid]).toBeCloseTo(0.7)
      expect(SlowDebuff.duration[eid]).toBeCloseTo(1.5)
    })

    test('stronger slow (lower multiplier) overrides weaker slow', () => {
      const eid = spawnSpeedEntity(world, 100)

      // Apply weak slow (0.8 = 20% slow)
      applySlow(world, eid, 0.8, 1.0)
      expect(SlowDebuff.multiplier[eid]).toBeCloseTo(0.8)

      // Apply stronger slow (0.5 = 50% slow)
      applySlow(world, eid, 0.5, 1.0)
      expect(SlowDebuff.multiplier[eid]).toBeCloseTo(0.5)
    })

    test('weaker slow does not override stronger slow', () => {
      const eid = spawnSpeedEntity(world, 100)

      // Apply strong slow (0.3 = 70% slow)
      applySlow(world, eid, 0.3, 1.0)
      expect(SlowDebuff.multiplier[eid]).toBeCloseTo(0.3)

      // Try to apply weaker slow (0.7 = 30% slow)
      applySlow(world, eid, 0.7, 1.0)
      expect(SlowDebuff.multiplier[eid]).toBeCloseTo(0.3) // keeps stronger
    })

    test('duration refreshed to max of existing and new', () => {
      const eid = spawnSpeedEntity(world, 100)

      // Apply slow with 1.0s duration
      applySlow(world, eid, 0.5, 1.0)
      expect(SlowDebuff.duration[eid]).toBe(1.0)

      // Apply new slow with 2.0s duration
      applySlow(world, eid, 0.6, 2.0)
      expect(SlowDebuff.duration[eid]).toBe(2.0) // max of 1.0 and 2.0
    })

    test('duration not reduced when new slow has shorter duration', () => {
      const eid = spawnSpeedEntity(world, 100)

      // Apply slow with 3.0s duration
      applySlow(world, eid, 0.5, 3.0)
      expect(SlowDebuff.duration[eid]).toBe(3.0)

      // Apply new slow with 1.0s duration
      applySlow(world, eid, 0.4, 1.0)
      expect(SlowDebuff.duration[eid]).toBe(3.0) // keeps longer duration
    })

    test('equal strength slow refreshes duration', () => {
      const eid = spawnSpeedEntity(world, 100)

      // Apply slow
      applySlow(world, eid, 0.5, 1.0)

      // Re-apply same strength slow with longer duration
      applySlow(world, eid, 0.5, 2.5)
      expect(SlowDebuff.multiplier[eid]).toBe(0.5)
      expect(SlowDebuff.duration[eid]).toBe(2.5)
    })
  })

  describe('slowDebuffSystem - duration and speed', () => {
    test('ticks duration down by dt', () => {
      const eid = spawnSpeedEntity(world, 100)
      applySlow(world, eid, 0.5, 2.0)

      slowDebuffSystem(world, 1.0)

      expect(SlowDebuff.duration[eid]).toBeCloseTo(1.0)
    })

    test('applies speed reduction based on multiplier', () => {
      const eid = spawnSpeedEntity(world, 100)
      applySlow(world, eid, 0.6, 2.0) // 60% speed = 40% slow

      slowDebuffSystem(world, 0.1)

      expect(Speed.current[eid]).toBeCloseTo(60.0) // 100 * 0.6
    })

    test('removes component when duration expires', () => {
      const eid = spawnSpeedEntity(world, 100)
      applySlow(world, eid, 0.5, 1.0)

      slowDebuffSystem(world, 1.0)

      expect(hasComponent(world, SlowDebuff, eid)).toBe(false)
    })

    test('removes component when duration would go negative', () => {
      const eid = spawnSpeedEntity(world, 100)
      applySlow(world, eid, 0.5, 0.5)

      slowDebuffSystem(world, 1.0)

      expect(hasComponent(world, SlowDebuff, eid)).toBe(false)
    })

    test('restores speed to max when slow expires', () => {
      const eid = spawnSpeedEntity(world, 100)
      applySlow(world, eid, 0.5, 0.5)

      // First tick: slow applied
      slowDebuffSystem(world, 0.1)
      expect(Speed.current[eid]).toBeCloseTo(50.0)

      // Second tick: slow expires
      slowDebuffSystem(world, 0.5)
      expect(hasComponent(world, SlowDebuff, eid)).toBe(false)
      expect(Speed.current[eid]).toBe(100) // restored to max
    })

    test('handles exact boundary (duration equals dt)', () => {
      const eid = spawnSpeedEntity(world, 100)
      applySlow(world, eid, 0.5, 1.0)

      slowDebuffSystem(world, 1.0)

      // After 1.0 seconds with duration=1.0, duration should be exactly 0 (removed)
      expect(hasComponent(world, SlowDebuff, eid)).toBe(false)
      expect(Speed.current[eid]).toBeCloseTo(100)
    })

    test('multiple ticks correctly drain duration', () => {
      const eid = spawnSpeedEntity(world, 100)
      applySlow(world, eid, 0.5, 3.0)

      slowDebuffSystem(world, 1.0)
      expect(SlowDebuff.duration[eid]).toBeCloseTo(2.0)
      expect(hasComponent(world, SlowDebuff, eid)).toBe(true)

      slowDebuffSystem(world, 1.0)
      expect(SlowDebuff.duration[eid]).toBeCloseTo(1.0)
      expect(hasComponent(world, SlowDebuff, eid)).toBe(true)

      slowDebuffSystem(world, 1.0)
      expect(hasComponent(world, SlowDebuff, eid)).toBe(false)
    })

    test('different slow multipliers apply correctly', () => {
      const eid1 = spawnSpeedEntity(world, 100)
      const eid2 = spawnSpeedEntity(world, 100)
      const eid3 = spawnSpeedEntity(world, 100)

      applySlow(world, eid1, 0.8, 1.0) // 20% slow
      applySlow(world, eid2, 0.5, 1.0) // 50% slow
      applySlow(world, eid3, 0.2, 1.0) // 80% slow

      slowDebuffSystem(world, 0.1)

      expect(Speed.current[eid1]).toBeCloseTo(80.0)
      expect(Speed.current[eid2]).toBeCloseTo(50.0)
      expect(Speed.current[eid3]).toBeCloseTo(20.0)
    })

    test('entity without slow is unaffected', () => {
      const eid = spawnSpeedEntity(world, 100)

      slowDebuffSystem(world, 1.0)

      expect(Speed.current[eid]).toBe(100)
      expect(hasComponent(world, SlowDebuff, eid)).toBe(false)
    })
  })

  describe('dust clouds', () => {
    beforeEach(() => {
      // Initialize spatial hash for dust cloud tests
      world.spatialHash = createSpatialHash(800, 600, 32)
    })

    test('cloud slows enemies inside it', () => {
      const enemy = spawnEnemy(world, 100, 100, 100)

      // Add dust cloud at enemy position
      world.dustClouds.push({
        x: 100,
        y: 100,
        radius: 50,
        duration: 2.0,
        slow: 0.5,
      })

      // Rebuild spatial hash
      rebuildSpatialHash(world.spatialHash!, spatialQuery(world), Position.x, Position.y)

      slowDebuffSystem(world, 0.1)

      expect(hasComponent(world, SlowDebuff, enemy)).toBe(true)
      expect(SlowDebuff.multiplier[enemy]).toBe(0.5)
    })

    test('cloud duration ticks down', () => {
      world.dustClouds.push({
        x: 100,
        y: 100,
        radius: 50,
        duration: 2.0,
        slow: 0.5,
      })

      slowDebuffSystem(world, 1.0)

      expect(world.dustClouds).toHaveLength(1)
      expect(world.dustClouds[0]!.duration).toBeCloseTo(1.0)
    })

    test('expired clouds are removed', () => {
      world.dustClouds.push({
        x: 100,
        y: 100,
        radius: 50,
        duration: 0.5,
        slow: 0.5,
      })

      slowDebuffSystem(world, 1.0)

      expect(world.dustClouds).toHaveLength(0)
    })

    test('enemies outside cloud are not affected', () => {
      const enemy = spawnEnemy(world, 200, 200, 100)

      // Cloud far from enemy
      world.dustClouds.push({
        x: 100,
        y: 100,
        radius: 30,
        duration: 2.0,
        slow: 0.5,
      })

      rebuildSpatialHash(world.spatialHash!, spatialQuery(world), Position.x, Position.y)

      slowDebuffSystem(world, 0.1)

      expect(hasComponent(world, SlowDebuff, enemy)).toBe(false)
      expect(Speed.current[enemy]).toBe(100)
    })

    test('enemy at exact cloud edge is slowed (inclusive boundary)', () => {
      const enemy = spawnEnemy(world, 150, 100, 100)

      // Cloud radius 50, enemy at distance 50
      world.dustClouds.push({
        x: 100,
        y: 100,
        radius: 50,
        duration: 2.0,
        slow: 0.5,
      })

      rebuildSpatialHash(world.spatialHash!, spatialQuery(world), Position.x, Position.y)

      slowDebuffSystem(world, 0.1)

      // Distance = 50, radius = 50, so dx*dx + dy*dy = 2500 = radius*radius
      // Implementation uses > for rejection, so 2500 is NOT > 2500, enemy IS slowed
      expect(hasComponent(world, SlowDebuff, enemy)).toBe(true)
    })

    test('enemy just inside cloud edge is slowed', () => {
      const enemy = spawnEnemy(world, 149, 100, 100)

      // Cloud radius 50, enemy at distance ~49
      world.dustClouds.push({
        x: 100,
        y: 100,
        radius: 50,
        duration: 2.0,
        slow: 0.5,
      })

      rebuildSpatialHash(world.spatialHash!, spatialQuery(world), Position.x, Position.y)

      slowDebuffSystem(world, 0.1)

      expect(hasComponent(world, SlowDebuff, enemy)).toBe(true)
    })

    test('multiple clouds can affect same enemy', () => {
      const enemy = spawnEnemy(world, 100, 100, 100)

      // Two overlapping clouds with different slow strengths
      world.dustClouds.push({
        x: 100,
        y: 100,
        radius: 50,
        duration: 2.0,
        slow: 0.6, // weaker
      })
      world.dustClouds.push({
        x: 110,
        y: 100,
        radius: 50,
        duration: 2.0,
        slow: 0.3, // stronger
      })

      rebuildSpatialHash(world.spatialHash!, spatialQuery(world), Position.x, Position.y)

      slowDebuffSystem(world, 0.1)

      // applySlow is called twice, stronger slow (0.3) should win
      expect(hasComponent(world, SlowDebuff, enemy)).toBe(true)
      expect(SlowDebuff.multiplier[enemy]).toBeCloseTo(0.3)
    })

    test('cloud continuously re-applies slow each tick', () => {
      const enemy = spawnEnemy(world, 100, 100, 100)

      world.dustClouds.push({
        x: 100,
        y: 100,
        radius: 50,
        duration: 2.0,
        slow: 0.5,
      })

      rebuildSpatialHash(world.spatialHash!, spatialQuery(world), Position.x, Position.y)

      // First tick
      slowDebuffSystem(world, 0.1)
      expect(hasComponent(world, SlowDebuff, enemy)).toBe(true)
      const initialDuration = SlowDebuff.duration[enemy]

      // Second tick (still in cloud)
      slowDebuffSystem(world, 0.1)
      expect(hasComponent(world, SlowDebuff, enemy)).toBe(true)
      // Duration should be refreshed (applySlow called with 0.1 duration each tick)
      expect(SlowDebuff.duration[enemy]).toBeGreaterThanOrEqual(initialDuration! - 0.15)
    })

    test('non-enemy entities are not affected by cloud', () => {
      const eid = spawnSpeedEntity(world, 100) // not an enemy

      world.dustClouds.push({
        x: 0,
        y: 0,
        radius: 50,
        duration: 2.0,
        slow: 0.5,
      })

      // Even if spatial hash includes it, should be skipped
      addComponent(world, Position, eid)
      Position.x[eid] = 0
      Position.y[eid] = 0

      rebuildSpatialHash(world.spatialHash!, spatialQuery(world), Position.x, Position.y)

      slowDebuffSystem(world, 0.1)

      expect(hasComponent(world, SlowDebuff, eid)).toBe(false)
    })

    test('dead enemies are not slowed by cloud', () => {
      const enemy = spawnEnemy(world, 100, 100, 100)
      addComponent(world, Dead, enemy)

      world.dustClouds.push({
        x: 100,
        y: 100,
        radius: 50,
        duration: 2.0,
        slow: 0.5,
      })

      rebuildSpatialHash(world.spatialHash!, spatialQuery(world), Position.x, Position.y)

      slowDebuffSystem(world, 0.1)

      expect(hasComponent(world, SlowDebuff, enemy)).toBe(false)
    })

    test('enemy without Health component is not slowed by cloud', () => {
      const eid = addEntity(world)
      addComponent(world, Enemy, eid)
      addComponent(world, Position, eid)
      addComponent(world, Collider, eid)
      addComponent(world, Speed, eid)
      Position.x[eid] = 100
      Position.y[eid] = 100
      Collider.radius[eid] = 10
      Speed.max[eid] = 100
      Speed.current[eid] = 100
      // No Health component

      world.dustClouds.push({
        x: 100,
        y: 100,
        radius: 50,
        duration: 2.0,
        slow: 0.5,
      })

      rebuildSpatialHash(world.spatialHash!, spatialQuery(world), Position.x, Position.y)

      slowDebuffSystem(world, 0.1)

      expect(hasComponent(world, SlowDebuff, eid)).toBe(false)
    })

    test('multiple clouds tick down independently', () => {
      world.dustClouds.push(
        { x: 100, y: 100, radius: 50, duration: 1.0, slow: 0.5 },
        { x: 200, y: 200, radius: 50, duration: 2.0, slow: 0.5 },
        { x: 300, y: 300, radius: 50, duration: 3.0, slow: 0.5 }
      )

      slowDebuffSystem(world, 1.0)

      expect(world.dustClouds).toHaveLength(2) // first one expired
      expect(world.dustClouds[0]!.duration).toBeCloseTo(1.0)
      expect(world.dustClouds[1]!.duration).toBeCloseTo(2.0)
    })

    test('all clouds can expire in single tick', () => {
      world.dustClouds.push(
        { x: 100, y: 100, radius: 50, duration: 0.3, slow: 0.5 },
        { x: 200, y: 200, radius: 50, duration: 0.4, slow: 0.5 },
        { x: 300, y: 300, radius: 50, duration: 0.5, slow: 0.5 }
      )

      slowDebuffSystem(world, 1.0)

      expect(world.dustClouds).toHaveLength(0)
    })

    test('cloud applies short duration slow that needs continuous refresh', () => {
      const enemy = spawnEnemy(world, 100, 100, 100)

      world.dustClouds.push({
        x: 100,
        y: 100,
        radius: 50,
        duration: 5.0,
        slow: 0.5,
      })

      rebuildSpatialHash(world.spatialHash!, spatialQuery(world), Position.x, Position.y)

      // First tick: slow applied with 0.1s duration, then ticked down by 1/60
      const dt = 1 / 60
      slowDebuffSystem(world, dt)
      expect(hasComponent(world, SlowDebuff, enemy)).toBe(true)
      expect(SlowDebuff.duration[enemy]).toBeCloseTo(0.1 - dt)

      // Move enemy out of cloud
      Position.x[enemy] = 500
      rebuildSpatialHash(world.spatialHash!, spatialQuery(world), Position.x, Position.y)

      // Tick forward past slow duration (no refresh)
      slowDebuffSystem(world, 0.2)

      // Slow should have expired since it wasn't refreshed
      expect(hasComponent(world, SlowDebuff, enemy)).toBe(false)
    })
  })
})
