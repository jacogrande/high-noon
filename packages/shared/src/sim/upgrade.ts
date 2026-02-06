import type { UpgradeDef, UpgradeId } from './content/upgrades'
import {
  PLAYER_SPEED, PLAYER_HP, PLAYER_IFRAME_DURATION,
  ROLL_DURATION, ROLL_IFRAME_RATIO, ROLL_SPEED_MULTIPLIER,
} from './content/player'
import {
  PISTOL_FIRE_RATE, PISTOL_BULLET_SPEED,
  PISTOL_BULLET_DAMAGE, PISTOL_RANGE,
} from './content/weapons'
import { getLevelForXP } from './content/xp'

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
