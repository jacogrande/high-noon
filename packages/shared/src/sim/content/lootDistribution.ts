/**
 * Draft-Pick Loot Distribution
 *
 * In multiplayer camp phases, items are distributed via a snake draft:
 * players take turns picking from a shared pool. Pick order is based on
 * kill contribution (most kills → first pick). Snake reversal ensures
 * fairness across rounds (1-2-3 → 3-2-1 → 1-2-3).
 *
 * Single-player skips the draft — the existing visitor shop is used instead.
 */

import type { SeededRng } from '../../math/rng'
import { getAllItems, type ItemDef, type ItemRarity } from './items'

// ============================================================================
// Constants
// ============================================================================

/** Items offered per player in each draft */
export const DRAFT_OFFERS_PER_PLAYER = 2
/** Seconds per pick before auto-pick triggers */
export const DRAFT_PICK_TIMER_S = 15
/** Rarity priority for auto-pick (highest rarity first) */
const RARITY_PRIORITY: ItemRarity[] = ['gold', 'silver', 'brass', 'cursed']

// ============================================================================
// Types
// ============================================================================

export interface DraftOffer {
  itemId: number
  name: string
  description: string
  rarity: ItemRarity
  /** Index in the draft pool (stable identifier for pick messages) */
  poolIndex: number
  /** Entity ID of the player who picked this, or -1 if available.
   *  Uses -1 (not NO_TARGET/0xFFFF) since this is a plain JS number, not a typed array slot. */
  pickedBy: number
  downside: string | undefined
}

export type DraftPhase = 'picking' | 'complete'

export interface DraftState {
  phase: DraftPhase
  /** All items in the pool */
  offers: DraftOffer[]
  /** Snake-draft ordered list of player entity IDs */
  pickOrder: number[]
  /** Current index into pickOrder */
  currentPickIndex: number
  /** Seconds remaining for the current picker */
  pickTimer: number
  /** Number of picks completed so far */
  picksCompleted: number
  /** Total picks to make (pickOrder.length) */
  totalPicks: number
}

// ============================================================================
// Draft Generation
// ============================================================================

/** Rarity weights for draft pool generation */
const DRAFT_RARITY_WEIGHTS: [ItemRarity, number][] = [
  ['brass', 4],
  ['silver', 3],
  ['gold', 2],
  ['cursed', 1],
]

/**
 * Generate a draft pool of items for the camp phase.
 * Pool size = DRAFT_OFFERS_PER_PLAYER * playerCount + extra variety.
 */
export function generateDraftPool(
  rng: SeededRng,
  playerCount: number,
  existingItems: Map<number, number>,
): DraftOffer[] {
  const totalOffers = DRAFT_OFFERS_PER_PLAYER * playerCount + Math.ceil(playerCount * 0.5)
  const allItems = getAllItems()
  const offers: DraftOffer[] = []

  // Build weighted candidate pool, excluding items already at max stack
  const candidates: { def: ItemDef; weight: number }[] = []
  for (const def of allItems) {
    const currentStacks = existingItems.get(def.id) ?? 0
    if (currentStacks >= def.maxStack) continue
    const rarityWeight = DRAFT_RARITY_WEIGHTS.find(([r]) => r === def.rarity)?.[1] ?? 1
    candidates.push({ def, weight: rarityWeight })
  }

  // Pre-compute total weight (maintained incrementally as items are picked)
  let totalWeight = 0
  for (const c of candidates) totalWeight += c.weight

  for (let i = 0; i < totalOffers && candidates.length > 0; i++) {
    // Weighted random selection
    let roll = rng.next() * totalWeight
    let picked: typeof candidates[0] | null = null
    for (const c of candidates) {
      roll -= c.weight
      if (roll <= 0) { picked = c; break }
    }
    if (!picked) picked = candidates[candidates.length - 1]!

    // Remove picked candidate and update running total
    totalWeight -= picked.weight
    const idx = candidates.indexOf(picked)
    if (idx >= 0) candidates.splice(idx, 1)

    offers.push({
      itemId: picked.def.id,
      name: picked.def.name,
      description: picked.def.description,
      rarity: picked.def.rarity,
      poolIndex: offers.length,
      pickedBy: -1,
      downside: picked.def.downside,
    })
  }

  return offers
}

/**
 * Build snake-draft pick order from player entity IDs.
 * Most kills → first pick. Snake reversal for fairness.
 *
 * For 3 players with 2 picks each: [A, B, C, C, B, A]
 */
export function buildPickOrder(
  playerEids: number[],
  killsByPlayer: Map<number, number>,
): number[] {
  // Sort by kills descending, stable (original order as tiebreaker)
  const sorted = [...playerEids].sort((a, b) => {
    const killsA = killsByPlayer.get(a) ?? 0
    const killsB = killsByPlayer.get(b) ?? 0
    return killsB - killsA
  })

  const order: number[] = []
  for (let round = 0; round < DRAFT_OFFERS_PER_PLAYER; round++) {
    if (round % 2 === 0) {
      // Forward pass
      for (const eid of sorted) order.push(eid)
    } else {
      // Reverse pass (snake)
      for (let i = sorted.length - 1; i >= 0; i--) order.push(sorted[i]!)
    }
  }

  return order
}

/**
 * Auto-pick the best available item (highest rarity, then first in pool).
 * Returns the poolIndex of the selected item, or -1 if none available.
 */
export function autoPickBestItem(draft: DraftState): number {
  let bestIndex = -1
  let bestPriority = Infinity

  for (const offer of draft.offers) {
    if (offer.pickedBy !== -1) continue
    const priority = RARITY_PRIORITY.indexOf(offer.rarity)
    if (priority === -1) continue // unknown rarity — skip
    if (priority < bestPriority || (priority === bestPriority && (bestIndex === -1 || offer.poolIndex < bestIndex))) {
      bestPriority = priority
      bestIndex = offer.poolIndex
    }
  }

  return bestIndex
}

/**
 * Create initial draft state for a camp phase.
 */
export function createDraftState(
  rng: SeededRng,
  playerEids: number[],
  killsByPlayer: Map<number, number>,
  existingItems: Map<number, number>,
): DraftState {
  const offers = generateDraftPool(rng, playerEids.length, existingItems)
  const pickOrder = buildPickOrder(playerEids, killsByPlayer)

  return {
    phase: 'picking',
    offers,
    pickOrder,
    currentPickIndex: 0,
    pickTimer: DRAFT_PICK_TIMER_S,
    picksCompleted: 0,
    totalPicks: pickOrder.length,
  }
}

/**
 * Advance draft to next pick or complete if all picks are done.
 */
export function advanceDraft(draft: DraftState): void {
  draft.currentPickIndex++
  draft.picksCompleted++

  if (draft.currentPickIndex >= draft.totalPicks || allItemsPicked(draft)) {
    draft.phase = 'complete'
  } else {
    draft.pickTimer = DRAFT_PICK_TIMER_S
  }
}

/** Check if all items in the pool have been picked */
function allItemsPicked(draft: DraftState): boolean {
  return draft.offers.every(o => o.pickedBy !== -1)
}

/** Get the entity ID of the current picker, or -1 if draft is complete */
export function getCurrentPicker(draft: DraftState): number {
  if (draft.phase === 'complete') return -1
  return draft.pickOrder[draft.currentPickIndex] ?? -1
}
