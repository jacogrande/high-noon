import { describe, expect, test } from 'bun:test'
import type { Client } from 'colyseus'
import { GameRoom } from './GameRoom'

interface SentMessage {
  type: string
  payload: unknown
}

type TestClient = Client & {
  sent: SentMessage[]
}

function createClient(sessionId: string): TestClient {
  const sent: SentMessage[] = []
  const client = {
    sessionId,
    send: (type: string, payload: unknown) => {
      sent.push({ type, payload })
    },
    sendBytes: (type: string, payload: unknown) => {
      sent.push({ type, payload })
    },
  } as unknown as TestClient
  client.sent = sent
  return client
}

function createRoom(): GameRoom {
  const room = new GameRoom()
  ;(room as { setPatchRate: (ms?: number | null) => void }).setPatchRate = () => undefined
  ;(room as {
    setSimulationInterval: (cb: (deltaMs: number) => void, ms?: number) => void
  }).setSimulationInterval = () => undefined
  room.onCreate()
  return room
}

function getOnMessageHandler(room: GameRoom, type: string): (client: Client, data: unknown) => void {
  const onMessageHandlers = (room as unknown as {
    onMessageHandlers: Record<string, { callback: (client: Client, data: unknown) => void }>
  }).onMessageHandlers
  const handler = onMessageHandlers[type]?.callback
  if (!handler) {
    throw new Error(`Missing onMessage handler for "${type}"`)
  }
  return handler
}

describe('GameRoom lobby state', () => {
  test('set-ready updates player ready state while in lobby', () => {
    const room = createRoom()
    const client = createClient('session-a')
    room.onJoin(client, { name: 'Alice', characterId: 'sheriff' })

    const onSetReady = getOnMessageHandler(room, 'set-ready')
    const meta = room.state.players.get(client.sessionId)
    expect(meta?.ready).toBe(false)

    onSetReady(client, { ready: false })
    expect(meta?.ready).toBe(false)

    onSetReady(client, { ready: true })
    expect(meta?.ready).toBe(true)
  })

  test('set-character updates character, resets ready, and refreshes game-config', () => {
    const room = createRoom()
    const client = createClient('session-a')
    room.onJoin(client, { name: 'Alice', characterId: 'sheriff' })

    const onSetCharacter = getOnMessageHandler(room, 'set-character')
    const meta = room.state.players.get(client.sessionId)
    if (!meta) {
      throw new Error('Missing player metadata for joined client')
    }
    meta.ready = true

    const firstConfig = client.sent.find(message => message.type === 'game-config')?.payload as
      | { playerEid: number; characterId: string }
      | undefined
    expect(firstConfig?.characterId).toBe('sheriff')

    onSetCharacter(client, { characterId: 'undertaker' })

    expect(meta?.characterId).toBe('undertaker')
    expect(meta?.ready).toBe(false)

    const gameConfigs = client.sent
      .filter(message => message.type === 'game-config')
      .map(message => message.payload as { playerEid: number; characterId: string })
    expect(gameConfigs.length).toBeGreaterThanOrEqual(2)
    expect(gameConfigs.at(-1)?.characterId).toBe('undertaker')
    expect(gameConfigs.at(-1)?.playerEid).not.toBe(firstConfig?.playerEid)
  })

  test('readying any player transitions room from lobby to playing', () => {
    const room = createRoom()
    const clientA = createClient('session-a')
    const clientB = createClient('session-b')
    room.onJoin(clientA, { name: 'Alice', characterId: 'sheriff' })
    room.onJoin(clientB, { name: 'Bob', characterId: 'prospector' })

    const onSetReady = getOnMessageHandler(room, 'set-ready')
    expect(room.state.phase).toBe('lobby')

    onSetReady(clientA, { ready: true })

    expect(room.state.phase).toBe('playing')
  })
})
