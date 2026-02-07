import {
  UPGRADES, CHOICES_PER_LEVEL, RARITY_WEIGHTS, UpgradeRarity,
  type UpgradeDef, type UpgradeId,
} from './content/upgrades'
import type { SeededRng } from '../math/rng'
import {
  PLAYER_SPEED, PLAYER_HP, PLAYER_IFRAME_DURATION,
  ROLL_DURATION, ROLL_IFRAME_RATIO, ROLL_SPEED_MULTIPLIER,
} from './content/player'
import {
  PISTOL_FIRE_RATE, PISTOL_BULLET_SPEED,
  PISTOL_BULLET_DAMAGE, PISTOL_RANGE,
  PISTOL_CYLINDER_SIZE, PISTOL_RELOAD_TIME,
  PISTOL_MIN_FIRE_INTERVAL, PISTOL_HOLD_FIRE_RATE,
  PISTOL_LAST_ROUND_MULTIPLIER,
  SHOWDOWN_DURATION, SHOWDOWN_COOLDOWN,
  SHOWDOWN_KILL_REFUND, SHOWDOWN_DAMAGE_MULTIPLIER,
  SHOWDOWN_SPEED_BONUS, SHOWDOWN_MARK_RANGE,
} from './content/weapons'
import { getLevelForXP } from './content/xp'
import { Weapon, Speed, Health, Cylinder } from './components'
import type { GameWorld } from './world'

export interface UpgradeState {
  xp: number
  level: number
  pendingChoices: UpgradeDef[]     // empty = no pending level-up
  acquired: Map<UpgradeId, number> // upgradeId → stack count
  killCounter: number              // for vampiric rounds

  // Computed stats (base + all mods applied)
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
  showdownDuration: number
  showdownCooldown: number
  showdownKillRefund: number
  showdownDamageMultiplier: number
  showdownSpeedBonus: number
  showdownMarkRange: number
}

export function initUpgradeState(): UpgradeState {
  return {
    xp: 0,
    level: 0,
    pendingChoices: [],
    acquired: new Map(),
    killCounter: 0,
    fireRate: PISTOL_FIRE_RATE,
    bulletDamage: PISTOL_BULLET_DAMAGE,
    bulletSpeed: PISTOL_BULLET_SPEED,
    range: PISTOL_RANGE,
    speed: PLAYER_SPEED,
    maxHP: PLAYER_HP,
    iframeDuration: PLAYER_IFRAME_DURATION,
    rollDuration: ROLL_DURATION,
    rollIframeRatio: ROLL_IFRAME_RATIO,
    rollSpeedMultiplier: ROLL_SPEED_MULTIPLIER,
    cylinderSize: PISTOL_CYLINDER_SIZE,
    reloadTime: PISTOL_RELOAD_TIME,
    minFireInterval: PISTOL_MIN_FIRE_INTERVAL,
    holdFireRate: PISTOL_HOLD_FIRE_RATE,
    lastRoundMultiplier: PISTOL_LAST_ROUND_MULTIPLIER,
    showdownDuration: SHOWDOWN_DURATION,
    showdownCooldown: SHOWDOWN_COOLDOWN,
    showdownKillRefund: SHOWDOWN_KILL_REFUND,
    showdownDamageMultiplier: SHOWDOWN_DAMAGE_MULTIPLIER,
    showdownSpeedBonus: SHOWDOWN_SPEED_BONUS,
    showdownMarkRange: SHOWDOWN_MARK_RANGE,
  }
}

export function awardXP(state: UpgradeState, amount: number): boolean {
  state.xp += amount
  const newLevel = getLevelForXP(state.xp)
  if (newLevel > state.level) {
    state.level = newLevel
    return true
  }
  return false
}

/**
 * Recompute all player stats from base constants + acquired upgrade mods.
 * Order: all additive mods first, then all multiplicative mods.
 * Multiplicative stacking uses exponentiation (e.g. 3 stacks of 1.2x = 1.2^3).
 */
