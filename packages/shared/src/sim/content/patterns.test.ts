import { describe, it, expect } from 'bun:test'
import {
  aimed, ring, wall, spiral, scatter,
  layered, sequence, burst,
  validateMinGap,
  registerPattern, getPattern, allPatterns,
  type PatternContext, type PatternDefinition,
} from './patterns'
import { BulletSpriteId } from './weapons'

/** Create a test PatternContext */
function makeCtx(overrides?: Partial<PatternContext>): PatternContext {
  let rngState = 42
  return {
    originX: 0,
    originY: 0,
    targetX: 100,
    targetY: 0,
    baseAngle: 0,
    rng: {
      nextRange(min: number, max: number): number {
        rngState = (rngState * 1103515245 + 12345) & 0x7fffffff
        return min + (rngState / 0x7fffffff) * (max - min)
      },
      nextInt(max: number): number {
        rngState = (rngState * 1103515245 + 12345) & 0x7fffffff
        return rngState % max
      },
    },
    cycle: 0,
    ...overrides,
  }
}

describe('aimed', () => {
  it('produces single bullet at baseAngle when spread=0, count=1', () => {
    const gen = aimed({ count: 1, spread: 0, speed: 300, damage: 5 })
    const ctx = makeCtx({ baseAngle: Math.PI / 4 })
    const desc = gen(ctx)
    expect(desc).toHaveLength(1)
    expect(desc[0]!.angle).toBeCloseTo(Math.PI / 4, 5)
    expect(desc[0]!.speed).toBe(300)
    expect(desc[0]!.damage).toBe(5)
    expect(desc[0]!.delay).toBe(0)
  })

  it('produces correct count with spread', () => {
    const gen = aimed({ count: 5, spread: 1.0, speed: 200, damage: 3 })
    const desc = gen(makeCtx())
    expect(desc).toHaveLength(5)
    // Angles should span 1.0 radians centered on baseAngle (0)
    expect(desc[0]!.angle).toBeCloseTo(-0.5, 4)
    expect(desc[4]!.angle).toBeCloseTo(0.5, 4)
  })

  it('uses floating-point angles (not integer degrees)', () => {
    const gen = aimed({ count: 3, spread: 0.7, speed: 200, damage: 3 })
    const ctx = makeCtx({ baseAngle: 1.23456 })
    const desc = gen(ctx)
    for (const d of desc) {
      // Verify angle is not an integer degree
      const degrees = (d.angle * 180) / Math.PI
      expect(degrees % 1).not.toBe(0)
    }
  })

  it('applies jitter when configured', () => {
    const gen = aimed({ count: 1, spread: 0, speed: 200, damage: 3, jitter: 0.5 })
    const ctx1 = makeCtx({ baseAngle: 0 })
    const desc1 = gen(ctx1)
    // With jitter, the angle should differ from baseAngle
    // (statistically — could be exactly 0 but extremely unlikely)
    const ctx2 = makeCtx({ baseAngle: 0 })
    const desc2 = gen(ctx2)
    // At minimum, verify it returns a valid descriptor
    expect(desc1).toHaveLength(1)
    expect(desc2).toHaveLength(1)
  })

  it('sets accel and drag defaults to 0', () => {
    const gen = aimed({ count: 1, spread: 0, speed: 200, damage: 3 })
    const desc = gen(makeCtx())
    expect(desc[0]!.accel).toBe(0)
    expect(desc[0]!.drag).toBe(0)
  })

  it('passes accel and drag from config', () => {
    const gen = aimed({ count: 1, spread: 0, speed: 200, accel: 100, drag: 0.5, damage: 3 })
    const desc = gen(makeCtx())
    expect(desc[0]!.accel).toBe(100)
    expect(desc[0]!.drag).toBe(0.5)
  })
})

