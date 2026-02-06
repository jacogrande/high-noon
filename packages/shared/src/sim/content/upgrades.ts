export enum UpgradeId {
  // Common (10)
  QUICK_DRAW, HEAVY_ROUNDS, LONG_BARREL, FAST_FEET, THICK_SKIN,
  QUICK_RELOAD, HOLLOW_POINT, FLEET_FOOTED, IRON_WILL, STEADY_AIM,
  // Rare (5)
  BULLET_STORM, JUGGERNAUT, GUNSLINGER, GHOST_ROLL, VAMPIRIC_ROUNDS,
}

export enum UpgradeRarity { COMMON, RARE }
export enum UpgradeTag { OFFENSIVE, DEFENSIVE, MOBILITY, UTILITY }

export type StatName =
  | 'fireRate' | 'bulletDamage' | 'bulletSpeed' | 'range'
  | 'speed' | 'maxHP' | 'iframeDuration'
  | 'rollDuration' | 'rollIframeRatio' | 'rollSpeedMultiplier'

export interface StatMod {
  stat: StatName
  op: 'add' | 'mul'
  value: number
}

export interface UpgradeDef {
  id: UpgradeId
  name: string
  description: string
  rarity: UpgradeRarity
  tags: UpgradeTag[]
  mods: StatMod[]
  maxStacks: number
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  [UpgradeId.QUICK_DRAW]: {
    id: UpgradeId.QUICK_DRAW,
    name: 'Quick Draw',
    description: '+20% fire rate',
    rarity: UpgradeRarity.COMMON,
    tags: [UpgradeTag.OFFENSIVE],
    mods: [{ stat: 'fireRate', op: 'mul', value: 1.2 }],
    maxStacks: 3,
  },
  [UpgradeId.HEAVY_ROUNDS]: {
    id: UpgradeId.HEAVY_ROUNDS,
    name: 'Heavy Rounds',
    description: '+30% bullet damage',
    rarity: UpgradeRarity.COMMON,
    tags: [UpgradeTag.OFFENSIVE],
    mods: [{ stat: 'bulletDamage', op: 'mul', value: 1.3 }],
    maxStacks: 3,
  },
  [UpgradeId.LONG_BARREL]: {
    id: UpgradeId.LONG_BARREL,
    name: 'Long Barrel',
    description: '+25% range',
    rarity: UpgradeRarity.COMMON,
    tags: [UpgradeTag.OFFENSIVE],
    mods: [{ stat: 'range', op: 'mul', value: 1.25 }],
    maxStacks: 3,
  },
  [UpgradeId.FAST_FEET]: {
    id: UpgradeId.FAST_FEET,
    name: 'Fast Feet',
    description: '+15% move speed',
    rarity: UpgradeRarity.COMMON,
    tags: [UpgradeTag.MOBILITY],
    mods: [{ stat: 'speed', op: 'mul', value: 1.15 }],
    maxStacks: 3,
  },
  [UpgradeId.THICK_SKIN]: {
    id: UpgradeId.THICK_SKIN,
    name: 'Thick Skin',
    description: '+1 max HP',
    rarity: UpgradeRarity.COMMON,
    tags: [UpgradeTag.DEFENSIVE],
    mods: [{ stat: 'maxHP', op: 'add', value: 1 }],
    maxStacks: 3,
  },
  [UpgradeId.QUICK_RELOAD]: {
    id: UpgradeId.QUICK_RELOAD,
    name: 'Quick Reload',
    description: '+15% fire rate',
    rarity: UpgradeRarity.COMMON,
    tags: [UpgradeTag.OFFENSIVE],
    mods: [{ stat: 'fireRate', op: 'mul', value: 1.15 }],
    maxStacks: 3,
  },
  [UpgradeId.HOLLOW_POINT]: {
    id: UpgradeId.HOLLOW_POINT,
    name: 'Hollow Point',
    description: '+20% bullet damage',
    rarity: UpgradeRarity.COMMON,
    tags: [UpgradeTag.OFFENSIVE],
    mods: [{ stat: 'bulletDamage', op: 'mul', value: 1.2 }],
    maxStacks: 3,
  },
  [UpgradeId.FLEET_FOOTED]: {
    id: UpgradeId.FLEET_FOOTED,
    name: 'Fleet Footed',
    description: '+10% move speed, +15% roll speed',
    rarity: UpgradeRarity.COMMON,
    tags: [UpgradeTag.MOBILITY],
    mods: [
      { stat: 'speed', op: 'mul', value: 1.1 },
      { stat: 'rollSpeedMultiplier', op: 'mul', value: 1.15 },
    ],
    maxStacks: 2,
  },
  [UpgradeId.IRON_WILL]: {
    id: UpgradeId.IRON_WILL,
    name: 'Iron Will',
    description: '+0.2s i-frame duration',
    rarity: UpgradeRarity.COMMON,
    tags: [UpgradeTag.DEFENSIVE],
    mods: [{ stat: 'iframeDuration', op: 'add', value: 0.2 }],
    maxStacks: 2,
  },
  [UpgradeId.STEADY_AIM]: {
    id: UpgradeId.STEADY_AIM,
    name: 'Steady Aim',
    description: '+20% bullet speed',
    rarity: UpgradeRarity.COMMON,
    tags: [UpgradeTag.UTILITY],
    mods: [{ stat: 'bulletSpeed', op: 'mul', value: 1.2 }],
    maxStacks: 3,
  },
  [UpgradeId.BULLET_STORM]: {
    id: UpgradeId.BULLET_STORM,
    name: 'Bullet Storm',
    description: '+40% fire rate, -15% damage',
    rarity: UpgradeRarity.RARE,
    tags: [UpgradeTag.OFFENSIVE],
    mods: [
      { stat: 'fireRate', op: 'mul', value: 1.4 },
      { stat: 'bulletDamage', op: 'mul', value: 0.85 },
    ],
    maxStacks: 2,
  },
  [UpgradeId.JUGGERNAUT]: {
    id: UpgradeId.JUGGERNAUT,
    name: 'Juggernaut',
    description: '+2 max HP, -10% move speed',
    rarity: UpgradeRarity.RARE,
    tags: [UpgradeTag.DEFENSIVE],
    mods: [
      { stat: 'maxHP', op: 'add', value: 2 },
      { stat: 'speed', op: 'mul', value: 0.9 },
    ],
    maxStacks: 2,
  },
  [UpgradeId.GUNSLINGER]: {
    id: UpgradeId.GUNSLINGER,
    name: 'Gunslinger',
    description: '+25% fire rate, +25% bullet speed',
    rarity: UpgradeRarity.RARE,
    tags: [UpgradeTag.OFFENSIVE],
    mods: [
      { stat: 'fireRate', op: 'mul', value: 1.25 },
      { stat: 'bulletSpeed', op: 'mul', value: 1.25 },
    ],
    maxStacks: 1,
  },
  [UpgradeId.GHOST_ROLL]: {
    id: UpgradeId.GHOST_ROLL,
    name: 'Ghost Roll',
    description: '+50% roll speed, +30% roll i-frames',
    rarity: UpgradeRarity.RARE,
    tags: [UpgradeTag.MOBILITY],
    mods: [
      { stat: 'rollSpeedMultiplier', op: 'mul', value: 1.5 },
      { stat: 'rollIframeRatio', op: 'mul', value: 1.3 },
    ],
    maxStacks: 1,
  },
  [UpgradeId.VAMPIRIC_ROUNDS]: {
    id: UpgradeId.VAMPIRIC_ROUNDS,
    name: 'Vampiric Rounds',
    description: 'Heal 1 HP every 15 kills',
    rarity: UpgradeRarity.RARE,
    tags: [UpgradeTag.DEFENSIVE, UpgradeTag.UTILITY],
    mods: [],
    maxStacks: 1,
  },
}

export const RARITY_WEIGHTS: Record<UpgradeRarity, number> = {
  [UpgradeRarity.COMMON]: 0.75,
  [UpgradeRarity.RARE]: 0.25,
}

export const CHOICES_PER_LEVEL = 3

/** Kill count for Vampiric Rounds heal trigger */
export const VAMPIRIC_ROUNDS_KILL_THRESHOLD = 15
