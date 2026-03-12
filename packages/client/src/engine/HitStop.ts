/**
 * HitStop - Frame freeze effect for impact feel.
 *
 * Pauses the simulation for a brief duration on impact events.
 * Returns a time scale (0 or 1) that gates the simulation update.
 *
 * Supports additive stacking: multiple freeze() calls within one frame
 * sum their durations, capped at maxStackDuration to prevent a
 * "slideshow" effect from rapid-fire weapons.
 */

import { HIT_STOP_MAX_STACK } from '@high-noon/shared'

export class HitStop {
  private remaining = 0

  /** Accessibility toggle */
  enabled = true

  /** Maximum total freeze from stacked calls per frame (seconds) */
  maxStackDuration = HIT_STOP_MAX_STACK

  /**
   * Freeze the simulation for the given duration.
   * Stacks additively with any current remaining freeze,
   * capped at maxStackDuration.
   */
  freeze(durationSeconds: number): void {
    if (!this.enabled) return
    this.remaining = Math.min(this.remaining + durationSeconds, this.maxStackDuration)
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
