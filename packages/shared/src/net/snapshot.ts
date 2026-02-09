/**
 * Binary Snapshot Serialization (v3)
 *
 * Encodes/decodes the world state into a compact binary format for
 * server→client broadcast at 20Hz.
 */

import { defineQuery, hasComponent } from 'bitecs'
import {
  Position,
  Velocity,
  Player,
  PlayerState,
  Health,
  Dead,
  Invincible,
  Bullet,
  Collider,
  Enemy,
  EnemyAI,
} from '../sim/components'
import { playerQuery } from '../sim/queries'
import type { GameWorld } from '../sim/world'

// ============================================================================
// Constants
// ============================================================================

export const SNAPSHOT_VERSION = 3

/** Header: version(1) + tick(4) + serverTime(4) + playerCount(1) + bulletCount(2) + enemyCount(2) */
export const HEADER_SIZE = 14
export const PLAYER_SIZE = 21
export const BULLET_SIZE = 19
export const ENEMY_SIZE = 13

// ============================================================================
// Snapshot Types
// ============================================================================

export interface PlayerSnapshot {
  eid: number
  x: number
  y: number
  aimAngle: number
  state: number
  hp: number
  flags: number
  lastProcessedSeq: number
}

export interface BulletSnapshot {
  eid: number
  x: number
  y: number
  vx: number
  vy: number
  layer: number
}

export interface EnemySnapshot {
  eid: number
  x: number
  y: number
  type: number
  hp: number
  aiState: number
}

export interface WorldSnapshot {
  tick: number
  serverTime: number
  players: PlayerSnapshot[]
  bullets: BulletSnapshot[]
  enemies: EnemySnapshot[]
}

// ============================================================================
// Queries
// ============================================================================

const bulletQuery = defineQuery([Bullet, Position, Velocity, Collider])
const enemyQuery = defineQuery([Enemy, Position, Health, EnemyAI])

// ============================================================================
// Reusable buffer
// ============================================================================

const INITIAL_BUFFER_SIZE = 16 * 1024 // 16KB
let sharedBuffer = new ArrayBuffer(INITIAL_BUFFER_SIZE)

function clampHP(val: number): number {
  return Math.max(0, Math.min(255, val)) | 0
}

// ============================================================================
// Encoder
// ============================================================================

export function encodeSnapshot(
  world: GameWorld,
  serverTime: number,
  playerSeqs?: Map<number, number>,
): Uint8Array {
  const players = playerQuery(world)
  const bullets = bulletQuery(world)

  // Filter out dead enemies
  const allEnemies = enemyQuery(world)
  const enemies: number[] = []
  for (let i = 0; i < allEnemies.length; i++) {
    if (!hasComponent(world, Dead, allEnemies[i]!)) {
      enemies.push(allEnemies[i]!)
    }
  }

  const totalSize =
    HEADER_SIZE +
    players.length * PLAYER_SIZE +
    bullets.length * BULLET_SIZE +
    enemies.length * ENEMY_SIZE

  // Grow shared buffer if needed
  if (totalSize > sharedBuffer.byteLength) {
    sharedBuffer = new ArrayBuffer(totalSize * 2)
  }

  const view = new DataView(sharedBuffer)
  let offset = 0

  // Version byte
  view.setUint8(offset, SNAPSHOT_VERSION)
  offset += 1

  // Header
  view.setUint32(offset, world.tick, true)
  offset += 4
  view.setFloat32(offset, serverTime, true)
  offset += 4
  view.setUint8(offset, players.length)
  offset += 1
  view.setUint16(offset, bullets.length, true)
  offset += 2
  view.setUint16(offset, enemies.length, true)
  offset += 2

  // Players
  for (let i = 0; i < players.length; i++) {
    const eid = players[i]!
    view.setUint16(offset, eid, true)
    offset += 2
    view.setFloat32(offset, Position.x[eid]!, true)
    offset += 4
    view.setFloat32(offset, Position.y[eid]!, true)
    offset += 4
    view.setFloat32(offset, Player.aimAngle[eid]!, true)
    offset += 4
    view.setUint8(offset, PlayerState.state[eid]!)
    offset += 1
    view.setUint8(offset, clampHP(Health.current[eid]!))
    offset += 1

    let flags = 0
    if (hasComponent(world, Dead, eid)) flags |= 1
    if (hasComponent(world, Invincible, eid)) flags |= 2
    view.setUint8(offset, flags)
    offset += 1

    view.setUint32(offset, playerSeqs?.get(eid) ?? 0, true)
    offset += 4
  }

  // Bullets
  for (let i = 0; i < bullets.length; i++) {
    const eid = bullets[i]!
    view.setUint16(offset, eid, true)
    offset += 2
    view.setFloat32(offset, Position.x[eid]!, true)
    offset += 4
    view.setFloat32(offset, Position.y[eid]!, true)
    offset += 4
    view.setFloat32(offset, Velocity.x[eid]!, true)
    offset += 4
    view.setFloat32(offset, Velocity.y[eid]!, true)
    offset += 4
    view.setUint8(offset, Collider.layer[eid]!)
    offset += 1
  }

  // Enemies
  for (let i = 0; i < enemies.length; i++) {
    const eid = enemies[i]!
    view.setUint16(offset, eid, true)
    offset += 2
    view.setFloat32(offset, Position.x[eid]!, true)
    offset += 4
    view.setFloat32(offset, Position.y[eid]!, true)
    offset += 4
    view.setUint8(offset, Enemy.type[eid]!)
    offset += 1
    view.setUint8(offset, clampHP(Health.current[eid]!))
    offset += 1
    view.setUint8(offset, EnemyAI.state[eid]!)
    offset += 1
  }

  return new Uint8Array(sharedBuffer, 0, offset)
}

