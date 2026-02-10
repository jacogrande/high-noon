export interface EnemyDeathEvent {
  x: number
  y: number
  color: number
  isThreat: boolean
}

export interface EnemyHitEvent {
  x: number
  y: number
  color: number
  amount: number
}

export type GameplayEvent =
  | {
      type: 'enemy-sync'
      deathTrauma: number
      deaths: EnemyDeathEvent[]
      hits: EnemyHitEvent[]
    }
  | {
      type: 'bullet-removed'
      positions: Array<{ x: number; y: number }>
    }
  | {
      type: 'player-hit'
      trauma: number
      simHitStopSeconds: number
      renderPauseSeconds: number
      kickX: number
      kickY: number
      kickStrength: number
    }
  | {
      type: 'player-fire'
      eid: number
      angle: number
      muzzleX: number
      muzzleY: number
      trauma: number
      kickStrength: number
    }
  | { type: 'reload-start' }
  | { type: 'reload-complete' }
  | { type: 'dry-fire' }
  | { type: 'showdown-activate' }
  | { type: 'showdown-kill' }
  | { type: 'showdown-expire' }
  | { type: 'level-up'; x: number; y: number }

export class GameplayEventBuffer {
  private readonly events: GameplayEvent[] = []

  push(event: GameplayEvent): void {
    this.events.push(event)
  }

  drain(): GameplayEvent[] {
    if (this.events.length === 0) return []
    return this.events.splice(0, this.events.length)
  }

  clear(): void {
    this.events.length = 0
  }

  get length(): number {
    return this.events.length
  }
}
