import { describe, it, expect } from 'bun:test'
import { getBossAimedTarget } from './bossTargeting'
import { createGameWorld } from '../world'

describe('getBossAimedTarget', () => {
  it('returns -1 when no players', () => {
    const world = createGameWorld(42)
    const target = getBossAimedTarget(world, 0)
    expect(target).toBe(-1)
  })
})
