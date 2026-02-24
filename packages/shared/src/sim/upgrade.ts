import type { CharacterDef, CharacterId, StatName, SkillNodeDef, SkillBranch } from './content/characters'
import { getLevelForXP } from './content/xp'
import { Weapon, Speed, Health, Cylinder } from './components'
import { hasComponent } from 'bitecs'
import type { GameWorld } from './world'
import { applyNodeEffect } from './content/nodeEffects'
import { clampDamage } from './damage'
import {
  getItemDef,
  getItemDefByKey,
  computeHyperbolicChance,
  TIN_STAR_COEFFICIENT,
  FOOLS_GOLD_PER_STACK,
  PROSPECTORS_MAP_PER_STACK,
  MAX_ITEM_SLOTS,
} from './content/items'
import { getWeaponModDef } from './content/weaponMods'

// Resolve item IDs once at module load to avoid hardcoding
const TIN_STAR_BADGE_ID = getItemDefByKey('tin_star_badge')!.id
const FOOLS_GOLD_NUGGET_ID = getItemDefByKey('fools_gold_nugget')!.id
const PROSPECTORS_MAP_ID = getItemDefByKey('prospectors_map')!.id
const WORN_SADDLEBAG_ID = getItemDefByKey('worn_saddlebag')!.id
const DEVILS_BARGAIN_ID = getItemDefByKey('devils_bargain')!.id
/** Loaded Dice: damage multiplier applied to all damage types. */
const LOADED_DICE_DAMAGE_MULTIPLIER = 0.7
/** Loaded Dice: proc chance multiplier applied to all proc-based items. */
const LOADED_DICE_PROC_MULTIPLIER = 2

export const HANGMANS_NOOSE_ID = getItemDefByKey('hangmans_noose')!.id
export const FOOLS_ERRAND_ID = getItemDefByKey('fools_errand')!.id
export const LOADED_DICE_ID = getItemDefByKey('loaded_dice')!.id
export const UNMARKED_GRAVE_ID = getItemDefByKey('unmarked_grave')!.id

export interface UpgradeState {
  characterDef: CharacterDef

  // XP/Level
  xp: number
  level: number

  // Skill tree
  pendingPoints: number
  nodesTaken: Set<string>

  // Computed stats (field names unchanged — zero downstream changes)
  fireRate: number
  bulletDamage: number
  bulletSpeed: number
  range: number
  speed: number
  maxHP: number
  iframeDuration: number
  rollDuration: number
  rollIframeRatio: number
  rollSpeedMultiplier: number
  cylinderSize: number
  reloadTime: number
  minFireInterval: number
  holdFireRate: number
  lastRoundMultiplier: number
  pelletCount: number
  spreadAngle: number
  showdownDuration: number
  showdownCooldown: number
  showdownKillRefund: number
  showdownDamageMultiplier: number
  showdownSpeedBonus: number
  showdownMarkRange: number

  // Zone/pulse stats (Undertaker)
  zoneRadius: number
  pulseDamage: number
  pulseRadius: number
  chainLimit: number

  // Melee stats (Prospector)
  swingDamage: number
  swingRate: number
  reach: number
  cleaveArc: number
  knockback: number
  chargeTime: number
  chargeMultiplier: number

  // Dynamite stats (Prospector)
  dynamiteDamage: number
  dynamiteRadius: number
  dynamiteFuse: number
  dynamiteCooldown: number

  // Gold Rush stats (Prospector)
  goldFeverBonus: number
  goldFeverDuration: number

  // Gold Fever buff state (Prospector)
  goldFeverStacks: number
  goldFeverTimer: number

  // Dynamite cook state (Prospector)
  dynamiteCooking: boolean
  dynamiteCookTimer: number

  // Tremor counter (Prospector)
  consecutiveSwings: number
  /** Time since last swing — resets consecutiveSwings after 2s idle */
  consecutiveSwingTimer: number

  // Timed buff state
  lastStandActive: boolean
  lastStandTimer: number

  // Weapon mods (Tinkerer, unique per run)
  weaponMods: Set<number>

  // Item inventory (itemId → stack count)
  items: Map<number, number>
  /** Current HP potion count in the dedicated consumable slot */
  hpPotionCount: number
  /** Computed block chance from Tin Star Badge (hyperbolic) */
  blockChance: number
  /** Computed gold multiplier from Fool's Gold Nugget */
  goldMultiplier: number
  /** Moonshine Flask internal cooldown timer */
  moonshineFlaskCooldown: number
  /** Guard flag to prevent Grim Harvest from infinite recursion */
  grimHarvestFiring: boolean