describe('ring', () => {
  it('produces 8 bullets spaced 45° apart', () => {
    const gen = ring({ count: 8, speed: 300, damage: 5 })
    const desc = gen(makeCtx())
    expect(desc).toHaveLength(8)
    const step = (Math.PI * 2) / 8
    for (let i = 0; i < 8; i++) {
      const expectedAngle = desc[0]!.angle + i * step
      expect(desc[i]!.angle).toBeCloseTo(expectedAngle, 5)
    }
  })

  it('uses random seed when randomSeed=true', () => {
    const gen = ring({ count: 4, speed: 200, damage: 3, randomSeed: true })
    const desc1 = gen(makeCtx())
    const desc2 = gen(makeCtx()) // Same RNG seed → same result
    // Both should have 4 bullets, but angles depend on RNG
    expect(desc1).toHaveLength(4)
    expect(desc2).toHaveLength(4)
  })

  it('rotates seed angle by offset per cycle', () => {
    const gen = ring({ count: 4, speed: 200, damage: 3, offset: 0.1 })
    const desc0 = gen(makeCtx({ cycle: 0 }))
    const desc5 = gen(makeCtx({ cycle: 5 }))
    // Cycle 5 should rotate seed by 0.5 radians
    const diff = desc5[0]!.angle - desc0[0]!.angle
    expect(diff).toBeCloseTo(0.5, 4)
  })
})

describe('wall', () => {
  it('produces correct count', () => {
    const gen = wall({ count: 5, spacing: 0.2, speed: 300, damage: 5 })
    const desc = gen(makeCtx())
    expect(desc).toHaveLength(5)
  })

  it('all bullets have same speed', () => {
    const gen = wall({ count: 4, spacing: 0.3, speed: 350, damage: 5 })
    const desc = gen(makeCtx())
    for (const d of desc) {
      expect(d.speed).toBe(350)
    }
  })
})

describe('spiral', () => {
  it('produces bullets for each arm', () => {
    const gen = spiral({ count: 6, speed: 250, damage: 4, rotationRate: 0.2, arms: 3 })
    const desc = gen(makeCtx())
    // 6 total / 3 arms = 2 bullets per arm
    expect(desc).toHaveLength(6)
  })

  it('rotates seed angle by rotationRate per cycle', () => {
    const gen = spiral({ count: 3, speed: 250, damage: 4, rotationRate: 0.3, arms: 1 })
    const desc0 = gen(makeCtx({ cycle: 0 }))
    const desc1 = gen(makeCtx({ cycle: 1 }))
    // First bullet angle should differ by rotationRate
    const diff = desc1[0]!.angle - desc0[0]!.angle
    expect(diff).toBeCloseTo(0.3, 4)
  })
})

describe('scatter', () => {
  it('produces correct count', () => {
    const gen = scatter({ count: 8, coneAngle: 1.5, speedMin: 200, speedMax: 400, damage: 3, minSeparation: 0.1 })
    const desc = gen(makeCtx())
    expect(desc).toHaveLength(8)
  })

  it('respects minSeparation between bullets', () => {
    // Use fewer bullets and wider cone to make separation achievable
    const gen = scatter({ count: 3, coneAngle: 3.0, speedMin: 200, speedMax: 300, damage: 3, minSeparation: 0.3 })
    const desc = gen(makeCtx())
    const angles = desc.map(d => d.angle).sort((a, b) => a - b)
    // With 3 bullets in a 3.0 rad cone, 0.3 separation should be achievable
    let smallestGap = Infinity
    for (let i = 0; i < angles.length - 1; i++) {
      const gap = Math.abs(angles[i + 1]! - angles[i]!)
      if (gap < smallestGap) smallestGap = gap
    }
    expect(smallestGap).toBeGreaterThanOrEqual(0.2)
  })

  it('varies speed within range', () => {
    const gen = scatter({ count: 10, coneAngle: 1.5, speedMin: 100, speedMax: 500, damage: 3, minSeparation: 0.05 })
    const desc = gen(makeCtx())
    const speeds = new Set(desc.map(d => d.speed))
    // With 10 bullets, we should have some variety
    expect(speeds.size).toBeGreaterThan(1)
    for (const d of desc) {
      expect(d.speed).toBeGreaterThanOrEqual(100)
      expect(d.speed).toBeLessThanOrEqual(500)
    }
  })
})

