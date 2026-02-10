import type { CharacterId } from '../sim/content/characters'

export type LobbyPhase = 'lobby' | 'playing'

export interface LobbyPlayerState {
  sessionId: string
  name: string
  characterId: CharacterId
  ready: boolean
}

export interface LobbyState {
  phase: LobbyPhase
  players: LobbyPlayerState[]
  serverTick: number
}
