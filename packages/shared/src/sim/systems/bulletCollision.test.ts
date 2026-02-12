import { describe, expect, test, beforeEach, mock } from 'bun:test'
import { hasComponent, addComponent, addEntity } from 'bitecs'
import { createGameWorld, setWorldTilemap, type GameWorld } from '../world'
import { spawnBullet, spawnPlayer, CollisionLayer, NO_TARGET } from '../prefabs'
import { bulletCollisionSystem } from './bulletCollision'
import { spatialHashSystem } from './spatialHash'
import {
  Bullet, Position, Velocity, Health, Collider, Enemy, Player, Showdown, Invincible,
  EnemyAI, Detection, AttackConfig, Steering, Speed,
} from '../components'
import { createTestArena, TILE_SIZE } from '../content/maps/testArena'

/** Spawn a minimal enemy at (x, y) with given HP and radius */
function spawnTestEnemy(world: GameWorld, x: number, y: number, hp = 10, radius = 8): number {
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
  Health.iframes[eid] = 0
  Health.iframeDuration[eid] = 0
  Collider.radius[eid] = radius
  Collider.layer[eid] = CollisionLayer.ENEMY
  return eid
}

/** Rebuild the spatial hash so entity collision queries work */
function rebuildHash(world: GameWorld): void {
  spatialHashSystem(world, 0)
}

// Open space coordinates (tile 5,5 in the arena — safely inside border walls)
const OPEN_X = TILE_SIZE * 5 + TILE_SIZE / 2
const OPEN_Y = TILE_SIZE * 5 + TILE_SIZE / 2

