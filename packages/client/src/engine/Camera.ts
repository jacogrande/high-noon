/**
 * Camera - Aim-offset follow camera with smoothing, bounds clamping,
 * screen shake, and camera kick.
 *
 * The camera tracks the player with an offset toward the cursor,
 * providing "look-ahead" that makes aiming feel responsive.
 */

import { ScreenShake, type ScreenShakeConfig } from './ScreenShake'
import { CameraKick, type CameraKickConfig } from './CameraKick'

export interface CameraConfig {
  aimWeight: number
  maxAimOffset: number
  smoothingLambda: number
  shake?: Partial<ScreenShakeConfig>
  kick?: Partial<CameraKickConfig>
}

export interface CameraBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface CameraRenderState {
  x: number
  y: number
  angle: number
}

const DEFAULT_CONFIG: CameraConfig = {
  aimWeight: 0.2,
  maxAimOffset: 120,
  smoothingLambda: 12,
}

export class Camera {
  readonly shake: ScreenShake
  readonly kick: CameraKick

  private readonly config: CameraConfig

  // Current and previous position (for interpolation)
  private x = 0
  private y = 0
  private prevX = 0
  private prevY = 0

  // Viewport dimensions
  private viewportW = 0
  private viewportH = 0

  // Optional world bounds
  private bounds: CameraBounds | null = null

  // Pre-allocated return object
  private readonly renderState: CameraRenderState = { x: 0, y: 0, angle: 0 }

  constructor(config?: Partial<CameraConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.shake = new ScreenShake(this.config.shake)
    this.kick = new CameraKick(this.config.kick)
  }

  setViewport(width: number, height: number): void {
    this.viewportW = width
    this.viewportH = height
  }

  setBounds(bounds: CameraBounds): void {
    this.bounds = bounds
  }

  /** Instantly move camera without smoothing (for init/scene transitions). */
  snapTo(x: number, y: number): void {
    this.x = x
    this.y = y
    this.prevX = x
    this.prevY = y
  }

  /**
   * Update camera target position. Called once per sim tick (60Hz).
   *
   * @param playerX - Player world X
   * @param playerY - Player world Y
   * @param cursorWorldX - Cursor world X
   * @param cursorWorldY - Cursor world Y
   * @param dt - Fixed timestep in seconds
   */
  update(
    playerX: number,
    playerY: number,
    cursorWorldX: number,
    cursorWorldY: number,
    dt: number
  ): void {
    // Save previous position for interpolation
    this.prevX = this.x
    this.prevY = this.y

    // Compute aim offset: direction from player to cursor, clamped
    let aimDx = cursorWorldX - playerX
    let aimDy = cursorWorldY - playerY
    const aimDist = Math.sqrt(aimDx * aimDx + aimDy * aimDy)

    if (aimDist > 0) {
      const clampedDist = Math.min(aimDist, this.config.maxAimOffset)
      aimDx = (aimDx / aimDist) * clampedDist
      aimDy = (aimDy / aimDist) * clampedDist
    }

    // Target = player + weighted aim offset
    const targetX = playerX + aimDx * this.config.aimWeight
    const targetY = playerY + aimDy * this.config.aimWeight

    // Exponential smoothing (frame-rate independent)
    const factor = 1 - Math.exp(-this.config.smoothingLambda * dt)
    this.x += (targetX - this.x) * factor
    this.y += (targetY - this.y) * factor

    // Clamp both current and previous to bounds so interpolation
    // doesn't overshoot when the camera hits an edge
    this.clampToBounds()
    this.clampPrevToBounds()
  }

  /**
   * Get interpolated render state with shake and kick offsets.
   * Called per render frame (variable rate).
   *
   * @param alpha - Interpolation factor between prev and current tick
   * @param realDt - Real elapsed time since last render frame (seconds)
   * @returns Pre-allocated render state — do not store reference
   */
  getRenderState(alpha: number, realDt: number): CameraRenderState {
    // Update effects
    this.shake.update(realDt)
    this.kick.update(realDt)

    // Interpolate base position
    let x = this.prevX + (this.x - this.prevX) * alpha
    let y = this.prevY + (this.y - this.prevY) * alpha

    // Add shake offset
    const shakeOffset = this.shake.getOffset()
    x += shakeOffset.x
    y += shakeOffset.y

    // Add kick offset
    x += this.kick.getOffsetX()
    y += this.kick.getOffsetY()

    // Pixel-round to prevent sub-pixel shimmer on tile sprites
    this.renderState.x = Math.round(x)
    this.renderState.y = Math.round(y)
    this.renderState.angle = shakeOffset.angle

    return this.renderState
  }

  addTrauma(amount: number): void {
    this.shake.addTrauma(amount)
  }

  applyKick(fireDirX: number, fireDirY: number, magnitude: number): void {
    this.kick.kick(fireDirX, fireDirY, magnitude)
  }

  private readonly positionCache = { x: 0, y: 0 }

  /** Returns pre-allocated position object — do not store reference. */
  getPosition(): { x: number; y: number } {
    this.positionCache.x = this.x
    this.positionCache.y = this.y
    return this.positionCache
  }

  private clampToBounds(): void {
    if (!this.bounds) return
    this.x = this.clampAxis(this.x, this.bounds.minX, this.bounds.maxX, this.viewportW)
    this.y = this.clampAxis(this.y, this.bounds.minY, this.bounds.maxY, this.viewportH)
  }

  private clampPrevToBounds(): void {
    if (!this.bounds) return
    this.prevX = this.clampAxis(this.prevX, this.bounds.minX, this.bounds.maxX, this.viewportW)
    this.prevY = this.clampAxis(this.prevY, this.bounds.minY, this.bounds.maxY, this.viewportH)
  }

  private clampAxis(value: number, min: number, max: number, viewportSize: number): number {
    const half = viewportSize / 2
    const worldSize = max - min
    if (worldSize <= viewportSize) {
      return min + worldSize / 2
    }
    return Math.max(min + half, Math.min(max - half, value))
  }
}
