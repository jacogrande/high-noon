/**
 * Weapon Modification Definitions
 *
 * Tinkerer-exclusive weapon mods offered during camp phases.
 * Each mod is unique per run (removed from pool once taken).
 * Stat-based mods reuse the existing StatMod system.
 */

import type { CharacterId, StatMod } from './characters'

export interface WeaponModDef {
  id: number
  key: string
  name: string
  description: string
  characters: CharacterId[]
  mods: StatMod[]
  hasEffect: boolean
  flavor?: string
}

// ============================================================================
// Sheriff (Revolver) Mods
// ============================================================================

const SHERIFF_MODS: WeaponModDef[] = [
  {
    id: 1,
    key: 'long_barrel',
    name: 'Long Barrel',
    description: '+60% range, +20% bullet speed, -15% fire rate',
    characters: ['sheriff'],
    mods: [
      { stat: 'range', op: 'mul', value: 1.6 },
      { stat: 'bulletSpeed', op: 'mul', value: 1.2 },
      { stat: 'fireRate', op: 'mul', value: 0.85 },
    ],
    hasEffect: false,
    flavor: 'Reach out and touch someone.',
  },
  {
    id: 2,
    key: 'snub_nose',
    name: 'Snub Nose',
    description: '-40% range, +40% fire rate, +2 cylinder',
    characters: ['sheriff'],
    mods: [
      { stat: 'range', op: 'mul', value: 0.6 },
      { stat: 'fireRate', op: 'mul', value: 1.4 },
      { stat: 'cylinderSize', op: 'add', value: 2 },
    ],
    hasEffect: false,
    flavor: 'Short and sweet.',
  },
  {
    id: 3,
    key: 'hair_trigger',
    name: 'Hair Trigger',
    description: '-50% min fire interval, +30% hold fire rate, -15% damage',
    characters: ['sheriff'],
    mods: [
      { stat: 'minFireInterval', op: 'mul', value: 0.5 },
      { stat: 'holdFireRate', op: 'mul', value: 1.3 },
      { stat: 'bulletDamage', op: 'mul', value: 0.85 },
    ],
    hasEffect: false,
    flavor: 'A twitch is all it takes.',
  },
  {
    id: 4,
    key: 'heavy_cylinder',
    name: 'Heavy Cylinder',
    description: '+4 cylinder size, +25% reload time',
    characters: ['sheriff'],
    mods: [
      { stat: 'cylinderSize', op: 'add', value: 4 },
      { stat: 'reloadTime', op: 'mul', value: 1.25 },
    ],
    hasEffect: false,
    flavor: 'More lead, more patience.',
  },
  {
    id: 5,
    key: 'pepperbox',
    name: 'Pepperbox',
    description: '3 pellets in wide spread, -30% damage',
    characters: ['sheriff'],
    mods: [
      { stat: 'pelletCount', op: 'add', value: 2 },
      { stat: 'spreadAngle', op: 'add', value: 0.25 },
      { stat: 'bulletDamage', op: 'mul', value: 0.7 },
    ],
    hasEffect: false,
    flavor: 'Why aim when you can saturate?',
  },
  {
    id: 6,
    key: 'widowmaker',
    name: 'Widowmaker',
    description: '-4 cylinder, +120% damage, slower fire',
    characters: ['sheriff'],
    mods: [
      { stat: 'cylinderSize', op: 'add', value: -4 },
      { stat: 'bulletDamage', op: 'mul', value: 2.2 },
      { stat: 'minFireInterval', op: 'mul', value: 1.4 },
    ],
    hasEffect: false,
    flavor: 'Two shots. Make them count.',
  },
]

// ============================================================================
// Undertaker (Sawed-Off) Mods
// ============================================================================

const UNDERTAKER_MODS: WeaponModDef[] = [
  {
    id: 7,
    key: 'slug_barrel',
    name: 'Slug Barrel',
    description: '1 pellet, +200% damage, +80% range, no spread',
    characters: ['undertaker'],
    mods: [
      { stat: 'pelletCount', op: 'add', value: -4 },
      { stat: 'bulletDamage', op: 'mul', value: 3.0 },
      { stat: 'range', op: 'mul', value: 1.8 },
      { stat: 'spreadAngle', op: 'add', value: -0.8 },
    ],
    hasEffect: false,
    flavor: 'One shot, one soul.',
  },
  {
    id: 8,
    key: 'wide_choke',
    name: 'Wide Choke',
    description: '+3 pellets, +40% spread, -10% damage',
    characters: ['undertaker'],
    mods: [
      { stat: 'pelletCount', op: 'add', value: 3 },
      { stat: 'spreadAngle', op: 'add', value: 0.32 },
      { stat: 'bulletDamage', op: 'mul', value: 0.9 },
    ],
    hasEffect: false,
    flavor: 'Cover more ground. Literally.',
  },
  {
    id: 9,
    key: 'sawed_shorter',
    name: 'Sawed Shorter',
    description: '-30% range, +50% spread, +30% damage',
    characters: ['undertaker'],
    mods: [
      { stat: 'range', op: 'mul', value: 0.7 },
      { stat: 'spreadAngle', op: 'add', value: 0.4 },
      { stat: 'bulletDamage', op: 'mul', value: 1.3 },
    ],
    hasEffect: false,
    flavor: 'Shorter barrel, bigger mess.',
  },
  {
    id: 10,
    key: 'bottomless_shells',
    name: 'Bottomless Shells',
    description: '+2 barrel size, +20% reload',
    characters: ['undertaker'],
    mods: [
      { stat: 'cylinderSize', op: 'add', value: 2 },
      { stat: 'reloadTime', op: 'mul', value: 1.2 },
    ],
    hasEffect: false,
    flavor: 'Always one more in the chamber.',
  },
  {
    id: 11,
    key: 'grapeshot',
    name: 'Grapeshot',
    description: '8 pellets, wide spread, -40% range, -30% damage',
    characters: ['undertaker'],
    mods: [
      { stat: 'pelletCount', op: 'add', value: 3 },
      { stat: 'spreadAngle', op: 'add', value: 0.25 },
      { stat: 'range', op: 'mul', value: 0.6 },
      { stat: 'bulletDamage', op: 'mul', value: 0.7 },
    ],
    hasEffect: false,
    flavor: 'Like a cannon full of nails.',
  },
  {
    id: 12,
    key: 'crosshair_choke',
    name: 'Crosshair Choke',
    description: 'Tighter spread, +15% range',
    characters: ['undertaker'],
    mods: [
      { stat: 'spreadAngle', op: 'add', value: -0.3 },
      { stat: 'range', op: 'mul', value: 1.15 },
    ],
    hasEffect: false,
    flavor: 'Precision is a virtue, even for a shotgun.',
  },
]

