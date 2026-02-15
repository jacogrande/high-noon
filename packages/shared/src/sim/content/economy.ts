import type { SeededRng } from '../../math/rng'
import { getItemsByRarity, type ItemRarity } from './items'

/** Base shovel price. */
export const SHOVEL_BASE_PRICE = 2  // TODO: restore to 18 after testing
/** Flat shovel price increment per stage index. */
export const SHOVEL_STAGE_PRICE_STEP = 0  // TODO: restore to 8 after testing
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

/** Display duration for item-received feedback (longer than default). */
export const ITEM_FEEDBACK_DURATION = 2.5

export interface StashRewardRoll {
  gold: number
  rare: boolean
  /** Item ID to drop (null = no item drop) */
  itemId: number | null
}

export function getShovelPrice(stageIndex: number): number {
  return SHOVEL_BASE_PRICE + Math.max(0, stageIndex) * SHOVEL_STAGE_PRICE_STEP
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
 * Roll stash reward — items only, no gold:
 * - 65% brass item
 * - 25% silver item
 * -  8% gold item (rare)
 * -  2% cursed item (rare)
 */
export function rollStashReward(rng: SeededRng, _stageIndex: number): StashRewardRoll {
  const roll = rng.next()

  if (roll < 0.65) {
    return { gold: 0, rare: false, itemId: rollRandomItem(rng, 'brass') }
  } else if (roll < 0.90) {
    return { gold: 0, rare: false, itemId: rollRandomItem(rng, 'silver') }
  } else if (roll < 0.98) {
    return { gold: 0, rare: true, itemId: rollRandomItem(rng, 'gold') }
  } else {
    return { gold: 0, rare: true, itemId: rollRandomItem(rng, 'cursed') }
  }
}
