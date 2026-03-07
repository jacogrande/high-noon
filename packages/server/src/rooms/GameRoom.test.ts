import { describe, expect, test } from 'bun:test'
import type { Client } from 'colyseus'
import { Button, Position, TICK_MS, spawnGrunt, type GameWorld, type NetworkInput } from '@high-noon/shared'
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
  ;(room as { setMetadata: (meta: unknown) => void }).setMetadata = () => undefined
  Object.defineProperty(room, 'lock', {
    configurable: true,
    value: () => {
      Object.defineProperty(room, 'locked', {
        configurable: true,
        writable: true,
        value: true,
      })
    },
  })
  room.onCreate()
  return room
}

function makeInput(overrides: Partial<NetworkInput> = {}): NetworkInput {
  return {
    seq: 1,
    clientTick: 0,
    clientTimeMs: 0,
    estimatedServerTimeMs: 0,
    viewInterpDelayMs: 0,
    shootSeq: 0,
    buttons: 0,
    aimAngle: 0,
    moveX: 0,
    moveY: 0,
    cursorWorldX: 0,
    cursorWorldY: 0,
    ...overrides,
  }
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

  test('starting a private room locks it against late joins', () => {
    const room = createRoom()
    const client = createClient('session-a')
    room.onJoin(client, { name: 'Alice', characterId: 'sheriff' })

    const onSetReady = getOnMessageHandler(room, 'set-ready')
    onSetReady(client, { ready: true })

    expect((room as unknown as { locked: boolean }).locked).toBe(true)
    expect(() => room.onAuth(createClient('session-b'))).toThrow('Game already in progress')
  })

  test('owner transfers when the original host leaves the lobby', async () => {
    const room = createRoom()
    const clientA = createClient('session-a')
    const clientB = createClient('session-b')
    room.onJoin(clientA, { name: 'Alice', characterId: 'sheriff' })
    room.onJoin(clientB, { name: 'Bob', characterId: 'prospector' })

    const onSetFriendlyFire = getOnMessageHandler(room, 'set-friendly-fire')
    onSetFriendlyFire(clientB, { mode: 'full' })
    expect(room.state.friendlyFire).toBe('none')

    await room.onLeave(clientA, true)

    onSetFriendlyFire(clientB, { mode: 'full' })
    expect(room.state.friendlyFire).toBe('full')
  })

  test('single-client interactables bootstrap does not suppress the next broadcast', () => {
    const room = createRoom()
    const clientA = createClient('session-a')
    const clientB = createClient('session-b')
    room.onJoin(clientA, { name: 'Alice', characterId: 'sheriff' })
    room.onJoin(clientB, { name: 'Bob', characterId: 'prospector' })

    const roomWithInternals = room as unknown as {
      world: GameWorld
      sendInteractablesUpdates: () => void
      sendInteractablesToClient: (client: Client) => void
    }

    roomWithInternals.sendInteractablesUpdates()
    expect(clientA.sent.filter(message => message.type === 'interactables')).toHaveLength(1)
    expect(clientB.sent.filter(message => message.type === 'interactables')).toHaveLength(1)

    roomWithInternals.world.itemPickups.push({
      id: 1,
      itemId: 1,
      x: 200,
      y: 180,
      lifetime: 10,
      collected: false,
    })

    roomWithInternals.sendInteractablesToClient(clientA)
    expect(clientA.sent.filter(message => message.type === 'interactables')).toHaveLength(2)
    expect(clientB.sent.filter(message => message.type === 'interactables')).toHaveLength(1)

    roomWithInternals.sendInteractablesUpdates()
    expect(clientA.sent.filter(message => message.type === 'interactables')).toHaveLength(3)
    expect(clientB.sent.filter(message => message.type === 'interactables')).toHaveLength(2)
  })

  test('input without clientTick emits incompatible-protocol once', () => {
    const room = createRoom()
    const client = createClient('session-a')
    room.onJoin(client, { name: 'Alice', characterId: 'sheriff' })

    const onSetReady = getOnMessageHandler(room, 'set-ready')
    onSetReady(client, { ready: true })
    expect(room.state.phase).toBe('playing')

    const onInput = getOnMessageHandler(room, 'input')
    onInput(client, {
      seq: 1,
      buttons: 0,
      aimAngle: 0,
      moveX: 0,
      moveY: 0,
      cursorWorldX: 0,
      cursorWorldY: 0,
    })
    onInput(client, {
      seq: 2,
      buttons: 0,
      aimAngle: 0,
      moveX: 0,
      moveY: 0,
      cursorWorldX: 0,
      cursorWorldY: 0,
    })

    const protocolMsgs = client.sent.filter(message => message.type === 'incompatible-protocol')
    expect(protocolMsgs).toHaveLength(1)
  })

  test('camp progression requires all connected players to mark ready', () => {
    const room = createRoom()
    const clientA = createClient('session-a')
    const clientB = createClient('session-b')
    room.onJoin(clientA, { name: 'Alice', characterId: 'sheriff' })
    room.onJoin(clientB, { name: 'Bob', characterId: 'prospector' })

    const onSetReady = getOnMessageHandler(room, 'set-ready')
    const onSetCampReady = getOnMessageHandler(room, 'set-camp-ready')
    onSetReady(clientA, { ready: true })
    expect(room.state.phase).toBe('playing')

    const roomWithWorld = room as unknown as {
      world: {
        run: { transition: string; completed: boolean } | null
        campComplete: boolean
      }
    }
    if (!roomWithWorld.world.run) {
      throw new Error('Expected world.run after match start')
    }
    roomWithWorld.world.run.transition = 'camp'
    roomWithWorld.world.run.completed = false
    roomWithWorld.world.campComplete = false

    onSetCampReady(clientA, { ready: true })
    expect(roomWithWorld.world.campComplete).toBe(false)

    onSetCampReady(clientB, { ready: true })
    expect(roomWithWorld.world.campComplete).toBe(true)
  })

  test('set-camp-ready is ignored outside camp transition', () => {
    const room = createRoom()
    const client = createClient('session-a')
    room.onJoin(client, { name: 'Alice', characterId: 'sheriff' })

    const onSetReady = getOnMessageHandler(room, 'set-ready')
    const onSetCampReady = getOnMessageHandler(room, 'set-camp-ready')
    onSetReady(client, { ready: true })
    expect(room.state.phase).toBe('playing')

    const roomWithWorld = room as unknown as {
      world: {
        run: { transition: string; completed: boolean } | null
        campComplete: boolean
      }
    }
    if (!roomWithWorld.world.run) {
      throw new Error('Expected world.run after match start')
    }
    roomWithWorld.world.run.transition = 'none'
    roomWithWorld.world.run.completed = false
    roomWithWorld.world.campComplete = false

    onSetCampReady(client, { ready: true })
    expect(roomWithWorld.world.campComplete).toBe(false)
  })
})