// ============================================================================
// Decoder
// ============================================================================

export function decodeSnapshot(data: Uint8Array): WorldSnapshot {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let offset = 0

  const version = view.getUint8(offset)
  offset += 1
  if (version !== SNAPSHOT_VERSION) {
    throw new Error(`Snapshot version mismatch: expected ${SNAPSHOT_VERSION}, got ${version}`)
  }

  const tick = view.getUint32(offset, true)
  offset += 4
  const serverTime = view.getFloat32(offset, true)
  offset += 4
  const playerCount = view.getUint8(offset)
  offset += 1
  const bulletCount = view.getUint16(offset, true)
  offset += 2
  const enemyCount = view.getUint16(offset, true)
  offset += 2

  const players: PlayerSnapshot[] = new Array(playerCount)
  for (let i = 0; i < playerCount; i++) {
    const eid = view.getUint16(offset, true)
    offset += 2
    const x = view.getFloat32(offset, true)
    offset += 4
    const y = view.getFloat32(offset, true)
    offset += 4
    const aimAngle = view.getFloat32(offset, true)
    offset += 4
    const state = view.getUint8(offset)
    offset += 1
    const hp = view.getUint8(offset)
    offset += 1
    const flags = view.getUint8(offset)
    offset += 1
    const lastProcessedSeq = view.getUint32(offset, true)
    offset += 4
    players[i] = { eid, x, y, aimAngle, state, hp, flags, lastProcessedSeq }
  }

  const bullets: BulletSnapshot[] = new Array(bulletCount)
  for (let i = 0; i < bulletCount; i++) {
    const eid = view.getUint16(offset, true)
    offset += 2
    const x = view.getFloat32(offset, true)
    offset += 4
    const y = view.getFloat32(offset, true)
    offset += 4
    const vx = view.getFloat32(offset, true)
    offset += 4
    const vy = view.getFloat32(offset, true)
    offset += 4
    const layer = view.getUint8(offset)
    offset += 1
    bullets[i] = { eid, x, y, vx, vy, layer }
  }

  const enemies: EnemySnapshot[] = new Array(enemyCount)
  for (let i = 0; i < enemyCount; i++) {
    const eid = view.getUint16(offset, true)
    offset += 2
    const x = view.getFloat32(offset, true)
    offset += 4
    const y = view.getFloat32(offset, true)
    offset += 4
    const type = view.getUint8(offset)
    offset += 1
    const hp = view.getUint8(offset)
    offset += 1
    const aiState = view.getUint8(offset)
    offset += 1
    enemies[i] = { eid, x, y, type, hp, aiState }
  }

  return { tick, serverTime, players, bullets, enemies }
}
