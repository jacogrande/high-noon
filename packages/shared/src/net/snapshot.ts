/**
 * Binary Snapshot Serialization (v5)
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
  Roll,
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
import { NO_OWNER } from '../sim/prefabs'

// ============================================================================
// Constants
// ============================================================================

export const SNAPSHOT_VERSION = 5

/** Header: version(1) + tick(4) + serverTime(4) + playerCount(1) + bulletCount(2) + enemyCount(2) */
export const HEADER_SIZE = 14
export const PLAYER_SIZE = 27
export const BULLET_SIZE = 21
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
  rollElapsedMs: number
  rollDurationMs: number
  rollDirX: number
  rollDirY: number
}

export interface BulletSnapshot {
  eid: number
  x: number
  y: number
  vx: number
  vy: number
  layer: number
  ownerEid: number
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

function clampU16(val: number): number {
  return Math.max(0, Math.min(0xffff, val | 0))
}

function quantizeUnit(v: number): number {
  const clamped = Math.max(-1, Math.min(1, v))
  return Math.round(clamped * 127)
}

function dequantizeUnit(v: number): number {
  return v / 127
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
    if (Player.rollButtonWasDown[eid] === 1) flags |= 4
    view.setUint8(offset, flags)
    offset += 1

    view.setUint32(offset, playerSeqs?.get(eid) ?? 0, true)
    offset += 4

    const isRolling = hasComponent(world, Roll, eid)
    const rollElapsedMs = isRolling ? clampU16(Math.round(Roll.elapsed[eid]! * 1000)) : 0
    const rollDurationMs = isRolling ? clampU16(Math.round(Roll.duration[eid]! * 1000)) : 0
    const rollDirX = isRolling ? quantizeUnit(Roll.directionX[eid]!) : 0
    const rollDirY = isRolling ? quantizeUnit(Roll.directionY[eid]!) : 0
    view.setUint16(offset, rollElapsedMs, true)
    offset += 2
    view.setUint16(offset, rollDurationMs, true)
    offset += 2
    view.setInt8(offset, rollDirX)
    offset += 1
    view.setInt8(offset, rollDirY)
    offset += 1
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
    const owner = Bullet.ownerId[eid]!
    const encodedOwner = owner === 0xffff || owner === NO_OWNER ? 0xffff : clampU16(owner)
    view.setUint16(offset, encodedOwner, true)
    offset += 2
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
    const rollElapsedMs = view.getUint16(offset, true)
    offset += 2
    const rollDurationMs = view.getUint16(offset, true)
    offset += 2
    const rollDirX = dequantizeUnit(view.getInt8(offset))
    offset += 1
    const rollDirY = dequantizeUnit(view.getInt8(offset))
    offset += 1
    players[i] = {
      eid,
      x,
      y,
      aimAngle,
      state,
      hp,
      flags,
      lastProcessedSeq,
      rollElapsedMs,
      rollDurationMs,
      rollDirX,
      rollDirY,
    }
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
    const rawOwnerEid = view.getUint16(offset, true)
    offset += 2
    const ownerEid = rawOwnerEid === 0xffff ? NO_OWNER : rawOwnerEid
    bullets[i] = { eid, x, y, vx, vy, layer, ownerEid }
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
