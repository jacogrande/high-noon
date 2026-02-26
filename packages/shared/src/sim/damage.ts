/** Clamp damage to uint8 range [0, 255] */
export function clampDamage(value: number): number {
  return Math.min(255, Math.round(value))
}

/** Damage multiplier for friendly fire in 'reduced' mode (25%) */
export const FRIENDLY_FIRE_DAMAGE_SCALE = 0.25
