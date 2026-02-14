import type { SeededRng } from '../../math/rng'
import { getItemsByRarity, type ItemRarity } from './items'

/** Base shovel price. */
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
  /** Item ID to drop (null = no item drop) */
  itemId: number | null
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

/**
 * Pick a random item of a given rarity using the deterministic RNG.
 */
export function rollRandomItem(rng: SeededRng, rarity: ItemRarity): number | null {
  const pool = getItemsByRarity(rarity)
  if (pool.length === 0) return null
  return pool[rng.nextInt(pool.length)]!.id
}

/**
 * Roll stash reward with item drop table:
 * - 55% gold only
 * - 25% gold + brass item
 * -  8% gold + silver item
 * -  2% silver item only
 * - 10% rare gold bonus (existing formula)
 */
export function rollStashReward(rng: SeededRng, stageIndex: number): StashRewardRoll {
  const range = getStashGoldRange(stageIndex)
  const spread = Math.max(0, range.max - range.min)
  const baseGold = range.min + (spread > 0 ? rng.nextInt(spread + 1) : 0)
  const roll = rng.next()

  if (roll < 0.55) {
    // 55% — gold only
    return { gold: baseGold, rare: false, itemId: null }
  } else if (roll < 0.80) {
    // 25% — gold (50%) + brass item
    return {
      gold: Math.round(baseGold * 0.5),
      rare: false,
      itemId: rollRandomItem(rng, 'brass'),
    }
  } else if (roll < 0.88) {
    // 8% — gold (50%) + silver item
    return {
      gold: Math.round(baseGold * 0.5),
      rare: false,
      itemId: rollRandomItem(rng, 'silver'),
    }
  } else if (roll < 0.90) {
    // 2% — silver item only (jackpot)
    return {
      gold: 0,
      rare: true,
      itemId: rollRandomItem(rng, 'silver'),
    }
  } else {
    // 10% — rare gold bonus
    return {
      gold: baseGold + STASH_RARE_BONUS_GOLD,
      rare: true,
      itemId: null,
    }
  }
}