  // Undertaker buff timers
  deadweightBuffTimer: number
  corpseHarvestCooldownTimer: number
  openCasketAvailable: boolean
  openCasketCooldownTimer: number
  finalArrangementActive: boolean

  // Camp expansion item state
  /** Bandolier: damage multiplier for next shot after reload (0 = none) */
  bandolierFirstShotBonus: number
  /** Peacemaker: EID of last hit enemy */
  peacemakerLastTarget: number
  /** Peacemaker: consecutive hits on that target */
  peacemakerHitCount: number
  /** Witching Hour: whether double fire rate is active */
  witchingHourActive: boolean
  /** Witching Hour: remaining seconds of boost */
  witchingHourTimer: number
  /** Desert Rose: HP to heal at wave start */
  desertRoseHealQueued: number
  /** Computed max item slots (base + Worn Saddlebag stacks) */
  maxItems: number
  /** Hangman's Noose: accumulator for 5s HP drain */
  hangmansNooseDrainTimer: number
  /** Loaded Dice: multiplier for proc chances (default 1, set to 2 by Loaded Dice) */
  procChanceMultiplier: number
}

export function initUpgradeState(charDef: CharacterDef): UpgradeState {
  const b = charDef.baseStats
  return {
    characterDef: charDef,
    xp: 0,
    level: 0,
    pendingPoints: 0,
    nodesTaken: new Set(),
    fireRate: b.fireRate,
    bulletDamage: b.bulletDamage,
    bulletSpeed: b.bulletSpeed,
    range: b.range,
    speed: b.speed,
    maxHP: b.maxHP,
    iframeDuration: b.iframeDuration,
    rollDuration: b.rollDuration,
    rollIframeRatio: b.rollIframeRatio,
    rollSpeedMultiplier: b.rollSpeedMultiplier,
    cylinderSize: b.cylinderSize,
    reloadTime: b.reloadTime,
    minFireInterval: b.minFireInterval,
    holdFireRate: b.holdFireRate,
    lastRoundMultiplier: b.lastRoundMultiplier,
    pelletCount: b.pelletCount,
    spreadAngle: b.spreadAngle,
    showdownDuration: b.showdownDuration,
    showdownCooldown: b.showdownCooldown,
    showdownKillRefund: b.showdownKillRefund,
    showdownDamageMultiplier: b.showdownDamageMultiplier,
    showdownSpeedBonus: b.showdownSpeedBonus,
    showdownMarkRange: b.showdownMarkRange,
    zoneRadius: b.zoneRadius,
    pulseDamage: b.pulseDamage,
    pulseRadius: b.pulseRadius,
    chainLimit: b.chainLimit,
    swingDamage: b.swingDamage,
    swingRate: b.swingRate,
    reach: b.reach,
    cleaveArc: b.cleaveArc,
    knockback: b.knockback,
    chargeTime: b.chargeTime,
    chargeMultiplier: b.chargeMultiplier,
    dynamiteDamage: b.dynamiteDamage,
    dynamiteRadius: b.dynamiteRadius,
    dynamiteFuse: b.dynamiteFuse,
    dynamiteCooldown: b.dynamiteCooldown,
    goldFeverBonus: b.goldFeverBonus,
    goldFeverDuration: b.goldFeverDuration,
    goldFeverStacks: 0,
    goldFeverTimer: 0,
    weaponMods: new Set(),
    items: new Map(),
    hpPotionCount: 0,
    blockChance: 0,
    goldMultiplier: 1,
    moonshineFlaskCooldown: 0,
    grimHarvestFiring: false,
    dynamiteCooking: false,
    dynamiteCookTimer: 0,
    consecutiveSwings: 0,
    consecutiveSwingTimer: 0,
    lastStandActive: false,
    lastStandTimer: 0,
    deadweightBuffTimer: 0,
    corpseHarvestCooldownTimer: 0,
    openCasketAvailable: true,
    openCasketCooldownTimer: 0,
    finalArrangementActive: false,
    bandolierFirstShotBonus: 0,
    peacemakerLastTarget: 0xFFFF,
    peacemakerHitCount: 0,
    witchingHourActive: false,
    witchingHourTimer: 0,
    desertRoseHealQueued: 0,
    maxItems: MAX_ITEM_SLOTS,
    hangmansNooseDrainTimer: 0,
    procChanceMultiplier: 1,
  }
}

