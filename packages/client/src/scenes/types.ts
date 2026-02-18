import type { CharacterId } from '@high-noon/shared'

export type MinimapMarkerKind = 'self' | 'ally' | 'enemy' | 'npc' | 'salesman' | 'stash' | 'item' | 'potion'

export interface MinimapMarker {
  x: number
  y: number
  kind: MinimapMarkerKind
  rarity?: string
}

export interface MinimapState {
  mapWidth: number
  mapHeight: number
  markers: MinimapMarker[]
}

export interface HUDState {
  characterId: CharacterId
  hp: number
  maxHP: number
  hpPotions: number
  hpPotionsMax: number
  xp: number
  goldCollected: number
  killCount: number
  shovelCount: number
  interactionPrompt: string | null
  xpForCurrentLevel: number
  xpForNextLevel: number
  level: number
  waveNumber: number
  totalWaves: number
  waveStatus: 'active' | 'delay' | 'completed' | 'none'
  stageNumber: number
  totalStages: number
  stageStatus: 'active' | 'clearing' | 'camp' | 'completed' | 'none'
  narrativeThreadId: string | null
  narrativeThreadName: string | null
  campNarrativeLine: string | null
  resolutionText: string | null
  runIntroTitle: string | null
  runIntroText: string | null
  runIntroSequence: number
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
  pendingPoints: number
  isDead: boolean
  interactionFeedbackDescription?: string | null
  items: Array<{ itemId: number; key: string; name: string; description: string; rarity: string; stacks: number }>
  minimap: MinimapState | null
  objective: {
    type: string
    description: string
    status: 'active' | 'success' | 'soft_failure'
    progress: number
    /** Duel-only: forfeit warning timer (> 0 means player outside ring) */
    forfeitTimer?: number
  } | null
  campVisitor: {
    visitorId: number
    visitorName: string
    greeting: string
    offers: Array<{ itemId: number; itemName: string; itemDescription: string; rarity: string; price: number; sold: boolean }>
  } | null
  boss: {
    name: string
    hp: number
    maxHP: number
  } | null
}

export type SkillNodeState = 'taken' | 'available' | 'locked' | 'unimplemented'

export interface SkillTreeUIData {
  branches: Array<{
    id: string; name: string; description: string
    nodes: Array<{
      id: string; name: string; description: string; tier: number
      state: SkillNodeState
    }>
  }>
  pendingPoints: number
  level: number
}
