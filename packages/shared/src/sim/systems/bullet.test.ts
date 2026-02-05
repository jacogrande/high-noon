import { describe, expect, test, beforeEach } from 'bun:test'
import { hasComponent } from 'bitecs'
import { createGameWorld, type GameWorld } from '../world'
import { spawnBullet } from '../prefabs'
import { bulletSystem } from './bullet'
import { Bullet, Position, Velocity } from '../components'

describe('bulletSystem', () => {
  let world: GameWorld

  beforeEach(() => {
    world = createGameWorld()
  })

  describe('distance tracking', () => {
    test('accumulates distance traveled', () => {
      const bulletEid = spawnBullet(world, {
        x: 0,
        y: 0,
        vx: 100, // 100 px/sec
        vy: 0,
        damage: 10,
        range: 500,
        ownerId: 1,
      })

      // Simulate 0.1 seconds
      bulletSystem(world, 0.1)

      // Should have traveled 10 pixels
      expect(Bullet.distanceTraveled[bulletEid]).toBeCloseTo(10)
    })

    test('accumulates distance over multiple ticks', () => {
      const bulletEid = spawnBullet(world, {
        x: 0,
        y: 0,
        vx: 60,
        vy: 80, // Speed = 100 px/sec (3-4-5 triangle)
        damage: 10,
        range: 500,
        ownerId: 1,
      })

      // Simulate 3 ticks at 60Hz
      bulletSystem(world, 1 / 60)
      bulletSystem(world, 1 / 60)
      bulletSystem(world, 1 / 60)

      // Should have traveled ~5 pixels (100 px/sec * 0.05 sec)
      expect(Bullet.distanceTraveled[bulletEid]).toBeCloseTo(5, 1)
    })
  })

  describe('lifetime tracking', () => {
    test('decrements lifetime each tick', () => {
      const bulletEid = spawnBullet(world, {
        x: 0,
        y: 0,
        vx: 100,
        vy: 0,
        damage: 10,
        range: 500,
        ownerId: 1,
      })

      const initialLifetime = Bullet.lifetime[bulletEid]!

      bulletSystem(world, 0.1)

      expect(Bullet.lifetime[bulletEid]).toBeCloseTo(initialLifetime - 0.1)
    })
  })

  describe('despawn conditions', () => {
    test('despawns when range exceeded', () => {
      const bulletEid = spawnBullet(world, {
        x: 0,
        y: 0,
        vx: 1000, // Very fast bullet
        vy: 0,
        damage: 10,
        range: 50, // Short range
        ownerId: 1,
      })

      // Simulate enough time to exceed range (50px at 1000px/sec = 0.05s)
      bulletSystem(world, 0.1) // 100px traveled > 50px range

      // Bullet should be despawned
      expect(hasComponent(world, Bullet, bulletEid)).toBe(false)
    })

    test('despawns when lifetime expires', () => {
      const bulletEid = spawnBullet(world, {
        x: 0,
        y: 0,
        vx: 1, // Very slow bullet
        vy: 0,
        damage: 10,
        range: 10000, // Very long range
        ownerId: 1,
      })

      // Set lifetime to nearly expired
      Bullet.lifetime[bulletEid] = 0.01

      // Simulate tick that expires lifetime
      bulletSystem(world, 0.02)

      // Bullet should be despawned
      expect(hasComponent(world, Bullet, bulletEid)).toBe(false)
    })

    test('does not despawn when within range and lifetime', () => {
      const bulletEid = spawnBullet(world, {
        x: 0,
        y: 0,
        vx: 100,
        vy: 0,
        damage: 10,
        range: 500,
        ownerId: 1,
      })

      // Simulate small tick
      bulletSystem(world, 0.1) // 10px traveled < 500px range

      // Bullet should still exist
      expect(hasComponent(world, Bullet, bulletEid)).toBe(true)
    })

    test('despawns exactly at range boundary', () => {
      const bulletEid = spawnBullet(world, {
        x: 0,
        y: 0,
        vx: 100,
        vy: 0,
        damage: 10,
        range: 100, // Exactly 100px range
        ownerId: 1,
      })

      // Travel exactly to range
      bulletSystem(world, 1.0) // 100px traveled = 100px range

      // Bullet should be despawned
      expect(hasComponent(world, Bullet, bulletEid)).toBe(false)
    })
  })

  describe('multiple bullets', () => {
    test('processes multiple bullets independently', () => {
      // Spawn a slow bullet (won't despawn)
      const slowBullet = spawnBullet(world, {
        x: 0,
        y: 0,
        vx: 10,
        vy: 0,
        damage: 10,
        range: 500,
        ownerId: 1,
      })

      // Spawn a fast bullet (will despawn)
      const fastBullet = spawnBullet(world, {
        x: 0,
        y: 0,
        vx: 1000,
        vy: 0,
        damage: 10,
        range: 50,
        ownerId: 1,
      })

      bulletSystem(world, 0.1)

      // Slow bullet should still exist
      expect(hasComponent(world, Bullet, slowBullet)).toBe(true)
      // Fast bullet should be despawned
      expect(hasComponent(world, Bullet, fastBullet)).toBe(false)
    })
  })
})
