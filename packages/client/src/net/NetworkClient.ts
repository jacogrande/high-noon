/**
 * Colyseus connection wrapper for multiplayer.
 *
 * Handles joining a game room, sending input, receiving snapshots,
 * and dispatching decoded events to callbacks. Automatically attempts
 * reconnection on unexpected disconnects.
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

/** Connection timeout in milliseconds */
const CONNECT_TIMEOUT_MS = 10_000

/** Reconnection settings */
const RECONNECT_MAX_ATTEMPTS = 5
const RECONNECT_BASE_DELAY_MS = 500
const RECONNECT_MAX_DELAY_MS = 8_000

export class NetworkClient {
  private client: Client
  private room: Room | null = null
  private reconnectionToken: string | null = null
  private listeners: { [K in keyof NetworkEventMap]?: NetworkEventMap[K] } = {}
  private reconnecting = false
  private intentionalLeave = false

  constructor(private endpoint = `ws://${window.location.hostname}:2567`) {
    this.client = new Client(endpoint)
  }

  on<K extends keyof NetworkEventMap>(event: K, cb: NetworkEventMap[K]): void {
    this.listeners[event] = cb
  }

  async join(options?: Record<string, unknown>): Promise<void> {
    // Try reconnecting with a stored token (survives page refresh)
    const storedToken = sessionStorage.getItem('hn-reconnect-token')
    if (storedToken) {
      try {
        this.room = await this.client.reconnect(storedToken)
      } catch {
        sessionStorage.removeItem('hn-reconnect-token')
        // Fall through to fresh join
      }
    }

    if (!this.room) {
      try {
        this.room = await this.client.joinOrCreate('game', options)
      } catch (err) {
        throw new Error(`Failed to connect: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    this.reconnectionToken = this.room.reconnectionToken
    sessionStorage.setItem('hn-reconnect-token', this.reconnectionToken)
    this.intentionalLeave = false

    // Wait for game-config with timeout — server sends it on both fresh join and reconnect
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timed out waiting for game-config'))
      }, CONNECT_TIMEOUT_MS)

      this.room!.onMessage('game-config', (data: GameConfig) => {
        clearTimeout(timer)
        this.listeners['game-config']?.(data)
        resolve()
      })

      this.room!.onLeave(() => {
        clearTimeout(timer)
        reject(new Error('Disconnected before game-config received'))
      })
    })

    this.registerRoomHandlers(this.room)
  }

  sendInput(input: NetworkInput): void {
    this.room?.send('input', input)
  }

  sendPing(clientTime: number): void {
    this.room?.send('ping', { clientTime } satisfies PingMessage)
  }

  disconnect(): void {
    this.intentionalLeave = true
    sessionStorage.removeItem('hn-reconnect-token')
    this.room?.leave()
    this.room = null
    this.listeners = {}
  }

  /** Register message + leave handlers on a room */
  private registerRoomHandlers(room: Room): void {
    room.onMessage('pong', (data: PongMessage) => {
      this.listeners.pong?.(data.clientTime, data.serverTime)
    })

    room.onMessage('hud', (data: HudData) => {
      this.listeners.hud?.(data)
    })

    room.onMessage('snapshot', (data: ArrayBuffer | Uint8Array) => {
      try {
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
        const snapshot = decodeSnapshot(bytes)
        this.listeners.snapshot?.(snapshot)
      } catch (err) {
        console.error('[NetworkClient] Failed to decode snapshot:', err)
      }
    })

    room.onLeave(() => {
      if (this.intentionalLeave) return
      this.attemptReconnect()
    })
  }

  /** Attempt reconnection with exponential backoff */
  private async attemptReconnect(): Promise<void> {
    if (this.reconnecting || !this.reconnectionToken) {
      this.listeners.disconnect?.()
      return
    }

    this.reconnecting = true
    console.log('[NetworkClient] Connection lost, attempting reconnect...')

    for (let attempt = 0; attempt < RECONNECT_MAX_ATTEMPTS; attempt++) {
      const delay = Math.min(
        RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt),
        RECONNECT_MAX_DELAY_MS,
      )
      await new Promise(r => setTimeout(r, delay))

      // Check if intentionally disconnected during wait
      if (this.intentionalLeave) {
        this.reconnecting = false
        return
      }

      try {
        this.room = await this.client.reconnect(this.reconnectionToken!)
        this.reconnectionToken = this.room.reconnectionToken
        sessionStorage.setItem('hn-reconnect-token', this.reconnectionToken)
        this.registerRoomHandlers(this.room)
        this.reconnecting = false
        console.log(`[NetworkClient] Reconnected on attempt ${attempt + 1}`)
        return
      } catch {
        console.log(`[NetworkClient] Reconnect attempt ${attempt + 1}/${RECONNECT_MAX_ATTEMPTS} failed`)
      }
    }

    // All attempts exhausted
    this.reconnecting = false
    this.reconnectionToken = null
    sessionStorage.removeItem('hn-reconnect-token')
    this.listeners.disconnect?.()
  }
}
