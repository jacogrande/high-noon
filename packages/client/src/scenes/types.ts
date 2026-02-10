export interface HUDState {
  hp: number
  maxHP: number
  xp: number
  xpForCurrentLevel: number
  xpForNextLevel: number
  level: number
  waveNumber: number
  totalWaves: number
  waveStatus: 'active' | 'delay' | 'completed' | 'none'
  cylinderRounds: number
  cylinderMax: number
  isReloading: boolean
  reloadProgress: number
  showdownActive: boolean
  showdownCooldown: number
  showdownCooldownMax: number
  showdownTimeLeft: number
  showdownDurationMax: number
  pendingPoints: number
  isDead: boolean
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
