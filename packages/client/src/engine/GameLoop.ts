/**
 * GameLoop - Fixed timestep game loop
 *
 * Implements the accumulator pattern for fixed timestep simulation
 * with interpolation for smooth rendering at any frame rate.
 *
 * Reference: https://gafferongames.com/post/fix_your_timestep/
 */

import { TICK_MS, TICK_S } from '@high-noon/shared'

export type UpdateCallback = (dt: number) => void
export type RenderCallback = (alpha: number) => void

/** Maximum fixed updates per RAF frame to prevent render starvation */
const MAX_CATCHUP_STEPS = 4

/**
 * Fixed timestep game loop with interpolation
 */
export class GameLoop {
  private accumulator = 0
  private lastTime = 0
  private running = false
  private rafId: number | null = null

  private _tick = 0
  private _frameCount = 0
  private _fps = 0

  private fpsAccumulator = 0
  private fpsFrames = 0

  constructor(
    private readonly onUpdate: UpdateCallback,
    private readonly onRender: RenderCallback
  ) {}

  /** Current tick count */
  get tick(): number {
    return this._tick
  }

  /** Frames rendered */
  get frameCount(): number {
    return this._frameCount
  }

  /** Current FPS (updated every second) */
  get fps(): number {
    return this._fps
  }

  /**
   * Start the game loop
   */
  start(): void {
    if (this.running) return

    this.running = true
    this.lastTime = performance.now()
    this.accumulator = 0

    this.loop(this.lastTime)
  }

  /**
   * Stop the game loop
   */
  stop(): void {
    this.running = false
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  /**
   * Main loop iteration
   */
  private loop = (currentTime: number): void => {
    if (!this.running) return

    // Calculate delta time in milliseconds
    const deltaTime = currentTime - this.lastTime
    this.lastTime = currentTime

    // Cap delta time to prevent spiral of death
    // If frame took > 250ms, we're probably in a background tab
    const cappedDelta = Math.min(deltaTime, 250)

    this.accumulator += cappedDelta

    // Run fixed timestep updates (capped to protect render cadence)
    let catchupSteps = 0
    while (this.accumulator >= TICK_MS && catchupSteps < MAX_CATCHUP_STEPS) {
      this.onUpdate(TICK_S)
      this.accumulator -= TICK_MS
      this._tick++
      catchupSteps++
    }

    // If we hit the cap, drop the excess backlog to avoid long update bursts
    if (catchupSteps >= MAX_CATCHUP_STEPS && this.accumulator >= TICK_MS) {
      this.accumulator %= TICK_MS
    }

    // Calculate interpolation alpha (0 to 1)
    // This represents how far we are between ticks
    const alpha = this.accumulator / TICK_MS

    // Render with interpolation
    this.onRender(alpha)
    this._frameCount++

    // Update FPS counter
    this.fpsAccumulator += deltaTime
    this.fpsFrames++
    if (this.fpsAccumulator >= 1000) {
      this._fps = Math.round((this.fpsFrames * 1000) / this.fpsAccumulator)
      this.fpsAccumulator = 0
      this.fpsFrames = 0
    }

    // Schedule next frame
    this.rafId = requestAnimationFrame(this.loop)
  }

  /**
   * Check if loop is running
   */
  isRunning(): boolean {
    return this.running
  }
}
