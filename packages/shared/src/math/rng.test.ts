import { describe, expect, test } from 'bun:test'
import { SeededRng } from './rng'

describe('SeededRng', () => {
  test('produces values in [0, 1)', () => {
    const rng = new SeededRng(42)
    for (let i = 0; i < 1000; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  test('same seed produces identical sequence', () => {
    const a = new SeededRng(123)
    const b = new SeededRng(123)
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next())
    }
  })

  test('different seeds produce different sequences', () => {
    const a = new SeededRng(1)
    const b = new SeededRng(2)
    // At least one of the first 10 values should differ
    let allSame = true
    for (let i = 0; i < 10; i++) {
      if (a.next() !== b.next()) {
        allSame = false
        break
      }
    }
    expect(allSame).toBe(false)
  })

  test('nextInt returns integers in [0, max)', () => {
    const rng = new SeededRng(42)
    for (let i = 0; i < 500; i++) {
      const v = rng.nextInt(4)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(4)
      expect(v).toBe(Math.floor(v))
    }
  })

  test('nextRange returns values in [min, max)', () => {
    const rng = new SeededRng(42)
    for (let i = 0; i < 500; i++) {
      const v = rng.nextRange(10, 20)
      expect(v).toBeGreaterThanOrEqual(10)
      expect(v).toBeLessThan(20)
    }
  })

  test('seed of 0 works correctly', () => {
    const rng = new SeededRng(0)
    const v = rng.next()
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThan(1)
  })

  test('negative seed works correctly', () => {
    const rng = new SeededRng(-1)
    const v = rng.next()
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThan(1)
  })
})
