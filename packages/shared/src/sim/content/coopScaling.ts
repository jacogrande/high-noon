/**
 * Co-op Scaling
 *
 * Multipliers applied to enemy HP, wave budget, XP, and gold based on
 * the number of active players. Single-player (1 player) returns all 1.0
 * multipliers — no behavioral change. Curves interpolate linearly between
 * breakpoints so any player count in [1, 8] produces sensible values.
 */

export interface CoopScalars {
  /** Multiplier for fodder/threat Health.max on spawn */
  enemyHpMultiplier: number
  /** Multiplier for wave fodder budget */
  waveBudgetMultiplier: number
  /** Multiplier for boss Health.max on spawn */
  bossHpMultiplier: number
  /** Multiplier for per-kill XP (inverse scaling keeps leveling constant) */
  xpMultiplier: number
  /** Multiplier for per-kill gold drops */
  goldMultiplier: number
}

/**
 * Breakpoints: [playerCount, hpMul, budgetMul, bossHpMul, xpMul, goldMul]
 *
 * HP curve from brainstorm: 2p +50%, 4p +150%, 8p +300%.
 * Budget scales at ~60% of HP rate.
 * XP/gold scale inversely so per-player economy stays roughly constant.
 */
const BREAKPOINTS: [number, number, number, number, number, number][] = [
  //  pc   hpMul  budgetMul  bossHpMul  xpMul  goldMul
  [1, 1.0, 1.0, 1.0, 1.0, 1.0],
  [2, 1.5, 1.3, 1.5, 0.65, 0.65],
  [4, 2.5, 1.9, 2.5, 0.4, 0.4],
  [8, 4.0, 2.8, 4.0, 0.25, 0.25],
]

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Apply co-op HP scaling to a freshly spawned entity.
 * No-op for single-player (activePlayerCount <= 1).
 */
export function applyCoopHpScale(
  activePlayerCount: number,
  eid: number,
  isBoss: boolean,
  Health: { max: Float32Array; current: Float32Array },
): void {
  if (activePlayerCount <= 1) return
  const scalars = getCoopScalars(activePlayerCount)
  const mul = isBoss ? scalars.bossHpMultiplier : scalars.enemyHpMultiplier
  Health.max[eid] = Math.max(1, Math.round(Health.max[eid]! * mul))
  Health.current[eid] = Health.max[eid]!
}

/**
 * Get co-op scaling multipliers for the given player count.
 * Returns all 1.0 for single-player (playerCount <= 1).
 */
export function getCoopScalars(playerCount: number): CoopScalars {
  const pc = Math.max(1, Math.min(8, playerCount))

  if (pc <= 1) {
    return {
      enemyHpMultiplier: 1.0,
      waveBudgetMultiplier: 1.0,
      bossHpMultiplier: 1.0,
      xpMultiplier: 1.0,
      goldMultiplier: 1.0,
    }
  }

  // Find surrounding breakpoints and interpolate.
  // Guaranteed to find a bracket because pc is clamped to [1,8] and breakpoints span [1,8].
  let lower = BREAKPOINTS[0]!
  let upper = BREAKPOINTS[BREAKPOINTS.length - 1]!
  for (let i = 0; i < BREAKPOINTS.length - 1; i++) {
    if (pc >= BREAKPOINTS[i]![0] && pc <= BREAKPOINTS[i + 1]![0]) {
      lower = BREAKPOINTS[i]!
      upper = BREAKPOINTS[i + 1]!
      break
    }
  }

  const range = upper[0] - lower[0]
  const t = range > 0 ? (pc - lower[0]) / range : 0

  return {
    enemyHpMultiplier: lerp(lower[1], upper[1], t),
    waveBudgetMultiplier: lerp(lower[2], upper[2], t),
    bossHpMultiplier: lerp(lower[3], upper[3], t),
    xpMultiplier: lerp(lower[4], upper[4], t),
    goldMultiplier: lerp(lower[5], upper[5], t),
  }
}
