/**
 * Camp Visitor System
 *
 * Pure logic functions (not an ECS system) for selecting visitors,
 * generating offers, and processing purchases during camp phases.
 */

import type { SeededRng } from '../../math/rng'
import type { GameWorld } from '../world'
import type { CharacterId } from '../content/characters'
import { getUpgradeStateForPlayer, recomputePlayerStats, writeStatsToECS, FOOLS_ERRAND_ID, addItemToPlayer, getCharacterIdForPlayer } from '../upgrade'
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
import { getModsForCharacter, getWeaponModDef } from '../content/weaponMods'
import { applyWeaponModEffect } from '../content/weaponModEffects'

// ============================================================================
// Types
// ============================================================================

export interface VisitorOffer {
  itemId: number
  price: number
  sold: boolean
}

export interface WeaponModOffer {
  modId: number
  taken: boolean
}

export interface CampVisitorState {
  visitorId: number
  greeting: string
  greetingIndex: number
  offers: VisitorOffer[]
  modOffers: WeaponModOffer[]
  /** Per-player mod offers for co-op (keyed by player EID) */
  modOffersByPlayer: Map<number, WeaponModOffer[]>
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

  // Fool's Errand blocks all visitor purchases
  const buyerState = getUpgradeStateForPlayer(world, playerEid)
  if ((buyerState.items.get(FOOLS_ERRAND_ID) ?? 0) > 0) return false

  if (world.goldCollected < offer.price) return false

  // Try to add item
  const added = addItemToPlayer(world, playerEid, offer.itemId, reapplyAllItemEffects)
  if (!added) return false

  world.goldCollected -= offer.price
  offer.sold = true
  return true
}

// ============================================================================
// Tinkerer Weapon Mods
// ============================================================================

/**
 * Generate weapon mod offers for the Tinkerer.
 * Filters by character and already-taken mods, shuffles, picks 2-3.
 */
export function generateTinkererModOffers(
  rng: SeededRng,
  characterId: CharacterId,
  takenModIds: Set<number>,
): WeaponModOffer[] {
  const pool = getModsForCharacter(characterId).filter(m => !takenModIds.has(m.id))
  if (pool.length === 0) return []

  // Fisher-Yates shuffle
  const shuffled = [...pool]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    const temp = shuffled[i]!
    shuffled[i] = shuffled[j]!
    shuffled[j] = temp
  }

  const offerCount = Math.min(shuffled.length, pool.length >= 3 ? 3 : 2)
  return shuffled.slice(0, offerCount).map(m => ({ modId: m.id, taken: false }))
}

/**
 * Attempt to select a Tinkerer weapon mod offer.
 * Validates visitor is tinkerer, offer exists, and none already taken.
 * Returns true on success.
 */
export function tryTinkererModSelect(
  world: GameWorld,
  playerEid: number,
  offerIndex: number,
): boolean {
  const visitor = world.campVisitor
  if (!visitor) return false

  // Use per-player offers if available, fall back to shared modOffers
  const offers = visitor.modOffersByPlayer.get(playerEid) ?? visitor.modOffers
  if (offers.length === 0) return false

  if (offerIndex < 0 || offerIndex >= offers.length) return false
  const offer = offers[offerIndex]!
  if (offer.taken) return false

  // Only one mod per visit
  if (offers.some(o => o.taken)) return false

  // Validate mod is for this player's character
  const modDef = getWeaponModDef(offer.modId)
  if (modDef) {
    const charId = getCharacterIdForPlayer(world, playerEid)
    if (!modDef.characters.includes(charId)) return false
  }

  const state = getUpgradeStateForPlayer(world, playerEid)
  state.weaponMods.add(offer.modId)
  offer.taken = true
  recomputePlayerStats(state)
  writeStatsToECS(world, playerEid, state)
  applyWeaponModEffect(world, offer.modId, playerEid)
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
