import type { CharacterId } from '@high-noon/shared'

export type MinimapMarkerKind = 'self' | 'ally' | 'enemy' | 'npc' | 'salesman' | 'stash' | 'item'

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
  xp: number
  goldCollected: number
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
  items: Array<{ itemId: number; key: string; name: string; rarity: string; stacks: number }>
  minimap: MinimapState | null
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
