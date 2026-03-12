/**
 * Hit Stop Configuration
 *
 * Tiered freeze frame durations scaled by combat event intensity.
 * Values in seconds at 60Hz.
 */

/** Hit stop event types ordered by intensity */
export type HitStopIntensity = 'light' | 'medium' | 'heavy' | 'boss_kill'

/** Duration in seconds for each intensity tier */
export const HIT_STOP_DURATION: Record<HitStopIntensity, number> = {
  light: 0.05,       // 3 frames — standard enemy hit/kill, player takes damage
  medium: 0.083,     // 5 frames — threat/elite kill
  heavy: 0.15,       // 9 frames — boss phase transition
  boss_kill: 0.217,  // 13 frames — boss death
}

/** Maximum stacked freeze from rapid-fire hits in one frame (seconds) */
export const HIT_STOP_MAX_STACK = 0.1  // 6 frames cap
