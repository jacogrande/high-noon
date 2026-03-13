import { describe, it, expect } from 'bun:test'
import { createGameWorld } from './world'
import { validateWorld } from './worldValidation'

describe('validateWorld', () => {
  it('passes for a freshly created world', () => {
    const world = createGameWorld(42)
    const result = validateWorld(world)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('errors on invalid activePlayerCount', () => {
    const world = createGameWorld(42)
    world.activePlayerCount = 0
    const result = validateWorld(world)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('activePlayerCount'))).toBe(true)

    world.activePlayerCount = 10
    const result2 = validateWorld(world)
    expect(result2.valid).toBe(false)
  })

  it('errors on invalid maxProjectiles', () => {
    const world = createGameWorld(42)
    world.maxProjectiles = 0
    const result = validateWorld(world)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('maxProjectiles'))).toBe(true)
  })

  it('errors on unknown characterId', () => {
    const world = createGameWorld(42)
    ;(world as any).characterId = 'bandit'
    const result = validateWorld(world)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('bandit'))).toBe(true)
  })

  it('errors on invalid friendlyFireMode', () => {
    const world = createGameWorld(42)
    ;(world as any).friendlyFireMode = 'chaos'
    const result = validateWorld(world)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('friendlyFireMode'))).toBe(true)
  })

  it('errors on non-finite seed', () => {
    const world = createGameWorld(42)
    ;(world as any).initialSeed = Infinity
    const result = validateWorld(world)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('initialSeed'))).toBe(true)
  })
})