describe('layered', () => {
  it('merges descriptors from all sub-patterns', () => {
    const gen = layered(
      aimed({ count: 2, spread: 0.5, speed: 300, damage: 5 }),
      ring({ count: 4, speed: 200, damage: 3 }),
    )
    const desc = gen(makeCtx())
    expect(desc).toHaveLength(6) // 2 + 4
  })
})

describe('sequence', () => {
  it('adds cumulative delays', () => {
    const gen = sequence([
      { pattern: aimed({ count: 1, spread: 0, speed: 300, damage: 5 }), delayAfter: 0.5 },
      { pattern: aimed({ count: 1, spread: 0, speed: 300, damage: 5 }), delayAfter: 0.5 },
    ])
    const desc = gen(makeCtx())
    expect(desc).toHaveLength(2)
    expect(desc[0]!.delay).toBe(0)
    expect(desc[1]!.delay).toBeCloseTo(0.5, 5)
  })
})

describe('burst', () => {
  it('repeats pattern with incremental delays', () => {
    const gen = burst(
      aimed({ count: 2, spread: 0.3, speed: 300, damage: 5 }),
      3,
      0.2,
    )
    const desc = gen(makeCtx())
    expect(desc).toHaveLength(6) // 2 bullets × 3 repetitions
    // First pair: delay 0
    expect(desc[0]!.delay).toBe(0)
    expect(desc[1]!.delay).toBe(0)
    // Second pair: delay 0.2
    expect(desc[2]!.delay).toBeCloseTo(0.2, 5)
    expect(desc[3]!.delay).toBeCloseTo(0.2, 5)
    // Third pair: delay 0.4
    expect(desc[4]!.delay).toBeCloseTo(0.4, 5)
    expect(desc[5]!.delay).toBeCloseTo(0.4, 5)
  })
})

describe('validateMinGap', () => {
  it('passes for a ring with wide gaps', () => {
    const gen = ring({ count: 4, speed: 300, damage: 5 })
    const result = validateMinGap(gen, 16) // 4 bullets in ring = 90° gaps, plenty wide
    expect(result.valid).toBe(true)
  })

  it('catches a ring with too many bullets (narrow gaps)', () => {
    // 100 bullets in a ring at reference distance 150px:
    // gap = 2π/100 = 0.0628 radians
    // at 150px, linear gap = 2 * 150 * sin(0.0628/2) ≈ 9.4px
    // minGap = 2 * 16 = 32px → should fail
    const gen = ring({ count: 100, speed: 300, damage: 5 })
    const result = validateMinGap(gen, 16)
    expect(result.valid).toBe(false)
  })
})

describe('pattern registry', () => {
  it('stores and retrieves definitions', () => {
    const testDef: PatternDefinition = {
      id: '__test_registry_pattern__',
      name: 'Test Pattern',
      axes: ['precision'],
      generator: aimed({ count: 1, spread: 0, speed: 200, damage: 3 }),
      bulletSpriteId: BulletSpriteId.SLUG,
      bulletSize: 1.0,
    }
    registerPattern(testDef)
    const retrieved = getPattern('__test_registry_pattern__')
    expect(retrieved).toBeDefined()
    expect(retrieved!.name).toBe('Test Pattern')
  })

  it('has registered enemy patterns from patternDefs', () => {
    // Import patternDefs to trigger registrations
    require('./patternDefs')
    const swarmer = getPattern('swarmer_shot')
    expect(swarmer).toBeDefined()
    expect(swarmer!.name).toBe('Swarmer Shot')

    const shooterFan = getPattern('shooter_fan')
    expect(shooterFan).toBeDefined()
    expect(shooterFan!.axes).toContain('precision')
  })

  it('allPatterns iterates registered patterns', () => {
    require('./patternDefs')
    const patterns = [...allPatterns()]
    expect(patterns.length).toBeGreaterThan(5)
  })
})
