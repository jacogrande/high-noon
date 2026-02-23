/**
 * Render-side time scaling for slow-motion effects.
 * Does not affect deterministic simulation — only visual dt.
 */
export class TimeScale {
  private scale = 1
  private remaining = 0

  get current(): number {
    return this.scale
  }

  /** Apply slow-mo. If already active, keeps the stronger effect (min scale, max duration). */
  slowMo(scale: number, durationSeconds: number): void {
    this.scale = Math.min(this.scale, scale)
    this.remaining = Math.max(this.remaining, durationSeconds)
  }

  update(realDt: number): number {
    if (this.remaining <= 0) return realDt
    this.remaining = Math.max(0, this.remaining - realDt)
    if (this.remaining === 0) this.scale = 1
    return realDt * this.scale
  }
}
