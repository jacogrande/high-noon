import { describe, it, expect } from 'bun:test'
import {
  createSafespotDetector, updateSafespotDetector,
  createEnrageState, getEnrageProgress, getEnrageDensityMul, getEnrageSpeedMul,
  createVulnerabilityState, tickVulnerability,
  getStandardDesiredPhase,
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

describe('tickVulnerability', () => {
  it('does nothing when not vulnerable', () => {
    const vuln = createVulnerabilityState()
    tickVulnerability(vuln, 1.0)
    expect(vuln.vulnerable).toBe(false)
    expect(vuln.timer).toBe(0)
  })

  it('decrements timer while vulnerable', () => {
    const vuln = createVulnerabilityState()
    vuln.vulnerable = true
    vuln.timer = 1.0
    tickVulnerability(vuln, 0.3)
    expect(vuln.vulnerable).toBe(true)
    expect(vuln.timer).toBeCloseTo(0.7, 5)
  })

  it('clears vulnerability when timer expires', () => {
    const vuln = createVulnerabilityState()
    vuln.vulnerable = true
    vuln.timer = 0.5
    tickVulnerability(vuln, 0.6)
    expect(vuln.vulnerable).toBe(false)
    expect(vuln.timer).toBe(0)
  })
})

describe('getStandardDesiredPhase', () => {
  it('returns 1 for high HP', () => {
    expect(getStandardDesiredPhase(1.0)).toBe(1)
    expect(getStandardDesiredPhase(0.71)).toBe(1)
  })

  it('returns 2 at 70% threshold', () => {
    expect(getStandardDesiredPhase(0.70)).toBe(2)
    expect(getStandardDesiredPhase(0.50)).toBe(2)
  })

  it('returns 3 at 35% threshold', () => {
    expect(getStandardDesiredPhase(0.35)).toBe(3)
    expect(getStandardDesiredPhase(0.10)).toBe(3)
  })
})
