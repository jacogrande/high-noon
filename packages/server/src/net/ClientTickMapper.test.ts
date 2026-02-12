import { describe, expect, test } from 'bun:test'
import { ClientTickMapper } from './ClientTickMapper'

describe('ClientTickMapper', () => {
  test('initializes offset from first observed sample', () => {
    const mapper = new ClientTickMapper()
    mapper.updateOffset(1000, 995)

    expect(mapper.hasEstimate()).toBe(true)
    expect(mapper.getEstimatedOffsetTicks()).toBe(5)
    expect(mapper.estimateServerTick(1000)).toBe(1005)
  })

  test('smooths small offset jitter instead of snapping', () => {
    const mapper = new ClientTickMapper()
    mapper.updateOffset(500, 495) // +5
    mapper.updateOffset(560, 554) // +6

    const offset = mapper.getEstimatedOffsetTicks()
    expect(offset).toBeGreaterThan(5)
    expect(offset).toBeLessThan(6)
  })

  test('snaps on very large offset jumps', () => {
    const mapper = new ClientTickMapper()
    mapper.updateOffset(200, 195) // +5
    mapper.updateOffset(260, 230) // +30

    expect(mapper.getEstimatedOffsetTicks()).toBe(30)
  })

  test('clampRewindTick enforces [now-max, now] window', () => {
    const mapper = new ClientTickMapper()
    expect(mapper.clampRewindTick(100, 120, 7)).toEqual({ tick: 100, clamped: true })
    expect(mapper.clampRewindTick(100, 80, 7)).toEqual({ tick: 93, clamped: true })
    expect(mapper.clampRewindTick(100, 97, 7)).toEqual({ tick: 97, clamped: false })
  })
})
