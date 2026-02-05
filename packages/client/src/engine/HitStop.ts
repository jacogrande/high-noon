/**
 * HitStop - Frame freeze effect for impact feel.
 *
 * Pauses the simulation for a brief duration on impact events.
 * Returns a time scale (0 or 1) that gates the simulation update.
 */

export class HitStop {
  private remaining = 0

  /** Accessibility toggle */
  enabled = true

  /**
   * Freeze the simulation for the given duration.
   * Takes the max with any current remaining freeze.
   */
  freeze(durationSeconds: number): void {
    if (!this.enabled) return
    this.remaining = Math.max(this.remaining, durationSeconds)
  }

  /**
   * Update the hit stop timer.
   * @returns timeScale: 0 if frozen, 1 if running
   */
  update(realDt: number): number {
    if (this.remaining <= 0) return 1

    this.remaining -= realDt
    if (this.remaining <= 0) {
      this.remaining = 0
      return 1
    }
    return 0
  }

  get isFrozen(): boolean {
    return this.remaining > 0
  }
}
