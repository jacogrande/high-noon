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
      'Modified these myself. Handle with care.',
      'Precision-crafted. Worth every coin.',
      'Only the finest for a discerning gunslinger.',
    ],
    offerCount: 2,
    priceMultiplier: 1.4,
    rarityWeights: { brass: 10, silver: 50, gold: 35, cursed: 5 },
  },
  {
    id: 3,
    key: 'sawbones',
    name: 'Sawbones',
    greeting: [
      'Patch you up for a price.',
      'Prevention is cheaper than the cure.',
      "You look like you've seen better days.",
    ],
    offerCount: 2,
    priceMultiplier: 1.0,
    rarityWeights: { brass: 30, silver: 45, gold: 20, cursed: 5 },
  },
  {
    id: 4,
    key: 'gambler',
    name: 'Gambler',
    greeting: [
      "Feelin' lucky, stranger?",
      'High risk, high reward.',
      'Every card I deal is a winner... mostly.',
    ],
    offerCount: 3,
    priceMultiplier: 0.7,
    rarityWeights: { brass: 25, silver: 25, gold: 20, cursed: 30 },
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
