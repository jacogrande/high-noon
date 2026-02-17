import { describe, it, expect } from 'bun:test'
import { RollingHistogram } from './RollingHistogram'

describe('RollingHistogram', () => {
  it('returns 0 for all stats when empty', () => {
    const h = new RollingHistogram()
    expect(h.count).toBe(0)
    expect(h.mean()).toBe(0)
    expect(h.min()).toBe(0)
    expect(h.max()).toBe(0)
    expect(h.percentile(0.5)).toBe(0)
    expect(h.stddev()).toBe(0)
  })

  it('computes mean correctly', () => {
    const h = new RollingHistogram(10)
    h.push(10)
    h.push(20)
    h.push(30)
    expect(h.mean()).toBe(20)
    expect(h.count).toBe(3)
  })

  it('computes min and max', () => {
    const h = new RollingHistogram(10)
    h.push(5)
    h.push(15)
    h.push(10)
    expect(h.min()).toBe(5)
    expect(h.max()).toBe(15)
  })

  it('computes percentile for sorted data', () => {
    const h = new RollingHistogram(100)
    for (let i = 1; i <= 100; i++) h.push(i)
    expect(h.percentile(0.5)).toBe(51) // Math.round(99 * 0.5) = 50, sorted[50] = 51
    expect(h.percentile(0)).toBe(1)
    expect(h.percentile(1)).toBe(100)
  })

  it('evicts old values when window is full', () => {
    const h = new RollingHistogram(3)
    h.push(10)
    h.push(20)
    h.push(30)
    expect(h.count).toBe(3)
    expect(h.mean()).toBe(20)

    h.push(40) // evicts 10
    expect(h.count).toBe(3)
    expect(h.mean()).toBe(30)
    expect(h.min()).toBe(20)
  })

  it('computes stddev', () => {
    const h = new RollingHistogram(10)
    h.push(2)
    h.push(4)
    h.push(4)
    h.push(4)
    h.push(5)
    h.push(5)
    h.push(7)
    h.push(9)
    // Mean = 5, stddev = 2
    expect(h.stddev()).toBeCloseTo(2, 0)
  })

  it('handles single value', () => {
    const h = new RollingHistogram(5)
    h.push(42)
    expect(h.count).toBe(1)
    expect(h.mean()).toBe(42)
    expect(h.min()).toBe(42)
    expect(h.max()).toBe(42)
    expect(h.percentile(0.5)).toBe(42)
    expect(h.stddev()).toBe(0) // need at least 2 for meaningful stddev
  })
})
