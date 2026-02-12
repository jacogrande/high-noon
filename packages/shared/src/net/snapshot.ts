/**
 * Binary Snapshot Serialization (v8)
 *
 * Encodes/decodes the world state into a compact binary format for
 * server→client broadcast at room-configured cadence (currently 30Hz).
 */

import { defineQuery, hasComponent } from 'bitecs'
import {
  Position,
  Velocity,
  Player,
  PlayerState,
  Roll,
  ZPosition,
  Health,
  Dead,
  Invincible,
  Bullet,
  Collider,
  Enemy,
  EnemyAI,
  Showdown,
} from '../sim/components'
import { playerQuery } from '../sim/queries'
import type { GameWorld } from '../sim/world'
import { NO_OWNER, NO_TARGET } from '../sim/prefabs'

// ============================================================================
// Constants
// ============================================================================

export const SNAPSHOT_VERSION = 9

/** Header: version(1) + tick(4) + serverTime(4) + playerCount(1) + bulletCount(2) + enemyCount(2) */
export const HEADER_SIZE = 14
export const PLAYER_SIZE = 38 // v7+: +3 bytes (showdownActive:1 + showdownTargetEid:2)
export const BULLET_SIZE = 21
export const ENEMY_SIZE = 15 // v8: +2 bytes (enemy targetEid)

// ============================================================================
// Snapshot Types
// ============================================================================

export interface PlayerSnapshot {
  eid: number
  x: number
  y: number
  z: number
  zVelocity: number
  aimAngle: number
  state: number
  hp: number
  flags: number
  lastProcessedSeq: number
  rollElapsedMs: number
  rollDurationMs: number
  rollDirX: number
  rollDirY: number
  showdownActive: number
  showdownTargetEid: number
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
  targetEid: number
}

export interface LastRitesZoneSnapshot {
  ownerEid: number
  x: number
  y: number
  radius: number
}

export interface DynamiteSnapshot {
  x: number
  y: number
  startX: number
  startY: number
  fuseRemaining: number
  maxFuse: number
  radius: number
  ownerEid: number
}

export interface WorldSnapshot {
  tick: number
  serverTime: number
  players: PlayerSnapshot[]
  bullets: BulletSnapshot[]
  enemies: EnemySnapshot[]
  lastRitesZones: LastRitesZoneSnapshot[]
  dynamites: DynamiteSnapshot[]
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

  // Collect Last Rites zones
  const lastRitesZones: Array<{ ownerEid: number; x: number; y: number; radius: number }> = []
  for (const zone of world.lastRitesZones.values()) {
    if (zone.active) {
      lastRitesZones.push({ ownerEid: zone.ownerEid, x: zone.x, y: zone.y, radius: zone.radius })
    }
  }

  // Collect dynamites
  const dynamites = world.dynamites

  const totalSize =
    HEADER_SIZE +
    players.length * PLAYER_SIZE +
    bullets.length * BULLET_SIZE +
    enemies.length * ENEMY_SIZE +
    1 + lastRitesZones.length * 14 + // zone count header + 14 bytes/zone
    1 + dynamites.length * 30         // dynamite count header + 30 bytes/dynamite

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
    const z = hasComponent(world, ZPosition, eid) ? ZPosition.z[eid]! : 0
    const zVelocity = hasComponent(world, ZPosition, eid) ? ZPosition.zVelocity[eid]! : 0
    view.setFloat32(offset, z, true)
    offset += 4
    view.setFloat32(offset, zVelocity, true)
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
    if (Player.jumpButtonWasDown[eid] === 1) flags |= 8
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

    // Showdown state (v7)
    const showdownActive = hasComponent(world, Showdown, eid) ? Showdown.active[eid]! : 0
    const showdownTargetEid = hasComponent(world, Showdown, eid) ? Showdown.targetEid[eid]! : NO_TARGET
    view.setUint8(offset, showdownActive)
    offset += 1
    view.setUint16(offset, clampU16(showdownTargetEid), true)
    offset += 2
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

