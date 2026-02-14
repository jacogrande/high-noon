import type { SeededRng } from '../../math/rng'

/** Base shovel price in stage 1. */
export const SHOVEL_BASE_PRICE = 18
/** Flat shovel price increment per stage index. */
export const SHOVEL_STAGE_PRICE_STEP = 8
/** Hard carry cap to avoid runaway inventory. */
export const SHOVEL_MAX_STACK = 5

/** Number of stash points generated per active stage. */
export const STASHES_PER_STAGE = 6

/** Interaction radii in world pixels. */
export const STASH_INTERACT_RADIUS = 56
export const SALESMAN_INTERACT_RADIUS = 64

/** Required continuous hold duration to confirm interaction (60Hz ticks). */
export const INTERACT_HOLD_TICKS = 15

/** Default player feedback display duration in seconds. */
export const INTERACTION_FEEDBACK_DURATION = 1.2

/** Stage-1 stash gold range (before stage scaling). */
export const STASH_BASE_GOLD_MIN = 14
export const STASH_BASE_GOLD_MAX = 28
/** Additional stash gold range delta applied per stage index. */
export const STASH_STAGE_GOLD_STEP = 8
/** Rare bonus trigger chance per stash open. */
export const STASH_RARE_BONUS_CHANCE = 0.12
/** Extra gold granted on a rare stash roll. */
export const STASH_RARE_BONUS_GOLD = 30

export interface StashRewardRoll {
  gold: number
  rare: boolean
}

export function getShovelPrice(stageIndex: number): number {
  return SHOVEL_BASE_PRICE + Math.max(0, stageIndex) * SHOVEL_STAGE_PRICE_STEP
}

function getStashGoldRange(stageIndex: number): { min: number; max: number } {
  const bonus = Math.max(0, stageIndex) * STASH_STAGE_GOLD_STEP
  return {
    min: STASH_BASE_GOLD_MIN + bonus,
    max: STASH_BASE_GOLD_MAX + bonus,
  }
}

export function rollStashReward(rng: SeededRng, stageIndex: number): StashRewardRoll {
  const range = getStashGoldRange(stageIndex)
  const spread = Math.max(0, range.max - range.min)
  const base = range.min + (spread > 0 ? rng.nextInt(spread + 1) : 0)
  const rare = rng.next() < STASH_RARE_BONUS_CHANCE
  const bonus = rare ? STASH_RARE_BONUS_GOLD : 0
  return {
    gold: base + bonus,
    rare,
  }
}
