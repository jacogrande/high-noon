/**
 * Item Definitions
 *
 * Passive items that stack on the player throughout a run.
 * Items modify existing mechanics via stat mods and hook effects.
 */

import type { StatName } from './characters'

// ============================================================================
// Types
// ============================================================================

export type ItemRarity = 'brass' | 'silver' | 'gold' | 'cursed'

export type ItemTrigger =
  | 'passive'
  | 'onBulletHit'
  | 'onKill'
  | 'onRollEnd'
  | 'onReload'
  | 'onWaveStart'

export type StackFormula = 'linear' | 'hyperbolic' | 'additive_chance' | 'unique'

export interface ItemStatMod {
  stat: StatName
  op: 'add' | 'mul'
  /** Bonus per stack (additive mods) or multiplier per stack (mul mods) */
  perStack: number
}

export interface ItemDef {
  id: number
  key: string
  name: string
  description: string
  rarity: ItemRarity
  trigger: ItemTrigger
  stackFormula: StackFormula
  maxStack: number
  /** Stat modifications applied passively based on stack count */
  mods: ItemStatMod[]
  /** Whether this item has a hook-based effect in itemEffects.ts */
  hasEffect: boolean
  /** Optional downside description for cursed items */
  downside?: string
}

// ============================================================================
// Wave 1 Item Definitions (12 items)
// ============================================================================

