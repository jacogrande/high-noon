import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { NetworkClient, type GameConfig } from './NetworkClient'
import type { CharacterId, LobbyState, PlayerRosterEntry } from '@high-noon/shared'

class MemorySessionStorage {
  private readonly store = new Map<string, string>()

  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }
}

class FakeRoom {
  reconnectionToken = 'next-token'
  readonly sendCalls: Array<{ type: string; payload?: unknown }> = []
  leaveCallCount = 0
  state: unknown = null

  private readonly messageHandlers = new Map<string, Array<(payload: unknown) => void>>()
  private readonly leaveHandlers: Array<() => void> = []
  private readonly stateHandlers: Array<(state: unknown) => void> = []

  readonly onLeave = Object.assign(
    (cb: () => void) => {
      this.leaveHandlers.push(cb)
      return cb
    },
    {
      remove: (cb: () => void) => {
        const idx = this.leaveHandlers.indexOf(cb)
        if (idx >= 0) this.leaveHandlers.splice(idx, 1)
      },
    },
  )

  readonly onStateChange = Object.assign(
    (cb: (state: unknown) => void) => {
      this.stateHandlers.push(cb)
      return cb
    },
    {
      remove: (cb: (state: unknown) => void) => {
        const idx = this.stateHandlers.indexOf(cb)
        if (idx >= 0) this.stateHandlers.splice(idx, 1)
      },
    },
  )

  onMessage(type: string, cb: (payload: unknown) => void): () => void {
    const handlers = this.messageHandlers.get(type) ?? []
    handlers.push(cb)
    this.messageHandlers.set(type, handlers)
    return () => {
      const current = this.messageHandlers.get(type)
      if (!current) return
      const idx = current.indexOf(cb)
      if (idx >= 0) current.splice(idx, 1)
      if (current.length === 0) this.messageHandlers.delete(type)
    }
  }

  send(type: string, payload?: unknown): void {
    this.sendCalls.push({ type, payload })
  }

  emit(type: string, payload: unknown): void {
    const handlers = this.messageHandlers.get(type) ?? []
    for (const handler of handlers) handler(payload)
  }

  leave(): void {
    this.leaveCallCount++
    for (const handler of this.leaveHandlers) handler()
  }

  emitStateChange(state: unknown): void {
    this.state = state
    for (const handler of this.stateHandlers) handler(state)
  }

  messageHandlerCount(type: string): number {
    return this.messageHandlers.get(type)?.length ?? 0
  }

  leaveHandlerCount(): number {
    return this.leaveHandlers.length
  }

  stateHandlerCount(): number {
    return this.stateHandlers.length
  }
}

