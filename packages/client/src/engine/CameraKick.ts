/**
 * CameraKick - Directional recoil offset for weapon fire.
 *
 * When the player fires, the camera kicks opposite to the fire direction.
 * Decays exponentially, frame-rate independent.
 */

export interface CameraKickConfig {
  decay: number
  maxMagnitude: number
}

const DEFAULT_CONFIG: CameraKickConfig = {
  decay: 0.85,
  maxMagnitude: 20,
}

export class CameraKick {
  private readonly config: CameraKickConfig
  private offsetX = 0
  private offsetY = 0

  /** Accessibility toggle */
  enabled = true

  constructor(config?: Partial<CameraKickConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Apply a kick opposite to the given fire direction.
   * @param dirX - Fire direction X (normalized)
   * @param dirY - Fire direction Y (normalized)
   * @param magnitude - Kick strength in pixels
   */
  kick(dirX: number, dirY: number, magnitude: number): void {
    if (!this.enabled) return

    // Kick opposite to fire direction
    this.offsetX -= dirX * magnitude
    this.offsetY -= dirY * magnitude

    // Clamp accumulated magnitude
    const mag = Math.sqrt(this.offsetX * this.offsetX + this.offsetY * this.offsetY)
    if (mag > this.config.maxMagnitude) {
      const scale = this.config.maxMagnitude / mag
      this.offsetX *= scale
      this.offsetY *= scale
    }
  }

  update(realDt: number): void {
    // Frame-rate independent decay: decay^(dt * 60) at 60fps baseline
    const factor = Math.pow(this.config.decay, realDt * 60)
    this.offsetX *= factor
    this.offsetY *= factor

    // Zero out tiny values
    if (Math.abs(this.offsetX) < 0.01) this.offsetX = 0
    if (Math.abs(this.offsetY) < 0.01) this.offsetY = 0
  }

  getOffsetX(): number {
    return this.offsetX
  }

  getOffsetY(): number {
    return this.offsetY
  }
}
