import { EnemyType } from '../components'

/** XP awarded on kill, indexed by EnemyType value */
export const XP_VALUES: Record<number, number> = {
  [EnemyType.SWARMER]: 1,
  [EnemyType.GRUNT]: 2,
  [EnemyType.SHOOTER]: 5,
  [EnemyType.CHARGER]: 5,
  [EnemyType.GOBLIN_BARBARIAN]: 2,
  [EnemyType.GOBLIN_ROGUE]: 1,
}

/** Cumulative XP required to reach each level (index = level) */
export const LEVEL_THRESHOLDS = [
  0,    // level 0 (start)
  10,   // level 1  — ~6 grunts or 10 swarmers
  25,   // level 2
  50,   // level 3
  85,   // level 4
  130,  // level 5
  190,  // level 6
  265,  // level 7
  360,  // level 8
  480,  // level 9
  630,  // level 10
]

export const MAX_LEVEL = LEVEL_THRESHOLDS.length - 1

/** Returns the level for a given cumulative XP total */
export function getLevelForXP(totalXP: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalXP >= LEVEL_THRESHOLDS[i]!) return i
  }
  return 0
}
