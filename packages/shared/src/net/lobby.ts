import type { CharacterId } from '../sim/content/characters'

export type LobbyPhase = 'lobby' | 'playing'

export interface LobbyPlayerState {
  sessionId: string
  name: string
  characterId: CharacterId
  ready: boolean
}

export type FriendlyFireMode = 'none' | 'reduced' | 'full'

export interface LobbyState {
  phase: LobbyPhase
  players: LobbyPlayerState[]
  serverTick: number
  roomCode: string
  friendlyFire: FriendlyFireMode
}

/**
 * Characters allowed in room codes — uppercase alphanumeric,
 * excluding ambiguous characters (0/O, 1/I/L).
 */
export const ROOM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 6

/** Sentinel room code used for Quick Play matchmaking */
export const QUICK_PLAY_CODE = 'QUICKPLAY'