export function recomputePlayerStats(state: UpgradeState): void {
  // Accumulate add/mul totals per stat across all acquired upgrades
  const addTotals: Record<string, number> = {}
  const mulTotals: Record<string, number> = {}

  for (const [id, stacks] of state.acquired) {
    const def = UPGRADES[id]
    for (const mod of def.mods) {
      if (mod.op === 'add') {
        addTotals[mod.stat] = (addTotals[mod.stat] ?? 0) + mod.value * stacks
      } else {
        mulTotals[mod.stat] = (mulTotals[mod.stat] ?? 1) * (mod.value ** stacks)
      }
    }
  }

  // (base + additive sum) * multiplicative product
  const calc = (base: number, stat: string): number =>
    (base + (addTotals[stat] ?? 0)) * (mulTotals[stat] ?? 1)

  state.fireRate = calc(PISTOL_FIRE_RATE, 'fireRate')
  state.bulletDamage = calc(PISTOL_BULLET_DAMAGE, 'bulletDamage')
  state.bulletSpeed = calc(PISTOL_BULLET_SPEED, 'bulletSpeed')
  state.range = calc(PISTOL_RANGE, 'range')
  state.speed = calc(PLAYER_SPEED, 'speed')
  state.maxHP = calc(PLAYER_HP, 'maxHP')
  state.iframeDuration = calc(PLAYER_IFRAME_DURATION, 'iframeDuration')
  state.rollDuration = calc(ROLL_DURATION, 'rollDuration')
  state.rollIframeRatio = calc(ROLL_IFRAME_RATIO, 'rollIframeRatio')
  state.rollSpeedMultiplier = calc(ROLL_SPEED_MULTIPLIER, 'rollSpeedMultiplier')

  // Cylinder stats (no upgrade mods defined yet, but calc() will apply them when added)
  state.cylinderSize = calc(PISTOL_CYLINDER_SIZE, 'cylinderSize')
  state.reloadTime = calc(PISTOL_RELOAD_TIME, 'reloadTime')
  state.minFireInterval = calc(PISTOL_MIN_FIRE_INTERVAL, 'minFireInterval')
  state.holdFireRate = calc(PISTOL_HOLD_FIRE_RATE, 'holdFireRate')
  state.lastRoundMultiplier = calc(PISTOL_LAST_ROUND_MULTIPLIER, 'lastRoundMultiplier')

  // Showdown stats
  state.showdownDuration = calc(SHOWDOWN_DURATION, 'showdownDuration')
  state.showdownCooldown = calc(SHOWDOWN_COOLDOWN, 'showdownCooldown')
  state.showdownKillRefund = calc(SHOWDOWN_KILL_REFUND, 'showdownKillRefund')
  state.showdownDamageMultiplier = calc(SHOWDOWN_DAMAGE_MULTIPLIER, 'showdownDamageMultiplier')
  state.showdownSpeedBonus = calc(SHOWDOWN_SPEED_BONUS, 'showdownSpeedBonus')
  state.showdownMarkRange = calc(SHOWDOWN_MARK_RANGE, 'showdownMarkRange')
}

/**
 * Apply an upgrade: increment stack count and recompute stats.
 * No-op if the upgrade is already at maxStacks.
 */
export function applyUpgrade(state: UpgradeState, id: UpgradeId): void {
  const def = UPGRADES[id]
  const current = state.acquired.get(id) ?? 0
  if (current >= def.maxStacks) return
  state.acquired.set(id, current + 1)
  recomputePlayerStats(state)
}

/**
 * Write computed stats from UpgradeState into ECS components on the player entity.
 * Call after applyUpgrade() to push changes into the simulation.
 */
export function writeStatsToECS(world: GameWorld, playerEid: number): void {
  const state = world.upgradeState

  // Weapon stats
  Weapon.fireRate[playerEid] = state.fireRate
  Weapon.bulletDamage[playerEid] = Math.min(255, Math.round(state.bulletDamage))
  Weapon.bulletSpeed[playerEid] = state.bulletSpeed
  Weapon.range[playerEid] = state.range

  // Movement
  Speed.max[playerEid] = state.speed
  Speed.current[playerEid] = state.speed

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

  // Cylinder stats (only maxRounds and reloadTime — live state is not overwritten)
  Cylinder.maxRounds[playerEid] = Math.round(state.cylinderSize)
  Cylinder.reloadTime[playerEid] = state.reloadTime
}

/**
 * Generate weighted random upgrade choices for a level-up.
 * Uses seeded RNG for determinism. No duplicates in a single choice set.
 * Excludes upgrades that are already at maxStacks.
 */
export function generateUpgradeChoices(
  state: UpgradeState,
  rng: SeededRng,
  count: number = CHOICES_PER_LEVEL,
): UpgradeDef[] {
  // Collect all non-maxed upgrades, split by rarity
  const common: UpgradeDef[] = []
  const rare: UpgradeDef[] = []

  for (const def of Object.values(UPGRADES) as UpgradeDef[]) {
    const stacks = state.acquired.get(def.id) ?? 0
    if (stacks >= def.maxStacks) continue
    // Skip upgrades with no stat mods (e.g. Vampiric Rounds — mechanic not yet implemented)
    if (def.mods.length === 0) continue
    if (def.rarity === UpgradeRarity.COMMON) common.push(def)
    else rare.push(def)
  }

  const available = common.length + rare.length
  if (available === 0) return []

  const choices: UpgradeDef[] = []
  const chosenIds = new Set<UpgradeId>()
  const actualCount = Math.min(count, available)

  for (let i = 0; i < actualCount; i++) {
    // Roll rarity: 25% Rare, 75% Common
    const wantRare = rng.next() < RARITY_WEIGHTS[UpgradeRarity.RARE]

    // Get pool for rolled rarity, excluding already-chosen
    let pool = (wantRare ? rare : common).filter(d => !chosenIds.has(d.id))

    // Fallback to other rarity if pool exhausted
    if (pool.length === 0) {
      pool = (wantRare ? common : rare).filter(d => !chosenIds.has(d.id))
    }

    if (pool.length === 0) break

    const pick = pool[rng.nextInt(pool.length)]!
    choices.push(pick)
    chosenIds.add(pick.id)
  }

  return choices
}
