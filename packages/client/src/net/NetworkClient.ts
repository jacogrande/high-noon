/**
 * Colyseus connection wrapper for multiplayer.
 *
 * Handles joining a game room, sending input, receiving snapshots,
 * and dispatching decoded events to callbacks. Automatically attempts
 * reconnection on unexpected disconnects.
 */

import { Client, type Room } from 'colyseus.js'
import {
  decodeSnapshot,
  type WorldSnapshot,
  type NetworkInput,
  type PingMessage,
  type PongMessage,
  type HudData,
  type SelectNodeRequest,
  type SelectNodeResponse,
  type CharacterId,
  type PlayerRosterEntry,
} from '@high-noon/shared'

export interface GameConfig {
  seed: number
  sessionId: string
  playerEid: number
  characterId: CharacterId
  roster?: PlayerRosterEntry[]
  nodesTaken?: string[]
}

export interface JoinOptions {
  name?: string
  characterId?: CharacterId
  [key: string]: unknown
}

export type NetworkEventMap = {
  'game-config': (config: GameConfig) => void
  'player-roster': (roster: PlayerRosterEntry[]) => void
  snapshot: (snapshot: WorldSnapshot) => void
  hud: (data: HudData) => void
  'select-node-result': (result: SelectNodeResponse) => void
  'incompatible-protocol': (reason: string) => void
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

  async join(options?: JoinOptions): Promise<void> {
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

    // Wait for initial game-config before gameplay starts.
    await this.waitForGameConfig(this.room)

    this.registerRoomHandlers(this.room)
  }

  sendInput(input: NetworkInput): void {
    this.room?.send('input', input)
  }

  sendPing(clientTime: number): void {
    this.room?.send('ping', { clientTime } satisfies PingMessage)
  }

  sendSelectNode(nodeId: string): void {
    this.room?.send('select-node', { nodeId } satisfies SelectNodeRequest)
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
    room.onMessage('game-config', (data: GameConfig) => {
      this.listeners['game-config']?.(data)
    })

    room.onMessage('pong', (data: PongMessage) => {
      this.listeners.pong?.(data.clientTime, data.serverTime)
    })

    room.onMessage('hud', (data: HudData) => {
      this.listeners.hud?.(data)
    })

    room.onMessage('player-roster', (roster: PlayerRosterEntry[]) => {
      this.listeners['player-roster']?.(roster)
    })

    room.onMessage('select-node-result', (data: SelectNodeResponse) => {
      this.listeners['select-node-result']?.(data)
    })

    room.onMessage('snapshot', (data: ArrayBuffer | Uint8Array) => {
      try {
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
        const snapshot = decodeSnapshot(bytes)
        this.listeners.snapshot?.(snapshot)
      } catch (err) {
        console.error('[NetworkClient] Failed to decode snapshot:', err)
        if (this.isProtocolMismatchError(err)) {
          this.handleProtocolMismatch(room, err)
        }
      }
    })

    room.onLeave(() => {
      if (this.intentionalLeave) return
      this.attemptReconnect()
    })
  }

  private isProtocolMismatchError(err: unknown): boolean {
    return err instanceof Error && err.message.includes('Snapshot version mismatch')
  }

  private handleProtocolMismatch(room: Room, err: unknown): void {
    const reason = err instanceof Error ? err.message : 'Snapshot protocol mismatch'
    this.intentionalLeave = true
    this.reconnecting = false
    this.reconnectionToken = null
    sessionStorage.removeItem('hn-reconnect-token')

    try {
      room.leave()
    } catch (leaveErr) {
      console.warn('[NetworkClient] Failed to leave room after protocol mismatch:', leaveErr)
    }

    this.room = null
    this.listeners['incompatible-protocol']?.(reason)
    this.listeners.disconnect?.()
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
        this.requestGameConfig(this.room)
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

  /**
   * Wait for a game-config message on a specific room.
   * The returned promise rejects on timeout or disconnection.
   */
  private waitForGameConfig(room: Room): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false
      let offMessage: (() => void) | null = null

      const cleanup = () => {
        clearTimeout(timer)
        offMessage?.()
        room.onLeave.remove(onLeave)
      }

      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        cleanup()
        fn()
      }

      const onLeave = () => {
        finish(() => reject(new Error('Disconnected before game-config received')))
      }

      const timer = setTimeout(() => {
        finish(() => reject(new Error('Timed out waiting for game-config')))
      }, CONNECT_TIMEOUT_MS)

      offMessage = room.onMessage('game-config', (data: GameConfig) => {
        finish(() => {
          this.listeners['game-config']?.(data)
          resolve()
        })
      })

      room.onLeave(onLeave)
    })
  }

  /**
   * Request authoritative game-config from server.
   * Used after reconnect in case server's automatic config send raced handlers.
   */
  private requestGameConfig(room: Room): void {
    try {
      room.send('request-game-config')
    } catch (err) {
      console.warn('[NetworkClient] Failed to request game-config:', err)
    }
  }
}