  // Enemies (v8: includes targetEid)
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
    const target = EnemyAI.targetEid[eid]!
    const encodedTarget = target === NO_TARGET ? NO_TARGET : clampU16(target)
    view.setUint16(offset, encodedTarget, true)
    offset += 2
  }

  // Last Rites Zones (v7)
  view.setUint8(offset, lastRitesZones.length)
  offset += 1
  for (const zone of lastRitesZones) {
    view.setUint16(offset, clampU16(zone.ownerEid), true)
    offset += 2
    view.setFloat32(offset, zone.x, true)
    offset += 4
    view.setFloat32(offset, zone.y, true)
    offset += 4
    view.setFloat32(offset, zone.radius, true)
    offset += 4
  }

  // Dynamites (v7)
  view.setUint8(offset, dynamites.length)
  offset += 1
  for (const dyn of dynamites) {
    view.setFloat32(offset, dyn.x, true)
    offset += 4
    view.setFloat32(offset, dyn.y, true)
    offset += 4
    view.setFloat32(offset, dyn.startX, true)
    offset += 4
    view.setFloat32(offset, dyn.startY, true)
    offset += 4
    view.setFloat32(offset, dyn.fuseRemaining, true)
    offset += 4
    view.setFloat32(offset, dyn.maxFuse, true)
    offset += 4
    view.setFloat32(offset, dyn.radius, true)
    offset += 4
    view.setUint16(offset, clampU16(dyn.ownerId), true)
    offset += 2
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
    const z = view.getFloat32(offset, true)
    offset += 4
    const zVelocity = view.getFloat32(offset, true)
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
    const showdownActive = view.getUint8(offset)
    offset += 1
    const showdownTargetEid = view.getUint16(offset, true)
    offset += 2
    players[i] = {
      eid,
      x,
      y,
      z,
      zVelocity,
      aimAngle,
      state,
      hp,
      flags,
      lastProcessedSeq,
      rollElapsedMs,
      rollDurationMs,
      rollDirX,
      rollDirY,
      showdownActive,
      showdownTargetEid,
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
    const rawTargetEid = view.getUint16(offset, true)
    offset += 2
    const targetEid = rawTargetEid === NO_TARGET ? NO_TARGET : rawTargetEid
    enemies[i] = { eid, x, y, type, hp, aiState, targetEid }
  }

  // Last Rites Zones (v7)
  const zoneCount = view.getUint8(offset)
  offset += 1
  const lastRitesZones: LastRitesZoneSnapshot[] = new Array(zoneCount)
  for (let i = 0; i < zoneCount; i++) {
    const ownerEid = view.getUint16(offset, true)
    offset += 2
    const zx = view.getFloat32(offset, true)
    offset += 4
    const zy = view.getFloat32(offset, true)
    offset += 4
    const radius = view.getFloat32(offset, true)
    offset += 4
    lastRitesZones[i] = { ownerEid, x: zx, y: zy, radius }
  }

  // Dynamites (v7)
  const dynamiteCount = view.getUint8(offset)
  offset += 1
  const dynamites: DynamiteSnapshot[] = new Array(dynamiteCount)
  for (let i = 0; i < dynamiteCount; i++) {
    const dx = view.getFloat32(offset, true)
    offset += 4
    const dy = view.getFloat32(offset, true)
    offset += 4
    const startX = view.getFloat32(offset, true)
    offset += 4
    const startY = view.getFloat32(offset, true)
    offset += 4
    const fuseRemaining = view.getFloat32(offset, true)
    offset += 4
    const maxFuse = view.getFloat32(offset, true)
    offset += 4
    const radius = view.getFloat32(offset, true)
    offset += 4
    const ownerEid = view.getUint16(offset, true)
    offset += 2
    dynamites[i] = { x: dx, y: dy, startX, startY, fuseRemaining, maxFuse, radius, ownerEid }
  }

  return { tick, serverTime, players, bullets, enemies, lastRitesZones, dynamites }
}
