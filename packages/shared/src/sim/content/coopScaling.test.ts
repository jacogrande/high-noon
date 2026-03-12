import { describe, expect, it } from 'bun:test'
import { getCoopScalars, getPatternDensityScale, getArenaScale } from './coopScaling'

describe('getCoopScalars', () => {
  it('returns all 1.0 for single player', () => {
    const s = getCoopScalars(1)
    expect(s.enemyHpMultiplier).toBe(1.0)
    expect(s.waveBudgetMultiplier).toBe(1.0)
    expect(s.bossHpMultiplier).toBe(1.0)
    expect(s.xpMultiplier).toBe(1.0)
    expect(s.goldMultiplier).toBe(1.0)
  })

  it('returns all 1.0 for playerCount <= 0', () => {
    const s = getCoopScalars(0)
    expect(s.enemyHpMultiplier).toBe(1.0)
    expect(s.waveBudgetMultiplier).toBe(1.0)
  })

  it('scales correctly at 2 players', () => {
    const s = getCoopScalars(2)
    expect(s.enemyHpMultiplier).toBe(1.5)
    expect(s.bossHpMultiplier).toBe(1.5)
    expect(s.waveBudgetMultiplier).toBe(1.3)
    expect(s.xpMultiplier).toBe(0.65)
    expect(s.goldMultiplier).toBe(0.65)
  })

  it('scales correctly at 4 players', () => {
    const s = getCoopScalars(4)
    expect(s.enemyHpMultiplier).toBe(2.5)
    expect(s.bossHpMultiplier).toBe(2.5)
    expect(s.waveBudgetMultiplier).toBe(1.9)
    expect(s.xpMultiplier).toBe(0.4)
    expect(s.goldMultiplier).toBe(0.4)
  })

  it('scales correctly at 8 players', () => {
    const s = getCoopScalars(8)
    expect(s.enemyHpMultiplier).toBe(4.0)
    expect(s.bossHpMultiplier).toBe(4.0)
    expect(s.waveBudgetMultiplier).toBe(2.8)
    expect(s.xpMultiplier).toBe(0.25)
    expect(s.goldMultiplier).toBe(0.25)
  })

  it('interpolates between breakpoints for 3 players', () => {
    const s = getCoopScalars(3)
    // 3 is midpoint between 2 (1.5) and 4 (2.5)
    expect(s.enemyHpMultiplier).toBe(2.0)
    expect(s.bossHpMultiplier).toBe(2.0)
    // Budget: midpoint between 1.3 and 1.9 = 1.6
    expect(s.waveBudgetMultiplier).toBeCloseTo(1.6, 5)
  })

  it('interpolates between breakpoints for 6 players', () => {
    const s = getCoopScalars(6)
    // 6 is midpoint between 4 (2.5) and 8 (4.0)
    expect(s.enemyHpMultiplier).toBeCloseTo(3.25, 5)
    expect(s.bossHpMultiplier).toBeCloseTo(3.25, 5)
  })

  it('clamps to 8 players max', () => {
    const s = getCoopScalars(12)
    expect(s.enemyHpMultiplier).toBe(4.0)
    expect(s.bossHpMultiplier).toBe(4.0)
  })

  it('enemy HP multiplier is always >= 1.0', () => {
    for (let pc = 1; pc <= 8; pc++) {
      expect(getCoopScalars(pc).enemyHpMultiplier).toBeGreaterThanOrEqual(1.0)
    }
  })

  it('XP multiplier decreases as player count increases', () => {
    let prev = getCoopScalars(1).xpMultiplier
    for (let pc = 2; pc <= 8; pc++) {
      const curr = getCoopScalars(pc).xpMultiplier
      expect(curr).toBeLessThanOrEqual(prev)
      prev = curr
    }
  })
})

describe('getPatternDensityScale', () => {
  it('returns 1.0 for single player', () => {
    expect(getPatternDensityScale(1)).toBe(1.0)
  })

  it('returns sub-linear scaling for 2-4 players', () => {
    const scale2 = getPatternDensityScale(2)
    const scale3 = getPatternDensityScale(3)
    const scale4 = getPatternDensityScale(4)
    expect(scale2).toBeCloseTo(1.5, 1)
    expect(scale3).toBeGreaterThan(scale2)
    expect(scale4).toBeCloseTo(1.5 + Math.log2(4) * 0.5 - Math.log2(2) * 0.5, 1)
    // 4 players should be at most 2x (sub-linear)
    expect(scale4).toBeLessThanOrEqual(2.0)
  })
})

describe('getArenaScale', () => {
  it('returns 1.0 for single player', () => {
    expect(getArenaScale(1)).toBe(1.0)
  })

  it('scales 15% per additional player', () => {
    expect(getArenaScale(2)).toBeCloseTo(1.15, 2)
    expect(getArenaScale(4)).toBeCloseTo(1.45, 2)
  })
})
