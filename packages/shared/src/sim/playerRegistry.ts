/**
 * Player Registry
 *
 * Maps session IDs to player entities for multiplayer.
 * Used by the server to spawn/despawn players on join/leave
 * and route per-player input to the correct entity.
 */

import { removeEntity } from 'bitecs'
import type { GameWorld } from './world'
import type { UpgradeState } from './upgrade'
import { spawnPlayer } from './prefabs'
import { getArenaCenter } from './content/maps/testArena'

/** Maximum number of concurrent players */
export const MAX_PLAYERS = 8

/** Spawn offsets from arena center for each slot (symmetric layout) */
const SPAWN_OFFSETS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: 0, dy: 0 },      // slot 0: center
  { dx: -64, dy: 0 },     // slot 1: left
  { dx: 64, dy: 0 },      // slot 2: right
  { dx: 0, dy: -64 },     // slot 3: up
  { dx: 0, dy: 64 },      // slot 4: down
  { dx: -64, dy: -64 },   // slot 5: top-left
  { dx: 64, dy: -64 },    // slot 6: top-right
  { dx: 64, dy: 64 },     // slot 7: bottom-right
]

/**
 * Find the lowest available slot not currently used by any player.
 */
function nextSlot(world: GameWorld): number {
  const usedSlots = new Set<number>()
  for (const info of world.players.values()) {
    usedSlots.add(info.slot)
  }
  for (let i = 0; i < MAX_PLAYERS; i++) {
    if (!usedSlots.has(i)) return i
  }
  return -1
}

/**
 * Add a player to the world, keyed by session ID.
 *
 * @param world - The game world
 * @param sessionId - Unique session identifier (e.g. Colyseus session ID)
 * @returns The entity ID of the newly spawned player
 * @throws If sessionId is already registered or room is full
 */
export function addPlayer(world: GameWorld, sessionId: string, upgradeState?: UpgradeState): number {
  if (world.players.has(sessionId)) {
    throw new Error(`Player session already registered: ${sessionId}`)
  }

  const slot = nextSlot(world)
  if (slot === -1) {
    throw new Error(`Room is full (max ${MAX_PLAYERS} players)`)
  }

  const { x: cx, y: cy } = getArenaCenter()
  const offset = SPAWN_OFFSETS[slot]!
  const eid = spawnPlayer(world, cx + offset.dx, cy + offset.dy, slot, upgradeState)

  world.players.set(sessionId, { eid, slot })
  return eid
}

/**
 * Remove a player from the world by session ID.
 * Idempotent — no-op if session is unknown.
 *
 * @param world - The game world
 * @param sessionId - Unique session identifier
 */
export function removePlayer(world: GameWorld, sessionId: string): void {
  const info = world.players.get(sessionId)
  if (!info) return

  world.playerInputs.delete(info.eid)
  world.rollDodgedBullets.delete(info.eid)
  world.lastPlayerHitDir.delete(info.eid)
  world.playerUpgradeStates.delete(info.eid)
  world.playerCharacters.delete(info.eid)
  world.lastRitesZones.delete(info.eid)
  removeEntity(world, info.eid)
  world.players.delete(sessionId)
}

/**
 * Get the entity ID for a session, or undefined if not registered.
 *
 * @param world - The game world
 * @param sessionId - Unique session identifier
 * @returns The player entity ID, or undefined
 */
export function getPlayerEntity(world: GameWorld, sessionId: string): number | undefined {
  return world.players.get(sessionId)?.eid
}
