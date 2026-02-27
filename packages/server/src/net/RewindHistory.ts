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
  players: Map<number, RewindPlayerState>
  enemies: Map<number, RewindEnemyState>
}

const playerQuery = defineQuery([Player, Position])
const enemyQuery = defineQuery([Enemy, Position, Collider])

/**
 * Fixed-size ring buffer of lightweight hit-validation state used for
 * lag-compensated rewind checks on the authoritative server.
 */
export class RewindHistory {
  private readonly buffer: (RewindFrame | null)[]
  private readonly capacity: number
  private head = 0 // index of oldest entry
  private count = 0

  constructor(maxFrames = 32) {
    this.capacity = Math.max(1, Math.trunc(maxFrames))
    this.buffer = new Array<RewindFrame | null>(this.capacity).fill(null)
  }

  record(world: GameWorld): void {
    const players = new Map<number, RewindPlayerState>()
    for (const eid of playerQuery(world)) {
      players.set(eid, {
        x: Position.x[eid]!,
        y: Position.y[eid]!,
      })
    }

    const enemies = new Map<number, RewindEnemyState>()
    for (const eid of enemyQuery(world)) {
      enemies.set(eid, {
        x: Position.x[eid]!,
        y: Position.y[eid]!,
        radius: Collider.radius[eid]!,
        alive: !hasComponent(world, Dead, eid),
      })
    }

    const writeIdx = (this.head + this.count) % this.capacity
    this.buffer[writeIdx] = { tick: world.tick, players, enemies }

    if (this.count < this.capacity) {
      this.count++
    } else {
      // Overwrite oldest — advance head
      this.head = (this.head + 1) % this.capacity
    }
  }

  clear(): void {
    this.buffer.fill(null)
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
    return frame?.players.get(eid) ?? null
  }

  getEnemyStateAtTick(eid: number, tick: number): RewindEnemyState | null {
    const frame = this.findFrameAtOrBefore(tick)
    return frame?.enemies.get(eid) ?? null
  }

  private findFrameAtOrBefore(tick: number): RewindFrame | null {
    const safeTick = Math.trunc(tick)
    for (let i = this.count - 1; i >= 0; i--) {
      const frame = this.buffer[(this.head + i) % this.capacity]!
      if (frame.tick <= safeTick) return frame
    }
    return null
  }
}
