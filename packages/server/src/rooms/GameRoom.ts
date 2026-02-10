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
  Button,
  Cylinder,
  Showdown,
  Health,
  MAX_PLAYERS,
  STAGE_1_ENCOUNTER,
  TICK_MS,
  type GameWorld,
  type SystemRegistry,
  type InputState,
  type NetworkInput,
  type PingMessage,
  type PongMessage,
  type HudData,
} from '@high-noon/shared'
import { GameRoomState, PlayerMeta } from './schema/GameRoomState'

/** Maximum ticks to catch up in one update call (spiral-of-death protection) */
const MAX_CATCHUP_TICKS = 4

/** Snapshot broadcast interval (every N ticks). 60Hz / 3 = 20Hz */
const SNAPSHOT_INTERVAL = 3

/** Maximum queued inputs per player before dropping oldest */
const MAX_INPUT_QUEUE = 30

/** Per-client input rate limit (token bucket) */
const INPUT_RATE_LIMIT_PER_SECOND = 120
const INPUT_RATE_BURST_CAPACITY = 60

/** If queue exceeds this depth, skip to latest input to reduce latency */
const INPUT_QUEUE_TRIM_THRESHOLD = 6

/** When queue is briefly empty, reuse last input for a few ticks to avoid edge glitches */
const INPUT_HOLD_TICKS = 3

/** Neutral input (all zeros) used when a player's queue is empty. Frozen to prevent accidental mutation. */
const neutralInput: InputState = Object.freeze(createInputState())

/**
 * Action buttons that should survive queue trimming.
 * These are edge-sensitive gameplay actions where dropping a short tap
 * causes visible client/server divergence (e.g., dash not starting server-side).
 */
const TRANSIENT_ACTION_BUTTONS =
  Button.ROLL | Button.RELOAD | Button.ABILITY | Button.SHOOT

/**
 * Merge a trimmed backlog into one input:
 * - Keep latest analog state (movement/aim/cursor)
 * - Preserve any transient action taps observed in dropped inputs
 */
function mergeTrimmedInputs(queue: NetworkInput[]): NetworkInput {
  const latest = queue[queue.length - 1]!
  let mergedButtons = latest.buttons
  for (let i = 0; i < queue.length - 1; i++) {
    mergedButtons |= queue[i]!.buttons & TRANSIENT_ACTION_BUTTONS
  }
  return {
    ...latest,
    buttons: mergedButtons,
  }
}

/** Per-player server state */
interface PlayerSlot {
  client: Client
  eid: number
  inputQueue: NetworkInput[]
  lastProcessedSeq: number
  lastInput: InputState
  heldInputTicks: number
  inputTokens: number
  inputTokenLastRefillMs: number
  rateLimitedDrops: number
}

/** World coordinate clamp range (generous bounds for any reasonable arena) */
const WORLD_COORD_MAX = 10_000

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/**
 * Validate that incoming data has the correct shape for NetworkInput.
 * Rejects NaN, Infinity, and non-number fields.
 */
function isValidInput(data: unknown): data is NetworkInput {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  return (
    isFiniteNumber(d.seq) &&
    isFiniteNumber(d.buttons) &&
    isFiniteNumber(d.aimAngle) &&
    isFiniteNumber(d.moveX) &&
    isFiniteNumber(d.moveY) &&
    isFiniteNumber(d.cursorWorldX) &&
    isFiniteNumber(d.cursorWorldY)
  )
}

/** Bits that are not allowed from client input (server-side only / debug) */
const STRIPPED_BUTTONS = Button.DEBUG_SPAWN

/** Clamp validated input values to safe ranges */
function clampInput(input: NetworkInput): NetworkInput {
  return {
    seq: Math.max(1, input.seq | 0),
    buttons: (input.buttons | 0) & ~STRIPPED_BUTTONS,
    aimAngle: Math.max(-Math.PI, Math.min(Math.PI, input.aimAngle)),
    moveX: Math.max(-1, Math.min(1, input.moveX)),
    moveY: Math.max(-1, Math.min(1, input.moveY)),
    cursorWorldX: Math.max(-WORLD_COORD_MAX, Math.min(WORLD_COORD_MAX, input.cursorWorldX)),
    cursorWorldY: Math.max(-WORLD_COORD_MAX, Math.min(WORLD_COORD_MAX, input.cursorWorldY)),
  }
}

