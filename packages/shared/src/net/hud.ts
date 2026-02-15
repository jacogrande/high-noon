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
  goldCollected: number
  shovelCount: number
  interactionPrompt: string | null
  pendingPoints: number
  xpForCurrentLevel: number
  xpForNextLevel: number

  // Wave status
  waveNumber: number
  totalWaves: number
  waveStatus: 'active' | 'delay' | 'completed' | 'none'

  // Stage progression
  stageNumber: number
  totalStages: number
  stageStatus: 'active' | 'clearing' | 'camp' | 'completed' | 'none'

  // Interaction feedback description (item received, etc.)
  interactionFeedbackDescription?: string

  // Items
  items: Array<{ itemId: number; key: string; name: string; description: string; rarity: string; stacks: number }>

  // Stage objective
  objective: {
    type: string
    description: string
    status: 'active' | 'success' | 'soft_failure'
    /** Protect: target HP fraction (0-1). Intercept: runners escaped / threshold. Duel: duelist HP fraction. */
    progress: number
    /** Duel-only: forfeit warning timer (> 0 means player outside ring) */
    forfeitTimer?: number
  } | null

  // Camp visitor
  campVisitor: {
    visitorId: number
    visitorName: string
    greeting: string
    offers: Array<{ itemId: number; itemName: string; itemDescription: string; rarity: string; price: number; sold: boolean }>
  } | null

  // Boss HP bar (top-of-screen)
  boss: {
    name: string
    hp: number
    maxHP: number
  } | null
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
