import { describe, it, expect } from 'bun:test'
import { addEntity, addComponent } from 'bitecs'
import { createGameWorld } from './world'
import { Position, Health, Player, Enemy, EnemyAI } from './components'
import { computeQuickHash, computeStateHash } from './stateHash'

function setupWorldWithPlayer(seed = 12345) {
  const world = createGameWorld(seed)
  const eid = addEntity(world)
  addComponent(world, Player, eid)
  addComponent(world, Position, eid)
  addComponent(world, Health, eid)
  Position.x[eid] = 100
  Position.y[eid] = 200
  Health.current[eid] = 50
  Health.max[eid] = 100
  return { world, eid }
}

function setupWorldWithEnemy(seed = 12345) {
  const { world, eid: playerEid } = setupWorldWithPlayer(seed)
  const eid = addEntity(world)
  addComponent(world, Enemy, eid)
  addComponent(world, Position, eid)
  addComponent(world, Health, eid)
  addComponent(world, EnemyAI, eid)
  Position.x[eid] = 300
  Position.y[eid] = 400
  Health.current[eid] = 25
  EnemyAI.state[eid] = 1
  return { world, playerEid, enemyEid: eid }
}

describe('computeQuickHash', () => {
  it('produces same hash for same state', () => {
    const { world: w1 } = setupWorldWithPlayer(42)
    const { world: w2 } = setupWorldWithPlayer(42)
    expect(computeQuickHash(w1)).toBe(computeQuickHash(w2))
  })

  it('produces different hash when position changes', () => {
    const { world, eid } = setupWorldWithPlayer()
    const hash1 = computeQuickHash(world)
    Position.x[eid] = 999
    const hash2 = computeQuickHash(world)
    expect(hash1).not.toBe(hash2)
  })

  it('produces different hash when health changes', () => {
    const { world, eid } = setupWorldWithPlayer()
    const hash1 = computeQuickHash(world)
    Health.current[eid] = 10
    const hash2 = computeQuickHash(world)
    expect(hash1).not.toBe(hash2)
  })

  it('produces different hash when tick changes', () => {
    const { world } = setupWorldWithPlayer()
    const hash1 = computeQuickHash(world)
    world.tick = 100
    const hash2 = computeQuickHash(world)
    expect(hash1).not.toBe(hash2)
  })

  it('produces different hash when RNG advances', () => {
    const { world } = setupWorldWithPlayer()
    const hash1 = computeQuickHash(world)
    world.rng.next()
    const hash2 = computeQuickHash(world)
    expect(hash1).not.toBe(hash2)
  })
})

describe('computeStateHash', () => {
  it('returns per-subsystem hashes', () => {
    const { world } = setupWorldWithEnemy()
    const result = computeStateHash(world)
    expect(typeof result.full).toBe('number')
    expect(typeof result.positions).toBe('number')
    expect(typeof result.health).toBe('number')
    expect(typeof result.enemies).toBe('number')
    expect(typeof result.rng).toBe('number')
  })

  it('position change only affects positions hash', () => {
    const { world, playerEid } = setupWorldWithEnemy()
    const before = computeStateHash(world)
    Position.x[playerEid] = 999
    const after = computeStateHash(world)
    expect(after.positions).not.toBe(before.positions)
    expect(after.rng).toBe(before.rng) // RNG unchanged
  })

  it('enemy AI state change affects enemies hash', () => {
    const { world, enemyEid } = setupWorldWithEnemy()
    const before = computeStateHash(world)
    EnemyAI.state[enemyEid] = 3
    const after = computeStateHash(world)
    expect(after.enemies).not.toBe(before.enemies)
  })
})