const ITEMS: ItemDef[] = [
  // --- Brass (Common) ---
  {
    id: 1,
    key: 'gun_oil_tin',
    name: 'Gun Oil Tin',
    description: '+12% fire rate.',
    rarity: 'brass',
    trigger: 'passive',
    stackFormula: 'linear',
    maxStack: 10,
    mods: [{ stat: 'fireRate', op: 'mul', perStack: 0.12 }],
    hasEffect: false,
  },
  {
    id: 2,
    key: 'gunpowder_pouch',
    name: 'Gunpowder Pouch',
    description: '+8% bullet damage.',
    rarity: 'brass',
    trigger: 'passive',
    stackFormula: 'linear',
    maxStack: 10,
    mods: [{ stat: 'bulletDamage', op: 'mul', perStack: 0.08 }],
    hasEffect: false,
  },
  {
    id: 3,
    key: 'trail_dust_boots',
    name: 'Trail Dust Boots',
    description: '+10% movement speed.',
    rarity: 'brass',
    trigger: 'passive',
    stackFormula: 'linear',
    maxStack: 10,
    mods: [{ stat: 'speed', op: 'mul', perStack: 0.10 }],
    hasEffect: false,
  },
  {
    id: 4,
    key: 'leather_duster',
    name: 'Leather Duster',
    description: '+1 max HP.',
    rarity: 'brass',
    trigger: 'passive',
    stackFormula: 'linear',
    maxStack: 10,
    mods: [{ stat: 'maxHP', op: 'add', perStack: 1 }],
    hasEffect: false,
  },
  {
    id: 5,
    key: 'tin_star_badge',
    name: 'Tin Star Badge',
    description: 'Chance to block incoming damage.',
    rarity: 'brass',
    trigger: 'passive',
    stackFormula: 'hyperbolic',
    maxStack: 10,
    mods: [], // blockChance computed separately via hyperbolic formula
    hasEffect: false,
  },
  {
    id: 6,
    key: 'fools_gold_nugget',
    name: "Fool's Gold Nugget",
    description: '+15% gold from all sources.',
    rarity: 'brass',
    trigger: 'passive',
    stackFormula: 'linear',
    maxStack: 10,
    mods: [], // goldMultiplier computed separately
    hasEffect: false,
  },

  // --- Silver (Uncommon) ---
  {
    id: 7,
    key: 'rattlesnake_fang',
    name: 'Rattlesnake Fang',
    description: '8% chance: bullets deal 3 bonus damage.',
    rarity: 'silver',
    trigger: 'onBulletHit',
    stackFormula: 'additive_chance',
    maxStack: 10,
    mods: [],
    hasEffect: true,
  },
  {
    id: 8,
    key: 'moonshine_flask',
    name: 'Moonshine Flask',
    description: 'Heal 1 HP on kill (2s cooldown).',
    rarity: 'silver',
    trigger: 'onKill',
    stackFormula: 'linear',
    maxStack: 5,
    mods: [],
    hasEffect: true,
  },
  {
    id: 9,
    key: 'powder_keg',
    name: 'Powder Keg',
    description: 'Enemies explode on death for 4 damage in 50px.',
    rarity: 'silver',
    trigger: 'onKill',
    stackFormula: 'linear',
    maxStack: 5,
    mods: [],
    hasEffect: true,
  },
  {
    id: 10,
    key: 'sidewinder_belt',
    name: 'Sidewinder Belt',
    description: 'Rolling reloads 1 round into the cylinder.',
    rarity: 'silver',
    trigger: 'onRollEnd',
    stackFormula: 'linear',
    maxStack: 5,
    mods: [],
    hasEffect: true,
  },

  // --- Gold (Rare) ---
  {
    id: 11,
    key: 'dead_mans_deed',
    name: "Dead Man's Deed",
    description: 'Kill-shots pierce all remaining enemies at 60% damage.',
    rarity: 'gold',
    trigger: 'onBulletHit',
    stackFormula: 'unique',
    maxStack: 1,
    mods: [],
    hasEffect: true,
  },
  {
    id: 12,
    key: 'grim_harvest',
    name: 'Grim Harvest',
    description: 'On-kill effects trigger twice.',
    rarity: 'gold',
    trigger: 'onKill',
    stackFormula: 'unique',
    maxStack: 1,
    mods: [],
    hasEffect: true,
  },

  // --- Wave 2 Items (Camp Expansion) ---

  // Brass (Common)
  {
    id: 13,
    key: 'prospectors_map',
    name: "Prospector's Map",
    description: '+15% gold per stack.',
    rarity: 'brass',
    trigger: 'passive',
    stackFormula: 'linear',
    maxStack: 10,
    mods: [], // goldMultiplier computed separately
    hasEffect: false,
  },
  {
    id: 14,
    key: 'worn_saddlebag',
    name: 'Worn Saddlebag',
    description: '+1 item slot per stack.',
    rarity: 'brass',
    trigger: 'passive',
    stackFormula: 'linear',
    maxStack: 4,
    mods: [],
    hasEffect: false,
  },
  {
    id: 15,
    key: 'bounty_notice',
    name: 'Bounty Notice',
    description: '10% chance per stack to drop bonus gold on kill.',
    rarity: 'brass',
    trigger: 'onKill',
    stackFormula: 'additive_chance',
    maxStack: 10,
    mods: [],
    hasEffect: true,
  },

  // Silver (Uncommon)
  {
    id: 16,
    key: 'lightning_rod',
    name: 'Lightning Rod',
    description: '8% chance per stack: chain lightning to nearby enemy on kill.',
    rarity: 'silver',
    trigger: 'onKill',
    stackFormula: 'additive_chance',
    maxStack: 10,
    mods: [],
    hasEffect: true,
  },
  {
    id: 17,
    key: 'cactus_spine',
    name: 'Cactus Spine',
    description: 'Reflect 15 damage per stack to attacker when hit.',
    rarity: 'silver',
    trigger: 'passive',
    stackFormula: 'linear',
    maxStack: 5,
    mods: [],
    hasEffect: true,
  },
  {
    id: 18,
    key: 'scorpion_stinger',
    name: 'Scorpion Stinger',
    description: 'Bullets slow enemies by 12% per stack for 1.5s.',
    rarity: 'silver',
    trigger: 'onBulletHit',
    stackFormula: 'linear',
    maxStack: 5,
    mods: [],
    hasEffect: true,
  },
  {
    id: 19,
    key: 'pocket_watch',
    name: 'Pocket Watch',
    description: '+8% reload speed per stack.',
    rarity: 'silver',
    trigger: 'passive',
    stackFormula: 'linear',
    maxStack: 10,
    mods: [{ stat: 'reloadTime', op: 'mul', perStack: -0.08 }],
    hasEffect: false,
  },

  // Gold (Rare)
  {
    id: 20,
    key: 'bandolier',
    name: 'Bandolier',
    description: 'First shot after reload deals +50% damage per stack.',
    rarity: 'gold',
    trigger: 'onReload',
    stackFormula: 'linear',
    maxStack: 5,
    mods: [],
    hasEffect: true,
  },
  {
    id: 21,
    key: 'desert_rose',
    name: 'Desert Rose',
    description: 'Heal 2 HP per stack at the start of each wave.',
    rarity: 'gold',
    trigger: 'onWaveStart',
    stackFormula: 'linear',
    maxStack: 5,
    mods: [],
    hasEffect: true,
  },
  {
    id: 22,
    key: 'peacemaker',
    name: 'Peacemaker',
    description: 'Consecutive hits on same target deal +10% damage per stack.',
    rarity: 'gold',
    trigger: 'onBulletHit',
    stackFormula: 'linear',
    maxStack: 5,
    mods: [],
    hasEffect: true,
  },

  // Legendary
  {
    id: 23,
    key: 'witching_hour',
    name: 'Witching Hour',
    description: '3s of double fire rate when cylinder empties.',
    rarity: 'gold',
    trigger: 'passive',
    stackFormula: 'unique',
    maxStack: 1,
    mods: [],
    hasEffect: true,
  },

  // Cursed
  {
    id: 24,
    key: 'devils_bargain',
    name: "Devil's Bargain",
    description: '+40% damage per stack, but max HP divided by (1 + stacks).',
    rarity: 'cursed',
    trigger: 'passive',
    stackFormula: 'linear',
    maxStack: 3,
    mods: [],
    hasEffect: false,
    downside: 'Max HP divided by (1 + stacks).',
  },
]

