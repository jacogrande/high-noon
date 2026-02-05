import { describe, expect, test, beforeEach, mock } from 'bun:test'
import { hasComponent } from 'bitecs'
import { createGameWorld, setWorldTilemap, type GameWorld } from '../world'
import { spawnBullet } from '../prefabs'
import { bulletCollisionSystem } from './bulletCollision'
import { Bullet, Position } from '../components'
import { createTestArena, TILE_SIZE } from '../content/maps/testArena'

describe('bulletCollisionSystem', () => {
  let world: GameWorld

  beforeEach(() => {
    world = createGameWorld()
    // Create test arena with walls around edges
    const tilemap = createTestArena()
    setWorldTilemap(world, tilemap)
  })

  describe('wall collision', () => {
    test('despawns bullet when hitting wall', () => {
      // Spawn bullet heading toward left wall
      // Arena has walls at x=0, so spawn bullet at x=TILE_SIZE+10 heading left
      const bulletEid = spawnBullet(world, {
        x: TILE_SIZE + 10,
        y: TILE_SIZE * 5, // Middle of arena
        vx: 0,
        vy: 0,
        damage: 10,
        range: 500,
        ownerId: 1,
      })

      // Move bullet into wall
      Position.x[bulletEid] = TILE_SIZE / 2 // Inside wall

      bulletCollisionSystem(world, 1 / 60)

      // Bullet should be despawned
      expect(hasComponent(world, Bullet, bulletEid)).toBe(false)
    })

    test('does not despawn bullet in open space', () => {
      // Spawn bullet in open space (tile 3,3 is clear of obstacles)
      const bulletEid = spawnBullet(world, {
        x: TILE_SIZE * 3 + TILE_SIZE / 2, // Center of tile 3
        y: TILE_SIZE * 3 + TILE_SIZE / 2, // Center of tile 3
        vx: 100,
        vy: 0,
        damage: 10,
        range: 500,
        ownerId: 1,
      })

      bulletCollisionSystem(world, 1 / 60)

      // Bullet should still exist
      expect(hasComponent(world, Bullet, bulletEid)).toBe(true)
    })

    test('checks bullet edge for collision', () => {
      // Spawn bullet where center is in open space but edge touches wall
      const bulletRadius = 4 // BULLET_RADIUS from weapons.ts
      const bulletEid = spawnBullet(world, {
        x: TILE_SIZE + bulletRadius - 1, // Edge will be inside wall
        y: TILE_SIZE * 5,
        vx: 0,
        vy: 0,
        damage: 10,
        range: 500,
        ownerId: 1,
      })

      bulletCollisionSystem(world, 1 / 60)

      // Bullet should be despawned because edge is in wall
      expect(hasComponent(world, Bullet, bulletEid)).toBe(false)
    })
  })

  describe('collision callback', () => {
    test('calls onCollide callback when hitting wall', () => {
      const onCollide = mock(() => {})

      const bulletEid = spawnBullet(world, {
        x: TILE_SIZE / 2, // Inside wall
        y: TILE_SIZE * 5,
        vx: 0,
        vy: 0,
        damage: 10,
        range: 500,
        ownerId: 1,
        onCollide,
      })

      bulletCollisionSystem(world, 1 / 60)

      // Callback should have been called
      expect(onCollide).toHaveBeenCalledTimes(1)
      expect(onCollide.mock.calls[0][0]).toBe(world)
      expect(onCollide.mock.calls[0][1]).toBe(bulletEid)
      expect(onCollide.mock.calls[0][2].type).toBe('wall')
    })

    test('does not call callback when no collision', () => {
      const onCollide = mock(() => {})

      spawnBullet(world, {
        x: TILE_SIZE * 3 + TILE_SIZE / 2, // Center of tile 3 (open space)
        y: TILE_SIZE * 3 + TILE_SIZE / 2,
        vx: 100,
        vy: 0,
        damage: 10,
        range: 500,
        ownerId: 1,
        onCollide,
      })

      bulletCollisionSystem(world, 1 / 60)

      // Callback should not have been called
      expect(onCollide).not.toHaveBeenCalled()
    })

    test('cleans up callback after bullet removed', () => {
      const onCollide = mock(() => {})

      const bulletEid = spawnBullet(world, {
        x: TILE_SIZE / 2, // Inside wall
        y: TILE_SIZE * 5,
        vx: 0,
        vy: 0,
        damage: 10,
        range: 500,
        ownerId: 1,
        onCollide,
      })

      bulletCollisionSystem(world, 1 / 60)

      // Callback should be cleaned up from registry
      expect(world.bulletCollisionCallbacks.has(bulletEid)).toBe(false)
    })
  })

  describe('no tilemap', () => {
    test('does nothing without tilemap', () => {
      // Create world without tilemap
      const emptyWorld = createGameWorld()

      const bulletEid = spawnBullet(emptyWorld, {
        x: 0,
        y: 0,
        vx: 100,
        vy: 0,
        damage: 10,
        range: 500,
        ownerId: 1,
      })

      bulletCollisionSystem(emptyWorld, 1 / 60)

      // Bullet should still exist
      expect(hasComponent(emptyWorld, Bullet, bulletEid)).toBe(true)
    })
  })
})
