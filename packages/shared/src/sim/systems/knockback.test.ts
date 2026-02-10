import { describe, expect, test, beforeEach } from 'bun:test'
import { hasComponent, addComponent, addEntity } from 'bitecs'
import { createGameWorld, type GameWorld } from '../world'
import { knockbackSystem } from './knockback'
import { Knockback, Velocity } from '../components'

describe('knockbackSystem', () => {
  let world: GameWorld

  beforeEach(() => {
    world = createGameWorld(42)
  })

  function spawnWithKnockback(vx: number, vy: number, duration: number): number {
    const eid = addEntity(world)
    addComponent(world, Velocity, eid)
    addComponent(world, Knockback, eid)
    Velocity.x[eid] = 0
    Velocity.y[eid] = 0
    Knockback.vx[eid] = vx
    Knockback.vy[eid] = vy
    Knockback.duration[eid] = duration
    return eid
  }

  test('overrides velocity with knockback impulse', () => {
    const eid = spawnWithKnockback(100, 50, 0.15)

    knockbackSystem(world, 1 / 60)

    expect(Velocity.x[eid]).toBe(100)
    expect(Velocity.y[eid]).toBe(50)
  })

  test('decrements duration each tick', () => {
    const eid = spawnWithKnockback(100, 0, 0.15)

    knockbackSystem(world, 0.05)

    expect(Knockback.duration[eid]).toBeCloseTo(0.10)
    expect(hasComponent(world, Knockback, eid)).toBe(true)
  })

  test('removes component and zeros velocity when duration expires', () => {
    const eid = spawnWithKnockback(100, 50, 0.05)

    knockbackSystem(world, 0.1)

    expect(hasComponent(world, Knockback, eid)).toBe(false)
    expect(Velocity.x[eid]).toBe(0)
    expect(Velocity.y[eid]).toBe(0)
  })

  test('handles multiple entities independently', () => {
    const eid1 = spawnWithKnockback(100, 0, 0.15)
    const eid2 = spawnWithKnockback(-50, 30, 0.05)

    knockbackSystem(world, 0.1)

    // eid1 still has knockback
    expect(hasComponent(world, Knockback, eid1)).toBe(true)
    expect(Velocity.x[eid1]).toBe(100)

    // eid2 expired
    expect(hasComponent(world, Knockback, eid2)).toBe(false)
    expect(Velocity.x[eid2]).toBe(0)
  })
})
