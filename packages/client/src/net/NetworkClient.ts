/**
 * Colyseus connection wrapper for multiplayer.
 *
 * Handles joining a game room, sending input, receiving snapshots,
 * and dispatching decoded events to callbacks.
 */

import { Client, type Room } from 'colyseus.js'
import { decodeSnapshot, type WorldSnapshot, type InputState } from '@high-noon/shared'

export interface GameConfig {
  seed: number
  sessionId: string
  playerEid: number
}

export type NetworkEventMap = {
  'game-config': (config: GameConfig) => void
  snapshot: (snapshot: WorldSnapshot) => void
  disconnect: () => void
}

export class NetworkClient {
  private client: Client
  private room: Room | null = null
  private listeners: { [K in keyof NetworkEventMap]?: NetworkEventMap[K] } = {}

  constructor(endpoint = `ws://${window.location.hostname}:2567`) {
    this.client = new Client(endpoint)
  }

  on<K extends keyof NetworkEventMap>(event: K, cb: NetworkEventMap[K]): void {
    this.listeners[event] = cb
  }

  async join(options?: Record<string, unknown>): Promise<void> {
    this.room = await this.client.joinOrCreate('game', options)

    this.room.onMessage('game-config', (data: GameConfig) => {
      this.listeners['game-config']?.(data)
    })

    this.room.onMessage('snapshot', (data: ArrayBuffer | Uint8Array) => {
      // Colyseus sendBytes delivers ArrayBuffer on the client
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
      const snapshot = decodeSnapshot(bytes)
      this.listeners.snapshot?.(snapshot)
    })

    this.room.onLeave(() => {
      this.listeners.disconnect?.()
    })
  }

  sendInput(input: InputState): void {
    this.room?.send('input', input)
  }

  disconnect(): void {
    this.room?.leave()
    this.room = null
    this.listeners = {}
  }
}