describe('GameRoom lag compensation', () => {
  test('time-based rewind tracks queue delay telemetry without double-counting age', () => {
    const room = createRoom() as unknown as {
      world: { tick: number }
      estimateShotTickFromInputTime: (
        nowMs: number,
        input: NetworkInput,
        queueDepth: number,
      ) => {
        tick: number
        latencyMs: number
        interpMs: number
        queueDelayMs: number
        effectiveAgeMs: number
      } | null
    }
    room.world.tick = 1000

    const input = makeInput({
      estimatedServerTimeMs: 1000,
      viewInterpDelayMs: 40,
    })

    const sample = room.estimateShotTickFromInputTime(1100, input, 3)
    expect(sample).not.toBeNull()
    expect(sample!.latencyMs).toBe(100)
    expect(sample!.interpMs).toBe(40)
    expect(sample!.queueDelayMs).toBeCloseTo(3 * TICK_MS, 4)
    const expectedAgeMs = 100
    expect(sample!.effectiveAgeMs).toBeCloseTo(expectedAgeMs, 4)
    expect(sample!.tick).toBe(1000 - Math.round(expectedAgeMs / TICK_MS))

    const clamped = room.estimateShotTickFromInputTime(1100, input, 999)
    expect(clamped).not.toBeNull()
    expect(clamped!.queueDelayMs).toBe(120)
  })

  test('queue trimming carries dropped shoot timing into the kept input', () => {
    const room = createRoom()
    const client = createClient('session-a')
    room.onJoin(client, { name: 'Alice', characterId: 'sheriff' })
    const onSetReady = getOnMessageHandler(room, 'set-ready')
    onSetReady(client, { ready: true })

    const roomPrivate = room as unknown as {
      slots: Map<string, {
        eid: number
        inputQueue: NetworkInput[]
        lastShootSeq: number
        lastInput: NetworkInput
      }>
      serverTick: () => void
    }
    const slot = roomPrivate.slots.get(client.sessionId)
    if (!slot) {
      throw new Error('Expected slot for joined client')
    }

    slot.inputQueue = [
      makeInput({ seq: 1, clientTick: 91 }),
      makeInput({
        seq: 2,
        clientTick: 123,
        clientTimeMs: 4567,
        estimatedServerTimeMs: 4500,
        viewInterpDelayMs: 35,
        buttons: Button.SHOOT,
        shootSeq: 7,
        aimAngle: 1.25,
        cursorWorldX: 321,
        cursorWorldY: 654,
      }),
      makeInput({ seq: 3, clientTick: 93 }),
      makeInput({ seq: 4, clientTick: 94 }),
      makeInput({ seq: 5, clientTick: 95 }),
      makeInput({ seq: 6, clientTick: 96 }),
      makeInput({ seq: 7, clientTick: 97 }),
    ]

    roomPrivate.serverTick()

    const consumed = slot.lastInput
    expect(consumed.seq).toBe(5)
    expect(consumed.buttons & Button.SHOOT).toBe(Button.SHOOT)
    expect(consumed.shootSeq).toBe(7)
    expect(consumed.clientTick).toBe(123)
    expect(consumed.clientTimeMs).toBe(4567)
    expect(consumed.estimatedServerTimeMs).toBe(4500)
    expect(consumed.viewInterpDelayMs).toBe(35)
    expect(consumed.aimAngle).toBe(1.25)
    expect(consumed.cursorWorldX).toBe(321)
    expect(consumed.cursorWorldY).toBe(654)
    expect(slot.lastShootSeq).toBe(7)
  })

  test('hitscan fire emits shot-result to the shooter', () => {
    const room = createRoom()
    const client = createClient('session-a')
    room.onJoin(client, { name: 'Alice', characterId: 'sheriff' })
    const onSetReady = getOnMessageHandler(room, 'set-ready')
    onSetReady(client, { ready: true })

    const roomPrivate = room as unknown as {
      world: GameWorld
      slots: Map<string, {
        eid: number
        inputQueue: NetworkInput[]
      }>
      serverTick: () => void
    }
    const slot = roomPrivate.slots.get(client.sessionId)
    if (!slot) {
      throw new Error('Expected slot for joined client')
    }

    const shooterX = Position.x[slot.eid]!
    const shooterY = Position.y[slot.eid]!
    spawnGrunt(roomPrivate.world, shooterX + 120, shooterY)

    slot.inputQueue = [
      makeInput({
        seq: 1,
        clientTick: 1,
        buttons: Button.SHOOT,
        aimAngle: 0,
        shootSeq: 1,
      }),
    ]

    roomPrivate.serverTick()

    const shot = client.sent.find(message => message.type === 'shot-result')?.payload as
      | { shooterServerEid: number; shootSeq: number; hit: boolean; damageApplied?: number }
      | undefined
    expect(shot).toBeDefined()
    expect(shot?.shooterServerEid).toBe(slot.eid)
    expect(shot?.shootSeq).toBe(1)
    expect(shot?.hit).toBe(true)
    expect((shot?.damageApplied ?? 0)).toBeGreaterThan(0)
  })
})