// ============================================================================
// Prospector (Pickaxe) Mods
// ============================================================================

const PROSPECTOR_MODS: WeaponModDef[] = [
  {
    id: 13,
    key: 'tempered_edge',
    name: 'Tempered Edge',
    description: '+40% swing damage, -15% swing rate',
    characters: ['prospector'],
    mods: [
      { stat: 'swingDamage', op: 'mul', value: 1.4 },
      { stat: 'swingRate', op: 'mul', value: 0.85 },
    ],
    hasEffect: false,
    flavor: 'Hits like it means it.',
  },
  {
    id: 14,
    key: 'extended_handle',
    name: 'Extended Handle',
    description: '+50% reach, +30% cleave arc',
    characters: ['prospector'],
    mods: [
      { stat: 'reach', op: 'add', value: 30 },
      { stat: 'cleaveArc', op: 'add', value: 0.47 },
    ],
    hasEffect: false,
    flavor: 'Keep your enemies at arm\'s length. And then some.',
  },
  {
    id: 15,
    key: 'whirlwind_grip',
    name: 'Whirlwind Grip',
    description: '+50% swing rate, 360\u00B0 cleave, -30% damage',
    characters: ['prospector'],
    mods: [
      { stat: 'swingRate', op: 'mul', value: 1.5 },
      { stat: 'cleaveArc', op: 'add', value: 3.77 },
      { stat: 'swingDamage', op: 'mul', value: 0.7 },
    ],
    hasEffect: false,
    flavor: 'Spin to win.',
  },
  {
    id: 16,
    key: 'quick_release',
    name: 'Quick Release',
    description: '-40% charge time, +0.5 charge multiplier',
    characters: ['prospector'],
    mods: [
      { stat: 'chargeTime', op: 'mul', value: 0.6 },
      { stat: 'chargeMultiplier', op: 'add', value: 0.5 },
    ],
    hasEffect: false,
    flavor: 'Fast and furious.',
  },
  {
    id: 17,
    key: 'heavy_head',
    name: 'Heavy Head',
    description: '+80% knockback, +25% damage, -20% swing rate',
    characters: ['prospector'],
    mods: [
      { stat: 'knockback', op: 'add', value: 32 },
      { stat: 'swingDamage', op: 'mul', value: 1.25 },
      { stat: 'swingRate', op: 'mul', value: 0.8 },
    ],
    hasEffect: false,
    flavor: 'Physics is a weapon too.',
  },
  {
    id: 18,
    key: 'lightweight_pick',
    name: 'Lightweight Pick',
    description: '+30% swing rate, +20% speed, -20% damage',
    characters: ['prospector'],
    mods: [
      { stat: 'swingRate', op: 'mul', value: 1.3 },
      { stat: 'speed', op: 'mul', value: 1.2 },
      { stat: 'swingDamage', op: 'mul', value: 0.8 },
    ],
    hasEffect: false,
    flavor: 'Light on your feet, light in your hands.',
  },
]

// ============================================================================
// All Mods + Lookup
// ============================================================================

const ALL_WEAPON_MODS: WeaponModDef[] = [
  ...SHERIFF_MODS,
  ...UNDERTAKER_MODS,
  ...PROSPECTOR_MODS,
]

const MODS_BY_ID = new Map<number, WeaponModDef>()
for (const mod of ALL_WEAPON_MODS) {
  MODS_BY_ID.set(mod.id, mod)
}

const MODS_BY_CHARACTER = new Map<CharacterId, WeaponModDef[]>()
for (const mod of ALL_WEAPON_MODS) {
  for (const charId of mod.characters) {
    const list = MODS_BY_CHARACTER.get(charId) ?? []
    list.push(mod)
    MODS_BY_CHARACTER.set(charId, list)
  }
}

export function getWeaponModDef(id: number): WeaponModDef | undefined {
  return MODS_BY_ID.get(id)
}

export function getModsForCharacter(charId: CharacterId): readonly WeaponModDef[] {
  return MODS_BY_CHARACTER.get(charId) ?? []
}

export function getAllWeaponMods(): readonly WeaponModDef[] {
  return ALL_WEAPON_MODS
}
