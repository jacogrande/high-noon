/**
 * Bullet Pattern System
 *
 * Composable pattern generators that produce arrays of bullet spawn descriptors.
 * Each primitive (aimed, ring, wall, spiral, scatter) is a factory that returns
 * a PatternGenerator function. Patterns compose via layered(), sequence(), burst().
 *
 * All angles are floating-point radians (1,500+ possible directions).
 * All game logic — lives in packages/shared.
 */

import type { BulletSpriteIdValue } from './weapons'

// ============================================================================
// Core Types
// ============================================================================

/** Output of a pattern generator — describes one bullet to spawn */
export interface BulletSpawnDescriptor {
  /** Angle in radians (float, not integer degrees) */
  angle: number
  /** Speed in px/s */
  speed: number
  /** Acceleration px/s² (0 = constant speed) */
  accel: number
  /** Drag coefficient (0 = no drag) */
  drag: number
  /** Damage per hit */
  damage: number
  /** Delay before spawning in seconds (0 = immediate, enables staggered bursts) */
  delay: number
}

/** Context passed to every pattern generator */
export interface PatternContext {
  /** Origin position */
  originX: number
  originY: number
  /** Target position (for aimed patterns) */
  targetX: number
  targetY: number
  /** Angle from origin to target (pre-computed) */
  baseAngle: number
  /** World RNG for deterministic randomness */
  rng: { nextRange(min: number, max: number): number; nextInt(max: number): number }
  /** Current attack cycle count (for rotating seed angles) */
  cycle: number
}

/** A pattern generator takes context and returns spawn descriptors */
export type PatternGenerator = (ctx: PatternContext) => BulletSpawnDescriptor[]

// ============================================================================
// Registry Types
// ============================================================================

/** Difficulty axes for encounter design */
export type DifficultyAxis = 'precision' | 'reading' | 'multitasking' | 'planning'

/** A named, registered pattern definition */
export interface PatternDefinition {
  /** Unique pattern ID for registry lookup */
  id: string
  /** Human-readable name */
  name: string
  /** Difficulty axis tags for encounter design */
  axes: DifficultyAxis[]
  /** The pattern generator */
  generator: PatternGenerator
  /** Bullet visual config */
  bulletSpriteId: BulletSpriteIdValue
  /** Bullet collision size multiplier */
  bulletSize: number
}

// ============================================================================
// Pattern Registry
// ============================================================================

const patternRegistry = new Map<string, PatternDefinition>()

/** Register a pattern definition. Idempotent — skips if id already registered. */
export function registerPattern(def: PatternDefinition): void {
  if (patternRegistry.has(def.id)) return
  patternRegistry.set(def.id, def)
}

/** Look up a pattern definition by id. */
export function getPattern(id: string): PatternDefinition | undefined {
  return patternRegistry.get(id)
}

/** Iterate all registered pattern definitions. */
export function allPatterns(): Iterable<PatternDefinition> {
  return patternRegistry.values()
}

// ============================================================================
// Pattern Primitives
// ============================================================================

export interface AimedConfig {
  count: number           // bullets per volley
  spread: number          // total spread angle in radians (0 = single shot)
  speed: number
  accel?: number
  drag?: number
  damage: number
  jitter?: number         // random angle offset range in radians
}

/** Single or multi-shot aimed at target */
export function aimed(config: AimedConfig): PatternGenerator {
  const { count, spread, speed, accel = 0, drag = 0, damage, jitter = 0 } = config
  return (ctx: PatternContext): BulletSpawnDescriptor[] => {
    const result: BulletSpawnDescriptor[] = []
    const base = ctx.baseAngle + (jitter !== 0 ? ctx.rng.nextRange(-jitter, jitter) : 0)
    for (let i = 0; i < count; i++) {
      let angle: number
      if (count === 1) {
        angle = base
      } else {
        angle = base + spread * (i / (count - 1) - 0.5)
      }
      result.push({ angle, speed, accel, drag, damage, delay: 0 })
    }
    return result
  }
}

export interface RingConfig {
  count: number           // bullets in ring
  speed: number
  accel?: number
  drag?: number
  damage: number
  seedAngle?: number      // fixed seed angle (if undefined, uses baseAngle)
  randomSeed?: boolean    // if true, randomize seed angle each fire
  offset?: number         // per-cycle rotation in radians (for spirals via repeated rings)
}

