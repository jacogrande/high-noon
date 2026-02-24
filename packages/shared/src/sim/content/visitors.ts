/**
 * Camp Visitor Definitions
 *
 * Visitors appear during camp phases between stages and offer items for sale.
 * Each visitor has different inventory biases, pricing, and flavor text.
 */

import type { ItemRarity } from './items'

// ============================================================================
// Types
// ============================================================================

export interface VisitorDef {
  id: number
  key: string
  name: string
  greeting: string[]
  offerCount: number
  priceMultiplier: number
  rarityWeights: Partial<Record<ItemRarity, number>>
}

// ============================================================================
// Pricing
// ============================================================================

export const BASE_ITEM_PRICE: Record<ItemRarity, number> = {
  brass: 30,
  silver: 60,
  gold: 100,
  cursed: 40,
}

// ============================================================================
// Visitor Definitions
// ============================================================================

const VISITORS: VisitorDef[] = [
  {
    id: 1,
    key: 'trade_caravan',
    name: 'Trade Caravan',
    greeting: [
      'Goods from across the frontier.',
      'Take a look — fair prices, no tricks.',
      'Stock up while you can, partner.',
    ],
    offerCount: 3,
    priceMultiplier: 1.0,
    rarityWeights: { brass: 40, silver: 40, gold: 15, cursed: 5 },
  },
  {
    id: 2,
    key: 'tinkerer',
    name: 'Tinkerer',
    greeting: [
      'Let me take a look at that iron...',
      'I can rework this. Pick your poison.',
      'Every weapon\'s got room for improvement.',
    ],
    // Tinkerer uses weapon mod offers, not item offers.
    // offerCount/priceMultiplier/rarityWeights are unused but kept for VisitorDef conformance.
    offerCount: 0,
    priceMultiplier: 1.0,
    rarityWeights: {},
  },
]

// ============================================================================
// Lookup
// ============================================================================

const VISITORS_BY_ID = new Map<number, VisitorDef>()
for (const v of VISITORS) {
  VISITORS_BY_ID.set(v.id, v)
}

export function getVisitorDef(id: number): VisitorDef | undefined {
  return VISITORS_BY_ID.get(id)
}

export function getAllVisitors(): readonly VisitorDef[] {
  return VISITORS
}
