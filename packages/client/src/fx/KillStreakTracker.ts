/**
 * KillStreakTracker — tracks rapid multi-kills for escalating visual feedback.
 * Resets if > 2s since last kill.
 */
export class KillStreakTracker {
  private streak = 0
  private lastKillTime = 0

  /** Register a kill. Returns updated streak count. */
  registerKill(time: number): number {
    if (time - this.lastKillTime > 2) {
      this.streak = 0
    }
    this.streak++
    this.lastKillTime = time
    return this.streak
  }

  /** Extra camera trauma for streaks >= 3. Capped at 0.15. */
  getTraumaBonus(): number {
    if (this.streak < 3) return 0
    return Math.min(0.15, (this.streak - 2) * 0.03)
  }

  /** Scale multiplier for floating text at streaks >= 3. Capped at 2.0. */
  getTextScale(): number {
    if (this.streak < 3) return 1.0
    return Math.min(2.0, 1.0 + (this.streak - 2) * 0.2)
  }

  /** Whether to trigger slow-mo (streak >= 5). */
  shouldSlowMo(): boolean {
    return this.streak >= 5
  }

  /** Explicitly reset streak (e.g. on stage/wave clear). */
  reset(): void {
    this.streak = 0
    this.lastKillTime = 0
  }
}