describe('NetworkClient', () => {
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  const originalSessionStorage = (globalThis as { sessionStorage?: unknown }).sessionStorage

  beforeEach(() => {
    ;(globalThis as { sessionStorage: MemorySessionStorage }).sessionStorage = new MemorySessionStorage()
    ;(globalThis as { setTimeout: typeof setTimeout }).setTimeout = ((cb: (...args: any[]) => void) => {
      cb()
      return 0 as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout
    ;(globalThis as { clearTimeout: typeof clearTimeout }).clearTimeout =
      (() => undefined) as typeof clearTimeout
  })

  afterEach(() => {
    ;(globalThis as { setTimeout: typeof setTimeout }).setTimeout = originalSetTimeout
    ;(globalThis as { clearTimeout: typeof clearTimeout }).clearTimeout = originalClearTimeout
    if (originalSessionStorage === undefined) {
      delete (globalThis as { sessionStorage?: unknown }).sessionStorage
    } else {
      ;(globalThis as { sessionStorage: unknown }).sessionStorage = originalSessionStorage
    }
  })

  test('registerRoomHandlers forwards game-config messages', () => {
    const net = new NetworkClient('ws://localhost:2567')
    const room = new FakeRoom()

    let received: GameConfig | null = null
    net.on('game-config', (config) => {
      received = config
    })

    ;(net as any).registerRoomHandlers(room)

    room.emit('game-config', {
      seed: 123,
      sessionId: 'abc',
      playerEid: 42,
      characterId: 'undertaker',
    } satisfies GameConfig)

    expect(received).not.toBeNull()
    expect(received?.characterId).toBe('undertaker')
    expect(net.getLatestGameConfig()?.characterId).toBe('undertaker')
  })

  test('on supports multiple listeners and unsubscribing', () => {
    const net = new NetworkClient('ws://localhost:2567')
    const events: string[] = []

    const offA = net.on('disconnect', () => {
      events.push('a')
    })
    const offB = net.on('disconnect', () => {
      events.push('b')
    })

    ;(net as any).emit('disconnect')
    offA()
    ;(net as any).emit('disconnect')
    offB()
    ;(net as any).emit('disconnect')

    expect(events).toEqual(['a', 'b', 'b'])
  })

  test('registerRoomHandlers replaces previous room listeners', () => {
    const net = new NetworkClient('ws://localhost:2567')
    const room = new FakeRoom()
    room.state = {
      phase: 'lobby',
      serverTick: 1,
      players: {},
    }

    const lobbyStates: LobbyState[] = []
    let gameConfigEvents = 0
    net.on('lobby-state', (state) => {
      lobbyStates.push(state)
    })
    net.on('game-config', () => {
      gameConfigEvents++
    })

    ;(net as any).registerRoomHandlers(room)
    ;(net as any).registerRoomHandlers(room)

    expect(room.messageHandlerCount('game-config')).toBe(1)
    expect(room.leaveHandlerCount()).toBe(1)
    expect(room.stateHandlerCount()).toBe(1)

    room.emit('game-config', {
      seed: 22,
      sessionId: 'abc',
      playerEid: 5,
      characterId: 'sheriff',
    } satisfies GameConfig)
    room.emitStateChange({
      phase: 'playing',
      serverTick: 3,
      players: {},
    })

    expect(gameConfigEvents).toBe(1)
    expect(lobbyStates.length).toBe(3)
  })

  test('disconnect clears active room handlers', () => {
    const net = new NetworkClient('ws://localhost:2567')
    const room = new FakeRoom()
    ;(net as any).room = room
    ;(net as any).registerRoomHandlers(room)

    net.disconnect()

    expect(room.messageHandlerCount('game-config')).toBe(0)
    expect(room.leaveHandlerCount()).toBe(0)
    expect(room.stateHandlerCount()).toBe(0)
  })

  test('attemptReconnect requests authoritative game-config after reconnect', async () => {
    const net = new NetworkClient('ws://localhost:2567')
    const room = new FakeRoom()
    let configEvents = 0

    net.on('game-config', () => {
      configEvents++
    })

    ;(net as any).client = {
      reconnect: async () => room,
    }
    ;(net as any).reconnectionToken = 'reconnect-token'

    await (net as any).attemptReconnect()

    expect(room.sendCalls.some(call => call.type === 'request-game-config')).toBe(true)

    room.emit('game-config', {
      seed: 1,
      sessionId: 's',
      playerEid: 7,
      characterId: 'sheriff',
    } satisfies GameConfig)

    expect(configEvents).toBe(1)
  })

  test('registerRoomHandlers forwards player-roster messages', () => {
    const net = new NetworkClient('ws://localhost:2567')
    const room = new FakeRoom()
    let received: PlayerRosterEntry[] | null = null

    net.on('player-roster', (roster) => {
      received = roster
    })

    ;(net as any).registerRoomHandlers(room)

    room.emit('player-roster', [
      { eid: 7, characterId: 'undertaker' },
      { eid: 9, characterId: 'prospector' },
    ] satisfies PlayerRosterEntry[])

    expect(received).toEqual([
      { eid: 7, characterId: 'undertaker' },
      { eid: 9, characterId: 'prospector' },
    ])
  })

  test('registerRoomHandlers emits lobby-state from schema state and updates', () => {
    const net = new NetworkClient('ws://localhost:2567')
    const room = new FakeRoom()
    room.state = {
      phase: 'lobby',
      serverTick: 0,
      players: {
        sessionA: { name: 'Alice', characterId: 'sheriff', ready: false },
      },
    }

    const received: LobbyState[] = []
    net.on('lobby-state', (state) => {
      received.push(state)
    })

    ;(net as any).registerRoomHandlers(room)

    room.emitStateChange({
      phase: 'playing',
      serverTick: 12,
      players: {
        sessionA: { name: 'Alice', characterId: 'undertaker', ready: true },
        sessionB: { name: 'Bob', characterId: 'prospector', ready: false },
      },
    })

    expect(received.length).toBe(2)
    expect(received[0]).toEqual({
      phase: 'lobby',
      serverTick: 0,
      players: [
        { sessionId: 'sessionA', name: 'Alice', characterId: 'sheriff', ready: false },
      ],
    } satisfies LobbyState)
    expect(received[1]).toEqual({
      phase: 'playing',
      serverTick: 12,
      players: [
        { sessionId: 'sessionA', name: 'Alice', characterId: 'undertaker', ready: true },
        { sessionId: 'sessionB', name: 'Bob', characterId: 'prospector', ready: false },
      ],
    } satisfies LobbyState)
  })

  test('sendReady and sendCharacter forward to room', () => {
    const net = new NetworkClient('ws://localhost:2567')
    const room = new FakeRoom()
    ;(net as any).room = room

    net.sendReady(true)
    net.sendCharacter('undertaker' satisfies CharacterId)

    expect(room.sendCalls).toEqual([
      { type: 'set-ready', payload: { ready: true } },
      { type: 'set-character', payload: { characterId: 'undertaker' } },
    ])
  })

  test('protocol mismatch on snapshot emits incompatible-protocol and disconnects', () => {
    const net = new NetworkClient('ws://localhost:2567')
    const room = new FakeRoom()
    const originalConsoleError = console.error
    console.error = () => undefined
    try {
      let incompatibleReason: string | null = null
      let disconnectCount = 0
      net.on('incompatible-protocol', (reason) => {
        incompatibleReason = reason
      })
      net.on('disconnect', () => {
        disconnectCount++
      })

      ;(net as any).registerRoomHandlers(room)

      room.emit('snapshot', new Uint8Array([99]))

      expect(incompatibleReason).toContain('Snapshot version mismatch')
      expect(disconnectCount).toBe(1)
      expect(room.leaveCallCount).toBe(1)
      expect((net as any).room).toBeNull()
    } finally {
      console.error = originalConsoleError
    }
  })

  test('server incompatible-protocol message forces disconnect', () => {
    const net = new NetworkClient('ws://localhost:2567')
    const room = new FakeRoom()

    let incompatibleReason: string | null = null
    let disconnectCount = 0
    net.on('incompatible-protocol', (reason) => {
      incompatibleReason = reason
    })
    net.on('disconnect', () => {
      disconnectCount++
    })

    ;(net as any).registerRoomHandlers(room)
    room.emit('incompatible-protocol', 'Input protocol mismatch: expected clientTick')

    expect(incompatibleReason).toContain('clientTick')
    expect(disconnectCount).toBe(1)
    expect(room.leaveCallCount).toBe(1)
    expect((net as any).room).toBeNull()
  })
})