describe('bulletCollisionSystem', () => {
  let world: GameWorld

  beforeEach(() => {
    world = createGameWorld(42)
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

  describe('entity collision', () => {
    test('player bullet damages enemy and is removed', () => {
      const playerEid = spawnPlayer(world, OPEN_X, OPEN_Y)
      const enemyEid = spawnTestEnemy(world, OPEN_X, OPEN_Y, 20)

      const bulletEid = spawnBullet(world, {
        x: OPEN_X, y: OPEN_Y,
        vx: 100, vy: 0,
        damage: 7,
        range: 500,
        ownerId: playerEid,
      })

      rebuildHash(world)
      bulletCollisionSystem(world, 1 / 60)

      expect(Health.current[enemyEid]).toBe(20 - 7)
      expect(hasComponent(world, Bullet, bulletEid)).toBe(false)
    })

    test('enemy bullet damages player and is removed', () => {
      const playerEid = spawnPlayer(world, OPEN_X, OPEN_Y)
      const enemyEid = spawnTestEnemy(world, OPEN_X + 100, OPEN_Y)

      const bulletEid = spawnBullet(world, {
        x: OPEN_X, y: OPEN_Y,
        vx: -100, vy: 0,
        damage: 3,
        range: 500,
        ownerId: enemyEid,
        layer: CollisionLayer.ENEMY_BULLET,
      })

      rebuildHash(world)
      bulletCollisionSystem(world, 1 / 60)

      expect(Health.current[playerEid]).toBe(Health.max[playerEid]! - 3)
      expect(hasComponent(world, Bullet, bulletEid)).toBe(false)
    })

    test('player bullet does NOT hit player (same layer)', () => {
      const playerEid = spawnPlayer(world, OPEN_X, OPEN_Y)
      const startHP = Health.current[playerEid]!

      // A stray player bullet overlapping the player — should not self-hit
      // ownerId check handles this, but layer check also prevents it
      const bulletEid = spawnBullet(world, {
        x: OPEN_X, y: OPEN_Y,
        vx: 100, vy: 0,
        damage: 5,
        range: 500,
        ownerId: playerEid,
      })

      rebuildHash(world)
      bulletCollisionSystem(world, 1 / 60)

      expect(Health.current[playerEid]).toBe(startHP)
      // Bullet should still exist (no wall collision in open space)
      expect(hasComponent(world, Bullet, bulletEid)).toBe(true)
    })

    test('enemy bullet does NOT hit its owner enemy', () => {
      spawnPlayer(world, OPEN_X + 200, OPEN_Y + 200) // far away
      const enemyEid = spawnTestEnemy(world, OPEN_X, OPEN_Y, 10)

      const bulletEid = spawnBullet(world, {
        x: OPEN_X, y: OPEN_Y,
        vx: 100, vy: 0,
        damage: 5,
        range: 500,
        ownerId: enemyEid,
        layer: CollisionLayer.ENEMY_BULLET,
      })

      rebuildHash(world)
      bulletCollisionSystem(world, 1 / 60)

      // Owner enemy should not be hit
      expect(Health.current[enemyEid]).toBe(10)
      // Bullet stays (no valid target hit)
      expect(hasComponent(world, Bullet, bulletEid)).toBe(true)
    })

    test('skips invincible entities (Invincible component)', () => {
      const playerEid = spawnPlayer(world, OPEN_X, OPEN_Y)
      addComponent(world, Invincible, playerEid)
      const startHP = Health.current[playerEid]!

      const enemyEid = spawnTestEnemy(world, OPEN_X + 200, OPEN_Y)
      const bulletEid = spawnBullet(world, {
        x: OPEN_X, y: OPEN_Y,
        vx: -100, vy: 0,
        damage: 5,
        range: 500,
        ownerId: enemyEid,
        layer: CollisionLayer.ENEMY_BULLET,
      })

      rebuildHash(world)
      bulletCollisionSystem(world, 1 / 60)

      expect(Health.current[playerEid]).toBe(startHP)
      expect(hasComponent(world, Bullet, bulletEid)).toBe(true)
    })

    test('skips entities with active iframes', () => {
      const playerEid = spawnPlayer(world, OPEN_X, OPEN_Y)
      Health.iframes[playerEid] = 0.5 // 0.5s of iframe remaining
      const startHP = Health.current[playerEid]!

      const enemyEid = spawnTestEnemy(world, OPEN_X + 200, OPEN_Y)
      const bulletEid = spawnBullet(world, {
        x: OPEN_X, y: OPEN_Y,
        vx: -100, vy: 0,
        damage: 5,
        range: 500,
        ownerId: enemyEid,
        layer: CollisionLayer.ENEMY_BULLET,
      })

      rebuildHash(world)
      bulletCollisionSystem(world, 1 / 60)

      expect(Health.current[playerEid]).toBe(startHP)
      expect(hasComponent(world, Bullet, bulletEid)).toBe(true)
    })

    test('sets iframes on hit target', () => {
      const playerEid = spawnPlayer(world, OPEN_X, OPEN_Y)
      const enemyEid = spawnTestEnemy(world, OPEN_X, OPEN_Y, 20)
      // Give the enemy an iframe duration
      Health.iframeDuration[enemyEid] = 0.3

      spawnBullet(world, {
        x: OPEN_X, y: OPEN_Y,
        vx: 100, vy: 0,
        damage: 5,
        range: 500,
        ownerId: playerEid,
      })

      rebuildHash(world)
      bulletCollisionSystem(world, 1 / 60)

      expect(Health.iframes[enemyEid]).toBeCloseTo(0.3)
    })

    test('calls entity collision callback', () => {
      const onCollide = mock(() => {})
      const playerEid = spawnPlayer(world, OPEN_X, OPEN_Y)
      const enemyEid = spawnTestEnemy(world, OPEN_X, OPEN_Y, 20)

      const bulletEid = spawnBullet(world, {
        x: OPEN_X, y: OPEN_Y,
        vx: 100, vy: 0,
        damage: 5,
        range: 500,
        ownerId: playerEid,
        onCollide,
      })

      rebuildHash(world)
      bulletCollisionSystem(world, 1 / 60)

      expect(onCollide).toHaveBeenCalledTimes(1)
      expect(onCollide.mock.calls[0][2].type).toBe('entity')
      expect(onCollide.mock.calls[0][2].hitEntity).toBe(enemyEid)
    })

    test('cleans up pierce hit tracking on bullet removal', () => {
      const playerEid = spawnPlayer(world, OPEN_X, OPEN_Y)
      const enemyEid = spawnTestEnemy(world, OPEN_X, OPEN_Y, 20)

      const bulletEid = spawnBullet(world, {
        x: OPEN_X, y: OPEN_Y,
        vx: 100, vy: 0,
        damage: 5,
        range: 500,
        ownerId: playerEid,
      })

      // Pre-populate pierce tracking to verify cleanup
      world.bulletPierceHits.set(bulletEid, new Set([999]))

      rebuildHash(world)
      bulletCollisionSystem(world, 1 / 60)

      expect(world.bulletPierceHits.has(bulletEid)).toBe(false)
    })

    test('fires onHealthChanged hook when player is hit', () => {
      const playerEid = spawnPlayer(world, OPEN_X, OPEN_Y)
      const enemyEid = spawnTestEnemy(world, OPEN_X + 200, OPEN_Y)

      let hookFired = false
      let capturedOldHP = 0
      let capturedNewHP = 0
      world.hooks.register('onHealthChanged', 'test', (_w, _eid, oldHP, newHP) => {
        hookFired = true
        capturedOldHP = oldHP
        capturedNewHP = newHP
      })

      const startHP = Health.current[playerEid]!
      spawnBullet(world, {
        x: OPEN_X, y: OPEN_Y,
        vx: -100, vy: 0,
        damage: 2,
        range: 500,
        ownerId: enemyEid,
        layer: CollisionLayer.ENEMY_BULLET,
      })

      rebuildHash(world)
      bulletCollisionSystem(world, 1 / 60)

      expect(hookFired).toBe(true)
      expect(capturedOldHP).toBe(startHP)
      expect(capturedNewHP).toBe(startHP - 2)
    })

    test('stores lastPlayerHitDir when player is hit', () => {
      const playerEid = spawnPlayer(world, OPEN_X, OPEN_Y)
      const enemyEid = spawnTestEnemy(world, OPEN_X + 200, OPEN_Y)

      spawnBullet(world, {
        x: OPEN_X, y: OPEN_Y,
        vx: -100, vy: 0, // bullet traveling left
        damage: 2,
        range: 500,
        ownerId: enemyEid,
        layer: CollisionLayer.ENEMY_BULLET,
      })

      rebuildHash(world)
      bulletCollisionSystem(world, 1 / 60)

      // Hit direction should be normalized bullet velocity direction (left = -1, 0)
      const hitDir = world.lastPlayerHitDir.get(playerEid)!
      expect(hitDir.x).toBeCloseTo(-1)
      expect(hitDir.y).toBeCloseTo(0)
    })
  })

  describe('Showdown pierce and damage', () => {
    test('bullet pierces non-target enemy during Showdown', () => {
      const playerEid = spawnPlayer(world, OPEN_X, OPEN_Y)
      const nonTarget = spawnTestEnemy(world, OPEN_X + 5, OPEN_Y, 20, 8)
      const target = spawnTestEnemy(world, OPEN_X + 20, OPEN_Y, 20, 8)

      // Activate Showdown on target
      Showdown.active[playerEid] = 1
      Showdown.targetEid[playerEid] = target
      Showdown.duration[playerEid] = 3.0

      const bulletEid = spawnBullet(world, {
        x: OPEN_X + 5, y: OPEN_Y, // overlapping non-target
        vx: 100, vy: 0,
        damage: 10,
        range: 500,
        ownerId: playerEid,
      })

      rebuildHash(world)
      bulletCollisionSystem(world, 1 / 60)

      // Non-target should take damage
      expect(Health.current[nonTarget]).toBe(20 - 10)
      // Bullet should NOT be removed (pierced through)
      expect(hasComponent(world, Bullet, bulletEid)).toBe(true)
      // Pierce tracking should record the non-target
      expect(world.bulletPierceHits.get(bulletEid)?.has(nonTarget)).toBe(true)
    })

    test('bullet stops on Showdown target with bonus damage', () => {
      const playerEid = spawnPlayer(world, OPEN_X, OPEN_Y)
      const target = spawnTestEnemy(world, OPEN_X + 5, OPEN_Y, 50, 8)

      Showdown.active[playerEid] = 1
      Showdown.targetEid[playerEid] = target
      Showdown.duration[playerEid] = 3.0

      const bulletEid = spawnBullet(world, {
        x: OPEN_X + 5, y: OPEN_Y,
        vx: 100, vy: 0,
        damage: 10,
        range: 500,
        ownerId: playerEid,
      })

      rebuildHash(world)
      bulletCollisionSystem(world, 1 / 60)

      // Target should take bonus damage (1.5x default multiplier)
      const expectedDamage = Math.min(255, Math.round(10 * world.upgradeState.showdownDamageMultiplier))
      expect(Health.current[target]).toBe(50 - expectedDamage)
      // Bullet should be removed (stops on target)
      expect(hasComponent(world, Bullet, bulletEid)).toBe(false)
    })

    test('Showdown pierce does not hit same entity twice', () => {
      const playerEid = spawnPlayer(world, OPEN_X, OPEN_Y)
      const nonTarget = spawnTestEnemy(world, OPEN_X + 5, OPEN_Y, 20, 8)
      const target = spawnTestEnemy(world, OPEN_X + 50, OPEN_Y, 20, 8) // far enough

      Showdown.active[playerEid] = 1
      Showdown.targetEid[playerEid] = target
      Showdown.duration[playerEid] = 3.0

      const bulletEid = spawnBullet(world, {
        x: OPEN_X + 5, y: OPEN_Y,
        vx: 100, vy: 0,
        damage: 10,
        range: 500,
        ownerId: playerEid,
      })

      rebuildHash(world)

      // First collision — pierces through non-target
      bulletCollisionSystem(world, 1 / 60)
      expect(Health.current[nonTarget]).toBe(10)
      expect(hasComponent(world, Bullet, bulletEid)).toBe(true)

      // Second collision tick — bullet still near non-target but should skip it
      rebuildHash(world)
      bulletCollisionSystem(world, 1 / 60)
      // Non-target should NOT take another hit
      expect(Health.current[nonTarget]).toBe(10)
    })
  })

  describe('local-player scope optimistic hits', () => {
    test('local player bullets apply optimistic enemy damage immediately', () => {
      const playerEid = spawnPlayer(world, OPEN_X, OPEN_Y)
      const enemyEid = spawnTestEnemy(world, OPEN_X, OPEN_Y, 20)
      const bulletEid = spawnBullet(world, {
        x: OPEN_X, y: OPEN_Y,
        vx: 100, vy: 0,
        damage: 6,
        range: 500,
        ownerId: playerEid,
      })

      // Build hash in full-world mode (local-player mode reuses this authoritative hash).
      rebuildHash(world)
      world.simulationScope = 'local-player'
      world.localPlayerEid = playerEid

      bulletCollisionSystem(world, 1 / 60)

      expect(Health.current[enemyEid]).toBe(14)
      expect(hasComponent(world, Bullet, bulletEid)).toBe(false)
    })

    test('local-player scope ignores bullets not owned by local player', () => {
      const localPlayer = spawnPlayer(world, OPEN_X, OPEN_Y)
      const remotePlayer = spawnPlayer(world, OPEN_X + 200, OPEN_Y)
      const enemyEid = spawnTestEnemy(world, OPEN_X, OPEN_Y, 20)
      const bulletEid = spawnBullet(world, {
        x: OPEN_X, y: OPEN_Y,
        vx: 100, vy: 0,
        damage: 6,
        range: 500,
        ownerId: remotePlayer,
      })

      rebuildHash(world)
      world.simulationScope = 'local-player'
      world.localPlayerEid = localPlayer

      bulletCollisionSystem(world, 1 / 60)

      expect(Health.current[enemyEid]).toBe(20)
      expect(hasComponent(world, Bullet, bulletEid)).toBe(true)
    })
  })

  describe('onBulletHit hook', () => {
    test('hook can modify damage', () => {
      const playerEid = spawnPlayer(world, OPEN_X, OPEN_Y)
      const enemyEid = spawnTestEnemy(world, OPEN_X, OPEN_Y, 50)

      // Register hook that doubles damage
      world.hooks.register('onBulletHit', 'test_damage', (_w, _bulletEid, _targetEid, damage) => {
        return { damage: damage * 2, pierce: false }
      })

      spawnBullet(world, {
        x: OPEN_X, y: OPEN_Y,
        vx: 100, vy: 0,
        damage: 10,
        range: 500,
        ownerId: playerEid,
      })

      rebuildHash(world)
      bulletCollisionSystem(world, 1 / 60)

      expect(Health.current[enemyEid]).toBe(50 - 20)
    })

    test('hook can request pierce', () => {
      const playerEid = spawnPlayer(world, OPEN_X, OPEN_Y)
      const enemyEid = spawnTestEnemy(world, OPEN_X, OPEN_Y, 50)

      // Register hook that requests pierce
      world.hooks.register('onBulletHit', 'test_pierce', (_w, _bulletEid, _targetEid, damage) => {
        return { damage, pierce: true }
      })

      const bulletEid = spawnBullet(world, {
        x: OPEN_X, y: OPEN_Y,
        vx: 100, vy: 0,
        damage: 10,
        range: 500,
        ownerId: playerEid,
      })

      rebuildHash(world)
      bulletCollisionSystem(world, 1 / 60)

      // Damage should still apply
      expect(Health.current[enemyEid]).toBe(50 - 10)
      // Bullet should NOT be removed (pierce)
      expect(hasComponent(world, Bullet, bulletEid)).toBe(true)
      // Pierce hit tracking should be set
      expect(world.bulletPierceHits.get(bulletEid)?.has(enemyEid)).toBe(true)
    })

    test('hook does not fire for enemy bullets', () => {
      const playerEid = spawnPlayer(world, OPEN_X, OPEN_Y)
      const enemyEid = spawnTestEnemy(world, OPEN_X + 200, OPEN_Y)

      let hookCalled = false
      world.hooks.register('onBulletHit', 'test', () => {
        hookCalled = true
        return { damage: 0, pierce: false }
      })

      spawnBullet(world, {
        x: OPEN_X, y: OPEN_Y,
        vx: -100, vy: 0,
        damage: 3,
        range: 500,
        ownerId: enemyEid,
        layer: CollisionLayer.ENEMY_BULLET,
      })

      rebuildHash(world)
      bulletCollisionSystem(world, 1 / 60)

      expect(hookCalled).toBe(false)
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