// ============================================================================
// Lookup Maps (built once)
// ============================================================================

const ITEMS_BY_ID = new Map<number, ItemDef>()
const ITEMS_BY_KEY = new Map<string, ItemDef>()
const ITEMS_BY_RARITY = new Map<ItemRarity, ItemDef[]>()

for (const item of ITEMS) {
  ITEMS_BY_ID.set(item.id, item)
  ITEMS_BY_KEY.set(item.key, item)
  const list = ITEMS_BY_RARITY.get(item.rarity) ?? []
  list.push(item)
  ITEMS_BY_RARITY.set(item.rarity, list)
}

// ============================================================================
// Helpers
// ============================================================================

export function getItemDef(id: number): ItemDef | undefined {
  return ITEMS_BY_ID.get(id)
}

export function getItemDefByKey(key: string): ItemDef | undefined {
  return ITEMS_BY_KEY.get(key)
}

export function getItemsByRarity(rarity: ItemRarity): readonly ItemDef[] {
  return ITEMS_BY_RARITY.get(rarity) ?? []
}

export function getAllItems(): readonly ItemDef[] {
  return ITEMS
}

// ============================================================================
// Stacking Math
// ============================================================================

/** Linear: bonus = perStack * stacks */
export function computeLinearBonus(perStack: number, stacks: number): number {
  return perStack * stacks
}

/**
 * Hyperbolic: chance = 1 - 1/(1 + coefficient * stacks)
 * Approaches 1.0 asymptotically.
 */
export function computeHyperbolicChance(coefficient: number, stacks: number): number {
  if (stacks <= 0) return 0
  return 1 - 1 / (1 + coefficient * stacks)
}

/**
 * Additive chance: chance = min(baseChance * stacks, 1.0)
 * Simple capped probability stacking.
 */
export function computeAdditiveChance(baseChance: number, stacks: number): number {
  return Math.min(baseChance * stacks, 1.0)
}

/** Tin Star Badge block chance coefficient */
export const TIN_STAR_COEFFICIENT = 0.12

/** Fool's Gold bonus per stack */
export const FOOLS_GOLD_PER_STACK = 0.15

/** Maximum item slots a player can hold (base) */
export const MAX_ITEM_SLOTS = 8

/** Prospector's Map gold bonus per stack */
export const PROSPECTORS_MAP_PER_STACK = 0.15

/** Pick a random item of the given rarity using the provided RNG */
export function getRandomItemByRarity(rng: { next(): number }, rarity: ItemRarity): number | null {
  const pool = ITEMS_BY_RARITY.get(rarity)
  if (!pool || pool.length === 0) return null
  return pool[Math.floor(rng.next() * pool.length)]!.id
}
