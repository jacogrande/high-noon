import { EnemyType } from '../components'
import type { GameWorld } from '../world'

/**
 * Base kill gold per enemy type, before time/stage scaling.
 * Higher-threat enemies pay more.
 */
export const GOLD_BASE_VALUES: Record<number, number> = {
  [EnemyType.SWARMER]: 1,
  [EnemyType.GRUNT]: 2,
  [EnemyType.SHOOTER]: 4,
  [EnemyType.CHARGER]: 5,
  [EnemyType.GOBLIN_BARBARIAN]: 2,
  [EnemyType.GOBLIN_ROGUE]: 1,
  [EnemyType.BOOMSTICK]: 20,
}

/**
 * Risk-of-Rain-inspired difficulty growth:
 * coeff = (1 + minutes * perMinute) * stageCoeff
 *
 * The per-minute value mirrors Rainstorm single-player pacing
 * (0.0506 * difficultyValue(2) = 0.1012).
 */
export const GOLD_TIME_COEFF_PER_MINUTE = 0.1012
export const GOLD_STAGE_COEFF_PER_STAGE = 0.3
export const GOLD_MELEE_BONUS_MULTIPLIER = 2

function getStagesCleared(world: Pick<GameWorld, 'run'>): number {
  if (!world.run) return 0
  if (world.run.completed) return Math.max(0, world.run.totalStages)
  return Math.max(0, world.run.currentStage)
}

export function getGoldDifficultyCoefficient(world: Pick<GameWorld, 'time' | 'run'>): number {
  const minutes = Math.max(0, world.time) / 60
  const stageCoeff = 1 + getStagesCleared(world) * GOLD_STAGE_COEFF_PER_STAGE
  return (1 + minutes * GOLD_TIME_COEFF_PER_MINUTE) * stageCoeff
}

export function getGoldRewardForKill(
  world: Pick<GameWorld, 'time' | 'run'>,
  enemyType: number,
  wasMelee: boolean,
): number {
  const base = GOLD_BASE_VALUES[enemyType] ?? 1
  const coeff = getGoldDifficultyCoefficient(world)
  const meleeMul = wasMelee ? GOLD_MELEE_BONUS_MULTIPLIER : 1
  return Math.max(1, Math.round(base * coeff * meleeMul))
}
