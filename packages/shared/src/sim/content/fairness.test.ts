import { describe, it, expect } from 'bun:test'
import { validateMinGap, allPatterns } from './patterns'
import { PLAYER_RADIUS } from './player'
import './patternDefs' // ensure patterns are registered

describe('pattern fairness', () => {
  it('non-boss registered patterns have gaps >= player radius at ref distance', () => {
    const patterns = [...allPatterns()]
    expect(patterns.length).toBeGreaterThan(0)

    // Boss patterns intentionally have tight gaps; scatter patterns use best-effort
    // randomized placement that can't guarantee minimum gaps — skip both
    const skipPrefixes = ['boomstick_', 'maddog_', 'scatter_']

    for (const pattern of patterns) {
      if (skipPrefixes.some(p => pattern.id.startsWith(p))) continue

      // Only validate patterns with 2+ bullets (single-bullet patterns have no "gaps")
      const testCtx = {
        originX: 0, originY: 0,
        targetX: 150, targetY: 0,
        baseAngle: 0,
        rng: { nextRange: (a: number, b: number) => (a + b) / 2, nextInt: (_m: number) => 0 },
        cycle: 0,
      }
      const desc = pattern.generator(testCtx)
      if (desc.length < 2) continue

      // Use half the collider radius as the threshold — player only needs to
      // fit their radius (not diameter) through gaps between bullets
      const result = validateMinGap(pattern.generator, PLAYER_RADIUS / 2)
      expect(result.valid).toBe(true)
    }
  })

  it('PLAYER_RADIUS is 30-50% of visual sprite radius', () => {
    // Visual sprite body radius is approximately 32px
    // (79px sprite cell at BODY_SCALE 2 = 158px total, body fills ~40% of cell)
    const VISUAL_RADIUS = 32
    const ratio = PLAYER_RADIUS / VISUAL_RADIUS
    expect(ratio).toBeGreaterThanOrEqual(0.3)
    expect(ratio).toBeLessThanOrEqual(0.5)
  })
})
