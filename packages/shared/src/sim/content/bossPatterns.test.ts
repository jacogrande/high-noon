import { describe, it, expect } from 'bun:test'
import {
  createSafespotDetector, updateSafespotDetector,
  createEnrageState, getEnrageProgress, getEnrageDensityMul, getEnrageSpeedMul,
  VULNERABILITY_DAMAGE_MUL,
} from './bossPatterns'

describe('SafespotDetector', () => {
  it('does not trigger before threshold', () => {
    const det = createSafespotDetector()
    updateSafespotDetector(det, 100, 100, 1.0)
    updateSafespotDetector(det, 100, 100, 1.0)
    expect(det.triggered).toBe(false)
  })

  it('triggers after 2.5s of camping', () => {
    const det = createSafespotDetector()
    det.lastPlayerX = 100
    det.lastPlayerY = 100
    for (let i = 0; i < 30; i++) {
      updateSafespotDetector(det, 100, 100, 0.1)
    }
    expect(det.triggered).toBe(true)
  })

  it('resets when player moves significantly', () => {
    const det = createSafespotDetector()
    det.lastPlayerX = 100
    det.lastPlayerY = 100
    det.stationaryTime = 2.0
    updateSafespotDetector(det, 200, 200, 0.1) // big move
    expect(det.stationaryTime).toBe(0)
    expect(det.triggered).toBe(false)
  })
})

describe('EnrageState', () => {
  it('starts at 0 progress', () => {
    const state = createEnrageState(300)
    expect(getEnrageProgress(state)).toBe(0)
  })

  it('reaches 1.0 at enrage target', () => {
    const state = createEnrageState(300)
    state.fightDuration = 300
    expect(getEnrageProgress(state)).toBe(1.0)
  })

  it('caps at 1.0 past target', () => {
    const state = createEnrageState(300)
    state.fightDuration = 600
    expect(getEnrageProgress(state)).toBe(1.0)
  })

  it('density multiplier scales to 1.5x', () => {
    const state = createEnrageState(300)
    state.fightDuration = 300
    expect(getEnrageDensityMul(state)).toBeCloseTo(1.5, 2)
  })

  it('speed multiplier scales to 1.3x', () => {
    const state = createEnrageState(300)
    state.fightDuration = 300
    expect(getEnrageSpeedMul(state)).toBeCloseTo(1.3, 2)
  })

  it('VULNERABILITY_DAMAGE_MUL is 1.5', () => {
    expect(VULNERABILITY_DAMAGE_MUL).toBe(1.5)
  })
})
