import { describe, expect, it } from 'bun:test'
import { getCoopScalars } from './coopScaling'

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