function consumeInputToken(slot: PlayerSlot, nowMs: number): boolean {
  const elapsedMs = Math.max(0, nowMs - slot.inputTokenLastRefillMs)
  if (elapsedMs > 0) {
    const refill = (elapsedMs / 1000) * INPUT_RATE_LIMIT_PER_SECOND
    slot.inputTokens = Math.min(INPUT_RATE_BURST_CAPACITY, slot.inputTokens + refill)
    slot.inputTokenLastRefillMs = nowMs
  }

  if (slot.inputTokens < 1) return false
  slot.inputTokens -= 1
  return true
}

export class GameRoom extends Room<GameRoomState> {
  override maxClients = MAX_PLAYERS

  private world!: GameWorld
  private systems!: SystemRegistry
  private slots = new Map<string, PlayerSlot>()
  private accumulator = 0
  private readonly playerSeqs = new Map<number, number>()
  private lastRateLimitLogTick = 0

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
      if (!consumeInputToken(slot, performance.now())) {
        slot.rateLimitedDrops++
        return
      }
      const input = clampInput(data)

      // Drop stale or duplicate sequence numbers.
      if (input.seq <= slot.lastProcessedSeq) return
      const lastQueued = slot.inputQueue[slot.inputQueue.length - 1]
      if (lastQueued && input.seq <= lastQueued.seq) return

      // Keep the freshest input under pressure: drop oldest, keep newest.
      if (slot.inputQueue.length >= MAX_INPUT_QUEUE) {
        slot.inputQueue.shift()
      }

