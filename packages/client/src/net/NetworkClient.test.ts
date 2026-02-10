import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { NetworkClient, type GameConfig } from './NetworkClient'
import type { PlayerRosterEntry } from '@high-noon/shared'

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

  private readonly messageHandlers = new Map<string, Array<(payload: unknown) => void>>()
  private readonly leaveHandlers: Array<() => void> = []

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
})
