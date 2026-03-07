import { defineQuery, hasComponent } from 'bitecs'
import {
  Collider,
  Dead,
  Enemy,
  Player,
  Position,
  type GameWorld,
  type RewindEnemyState,
  type RewindPlayerState,
} from '@high-noon/shared'

interface RewindFrame {
  tick: number
  playerCount: number
  playerEids: Uint32Array
  playerX: Float32Array
  playerY: Float32Array
  enemyCount: number
  enemyEids: Uint32Array
  enemyX: Float32Array
  enemyY: Float32Array
  enemyRadius: Float32Array
  enemyAlive: Uint8Array
}

const playerQuery = defineQuery([Player, Position])
const enemyQuery = defineQuery([Enemy, Position, Collider])

/**
 * Fixed-size ring buffer of lightweight hit-validation state used for
 * lag-compensated rewind checks on the authoritative server.
 */
export class RewindHistory {
  private readonly buffer: RewindFrame[]
  private readonly capacity: number
  private head = 0 // index of oldest entry
  private count = 0

  constructor(maxFrames = 32) {
    this.capacity = Math.max(1, Math.trunc(maxFrames))
    this.buffer = Array.from({ length: this.capacity }, () => this.createFrame())
  }

  record(world: GameWorld): void {
    const writeIdx = (this.head + this.count) % this.capacity
    const frame = this.buffer[writeIdx]!
    const players = playerQuery(world)
    const enemies = enemyQuery(world)

    this.ensurePlayerCapacity(frame, players.length)
    this.ensureEnemyCapacity(frame, enemies.length)

    frame.tick = world.tick
    frame.playerCount = players.length
    for (let i = 0; i < players.length; i++) {
      const eid = players[i]!
      frame.playerEids[i] = eid
      frame.playerX[i] = Position.x[eid]!
      frame.playerY[i] = Position.y[eid]!
    }

    frame.enemyCount = enemies.length
    for (let i = 0; i < enemies.length; i++) {
      const eid = enemies[i]!
      frame.enemyEids[i] = eid
      frame.enemyX[i] = Position.x[eid]!
      frame.enemyY[i] = Position.y[eid]!
      frame.enemyRadius[i] = Collider.radius[eid]!
      frame.enemyAlive[i] = hasComponent(world, Dead, eid) ? 0 : 1
    }

    if (this.count < this.capacity) {
      this.count++
    } else {
      // Overwrite oldest — advance head
      this.head = (this.head + 1) % this.capacity
    }
  }

  clear(): void {
    this.head = 0
    this.count = 0
  }

  hasTick(tick: number): boolean {
    const safeTick = Math.trunc(tick)
    for (let i = this.count - 1; i >= 0; i--) {
      const frame = this.buffer[(this.head + i) % this.capacity]!
      if (frame.tick === safeTick) return true
    }
    return false
  }

  getOldestTick(): number | null {
    return this.count > 0 ? this.buffer[this.head]!.tick : null
  }

  getNewestTick(): number | null {
    if (this.count === 0) return null
    const newestIdx = (this.head + this.count - 1) % this.capacity
    return this.buffer[newestIdx]!.tick
  }

  getPlayerAtTick(eid: number, tick: number): RewindPlayerState | null {
    const frame = this.findFrameAtOrBefore(tick)
    if (!frame) return null
    for (let i = 0; i < frame.playerCount; i++) {
      if (frame.playerEids[i] === eid) {
        return {
          x: frame.playerX[i]!,
          y: frame.playerY[i]!,
        }
      }
    }
    return null
  }

  getEnemyStateAtTick(eid: number, tick: number): RewindEnemyState | null {
    const frame = this.findFrameAtOrBefore(tick)
    if (!frame) return null
    for (let i = 0; i < frame.enemyCount; i++) {
      if (frame.enemyEids[i] === eid) {
        return {
          x: frame.enemyX[i]!,
          y: frame.enemyY[i]!,
          radius: frame.enemyRadius[i]!,
          alive: frame.enemyAlive[i] === 1,
        }
      }
    }
    return null
  }

  private findFrameAtOrBefore(tick: number): RewindFrame | null {
    const safeTick = Math.trunc(tick)
    for (let i = this.count - 1; i >= 0; i--) {
      const frame = this.buffer[(this.head + i) % this.capacity]!
      if (frame.tick <= safeTick) return frame
    }
    return null
  }

  private createFrame(playerCapacity = 8, enemyCapacity = 64): RewindFrame {
    return {
      tick: 0,
      playerCount: 0,
      playerEids: new Uint32Array(playerCapacity),
      playerX: new Float32Array(playerCapacity),
      playerY: new Float32Array(playerCapacity),
      enemyCount: 0,
      enemyEids: new Uint32Array(enemyCapacity),
      enemyX: new Float32Array(enemyCapacity),
      enemyY: new Float32Array(enemyCapacity),
      enemyRadius: new Float32Array(enemyCapacity),
      enemyAlive: new Uint8Array(enemyCapacity),
    }
  }

  private ensurePlayerCapacity(frame: RewindFrame, needed: number): void {
    if (frame.playerEids.length >= needed) return
    const capacity = Math.max(needed, frame.playerEids.length * 2)
    const playerEids = new Uint32Array(capacity)
    playerEids.set(frame.playerEids)
    frame.playerEids = playerEids
    const playerX = new Float32Array(capacity)
    playerX.set(frame.playerX)
    frame.playerX = playerX
    const playerY = new Float32Array(capacity)
    playerY.set(frame.playerY)
    frame.playerY = playerY
  }

  private ensureEnemyCapacity(frame: RewindFrame, needed: number): void {
    if (frame.enemyEids.length >= needed) return
    const capacity = Math.max(needed, frame.enemyEids.length * 2)
    const enemyEids = new Uint32Array(capacity)
    enemyEids.set(frame.enemyEids)
    frame.enemyEids = enemyEids
    const enemyX = new Float32Array(capacity)
    enemyX.set(frame.enemyX)
    frame.enemyX = enemyX
    const enemyY = new Float32Array(capacity)
    enemyY.set(frame.enemyY)
    frame.enemyY = enemyY
    const enemyRadius = new Float32Array(capacity)
    enemyRadius.set(frame.enemyRadius)
    frame.enemyRadius = enemyRadius
    const enemyAlive = new Uint8Array(capacity)
    enemyAlive.set(frame.enemyAlive)
    frame.enemyAlive = enemyAlive
  }
}