export function awardXP(state: UpgradeState, amount: number): boolean {
  state.xp += amount
  const newLevel = getLevelForXP(state.xp)
  if (newLevel > state.level) {
    state.pendingPoints += (newLevel - state.level)
    state.level = newLevel
    return true
  }
  return false
}

/**
 * Resolve upgrade state for a specific player entity.
 * Falls back to world.upgradeState for compatibility with single-player flows.
 */
export function getUpgradeStateForPlayer(world: GameWorld, playerEid: number): UpgradeState {
  return world.playerUpgradeStates.get(playerEid) ?? world.upgradeState
}

/**
 * Resolve character id for a specific player entity.
 * Falls back to world.characterId for compatibility with single-player flows.
 */
export function getCharacterIdForPlayer(world: GameWorld, playerEid: number): CharacterId {
  return world.playerCharacters.get(playerEid) ?? world.characterId
}

/**
 * Recompute all player stats from character base stats + taken skill node mods.
 * Order: all additive mods first, then all multiplicative mods.
 */
export function recomputePlayerStats(state: UpgradeState): void {
  const addTotals: Partial<Record<StatName, number>> = {}
  const mulTotals: Partial<Record<StatName, number>> = {}

  for (const nodeId of state.nodesTaken) {
    const result = findNode(state.characterDef, nodeId)
    if (!result) continue
    for (const mod of result.node.mods) {
      if (mod.op === 'add') {
        addTotals[mod.stat] = (addTotals[mod.stat] ?? 0) + mod.value
      } else {
        mulTotals[mod.stat] = (mulTotals[mod.stat] ?? 1) * mod.value
      }
    }
  }

  // Item stat mods (perStack * stacks)
  for (const [itemId, stacks] of state.items) {
    const def = getItemDef(itemId)
    if (!def) continue
    for (const mod of def.mods) {
      if (mod.op === 'add') {
        addTotals[mod.stat] = (addTotals[mod.stat] ?? 0) + mod.perStack * stacks
      } else {
        mulTotals[mod.stat] = (mulTotals[mod.stat] ?? 1) * (1 + mod.perStack * stacks)
      }
    }
  }

  // Weapon mod stat mods (Tinkerer)
  for (const modId of state.weaponMods) {
    const def = getWeaponModDef(modId)
    if (!def) continue
    for (const mod of def.mods) {
      if (mod.op === 'add') {
        addTotals[mod.stat] = (addTotals[mod.stat] ?? 0) + mod.value
      } else {
        mulTotals[mod.stat] = (mulTotals[mod.stat] ?? 1) * mod.value
      }
    }
  }

  const base = state.characterDef.baseStats
  const calc = (stat: StatName): number =>
    (base[stat] + (addTotals[stat] ?? 0)) * (mulTotals[stat] ?? 1)

  state.fireRate = calc('fireRate')
  state.bulletDamage = calc('bulletDamage')
  state.bulletSpeed = calc('bulletSpeed')
  state.range = calc('range')
  state.speed = calc('speed')
  state.maxHP = calc('maxHP')
  state.iframeDuration = calc('iframeDuration')
  state.rollDuration = calc('rollDuration')
  state.rollIframeRatio = calc('rollIframeRatio')
  state.rollSpeedMultiplier = calc('rollSpeedMultiplier')
  const rawCylinder = calc('cylinderSize')
  state.cylinderSize = rawCylinder > 0 ? Math.max(1, rawCylinder) : 0
  state.reloadTime = calc('reloadTime')
  state.minFireInterval = calc('minFireInterval')
  state.holdFireRate = calc('holdFireRate')
  state.lastRoundMultiplier = calc('lastRoundMultiplier')
  const rawPellets = calc('pelletCount')
  state.pelletCount = rawPellets > 0 ? Math.max(1, rawPellets) : 0
  state.spreadAngle = Math.max(0, calc('spreadAngle'))
  state.showdownDuration = calc('showdownDuration')
  state.showdownCooldown = calc('showdownCooldown')
  state.showdownKillRefund = calc('showdownKillRefund')
  state.showdownDamageMultiplier = calc('showdownDamageMultiplier')
  state.showdownSpeedBonus = calc('showdownSpeedBonus')
  state.showdownMarkRange = calc('showdownMarkRange')
  state.zoneRadius = calc('zoneRadius')
  state.pulseDamage = calc('pulseDamage')
  state.pulseRadius = calc('pulseRadius')
  state.chainLimit = calc('chainLimit')
  state.swingDamage = calc('swingDamage')
  state.swingRate = calc('swingRate')
  state.reach = calc('reach')
  state.cleaveArc = calc('cleaveArc')
  state.knockback = calc('knockback')
  state.chargeTime = calc('chargeTime')
  state.chargeMultiplier = calc('chargeMultiplier')
  state.dynamiteDamage = calc('dynamiteDamage')
  state.dynamiteRadius = calc('dynamiteRadius')
  state.dynamiteFuse = calc('dynamiteFuse')
  state.dynamiteCooldown = calc('dynamiteCooldown')
  state.goldFeverBonus = calc('goldFeverBonus')
  state.goldFeverDuration = calc('goldFeverDuration')

  // Computed item stats
  const tinStarStacks = state.items.get(TIN_STAR_BADGE_ID) ?? 0
  state.blockChance = computeHyperbolicChance(TIN_STAR_COEFFICIENT, tinStarStacks)

  const foolsGoldStacks = state.items.get(FOOLS_GOLD_NUGGET_ID) ?? 0
  const prospectorsMapStacks = state.items.get(PROSPECTORS_MAP_ID) ?? 0
  state.goldMultiplier = 1 + FOOLS_GOLD_PER_STACK * foolsGoldStacks + PROSPECTORS_MAP_PER_STACK * prospectorsMapStacks

  // Worn Saddlebag: +1 item slot per stack
  const saddlebagStacks = state.items.get(WORN_SADDLEBAG_ID) ?? 0
  state.maxItems = MAX_ITEM_SLOTS + saddlebagStacks

  // Devil's Bargain: +40% damage per stack, max HP halved per stack
  const devilsStacks = state.items.get(DEVILS_BARGAIN_ID) ?? 0
  if (devilsStacks > 0) {
    state.bulletDamage *= (1 + 0.40 * devilsStacks)
    state.maxHP = Math.ceil(state.maxHP / (1 + devilsStacks))
  }

  // Loaded Dice: all proc chances doubled, all damage -30%
  const loadedDiceStacks = state.items.get(LOADED_DICE_ID) ?? 0
  if (loadedDiceStacks > 0) {
    state.bulletDamage *= LOADED_DICE_DAMAGE_MULTIPLIER
    state.swingDamage *= LOADED_DICE_DAMAGE_MULTIPLIER
    state.dynamiteDamage *= LOADED_DICE_DAMAGE_MULTIPLIER
    state.pulseDamage *= LOADED_DICE_DAMAGE_MULTIPLIER
    state.procChanceMultiplier = LOADED_DICE_PROC_MULTIPLIER
  } else {
    state.procChanceMultiplier = 1
  }
}

