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
 * Ring-buffer history of lightweight hit-validation state used for
 * lag-compensated rewind checks on the authoritative server.
 */
export class RewindHistory {
  private readonly frames: RewindFrame[] = []
  private readonly maxFrames: number

  constructor(maxFrames = 32) {
    this.maxFrames = Math.max(1, Math.trunc(maxFrames))
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

    this.frames.push({
      tick: world.tick,
      players,
      enemies,
    })

    if (this.frames.length > this.maxFrames) {
      this.frames.shift()
    }
  }

  clear(): void {
    this.frames.length = 0
  }

  hasTick(tick: number): boolean {
    const safeTick = Math.trunc(tick)
    for (let i = this.frames.length - 1; i >= 0; i--) {
      if (this.frames[i]!.tick === safeTick) return true
    }
    return false
  }

  getOldestTick(): number | null {
    return this.frames.length > 0 ? this.frames[0]!.tick : null
  }

  getNewestTick(): number | null {
    return this.frames.length > 0 ? this.frames[this.frames.length - 1]!.tick : null
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
    for (let i = this.frames.length - 1; i >= 0; i--) {
      const frame = this.frames[i]!
      if (frame.tick <= safeTick) return frame
    }
    return null
  }
}