/** N bullets equally spaced around a circle */
export function ring(config: RingConfig): PatternGenerator {
  const { count, speed, accel = 0, drag = 0, damage, seedAngle, randomSeed = false, offset = 0 } = config
  return (ctx: PatternContext): BulletSpawnDescriptor[] => {
    const result: BulletSpawnDescriptor[] = []
    let seed: number
    if (randomSeed) {
      seed = ctx.rng.nextRange(0, Math.PI * 2)
    } else if (seedAngle !== undefined) {
      seed = seedAngle
    } else {
      seed = ctx.baseAngle
    }
    seed += offset * ctx.cycle
    const step = (Math.PI * 2) / count
    for (let i = 0; i < count; i++) {
      const angle = seed + i * step
      result.push({ angle, speed, accel, drag, damage, delay: 0 })
    }
    return result
  }
}

export interface WallConfig {
  count: number
  spacing: number         // angular spacing in radians between bullets
  speed: number
  accel?: number
  drag?: number
  damage: number
  perpendicular?: boolean // true = wall perpendicular to aim (default true)
}

/** Linear wall of bullets perpendicular (or parallel) to aim direction */
export function wall(config: WallConfig): PatternGenerator {
  const { count, spacing, speed, accel = 0, drag = 0, damage, perpendicular = true } = config
  return (ctx: PatternContext): BulletSpawnDescriptor[] => {
    const result: BulletSpawnDescriptor[] = []
    const wallDir = perpendicular ? ctx.baseAngle + Math.PI / 2 : ctx.baseAngle
    const totalSpread = spacing * (count - 1)
    const startAngle = wallDir - totalSpread / 2
    for (let i = 0; i < count; i++) {
      // All bullets travel in the aim direction, but start offset along the wall line
      // For a wall pattern, angle = aim direction (all bullets go toward player)
      const angle = ctx.baseAngle
      // The "wall" effect is achieved by offsetting spawn positions, but since
      // BulletSpawnDescriptor only has angle/speed, we approximate with angular offset
      const wallAngle = startAngle + spacing * i
      // Use the wall angle as the actual bullet direction to create a spread wall
      result.push({ angle: wallAngle, speed, accel, drag, damage, delay: 0 })
    }
    return result
  }
}

export interface SpiralConfig {
  count: number           // bullets per emission
  speed: number
  accel?: number
  drag?: number
  damage: number
  rotationRate: number    // radians per emission cycle
  arms: number            // number of spiral arms (1-4 typical)
}

/** Spiral: ring with rotating seed angle over time */
export function spiral(config: SpiralConfig): PatternGenerator {
  const { count, speed, accel = 0, drag = 0, damage, rotationRate, arms } = config
  return (ctx: PatternContext): BulletSpawnDescriptor[] => {
    const result: BulletSpawnDescriptor[] = []
    const seed = ctx.baseAngle + rotationRate * ctx.cycle
    const bulletsPerArm = Math.max(1, Math.floor(count / arms))
    const armStep = (Math.PI * 2) / arms
    for (let arm = 0; arm < arms; arm++) {
      for (let i = 0; i < bulletsPerArm; i++) {
        const angle = seed + arm * armStep + i * (armStep / bulletsPerArm)
        result.push({ angle, speed, accel, drag, damage, delay: 0 })
      }
    }
    return result
  }
}

export interface ScatterConfig {
  count: number
  coneAngle: number       // total cone width in radians
  speedMin: number
  speedMax: number
  accel?: number
  drag?: number
  damage: number
  minSeparation: number   // minimum angle between any two bullets (prevents clusters)
}

/** Controlled random scatter within a cone */
export function scatter(config: ScatterConfig): PatternGenerator {
  const { count, coneAngle, speedMin, speedMax, accel = 0, drag = 0, damage, minSeparation } = config
  return (ctx: PatternContext): BulletSpawnDescriptor[] => {
    const result: BulletSpawnDescriptor[] = []
    const halfCone = coneAngle / 2
    const angles: number[] = []

    for (let i = 0; i < count; i++) {
      let angle: number
      let attempts = 0
      do {
        angle = ctx.baseAngle + ctx.rng.nextRange(-halfCone, halfCone)
        attempts++
      } while (attempts < 20 && angles.some(a => Math.abs(normalizeAngle(angle - a)) < minSeparation))
      angles.push(angle)
      const bulletSpeed = ctx.rng.nextRange(speedMin, speedMax)
      result.push({ angle, speed: bulletSpeed, accel, drag, damage, delay: 0 })
    }
    return result
  }
}

// ============================================================================
// Pattern Composition
// ============================================================================