/**
 * Check if a skill node can be taken.
 * Returns true if: pendingPoints > 0, not already taken, node is implemented,
 * and all lower-tier nodes in the same branch are taken.
 */
export function canTakeNode(state: UpgradeState, nodeId: string): boolean {
  if (state.pendingPoints <= 0) return false
  if (state.nodesTaken.has(nodeId)) return false

  const result = findNode(state.characterDef, nodeId)
  if (!result) return false

  const { node, branch } = result
  if (!node.implemented) return false

  // Check prerequisite: all lower-tier nodes in the same branch must be taken
  for (const branchNode of branch.nodes) {
    if (branchNode.tier < node.tier && !state.nodesTaken.has(branchNode.id)) {
      return false
    }
  }

  return true
}

/**
 * Take a skill node: validates, adds to nodesTaken, decrements pendingPoints,
 * recomputes stats, and registers behavioral hooks. Returns true on success.
 */
export function takeNode(state: UpgradeState, nodeId: string, world?: GameWorld): boolean {
  if (!canTakeNode(state, nodeId)) return false
  state.nodesTaken.add(nodeId)
  state.pendingPoints--
  recomputePlayerStats(state)

  // Register behavioral hooks for this node (if any)
  if (world) {
    applyNodeEffect(world, nodeId)
  }

  return true
}

/**
 * Find a skill node by ID across all branches.
 */
