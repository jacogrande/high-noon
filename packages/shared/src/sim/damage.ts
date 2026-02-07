/** Clamp damage to uint8 range [0, 255] */
export function clampDamage(value: number): number {
  return Math.min(255, Math.round(value))
}
