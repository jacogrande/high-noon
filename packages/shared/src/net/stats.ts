/**
 * Post-run stat broadcast types.
 */

import type { PlayerRunStats } from '../sim/stats'

export interface PlayerStatEntry {
  sessionId: string
  characterId: string
  name: string
  stats: Omit<PlayerRunStats, '_currentStreak'>
}

export interface RunCompleteMessage {
  victory: boolean
  duration: number
  stagesCleared: number
  totalStages: number
  playerStats: PlayerStatEntry[]
}
