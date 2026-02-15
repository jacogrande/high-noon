/**
 * Camp Visitor System
 *
 * Pure logic functions (not an ECS system) for selecting visitors,
 * generating offers, and processing purchases during camp phases.
 */

import type { SeededRng } from '../../math/rng'
import type { GameWorld } from '../world'
import { getUpgradeStateForPlayer, addItemToPlayer } from '../upgrade'
import { reapplyAllItemEffects } from '../content/itemEffects'
import {
  type VisitorDef,
  getAllVisitors,
  BASE_ITEM_PRICE,
} from '../content/visitors'
import {
  type ItemRarity,
  getAllItems,
  getItemsByRarity,
  type ItemDef,
} from '../content/items'

// ============================================================================
// Types
// ============================================================================

export interface VisitorOffer {
  itemId: number
  price: number
  sold: boolean
}

export interface CampVisitorState {
  visitorId: number
  greeting: string
  greetingIndex: number
  offers: VisitorOffer[]
}

// ============================================================================
// Visitor Selection
// ============================================================================

/**
 * Select a camp visitor, deprioritizing recently seen visitors.
 */
export function selectCampVisitor(
  rng: SeededRng,
  previousVisitorIds: number[],
): VisitorDef {
  const all = getAllVisitors()
  const recentSet = new Set(previousVisitorIds.slice(-2))

  // Weight: 1.0 for fresh visitors, 0.25 for recent ones
  const weights: number[] = all.map(v => recentSet.has(v.id) ? 0.25 : 1.0)
  let totalWeight = 0
  for (const w of weights) totalWeight += w

  let roll = rng.next() * totalWeight
  for (let i = 0; i < all.length; i++) {
    roll -= weights[i]!
    if (roll <= 0) return all[i]!
  }
  return all[all.length - 1]!
}

// ============================================================================
// Offer Generation
// ============================================================================

/**
 * Roll a rarity from the visitor's weighted rarity table.
 */
function rollRarity(rng: SeededRng, weights: Partial<Record<ItemRarity, number>>): ItemRarity {
  let totalWeight = 0
  const entries: [ItemRarity, number][] = []
  for (const [rarity, weight] of Object.entries(weights) as [ItemRarity, number][]) {
    if (weight > 0) {
      entries.push([rarity, weight])
      totalWeight += weight
    }
  }
  if (entries.length === 0) return 'brass'

  let roll = rng.next() * totalWeight
  for (const [rarity, weight] of entries) {
    roll -= weight
    if (roll <= 0) return rarity
  }
  return entries[entries.length - 1]![0]
}

/**
 * Generate item offers for a visitor.
 * Avoids offering items the player already has at max stack.
 */
export function generateVisitorOffers(
  rng: SeededRng,
  visitor: VisitorDef,
  playerItems: Map<number, number>,
): VisitorOffer[] {
  const offers: VisitorOffer[] = []
  const usedItemIds = new Set<number>()

  for (let i = 0; i < visitor.offerCount; i++) {
    // Try up to 10 times to find a unique, non-maxed item
    let item: ItemDef | undefined
    for (let attempt = 0; attempt < 10; attempt++) {
      const rarity = rollRarity(rng, visitor.rarityWeights)
      const pool = getItemsByRarity(rarity)
      if (pool.length === 0) continue

      const candidate = pool[Math.floor(rng.next() * pool.length)]!
      if (usedItemIds.has(candidate.id)) continue

      // Skip if player already has max stacks
      const currentStacks = playerItems.get(candidate.id) ?? 0
      if (currentStacks >= candidate.maxStack) continue

      item = candidate
      break
    }

    if (!item) {
      // Fallback: pick any item
      const allItems = getAllItems()
      item = allItems[Math.floor(rng.next() * allItems.length)]!
    }

    usedItemIds.add(item.id)
    const basePrice = BASE_ITEM_PRICE[item.rarity] ?? 30
    const price = Math.round(basePrice * visitor.priceMultiplier)

    offers.push({ itemId: item.id, price, sold: false })
  }

  return offers
}

// ============================================================================
// Purchasing
// ============================================================================

/**
 * Attempt to purchase a visitor offer.
 * Returns true on success, false if insufficient gold, already sold, or inventory full.
 */
export function tryVisitorPurchase(
  world: GameWorld,
  playerEid: number,
  offerIndex: number,
): boolean {
  const visitor = world.campVisitor
  if (!visitor) return false

  const offer = visitor.offers[offerIndex]
  if (!offer || offer.sold) return false

  if (world.goldCollected < offer.price) return false

  // Try to add item
  const added = addItemToPlayer(world, playerEid, offer.itemId, reapplyAllItemEffects)
  if (!added) return false

  world.goldCollected -= offer.price
  offer.sold = true
  return true
}

// ============================================================================
// Greeting
// ============================================================================

/**
 * Pick a random greeting from a visitor's pool, avoiding the last used index.
 * Returns [greeting, index] so the index can be stored for next time.
 */
export function pickVisitorGreeting(
  rng: SeededRng,
  visitor: VisitorDef,
  lastGreetingIndex?: number,
): [string, number] {
  const pool = visitor.greeting
  if (pool.length <= 1) return [pool[0] ?? '', 0]
  // Avoid repeating the same greeting
  let idx: number
  do {
    idx = Math.floor(rng.next() * pool.length)
  } while (idx === lastGreetingIndex && pool.length > 1)
  return [pool[idx]!, idx]
}
