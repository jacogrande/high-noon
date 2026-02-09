/**
 * Colyseus connection wrapper for multiplayer.
 *
 * Handles joining a game room, sending input, receiving snapshots,
 * and dispatching decoded events to callbacks.
 */

import { Client, type Room } from 'colyseus.js'
import { decodeSnapshot, type WorldSnapshot, type NetworkInput, type PingMessage, type PongMessage, type HudData } from '@high-noon/shared'

export interface GameConfig {
  seed: number
  sessionId: string
  playerEid: number
}

export type NetworkEventMap = {
  'game-config': (config: GameConfig) => void
  snapshot: (snapshot: WorldSnapshot) => void
  hud: (data: HudData) => void
  disconnect: () => void
  pong: (clientTime: number, serverTime: number) => void
}

export class NetworkClient {
  private client: Client
  private room: Room | null = null
  // TODO: use for auto-reconnect in future sprint
  private reconnectionToken: string | null = null
  private listeners: { [K in keyof NetworkEventMap]?: NetworkEventMap[K] } = {}

  constructor(endpoint = `ws://${window.location.hostname}:2567`) {
    this.client = new Client(endpoint)
  }

  on<K extends keyof NetworkEventMap>(event: K, cb: NetworkEventMap[K]): void {
    this.listeners[event] = cb
  }

  async join(options?: Record<string, unknown>): Promise<void> {
    try {
      this.room = await this.client.joinOrCreate('game', options)
    } catch (err) {
      throw new Error(`Failed to connect: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }

    this.reconnectionToken = this.room.reconnectionToken

    this.room.onMessage('game-config', (data: GameConfig) => {
      this.listeners['game-config']?.(data)
    })

    this.room.onMessage('pong', (data: PongMessage) => {
      this.listeners.pong?.(data.clientTime, data.serverTime)
    })

    this.room.onMessage('hud', (data: HudData) => {
      this.listeners.hud?.(data)
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

  sendInput(input: NetworkInput): void {
    this.room?.send('input', input)
  }

  sendPing(clientTime: number): void {
    this.room?.send('ping', { clientTime } satisfies PingMessage)
  }

  disconnect(): void {
    this.room?.leave()
    this.room = null
    this.listeners = {}
  }
}