      slot.inputQueue.push(input)
    })

    // Clock sync ping/pong handler
    this.onMessage('ping', (client, data: PingMessage) => {
      client.send('pong', {
        clientTime: data.clientTime,
        serverTime: performance.now(),
      } satisfies PongMessage)
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
      lastProcessedSeq: 0,
      lastInput: neutralInput,
      heldInputTicks: 0,
      inputTokens: INPUT_RATE_BURST_CAPACITY,
      inputTokenLastRefillMs: performance.now(),
      rateLimitedDrops: 0,
    })

    // Send game config to the joining client
    client.send('game-config', {
      seed: this.world.initialSeed,
      sessionId: client.sessionId,
      playerEid: eid,
    })

    console.log(`[GameRoom] ${client.sessionId} joined (eid=${eid}, players=${this.slots.size})`)

    // Auto-start on first join
    if (this.state.phase === 'lobby' && this.slots.size >= 1) {
      this.state.phase = 'playing'
      setEncounter(this.world, STAGE_1_ENCOUNTER)
      console.log('[GameRoom] Phase → playing')
    }
  }

  override async onLeave(client: Client, consented?: boolean) {
    if (!consented) {
      try {
        await this.allowReconnection(client, 30)
        console.log(`[GameRoom] ${client.sessionId} reconnected`)

        // Send game-config to the reconnected client (new page load needs config)
        const slot = this.slots.get(client.sessionId)
        if (slot) {
          slot.inputQueue = []  // Clear stale inputs from before disconnect
          slot.lastInput = neutralInput
          slot.heldInputTicks = 0
          slot.inputTokens = INPUT_RATE_BURST_CAPACITY
          slot.inputTokenLastRefillMs = performance.now()
          slot.rateLimitedDrops = 0
          client.send('game-config', {
            seed: this.world.initialSeed,
            sessionId: client.sessionId,
            playerEid: slot.eid,
          })
        }
        return // Slot preserved
      } catch {
        // Timed out — fall through to cleanup
      }
    }

    removePlayer(this.world, client.sessionId)
    this.state.players.delete(client.sessionId)
    this.slots.delete(client.sessionId)

    console.log(`[GameRoom] ${client.sessionId} left (players=${this.slots.size})`)
  }

  override onDispose() {
    this.slots.clear()
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
    // 1. Pop one input per player into world.playerInputs (neutral if empty).
    //    Trim backlog aggressively: if queue depth exceeds threshold, skip to
    //    the latest input to prevent snowballing latency under jitter.
    for (const [, slot] of this.slots) {
      if (slot.inputQueue.length > INPUT_QUEUE_TRIM_THRESHOLD) {
        // Skip to latest analog state but preserve action-button taps from
        // dropped inputs to avoid losing edge-triggered actions.
        const merged = mergeTrimmedInputs(slot.inputQueue)
        slot.inputQueue.length = 0
        slot.lastProcessedSeq = merged.seq
        slot.lastInput = merged
        slot.heldInputTicks = 0
        this.world.playerInputs.set(slot.eid, merged)
      } else {
        const input = slot.inputQueue.shift()
        if (input) {
          slot.lastProcessedSeq = input.seq
          slot.lastInput = input
          slot.heldInputTicks = 0
          this.world.playerInputs.set(slot.eid, input)
        } else {
          if (slot.heldInputTicks < INPUT_HOLD_TICKS) {
            slot.heldInputTicks++
            this.world.playerInputs.set(slot.eid, slot.lastInput)
          } else {
            this.world.playerInputs.set(slot.eid, neutralInput)
          }
        }
      }
    }

    // 2. Step simulation — DO NOT pass input param (that's the single-player bridge)
    stepWorld(this.world, this.systems)

    // 3. Update Schema tick
    this.state.serverTick = this.world.tick

    // 4. Broadcast snapshot every SNAPSHOT_INTERVAL ticks (20Hz)
    if (this.world.tick % SNAPSHOT_INTERVAL === 0) {
      this.broadcastSnapshot()
    }

    // 5. Send per-client HUD data at 10Hz (every 6 ticks)
    if (this.world.tick % 6 === 0) {
      this.sendHudUpdates()
    }

    this.maybeLogRateLimitDrops()
  }

  private maybeLogRateLimitDrops(): void {
    const LOG_INTERVAL_TICKS = 60 * 5 // 5 seconds at 60Hz
    if (this.world.tick - this.lastRateLimitLogTick < LOG_INTERVAL_TICKS) return
    this.lastRateLimitLogTick = this.world.tick

    let dropped = 0
    for (const slot of this.slots.values()) {
      dropped += slot.rateLimitedDrops
      slot.rateLimitedDrops = 0
    }

    if (dropped > 0) {
      console.log(`[GameRoom][telemetry] dropped ${dropped} inputs due to rate limit over last 5s`)
    }
  }

  private sendHudUpdates() {
    for (const [, slot] of this.slots) {
      const eid = slot.eid
      const hud: HudData = {
        hp: Health.current[eid]!,
        maxHp: Health.max[eid]!,
        cylinderRounds: Cylinder.rounds[eid]!,
        cylinderMax: Cylinder.maxRounds[eid]!,
        isReloading: Cylinder.reloading[eid]! === 1,
        reloadProgress: Cylinder.reloading[eid]! === 1 && Cylinder.reloadTime[eid]! > 0
          ? Math.min(1, Cylinder.reloadTimer[eid]! / Cylinder.reloadTime[eid]!)
          : 0,
        showdownActive: Showdown.active[eid]! === 1,
        showdownCooldown: Showdown.cooldown[eid]!,
        showdownCooldownMax: this.world.upgradeState.showdownCooldown,
        showdownTimeLeft: Showdown.duration[eid]!,
        showdownDurationMax: this.world.upgradeState.showdownDuration,
      }
      slot.client.send('hud', hud)
    }
  }

  private broadcastSnapshot() {
    // Repopulate reusable seq acknowledgment map
    this.playerSeqs.clear()
    for (const [, slot] of this.slots) {
      this.playerSeqs.set(slot.eid, slot.lastProcessedSeq)
    }

    // encodeSnapshot returns a Uint8Array view into a shared buffer.
    // sendBytes copies data into the WebSocket send queue synchronously,
    // so broadcasting the same view to multiple clients is safe. The next
    // encodeSnapshot call only happens on the next serverTick.
    const snapshot = encodeSnapshot(this.world, performance.now(), this.playerSeqs)
    for (const [, slot] of this.slots) {
      slot.client.sendBytes('snapshot', snapshot)
    }
  }
}
