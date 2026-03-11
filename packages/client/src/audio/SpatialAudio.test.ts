import { describe, expect, test } from 'bun:test'
import { computeSpatial, type SpatialAudioConfig } from './SpatialAudio'

const DEFAULT: SpatialAudioConfig = { maxDistance: 800, panSpread: 360 }

describe('computeSpatial', () => {
  test('source on listener returns centered full volume', () => {
    const r = computeSpatial(100, 100, 100, 100, DEFAULT)
    expect(r.pan).toBe(0)
    expect(r.volume).toBe(1)
  })

  test('source to the right pans right with squared volume falloff', () => {
    // distance = 360, t = 1 - 360/800 = 0.55, volume = 0.55² ≈ 0.3025
    const r = computeSpatial(0, 0, 360, 0, DEFAULT)
    expect(r.pan).toBeCloseTo(1.0)
    expect(r.volume).toBeCloseTo(0.3025, 2)
  })

  test('source to the left pans left', () => {
    const r = computeSpatial(0, 0, -360, 0, DEFAULT)
    expect(r.pan).toBeCloseTo(-1.0)
    expect(r.volume).toBeCloseTo(0.3025, 2)
  })

  test('source at half distance has 0.25 volume (squared falloff)', () => {
    // distance = 400, t = 1 - 400/800 = 0.5, volume = 0.25
    const r = computeSpatial(0, 0, 0, 400, DEFAULT)
    expect(r.volume).toBeCloseTo(0.25, 2)
  })

  test('source at maxDistance is silent', () => {
    const r = computeSpatial(0, 0, 800, 0, DEFAULT)
    expect(r.volume).toBe(0)
  })

  test('source beyond maxDistance clamps to 0 volume', () => {
    const r = computeSpatial(0, 0, 1200, 0, DEFAULT)
    expect(r.volume).toBe(0)
  })

  test('source directly above has center pan', () => {
    const r = computeSpatial(0, 0, 0, -400, DEFAULT)
    expect(r.pan).toBe(0)
    expect(r.volume).toBeCloseTo(0.25, 2)
  })

  test('diagonal source uses euclidean distance', () => {
    // distance = sqrt(300² + 400²) = 500, t = 1 - 500/800 = 0.375, vol = 0.140625
    const r = computeSpatial(0, 0, 300, 400, DEFAULT)
    expect(r.pan).toBeCloseTo(300 / 360, 2)
    expect(r.volume).toBeCloseTo(0.375 * 0.375, 3)
  })

  test('pan clamps to [-1, 1] for extreme horizontal offsets', () => {
    const r1 = computeSpatial(0, 0, 1000, 0, DEFAULT)
    expect(r1.pan).toBe(1)
    const r2 = computeSpatial(0, 0, -1000, 0, DEFAULT)
    expect(r2.pan).toBe(-1)
  })

  test('each call returns a fresh object (no aliasing)', () => {
    const r1 = computeSpatial(0, 0, 100, 0, DEFAULT)
    const savedPan = r1.pan
    const r2 = computeSpatial(0, 0, -100, 0, DEFAULT)
    expect(r1.pan).toBe(savedPan)
    expect(r1).not.toBe(r2)
  })

  test('custom config overrides defaults', () => {
    const config: SpatialAudioConfig = { maxDistance: 100, panSpread: 50 }
    // distance = 50, t = 0.5, volume = 0.25
    const r = computeSpatial(0, 0, 50, 0, config)
    expect(r.pan).toBeCloseTo(1.0)
    expect(r.volume).toBeCloseTo(0.25, 2)
  })

  test('zero maxDistance returns zero volume', () => {
    const config: SpatialAudioConfig = { maxDistance: 0, panSpread: 360 }
    const r = computeSpatial(0, 0, 100, 0, config)
    expect(r.volume).toBe(0)
    expect(Number.isFinite(r.pan)).toBe(true)
  })

  test('zero panSpread returns zero pan', () => {
    const config: SpatialAudioConfig = { maxDistance: 800, panSpread: 0 }
    const r = computeSpatial(0, 0, 100, 0, config)
    expect(r.pan).toBe(0)
    expect(Number.isFinite(r.volume)).toBe(true)
  })

  test('NaN listener returns silent centered result', () => {
    const r = computeSpatial(NaN, 0, 100, 0, DEFAULT)
    expect(r.volume).toBe(0)
    expect(r.pan).toBe(0)
  })

  test('NaN source returns silent centered result', () => {
    const r = computeSpatial(0, 0, NaN, 0, DEFAULT)
    expect(r.volume).toBe(0)
    expect(r.pan).toBe(0)
  })

  test('Infinity source returns silent centered result', () => {
    const r = computeSpatial(0, 0, Infinity, 0, DEFAULT)
    expect(r.volume).toBe(0)
    expect(r.pan).toBe(0)
  })
})
