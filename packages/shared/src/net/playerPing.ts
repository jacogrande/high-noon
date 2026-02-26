/**
 * Player Ping Protocol
 *
 * Contextual pings for team communication in co-op. Separate from
 * clock ping/pong (clock.ts) — these are player-initiated map markers.
 *
 * Flow: Client → Server (validate + relay) → All Clients (render)
 * Pings are purely visual/social — no simulation impact.
 */

export type PingType = 'location' | 'enemy' | 'danger'

/** Client → Server */
export interface PlayerPingRequest {
  type: PingType
  worldX: number
  worldY: number
  /** Entity ID for enemy pings (server validates entity exists) */
  targetEid?: number
}

/** Server → All Clients */
export interface PlayerPingEvent {
  type: PingType
  worldX: number
  worldY: number
  targetEid?: number
  /** Entity ID of the player who sent the ping */
  senderEid: number
  /** Server tick when the ping was created */
  tick: number
}

/** Ping lifetime in seconds */
export const PING_LIFETIME_S = 5.0
/** Ping lifetime in ticks (60 Hz) */
export const PING_LIFETIME_TICKS = 300
/** Minimum seconds between pings per player (server-enforced) */
export const PING_COOLDOWN_S = 1.0
/** Maximum active pings per player */
export const PING_MAX_ACTIVE = 3