/** Fire multiple patterns simultaneously */
export function layered(...patterns: PatternGenerator[]): PatternGenerator {
  return (ctx: PatternContext): BulletSpawnDescriptor[] => {
    const result: BulletSpawnDescriptor[] = []
    for (const pattern of patterns) {
      const descriptors = pattern(ctx)
      for (let i = 0; i < descriptors.length; i++) {
        result.push(descriptors[i]!)
      }
    }
    return result
  }
}

/** Fire patterns in sequence with delays between them */
export function sequence(
  patterns: { pattern: PatternGenerator; delayAfter: number }[],
): PatternGenerator {
  return (ctx: PatternContext): BulletSpawnDescriptor[] => {
    const result: BulletSpawnDescriptor[] = []
    let cumulativeDelay = 0
    for (const entry of patterns) {
      const descriptors = entry.pattern(ctx)
      for (const desc of descriptors) {
        result.push({ ...desc, delay: desc.delay + cumulativeDelay })
      }
      cumulativeDelay += entry.delayAfter
    }
    return result
  }
}

/** Repeat a pattern N times with delay between emissions */
export function burst(
  pattern: PatternGenerator,
  count: number,
  interval: number,
): PatternGenerator {
  return (ctx: PatternContext): BulletSpawnDescriptor[] => {
    const result: BulletSpawnDescriptor[] = []
    for (let i = 0; i < count; i++) {
      const descriptors = pattern(ctx)
      const delay = i * interval
      for (const desc of descriptors) {
        result.push({ ...desc, delay: desc.delay + delay })
      }
    }
    return result
  }
}

// ============================================================================
// Gap Width Validation
// ============================================================================

/**
 * Validates that a pattern's generated bullets never create angular gaps
 * narrower than 2x the player collider radius at a reference distance.
 *
 * Used in content definition tests, not at runtime.
 *
 * @param pattern - The pattern generator to validate
 * @param playerColliderRadius - Player collider radius in px
 * @param sampleCount - Number of random contexts to test (default 100)
 * @param referenceDistance - Distance from origin to measure gaps (default 150)
 */
export function validateMinGap(
  pattern: PatternGenerator,
  playerColliderRadius: number,
  sampleCount = 100,
  referenceDistance = 150,
): { valid: boolean; narrowestGap: number; context?: PatternContext } {
  const minGapWidth = playerColliderRadius * 2
  // Convert linear gap at reference distance to angular gap
  const minAngularGap = 2 * Math.atan2(minGapWidth / 2, referenceDistance)

  let narrowestGap = Infinity
  let worstCtx: PatternContext | null = null

  // Simple deterministic RNG for validation
  let rngState = 12345
  const testRng = {
    nextRange(min: number, max: number): number {
      rngState = (rngState * 1103515245 + 12345) & 0x7fffffff
      return min + (rngState / 0x7fffffff) * (max - min)
    },
    nextInt(max: number): number {
      rngState = (rngState * 1103515245 + 12345) & 0x7fffffff
      return rngState % max
    },
  }

  for (let s = 0; s < sampleCount; s++) {
    const baseAngle = testRng.nextRange(0, Math.PI * 2)
    const ctx: PatternContext = {
      originX: 0,
      originY: 0,
      targetX: Math.cos(baseAngle) * referenceDistance,
      targetY: Math.sin(baseAngle) * referenceDistance,
      baseAngle,
      rng: testRng,
      cycle: s % 10,
    }

    const descriptors = pattern(ctx)
    if (descriptors.length < 2) continue

    // Sort by angle, find smallest gap
    const angles = descriptors.map(d => normalizeAngle(d.angle)).sort((a, b) => a - b)
    for (let i = 0; i < angles.length; i++) {
      const next = (i + 1) % angles.length
      let gap: number
      if (next === 0) {
        // Wraparound gap
        gap = (Math.PI * 2) - angles[angles.length - 1]! + angles[0]!
      } else {
        gap = angles[next]! - angles[i]!
      }
      if (gap < narrowestGap) {
        narrowestGap = gap
        worstCtx = ctx
      }
    }
  }

  return {
    valid: narrowestGap >= minAngularGap,
    narrowestGap,
    ...(worstCtx != null ? { context: worstCtx } : {}),
  }
}

// ============================================================================
// Helpers
// ============================================================================

/** Normalize angle to [0, 2π) */
function normalizeAngle(a: number): number {
  const TWO_PI = Math.PI * 2
  let result = a % TWO_PI
  if (result < 0) result += TWO_PI
  return result
}
