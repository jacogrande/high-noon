import { Room, type Client } from 'colyseus'
import {
  createGameWorld,
  setWorldTilemap,
  setEncounter,
  createTestArena,
  createSystemRegistry,
  registerAllSystems,
  stepWorld,
  addPlayer,
  removePlayer,
  encodeSnapshot,
  createInputState,
  STAGE_1_ENCOUNTER,
  TICK_MS,
  type GameWorld,
  type SystemRegistry,
  type InputState,
} from '@high-noon/shared'
import { GameRoomState, PlayerMeta } from './schema/GameRoomState'

/** Maximum ticks to catch up in one update call (spiral-of-death protection) */
const MAX_CATCHUP_TICKS = 4

/** Snapshot broadcast interval (every N ticks). 60Hz / 3 = 20Hz */
const SNAPSHOT_INTERVAL = 3

/** Maximum queued inputs per player before dropping */
const MAX_INPUT_QUEUE = 30

/** Neutral input (all zeros) used when a player's queue is empty. Frozen to prevent accidental mutation. */
const neutralInput: InputState = Object.freeze(createInputState())

/** Per-player server state */
interface PlayerSlot {
  client: Client
  eid: number
  inputQueue: InputState[]
}

/** World coordinate clamp range (generous bounds for any reasonable arena) */
const WORLD_COORD_MAX = 10_000

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/**
 * Validate that incoming data has the correct shape for InputState.
 * Rejects NaN, Infinity, and non-number fields.
 */
function isValidInput(data: unknown): data is InputState {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  return (
    isFiniteNumber(d.buttons) &&
    isFiniteNumber(d.aimAngle) &&
    isFiniteNumber(d.moveX) &&
    isFiniteNumber(d.moveY) &&
    isFiniteNumber(d.cursorWorldX) &&
    isFiniteNumber(d.cursorWorldY)
  )
}

/** Clamp validated input values to safe ranges */
function clampInput(input: InputState): InputState {
  return {
    buttons: input.buttons | 0, // truncate to integer
    aimAngle: Math.max(-Math.PI, Math.min(Math.PI, input.aimAngle)),
    moveX: Math.max(-1, Math.min(1, input.moveX)),
    moveY: Math.max(-1, Math.min(1, input.moveY)),
    cursorWorldX: Math.max(-WORLD_COORD_MAX, Math.min(WORLD_COORD_MAX, input.cursorWorldX)),
    cursorWorldY: Math.max(-WORLD_COORD_MAX, Math.min(WORLD_COORD_MAX, input.cursorWorldY)),
  }
}

export class GameRoom extends Room<GameRoomState> {
  override maxClients = 4

  private world!: GameWorld
  private systems!: SystemRegistry
  private slots = new Map<string, PlayerSlot>()
  private accumulator = 0

  override onCreate() {
    const seed = Date.now()
    this.world = createGameWorld(seed)
    setWorldTilemap(this.world, createTestArena())

    this.systems = createSystemRegistry()
    registerAllSystems(this.systems)

    this.setState(new GameRoomState())
    this.setPatchRate(100) // 10Hz Schema sync for lobby metadata

    // Input message handler
    this.onMessage('input', (client, data) => {
      const slot = this.slots.get(client.sessionId)
      if (!slot) return
      if (!isValidInput(data)) return
      if (slot.inputQueue.length >= MAX_INPUT_QUEUE) return
      slot.inputQueue.push(clampInput(data))
    })

    // Fixed-timestep simulation loop
    this.setSimulationInterval((deltaMs) => this.update(deltaMs), TICK_MS)

    console.log(`[GameRoom] Created with seed ${seed}`)
  }

  override onJoin(client: Client, options?: { name?: string }) {
    const eid = addPlayer(this.world, client.sessionId)

    // Add to Colyseus Schema (for lobby metadata)
    const meta = new PlayerMeta()
    meta.name = options?.name ?? client.sessionId.slice(0, 8)
    this.state.players.set(client.sessionId, meta)

    // Add to server slot tracking
    this.slots.set(client.sessionId, {
      client,
      eid,
      inputQueue: [],
    })

    // Send game config to the joining client
    client.send('game-config', {
      seed: this.world.initialSeed,
      sessionId: client.sessionId,
    })

    console.log(`[GameRoom] ${client.sessionId} joined (eid=${eid}, players=${this.slots.size})`)

    // Auto-start on first join
    if (this.state.phase === 'lobby' && this.slots.size >= 1) {
      this.state.phase = 'playing'
      setEncounter(this.world, STAGE_1_ENCOUNTER)
      console.log('[GameRoom] Phase → playing')
    }
  }

  override onLeave(client: Client) {
    removePlayer(this.world, client.sessionId)
    this.state.players.delete(client.sessionId)
    this.slots.delete(client.sessionId)

    console.log(`[GameRoom] ${client.sessionId} left (players=${this.slots.size})`)
  }

  override onDispose() {
    console.log('[GameRoom] Disposed')
  }

  private update(deltaMs: number) {
    if (this.state.phase !== 'playing') return

    this.accumulator += deltaMs
    let ticks = 0

    while (this.accumulator >= TICK_MS && ticks < MAX_CATCHUP_TICKS) {
      this.serverTick()
      ticks++
      this.accumulator -= TICK_MS
    }

    // Spiral-of-death protection: drop accumulated time
    if (ticks >= MAX_CATCHUP_TICKS) {
      this.accumulator = 0
    }
  }

  private serverTick() {
    // 1. Pop one input per player into world.playerInputs (neutral if empty)
    for (const [, slot] of this.slots) {
      this.world.playerInputs.set(slot.eid, slot.inputQueue.shift() ?? neutralInput)
    }

    // 2. Step simulation — DO NOT pass input param (that's the single-player bridge)
    stepWorld(this.world, this.systems)

    // 3. Update Schema tick
    this.state.serverTick = this.world.tick

    // 4. Broadcast snapshot every SNAPSHOT_INTERVAL ticks (20Hz)
    if (this.world.tick % SNAPSHOT_INTERVAL === 0) {
      this.broadcastSnapshot()
    }
  }

  private broadcastSnapshot() {
    // encodeSnapshot returns a Uint8Array view into a shared buffer.
    // sendBytes copies data into the WebSocket send queue synchronously,
    // so broadcasting the same view to multiple clients is safe. The next
    // encodeSnapshot call only happens on the next serverTick.
    const snapshot = encodeSnapshot(this.world)
    for (const [, slot] of this.slots) {
      slot.client.sendBytes('snapshot', snapshot)
    }
  }
}
