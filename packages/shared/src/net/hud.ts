/**
 * Per-client HUD data sent from server at 10Hz.
 */
import type { CharacterId } from '../sim/content/characters'

export interface AbilityHudStats {
  showdownCooldown: number
  showdownDuration: number
  dynamiteCooldown: number
  dynamiteFuse: number
  dynamiteCooking: boolean
  dynamiteCookTimer: number
}

export interface AbilityHudRuntime {
  showdownActive?: boolean
  showdownCooldown?: number
  showdownDuration?: number
}

export interface AbilityHudState {
  abilityName: string
  abilityActive: boolean
  abilityCooldown: number
  abilityCooldownMax: number
  abilityTimeLeft: number
  abilityDurationMax: number
  showdownActive: boolean
  showdownCooldown: number
  showdownCooldownMax: number
  showdownTimeLeft: number
  showdownDurationMax: number
}

export interface HudData {
  characterId: CharacterId
  hp: number
  maxHp: number
  cylinderRounds: number
  cylinderMax: number
  isReloading: boolean
  reloadProgress: number
  showCylinder: boolean
  abilityName: string
  abilityActive: boolean
  abilityCooldown: number
  abilityCooldownMax: number
  abilityTimeLeft: number
  abilityDurationMax: number

  /** Legacy Sheriff-specific aliases kept for incremental migration */
  showdownActive: boolean
  showdownCooldown: number
  showdownCooldownMax: number
  showdownTimeLeft: number
  showdownDurationMax: number

  // XP / Level
  xp: number
  level: number
  pendingPoints: number
  xpForCurrentLevel: number
  xpForNextLevel: number

  // Wave status
  waveNumber: number
  totalWaves: number
  waveStatus: 'active' | 'delay' | 'completed' | 'none'
}

export interface SelectNodeRequest { nodeId: string }
export interface SelectNodeResponse { success: boolean; nodeId: string }

/**
 * Shared ability HUD derivation used by single-player, multiplayer, and server HUD push.
 * Keeps ability naming/timers consistent across all modes.
 */
export function deriveAbilityHudState(
  characterId: CharacterId,
  stats: AbilityHudStats,
  runtime: AbilityHudRuntime = {},
): AbilityHudState {
  const showdownActive = runtime.showdownActive ?? false
  const showdownCooldown = runtime.showdownCooldown ?? 0
  const showdownDuration = runtime.showdownDuration ?? 0

  let abilityName = 'ABILITY'
  let abilityActive = false
  let abilityCooldown = 0
  let abilityCooldownMax = 0
  let abilityTimeLeft = 0
  let abilityDurationMax = 0

  if (characterId === 'sheriff' || characterId === 'undertaker') {
    abilityName = characterId === 'sheriff' ? 'SHOWDOWN' : 'LAST RITES'
    abilityActive = showdownActive
    abilityCooldown = showdownCooldown
    abilityCooldownMax = stats.showdownCooldown
    abilityTimeLeft = showdownDuration
    abilityDurationMax = stats.showdownDuration
  } else if (characterId === 'prospector') {
    abilityName = 'DYNAMITE'
    abilityActive = stats.dynamiteCooking
    abilityCooldown = showdownCooldown
    abilityCooldownMax = stats.dynamiteCooldown
    abilityTimeLeft = stats.dynamiteCooking
      ? Math.max(0, stats.dynamiteFuse - stats.dynamiteCookTimer)
      : 0
    abilityDurationMax = stats.dynamiteFuse
  }

  return {
    abilityName,
    abilityActive,
    abilityCooldown,
    abilityCooldownMax,
    abilityTimeLeft,
    abilityDurationMax,
    showdownActive: abilityActive,
    showdownCooldown: abilityCooldown,
    showdownCooldownMax: abilityCooldownMax,
    showdownTimeLeft: abilityTimeLeft,
    showdownDurationMax: abilityDurationMax,
  }
}