export function findNode(
  charDef: CharacterDef,
  nodeId: string,
): { node: SkillNodeDef; branch: SkillBranch } | null {
  for (const branch of charDef.branches) {
    for (const node of branch.nodes) {
      if (node.id === nodeId) return { node, branch }
    }
  }
  return null
}

// Last Stand buff multipliers (applied idempotently in writeStatsToECS)
const LAST_STAND_DAMAGE_BONUS = 1.5
const LAST_STAND_SPEED_BONUS = 1.2

/**
 * Write computed stats from UpgradeState into ECS components on the player entity.
 * Also applies active timed buffs (Last Stand) idempotently.
 */
export function writeStatsToECS(
  world: GameWorld,
  playerEid: number,
  state: UpgradeState = getUpgradeStateForPlayer(world, playerEid),
): void {

  // Weapon stats
  let bulletDamage = state.bulletDamage
  let speed = state.speed

  // Apply Last Stand buff bonuses (idempotent — always computed from base)
  if (state.lastStandActive) {
    bulletDamage *= LAST_STAND_DAMAGE_BONUS
    speed *= LAST_STAND_SPEED_BONUS
  }

  Weapon.fireRate[playerEid] = state.fireRate
  Weapon.bulletDamage[playerEid] = clampDamage(bulletDamage)
  Weapon.bulletSpeed[playerEid] = state.bulletSpeed
  Weapon.range[playerEid] = state.range

  // Movement
  Speed.max[playerEid] = speed
  Speed.current[playerEid] = speed

  // Health — heal the delta if max increased
  const oldMax = Health.max[playerEid]!
  Health.max[playerEid] = state.maxHP
  if (state.maxHP > oldMax) {
    Health.current[playerEid] = Math.min(
      Health.current[playerEid]! + (state.maxHP - oldMax),
      state.maxHP,
    )
  }

  // I-frame duration
  Health.iframeDuration[playerEid] = state.iframeDuration

  // Cylinder stats — grant extra rounds immediately if capacity increased
  // Skip for Prospector (no Cylinder component)
  if (hasComponent(world, Cylinder, playerEid)) {
    const newMaxRounds = Math.round(state.cylinderSize)
    const oldMaxRounds = Cylinder.maxRounds[playerEid]!
    Cylinder.maxRounds[playerEid] = newMaxRounds
    if (newMaxRounds > oldMaxRounds && Cylinder.reloading[playerEid] === 0) {
      Cylinder.rounds[playerEid] = Math.min(
        Cylinder.rounds[playerEid]! + (newMaxRounds - oldMaxRounds),
        newMaxRounds,
      )
    }
    Cylinder.reloadTime[playerEid] = state.reloadTime
  }
}

// ============================================================================
// Item Inventory Helpers
// ============================================================================

/** Number of distinct item slots currently occupied */
export function getItemCount(state: UpgradeState): number {
  return state.items.size
}

/** Get stack count for a specific item (0 if not held) */
export function getItemStacks(state: UpgradeState, itemId: number): number {
  return state.items.get(itemId) ?? 0
}

/**
 * Add one copy of an item to inventory.
 * Returns true if successfully added, false if inventory full or at maxStack.
 */
export function addItem(state: UpgradeState, itemId: number): boolean {
  const def = getItemDef(itemId)
  if (!def) return false

  const current = state.items.get(itemId) ?? 0
  if (current > 0) {
    // Already have this item — try to stack
    if (current >= def.maxStack) return false
    state.items.set(itemId, current + 1)
    return true
  }

  // New item — check slot cap (dynamic via Worn Saddlebag)
  if (state.items.size >= state.maxItems) return false
  state.items.set(itemId, 1)
  return true
}

/**
 * Add an item to a player's inventory and recompute stats + hooks.
 * Caller must provide the hook reapply function to avoid circular imports
 * (itemEffects.ts depends on upgrade.ts).
 * Returns true if successfully added.
 */
export function addItemToPlayer(
  world: GameWorld,
  playerEid: number,
  itemId: number,
  reapplyHooks: (world: GameWorld, playerEid: number, items: Map<number, number>) => void,
): boolean {
  const state = getUpgradeStateForPlayer(world, playerEid)
  if (!addItem(state, itemId)) return false
  recomputePlayerStats(state)
  writeStatsToECS(world, playerEid, state)
  reapplyHooks(world, playerEid, state.items)
  return true
}
