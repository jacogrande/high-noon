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
  type LobbyState,
  type LobbyPlayerState,
  type LobbyPhase,
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
  'lobby-state': (state: LobbyState) => void
  'player-roster': (roster: PlayerRosterEntry[]) => void
  snapshot: (snapshot: WorldSnapshot) => void
  hud: (data: HudData) => void
  'select-node-result': (result: SelectNodeResponse) => void
  'incompatible-protocol': (reason: string) => void
  disconnect: () => void
  pong: (clientTime: number, serverTime: number) => void
}

type NetworkListenerMap = {
  [K in keyof NetworkEventMap]?: Set<NetworkEventMap[K]>
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
  private latestGameConfig: GameConfig | null = null
  private listeners: NetworkListenerMap = {}
  private cleanupRoomHandlers: (() => void) | null = null
  private reconnecting = false
  private intentionalLeave = false

  constructor(private endpoint = `ws://${window.location.hostname}:2567`) {
    this.client = new Client(endpoint)
  }

  on<K extends keyof NetworkEventMap>(event: K, cb: NetworkEventMap[K]): () => void {
    let eventListeners = this.listeners[event] as Set<NetworkEventMap[K]> | undefined
    if (!eventListeners) {
      eventListeners = new Set<NetworkEventMap[K]>()
      this.listeners[event] = eventListeners as NetworkListenerMap[K]
    }

    eventListeners.add(cb)
    return () => {
      const current = this.listeners[event] as Set<NetworkEventMap[K]> | undefined
      if (!current) return
      current.delete(cb)
      if (current.size === 0) {
        delete this.listeners[event]
      }
    }
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

  sendReady(ready: boolean): void {
    this.room?.send('set-ready', { ready })
  }

  sendCharacter(characterId: CharacterId): void {
    this.room?.send('set-character', { characterId })
  }

  sendSelectNode(nodeId: string): void {
    this.room?.send('select-node', { nodeId } satisfies SelectNodeRequest)
  }

  requestGameConfig(): void {
    if (!this.room) return
    this.requestGameConfigFromRoom(this.room)
  }

  getLatestGameConfig(): GameConfig | null {
    return this.latestGameConfig
  }

  disconnect(): void {
    this.intentionalLeave = true
    sessionStorage.removeItem('hn-reconnect-token')
    this.clearRoomHandlers()
    this.room?.leave()
    this.room = null
    this.latestGameConfig = null
    this.listeners = {}
  }

  private emit<K extends keyof NetworkEventMap>(
    event: K,
    ...args: Parameters<NetworkEventMap[K]>
  ): void {
    const callbacks = this.listeners[event]
    if (!callbacks) return
    for (const callback of [...callbacks]) {
      ;(callback as (...eventArgs: Parameters<NetworkEventMap[K]>) => void)(...args)
    }
  }

  private clearRoomHandlers(): void {
    this.cleanupRoomHandlers?.()
    this.cleanupRoomHandlers = null
  }

  private removeLeaveHandler(room: Room, cb: () => void): void {
    ;(room.onLeave as { remove?: (handler: () => void) => void }).remove?.(cb)
  }

  /** Register message + leave handlers on a room */
  private registerRoomHandlers(room: Room): void {
    this.clearRoomHandlers()
    const cleanup: Array<() => void> = []

    cleanup.push(room.onMessage('game-config', (data: GameConfig) => {
      this.latestGameConfig = data
      this.emit('game-config', data)
    }))

    cleanup.push(room.onMessage('pong', (data: PongMessage) => {
      this.emit('pong', data.clientTime, data.serverTime)
    }))

    cleanup.push(room.onMessage('hud', (data: HudData) => {
      this.emit('hud', data)
    }))

    cleanup.push(room.onMessage('player-roster', (roster: PlayerRosterEntry[]) => {
      this.emit('player-roster', roster)
    }))

    cleanup.push(room.onMessage('select-node-result', (data: SelectNodeResponse) => {
      this.emit('select-node-result', data)
    }))

    cleanup.push(room.onMessage('incompatible-protocol', (reason: string) => {
      this.handleProtocolMismatch(room, new Error(reason))
    }))

    cleanup.push(room.onMessage('snapshot', (data: ArrayBuffer | Uint8Array) => {
      try {
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
        const snapshot = decodeSnapshot(bytes)
        this.emit('snapshot', snapshot)
      } catch (err) {
        console.error('[NetworkClient] Failed to decode snapshot:', err)
        if (this.isProtocolMismatchError(err)) {
          this.handleProtocolMismatch(room, err)
        }
      }
    }))

    const onLeave = () => {
      if (this.intentionalLeave) return
      this.attemptReconnect()
    }
    room.onLeave(onLeave)
    cleanup.push(() => this.removeLeaveHandler(room, onLeave))

    cleanup.push(this.registerLobbyStateHandlers(room))

    this.cleanupRoomHandlers = () => {
      for (const off of cleanup.splice(0)) {
        off()
      }
    }
  }

  private registerLobbyStateHandlers(room: Room): () => void {
    const emitLobbyState = () => {
      const state = this.normalizeLobbyState((room as { state?: unknown }).state)
      if (!state) return
      this.emit('lobby-state', state)
    }

    const roomWithStateHandler = room as unknown as {
      onStateChange?: ((cb: (state: unknown) => void) => void) & {
        remove?: (cb: (state: unknown) => void) => void
      }
    }
    const onStateChange = () => {
      emitLobbyState()
    }
    roomWithStateHandler.onStateChange?.(onStateChange)

    emitLobbyState()

    return () => {
      roomWithStateHandler.onStateChange?.remove?.(onStateChange)
    }
  }

  private normalizeLobbyState(state: unknown): LobbyState | null {
    if (typeof state !== 'object' || state === null) return null
    const value = state as {
      phase?: unknown
      serverTick?: unknown
      players?: unknown
    }

    const phase: LobbyPhase = value.phase === 'playing' ? 'playing' : 'lobby'
    const serverTick = typeof value.serverTick === 'number' ? value.serverTick : 0
    const players = this.normalizeLobbyPlayers(value.players)
    return { phase, serverTick, players }
  }

  private normalizeLobbyPlayers(players: unknown): LobbyPlayerState[] {
    if (!players || typeof players !== 'object') return []
    const result: LobbyPlayerState[] = []

    const pushPlayer = (sessionId: string, meta: unknown) => {
      if (typeof meta !== 'object' || meta === null) return
      const value = meta as {
        name?: unknown
        characterId?: unknown
        ready?: unknown
      }
      result.push({
        sessionId,
        name: typeof value.name === 'string' ? value.name : sessionId.slice(0, 8),
        characterId: isCharacterId(value.characterId) ? value.characterId : 'sheriff',
        ready: value.ready === true,
      })
    }

    if (players instanceof Map) {
      for (const [sessionId, meta] of players.entries()) {
        pushPlayer(String(sessionId), meta)
      }
      return result
    }

    const value = players as {
      forEach?: (cb: (meta: unknown, sessionId: string) => void) => void
      entries?: () => Iterable<[string, unknown]>
    }
    if (typeof value.forEach === 'function') {
      value.forEach((meta, sessionId) => {
        pushPlayer(String(sessionId), meta)
      })
      return result
    }
    if (typeof value.entries === 'function') {
      for (const [sessionId, meta] of value.entries()) {
        pushPlayer(String(sessionId), meta)
      }
      return result
    }

    for (const [sessionId, meta] of Object.entries(players as Record<string, unknown>)) {
      pushPlayer(sessionId, meta)
    }
    return result
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
    this.clearRoomHandlers()

    try {
      room.leave()
    } catch (leaveErr) {
      console.warn('[NetworkClient] Failed to leave room after protocol mismatch:', leaveErr)
    }

    this.room = null
    this.latestGameConfig = null
    this.emit('incompatible-protocol', reason)
    this.emit('disconnect')
  }

  /** Attempt reconnection with exponential backoff */
  private async attemptReconnect(): Promise<void> {
    if (this.reconnecting || !this.reconnectionToken) {
      this.emit('disconnect')
      return
    }

    this.reconnecting = true
    this.clearRoomHandlers()
    this.room = null
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
        this.requestGameConfigFromRoom(this.room)
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
    this.room = null
    this.emit('disconnect')
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
        this.removeLeaveHandler(room, onLeave)
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
          this.latestGameConfig = data
          this.emit('game-config', data)
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
  private requestGameConfigFromRoom(room: Room): void {
    try {
      room.send('request-game-config')
    } catch (err) {
      console.warn('[NetworkClient] Failed to request game-config:', err)
    }
  }
}

function isCharacterId(value: unknown): value is CharacterId {
  return value === 'sheriff' || value === 'undertaker' || value === 'prospector'
}
