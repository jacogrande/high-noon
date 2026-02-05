/**
 * ScreenShake - Trauma-based screen shake using Perlin noise.
 *
 * Uses the "trauma squared" technique: small hits produce subtle shake,
 * big hits produce intense shake. Trauma decays linearly over time.
 */

import { noise1d } from './noise'

export interface ShakeOffset {
  x: number
  y: number
  angle: number
}

export interface ScreenShakeConfig {
  maxTranslation: number
  maxRotation: number
  recoveryRate: number
  frequency: number
  traumaExponent: number
}

const DEFAULT_CONFIG: ScreenShakeConfig = {
  maxTranslation: 8,
  maxRotation: 0.0524, // ~3 degrees
  recoveryRate: 1.5,
  frequency: 25,
  traumaExponent: 2,
}

// Different noise seeds per axis so they don't correlate
const SEED_X = 0
const SEED_Y = 100
const SEED_ANGLE = 200

export class ScreenShake {
  private readonly config: ScreenShakeConfig
  private trauma = 0
  private elapsed = 0
  private readonly offset: ShakeOffset = { x: 0, y: 0, angle: 0 }

  /** 0-1 accessibility multiplier for shake intensity */
  intensityScale = 1

  constructor(config?: Partial<ScreenShakeConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount)
  }

  update(realDt: number): void {
    if (this.trauma <= 0) {
      this.offset.x = 0
      this.offset.y = 0
      this.offset.angle = 0
      this.elapsed = 0
      return
    }

    this.elapsed += realDt

    const { maxTranslation, maxRotation, frequency, traumaExponent, recoveryRate } = this.config
    const intensity = Math.pow(this.trauma, traumaExponent) * this.intensityScale
    const t = this.elapsed * frequency

    this.offset.x = maxTranslation * intensity * noise1d(SEED_X + t)
    this.offset.y = maxTranslation * intensity * noise1d(SEED_Y + t)
    this.offset.angle = maxRotation * intensity * noise1d(SEED_ANGLE + t)

    this.trauma = Math.max(0, this.trauma - recoveryRate * realDt)
  }

  /** Returns pre-allocated offset object — do not store reference. */
  getOffset(): ShakeOffset {
    return this.offset
  }

  get currentTrauma(): number {
    return this.trauma
  }
}
