/**
 * Hook System Tests
 *
 * Tests for the HookRegistry and node effect integration.
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import { HookRegistry } from './hooks'
import { applyNodeEffect } from './content/nodeEffects'
import { createGameWorld, type GameWorld } from './world'
import { spawnPlayer, spawnBullet, CollisionLayer, NO_TARGET } from './prefabs'
import { Health, Bullet, Cylinder, Weapon, Player, Position, Velocity, Showdown } from './components'
import { defineQuery } from 'bitecs'

// ============================================================================
// Test Setup
// ============================================================================

const bulletQuery = defineQuery([Bullet])

function countBullets(world: GameWorld): number {
  return bulletQuery(world).length
}

// ============================================================================
// HookRegistry Basics
// ============================================================================

describe('HookRegistry', () => {
  let hooks: HookRegistry

  beforeEach(() => {
    hooks = new HookRegistry()
  })

  describe('register/unregister', () => {
    test('should register and fire a handler', () => {
      let called = false
      hooks.register('onKill', 'test', () => {
        called = true
      })

      const world = createGameWorld(42)
      hooks.fireKill(world, 0, 1)

      expect(called).toBe(true)
    })

    test('should unregister all handlers with given id', () => {
      let callCount = 0

      hooks.register('onKill', 'test', () => { callCount++ })
      hooks.register('onRollDodge', 'test', () => { callCount++ })
      hooks.register('onKill', 'other', () => { callCount++ })

      const world = createGameWorld(42)

      hooks.unregister('test')

      hooks.fireKill(world, 0, 1)
      hooks.fireRollDodge(world, 0, 1)

      expect(callCount).toBe(1) // only 'other' handler fires
    })
  })

  describe('clear()', () => {
    test('should remove all handlers', () => {
      let callCount = 0

      hooks.register('onKill', 'a', () => { callCount++ })
      hooks.register('onRollDodge', 'b', () => { callCount++ })
      hooks.register('onCylinderEmpty', 'c', () => { callCount++ })

      hooks.clear()

      const world = createGameWorld(42)
      hooks.fireKill(world, 0, 1)
      hooks.fireRollDodge(world, 0, 1)
      hooks.fireCylinderEmpty(world, 0)

      expect(callCount).toBe(0)
    })
  })

  describe('hasHandlers()', () => {
    test('should return false when no handlers registered', () => {
      expect(hooks.hasHandlers('onBulletHit')).toBe(false)
      expect(hooks.hasHandlers('onKill')).toBe(false)
    })

    test('should return true when handler is registered', () => {
      hooks.register('onBulletHit', 'test', () => ({ damage: 1, pierce: false }))
      hooks.register('onKill', 'test', () => {})

      expect(hooks.hasHandlers('onBulletHit')).toBe(true)
      expect(hooks.hasHandlers('onKill')).toBe(true)
      expect(hooks.hasHandlers('onRollDodge')).toBe(false)
    })

    test('should return false after unregistering all handlers', () => {
      hooks.register('onKill', 'test', () => {})
      expect(hooks.hasHandlers('onKill')).toBe(true)

      hooks.unregister('test')
      expect(hooks.hasHandlers('onKill')).toBe(false)
    })
  })

  describe('priority ordering', () => {
    test('should run handlers in priority order (lower priority first)', () => {
      const order: number[] = []

      hooks.register('onKill', 'third', () => { order.push(3) }, 20)
      hooks.register('onKill', 'first', () => { order.push(1) }, 0)
      hooks.register('onKill', 'second', () => { order.push(2) }, 10)

      const world = createGameWorld(42)
      hooks.fireKill(world, 0, 1)

      expect(order).toEqual([1, 2, 3])
    })

    test('should sort handlers when registered out of order', () => {
      const order: string[] = []

      hooks.register('onKill', 'z', () => { order.push('z') }, 30)
      hooks.register('onKill', 'a', () => { order.push('a') }, 5)
      hooks.register('onKill', 'm', () => { order.push('m') }, 15)

      const world = createGameWorld(42)
      hooks.fireKill(world, 0, 1)

      expect(order).toEqual(['a', 'm', 'z'])
    })
  })
})

// ============================================================================
// Transform Hook: fireBulletHit
// ============================================================================

describe('fireBulletHit (transform hook)', () => {
  let world: GameWorld

  beforeEach(() => {
    world = createGameWorld(42)
  })

  test('should return default result with no handlers', () => {
    const result = world.hooks.fireBulletHit(world, 0, 1, 10)

    expect(result.damage).toBe(10)
    expect(result.pierce).toBe(false)
  })

  test('should allow single handler to modify result', () => {
    world.hooks.register('onBulletHit', 'double', (_w, _b, _t, damage) => {
      return { damage: damage * 2, pierce: false }
    })

    const result = world.hooks.fireBulletHit(world, 0, 1, 10)

    expect(result.damage).toBe(20)
    expect(result.pierce).toBe(false)
  })

  test('should chain multiple handlers', () => {
    // First handler: +5 damage
    world.hooks.register('onBulletHit', 'additive', (_w, _b, _t, damage) => {
      return { damage: damage + 5, pierce: false }
    }, 0)

    // Second handler: double damage (should receive 15)
    world.hooks.register('onBulletHit', 'multiplicative', (_w, _b, _t, damage) => {
      return { damage: damage * 2, pierce: false }
    }, 10)

    const result = world.hooks.fireBulletHit(world, 0, 1, 10)

    expect(result.damage).toBe(30) // (10 + 5) * 2
    expect(result.pierce).toBe(false)
  })

  test('should allow handler to set pierce', () => {
    world.hooks.register('onBulletHit', 'pierce', (_w, _b, _t, damage) => {
      return { damage, pierce: true }
    })

    const result = world.hooks.fireBulletHit(world, 0, 1, 10)

    expect(result.damage).toBe(10)
    expect(result.pierce).toBe(true)
  })
})

// ============================================================================
// Notify Hooks
// ============================================================================

describe('fireKill (notify hook)', () => {
  test('should call handler with correct arguments', () => {
    const world = createGameWorld(42)
    let capturedPlayerEid = -1
    let capturedVictimEid = -1

    world.hooks.register('onKill', 'test', (_w, playerEid, victimEid) => {
      capturedPlayerEid = playerEid
      capturedVictimEid = victimEid
    })

    world.hooks.fireKill(world, 5, 10)

    expect(capturedPlayerEid).toBe(5)
    expect(capturedVictimEid).toBe(10)
  })

  test('should call multiple handlers', () => {
    const world = createGameWorld(42)
    let callCount = 0

    world.hooks.register('onKill', 'first', () => { callCount++ })
    world.hooks.register('onKill', 'second', () => { callCount++ })
    world.hooks.register('onKill', 'third', () => { callCount++ })

    world.hooks.fireKill(world, 0, 1)

    expect(callCount).toBe(3)
  })
})

describe('fireRollDodge (notify hook)', () => {
  test('should call handler with correct arguments', () => {
    const world = createGameWorld(42)
    let capturedPlayerEid = -1
    let capturedBulletEid = -1

    world.hooks.register('onRollDodge', 'test', (_w, playerEid, bulletEid) => {
      capturedPlayerEid = playerEid
      capturedBulletEid = bulletEid
    })

    world.hooks.fireRollDodge(world, 7, 12)

    expect(capturedPlayerEid).toBe(7)
    expect(capturedBulletEid).toBe(12)
  })

  test('should call multiple handlers', () => {
    const world = createGameWorld(42)
    let callCount = 0

    world.hooks.register('onRollDodge', 'a', () => { callCount++ })
    world.hooks.register('onRollDodge', 'b', () => { callCount++ })

    world.hooks.fireRollDodge(world, 0, 1)

    expect(callCount).toBe(2)
  })
})

describe('fireCylinderEmpty (notify hook)', () => {
  test('should call handler with correct arguments', () => {
    const world = createGameWorld(42)
    let capturedPlayerEid = -1

    world.hooks.register('onCylinderEmpty', 'test', (_w, playerEid) => {
      capturedPlayerEid = playerEid
    })

    world.hooks.fireCylinderEmpty(world, 3)

    expect(capturedPlayerEid).toBe(3)
  })

  test('should call multiple handlers', () => {
    const world = createGameWorld(42)
    let callCount = 0

    world.hooks.register('onCylinderEmpty', 'x', () => { callCount++ })
    world.hooks.register('onCylinderEmpty', 'y', () => { callCount++ })
    world.hooks.register('onCylinderEmpty', 'z', () => { callCount++ })

    world.hooks.fireCylinderEmpty(world, 0)

    expect(callCount).toBe(3)
  })
})

describe('fireHealthChanged (notify hook)', () => {
  test('should call handler with correct arguments', () => {
    const world = createGameWorld(42)
    let capturedPlayerEid = -1
    let capturedOldHP = -1
    let capturedNewHP = -1

    world.hooks.register('onHealthChanged', 'test', (_w, playerEid, oldHP, newHP) => {
      capturedPlayerEid = playerEid
      capturedOldHP = oldHP
      capturedNewHP = newHP
    })

    world.hooks.fireHealthChanged(world, 2, 5, 3)

    expect(capturedPlayerEid).toBe(2)
    expect(capturedOldHP).toBe(5)
    expect(capturedNewHP).toBe(3)
  })

  test('should call multiple handlers', () => {
    const world = createGameWorld(42)
    let callCount = 0

    world.hooks.register('onHealthChanged', 'a', () => { callCount++ })
    world.hooks.register('onHealthChanged', 'b', () => { callCount++ })

    world.hooks.fireHealthChanged(world, 0, 10, 8)

    expect(callCount).toBe(2)
  })
})

describe('fireShowdownActivate (notify hook)', () => {
  test('should call handler with correct arguments', () => {
    const world = createGameWorld(42)
    let capturedPlayerEid = -1

    world.hooks.register('onShowdownActivate', 'test', (_w, playerEid) => {
      capturedPlayerEid = playerEid
    })

    world.hooks.fireShowdownActivate(world, 4)

    expect(capturedPlayerEid).toBe(4)
  })

  test('should call multiple handlers', () => {
    const world = createGameWorld(42)
    let callCount = 0

    world.hooks.register('onShowdownActivate', 'p', () => { callCount++ })
    world.hooks.register('onShowdownActivate', 'q', () => { callCount++ })

    world.hooks.fireShowdownActivate(world, 0)

    expect(callCount).toBe(2)
  })
})

// ============================================================================
// Node Effect Integration
// ============================================================================

describe('Node Effect: Piercing Rounds', () => {
  let world: GameWorld
  let playerEid: number
  let bulletEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    playerEid = spawnPlayer(world, 100, 100)
    bulletEid = spawnBullet(world, {
      x: 100,
      y: 100,
      vx: 10,
      vy: 0,
      damage: 5,
      range: 100,
      ownerId: playerEid,
    })

    applyNodeEffect(world, 'piercing_rounds')
  })

  test('should return pierce: true on first hit', () => {
    const result = world.hooks.fireBulletHit(world, bulletEid, 999, 5)

    expect(result.damage).toBe(5)
    expect(result.pierce).toBe(true)
  })

  test('should return pierce: false on second hit', () => {
    // First hit
    world.hooks.fireBulletHit(world, bulletEid, 999, 5)

    // Second hit (different target)
    const result = world.hooks.fireBulletHit(world, bulletEid, 1000, 5)

    expect(result.damage).toBe(5)
    expect(result.pierce).toBe(false)
  })

  test('should handle multiple bullets independently', () => {
    const bullet2 = spawnBullet(world, {
      x: 200,
      y: 100,
      vx: 10,
      vy: 0,
      damage: 7,
      range: 100,
      ownerId: playerEid,
    })

    // Both should pierce on first hit
    const result1 = world.hooks.fireBulletHit(world, bulletEid, 999, 5)
    const result2 = world.hooks.fireBulletHit(world, bullet2, 998, 7)

    expect(result1.pierce).toBe(true)
    expect(result2.pierce).toBe(true)

    // Both should not pierce on second hit
    const result3 = world.hooks.fireBulletHit(world, bulletEid, 997, 5)
    const result4 = world.hooks.fireBulletHit(world, bullet2, 996, 7)

    expect(result3.pierce).toBe(false)
    expect(result4.pierce).toBe(false)
  })
})

describe('Node Effect: Second Wind', () => {
  let world: GameWorld
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    playerEid = spawnPlayer(world, 100, 100)

    applyNodeEffect(world, 'second_wind')
  })

  test('should heal 1 HP on roll dodge', () => {
    // Damage player first
    Health.current[playerEid] = 3
    const maxHP = Health.max[playerEid]

    const bulletEid = spawnBullet(world, {
      x: 100,
      y: 100,
      vx: 10,
      vy: 0,
      damage: 1,
      range: 100,
      ownerId: -1,
      layer: CollisionLayer.ENEMY_BULLET,
    })

    world.hooks.fireRollDodge(world, playerEid, bulletEid)

    expect(Health.current[playerEid]).toBe(4)
  })

  test('should not overheal', () => {
    const maxHP = Health.max[playerEid]
    Health.current[playerEid] = maxHP

    const bulletEid = spawnBullet(world, {
      x: 100,
      y: 100,
      vx: 10,
      vy: 0,
      damage: 1,
      range: 100,
      ownerId: -1,
      layer: CollisionLayer.ENEMY_BULLET,
    })

    world.hooks.fireRollDodge(world, playerEid, bulletEid)

    expect(Health.current[playerEid]).toBe(maxHP)
  })

  test('should not heal when already at max HP', () => {
    const maxHP = Health.max[playerEid]
    Health.current[playerEid] = maxHP

    const bulletEid = spawnBullet(world, {
      x: 100,
      y: 100,
      vx: 10,
      vy: 0,
      damage: 1,
      range: 100,
      ownerId: -1,
      layer: CollisionLayer.ENEMY_BULLET,
    })

    const beforeHP = Health.current[playerEid]
    world.hooks.fireRollDodge(world, playerEid, bulletEid)

    expect(Health.current[playerEid]).toBe(beforeHP)
  })
})

describe('Node Effect: Dead Man\'s Hand', () => {
  let world: GameWorld
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    playerEid = spawnPlayer(world, 100, 100)

    // Set player aim angle and weapon stats
    Player.aimAngle[playerEid] = 0 // aiming right
    Weapon.bulletSpeed[playerEid] = 200
    Weapon.bulletDamage[playerEid] = 5
    Weapon.range[playerEid] = 100

    applyNodeEffect(world, 'dead_mans_hand')
  })

  test('should spawn 3 bullets on cylinder empty', () => {
    const beforeCount = countBullets(world)

    world.hooks.fireCylinderEmpty(world, playerEid)

    const afterCount = countBullets(world)
    expect(afterCount - beforeCount).toBe(3)
  })

  test('should spawn bullets with correct owner', () => {
    world.hooks.fireCylinderEmpty(world, playerEid)

    const bullets = bulletQuery(world)
    for (const bulletEid of bullets) {
      expect(Bullet.ownerId[bulletEid]).toBe(playerEid)
    }
  })

  test('should spawn bullets with spread pattern (different velocity angles)', () => {
    world.hooks.fireCylinderEmpty(world, playerEid)

    const bullets = bulletQuery(world)
    expect(bullets.length).toBeGreaterThanOrEqual(3)

    // Get the last 3 bullets (the ones we just spawned)
    const newBullets = bullets.slice(-3)

    // Verify velocity angles differ across the spread
    const angles = newBullets.map(eid => Math.atan2(Velocity.y[eid]!, Velocity.x[eid]!))

    // All angles should be distinct
    expect(new Set(angles).size).toBe(3)

    // Spread should be ~30° (PI/6) total — verify outer angles are ~PI/6 apart
    const spread = Math.abs(angles[2]! - angles[0]!)
    expect(spread).toBeCloseTo(Math.PI / 6, 4)
  })
})

describe('Node Effect: Last Stand', () => {
  let world: GameWorld
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    playerEid = spawnPlayer(world, 100, 100)

    applyNodeEffect(world, 'last_stand')
  })

  test('should activate when health drops to 1', () => {
    Health.current[playerEid] = 5

    world.hooks.fireHealthChanged(world, playerEid, 5, 1)

    expect(world.upgradeState.lastStandActive).toBe(true)
    expect(world.upgradeState.lastStandTimer).toBe(5.0)
  })

  test('should not activate when health drops to 2', () => {
    Health.current[playerEid] = 5

    world.hooks.fireHealthChanged(world, playerEid, 5, 2)

    expect(world.upgradeState.lastStandActive).toBe(false)
  })

  test('should not activate when health is already at 1', () => {
    Health.current[playerEid] = 1

    world.hooks.fireHealthChanged(world, playerEid, 1, 1)

    expect(world.upgradeState.lastStandActive).toBe(false)
  })

  test('should deactivate when healed above 1 HP', () => {
    // Activate first
    world.upgradeState.lastStandActive = true
    world.upgradeState.lastStandTimer = 3.0

    world.hooks.fireHealthChanged(world, playerEid, 1, 2)

    expect(world.upgradeState.lastStandActive).toBe(false)
    expect(world.upgradeState.lastStandTimer).toBe(0)
  })

  test('should not deactivate when healed from 2 to 3', () => {
    // Not active
    world.upgradeState.lastStandActive = false

    world.hooks.fireHealthChanged(world, playerEid, 2, 3)

    expect(world.upgradeState.lastStandActive).toBe(false)
  })
})

describe('Node Effect: Judge, Jury & Executioner (last round bonus)', () => {
  let world: GameWorld
  let playerEid: number
  let bulletEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    playerEid = spawnPlayer(world, 100, 100)
    bulletEid = spawnBullet(world, {
      x: 100,
      y: 100,
      vx: 10,
      vy: 0,
      damage: 10,
      range: 100,
      ownerId: playerEid,
    })

    applyNodeEffect(world, 'judge_jury_executioner')
  })

  test('should apply 2x damage bonus when cylinder is empty', () => {
    Cylinder.rounds[playerEid] = 0 // empty cylinder

    const result = world.hooks.fireBulletHit(world, bulletEid, 999, 10)

    expect(result.damage).toBe(20)
    expect(result.pierce).toBe(false)
  })

  test('should not apply bonus when cylinder has rounds', () => {
    Cylinder.rounds[playerEid] = 3

    const result = world.hooks.fireBulletHit(world, bulletEid, 999, 10)

    expect(result.damage).toBe(10)
    expect(result.pierce).toBe(false)
  })

  test('should cap damage at 255', () => {
    Cylinder.rounds[playerEid] = 0

    const result = world.hooks.fireBulletHit(world, bulletEid, 999, 200)

    expect(result.damage).toBe(255) // capped at max uint8
  })

  test('should work with piercing (priority ordering + pierce OR)', () => {
    // Apply piercing rounds too
    applyNodeEffect(world, 'piercing_rounds')

    Cylinder.rounds[playerEid] = 0

    const result = world.hooks.fireBulletHit(world, bulletEid, 999, 10)

    // Pierce runs first (priority 0): returns {damage: 10, pierce: true}
    // JJE runs second (priority 10): returns {damage: 20, pierce: false}
    // Pierce flags are OR'd: true || false = true
    expect(result.damage).toBe(20)
    expect(result.pierce).toBe(true)
  })
})

// ============================================================================
// Integration: Multiple Node Effects
// ============================================================================

describe('Multiple Node Effects', () => {
  test('should allow multiple effects to coexist', () => {
    const world = createGameWorld(42)
    const playerEid = spawnPlayer(world, 100, 100)

    // Apply multiple effects
    applyNodeEffect(world, 'second_wind')
    applyNodeEffect(world, 'last_stand')
    applyNodeEffect(world, 'dead_mans_hand')

    // Verify all hooks are registered
    expect(world.hooks.hasHandlers('onRollDodge')).toBe(true)
    expect(world.hooks.hasHandlers('onHealthChanged')).toBe(true)
    expect(world.hooks.hasHandlers('onCylinderEmpty')).toBe(true)
  })

  test('should allow same hook type from multiple nodes', () => {
    const world = createGameWorld(42)
    const playerEid = spawnPlayer(world, 100, 100)
    const bulletEid = spawnBullet(world, {
      x: 100,
      y: 100,
      vx: 10,
      vy: 0,
      damage: 10,
      range: 100,
      ownerId: playerEid,
    })

    // Both use onBulletHit
    applyNodeEffect(world, 'piercing_rounds')
    applyNodeEffect(world, 'judge_jury_executioner')

    Cylinder.rounds[playerEid] = 0

    // First hit: pierce active, cylinder empty
    const result = world.hooks.fireBulletHit(world, bulletEid, 999, 10)

    // Should get 2x damage from JJE (priority runs after pierce)
    expect(result.damage).toBe(20)
  })

  test('should clear all effects when world.hooks.clear() is called', () => {
    const world = createGameWorld(42)

    applyNodeEffect(world, 'piercing_rounds')
    applyNodeEffect(world, 'second_wind')
    applyNodeEffect(world, 'last_stand')

    world.hooks.clear()

    expect(world.hooks.hasHandlers('onBulletHit')).toBe(false)
    expect(world.hooks.hasHandlers('onRollDodge')).toBe(false)
    expect(world.hooks.hasHandlers('onHealthChanged')).toBe(false)
  })
})
