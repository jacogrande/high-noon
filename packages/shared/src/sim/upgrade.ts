import type { CharacterDef, StatName, SkillNodeDef, SkillBranch } from './content/characters'
import { getLevelForXP } from './content/xp'
import { Weapon, Speed, Health, Cylinder } from './components'
import type { GameWorld } from './world'

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
  showdownDuration: number
  showdownCooldown: number
  showdownKillRefund: number
  showdownDamageMultiplier: number
  showdownSpeedBonus: number
  showdownMarkRange: number
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
    showdownDuration: b.showdownDuration,
    showdownCooldown: b.showdownCooldown,
    showdownKillRefund: b.showdownKillRefund,
    showdownDamageMultiplier: b.showdownDamageMultiplier,
    showdownSpeedBonus: b.showdownSpeedBonus,
    showdownMarkRange: b.showdownMarkRange,
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
  state.cylinderSize = calc('cylinderSize')
  state.reloadTime = calc('reloadTime')
  state.minFireInterval = calc('minFireInterval')
  state.holdFireRate = calc('holdFireRate')
  state.lastRoundMultiplier = calc('lastRoundMultiplier')
  state.showdownDuration = calc('showdownDuration')
  state.showdownCooldown = calc('showdownCooldown')
  state.showdownKillRefund = calc('showdownKillRefund')
  state.showdownDamageMultiplier = calc('showdownDamageMultiplier')
  state.showdownSpeedBonus = calc('showdownSpeedBonus')
  state.showdownMarkRange = calc('showdownMarkRange')
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
 * and recomputes stats. Returns true on success.
 */
export function takeNode(state: UpgradeState, nodeId: string): boolean {
  if (!canTakeNode(state, nodeId)) return false
  state.nodesTaken.add(nodeId)
  state.pendingPoints--
  recomputePlayerStats(state)
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

/**
 * Write computed stats from UpgradeState into ECS components on the player entity.
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
