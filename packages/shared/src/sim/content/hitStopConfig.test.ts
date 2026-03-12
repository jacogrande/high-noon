import { describe, expect, test } from 'bun:test'
import { HIT_STOP_DURATION, HIT_STOP_MAX_STACK } from './hitStopConfig'

describe('hitStopConfig', () => {
  test('HIT_STOP_DURATION has all 4 intensity keys', () => {
    expect(HIT_STOP_DURATION).toHaveProperty('light')
    expect(HIT_STOP_DURATION).toHaveProperty('medium')
    expect(HIT_STOP_DURATION).toHaveProperty('heavy')
    expect(HIT_STOP_DURATION).toHaveProperty('boss_kill')
  })

  test('durations are in ascending order (light < medium < heavy < boss_kill)', () => {
    expect(HIT_STOP_DURATION.light).toBeLessThan(HIT_STOP_DURATION.medium)
    expect(HIT_STOP_DURATION.medium).toBeLessThan(HIT_STOP_DURATION.heavy)
    expect(HIT_STOP_DURATION.heavy).toBeLessThan(HIT_STOP_DURATION.boss_kill)
  })

  test('HIT_STOP_MAX_STACK is reasonable (> 0, < 1.0)', () => {
    expect(HIT_STOP_MAX_STACK).toBeGreaterThan(0)
    expect(HIT_STOP_MAX_STACK).toBeLessThan(1.0)
  })
})
