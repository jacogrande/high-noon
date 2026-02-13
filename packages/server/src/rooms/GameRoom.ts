import { Room, type Client } from 'colyseus'
import { hasComponent } from 'bitecs'
import {
  createGameWorld,
  setWorldTilemap,
  startRun,
  generateArena,
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
  getCharacterDef,
  getUpgradeStateForPlayer,
  deriveAbilityHudState,
  initUpgradeState,
  takeNode,
  writeStatsToECS,
  LEVEL_THRESHOLDS,
  MAX_LEVEL,
  MAX_PLAYERS,
  DEFAULT_RUN_STAGES,
  TICK_RATE,
  TICK_MS,
  type GameWorld,
  type SystemRegistry,
  type NetworkInput,
  type PingMessage,
  type PongMessage,
  type HudData,
  type SelectNodeRequest,
  type SelectNodeResponse,
  type CharacterId,
  type PlayerRosterEntry,
} from '@high-noon/shared'
import { GameRoomState, PlayerMeta } from './schema/GameRoomState'
import { ClientTickMapper } from '../net/ClientTickMapper'
import { RewindHistory } from '../net/RewindHistory'

/** Maximum ticks to catch up in one update call (spiral-of-death protection) */
const MAX_CATCHUP_TICKS = 4

/** Snapshot broadcast interval (every N ticks). 60Hz / 2 = 30Hz */
const SNAPSHOT_INTERVAL = 2

/** Maximum queued inputs per player before dropping oldest */
const MAX_INPUT_QUEUE = 30

/** Per-client input rate limit (token bucket) */
const INPUT_RATE_LIMIT_PER_SECOND = 120
const INPUT_RATE_BURST_CAPACITY = 60

/** If queue exceeds this depth, skip to latest input to reduce latency */
const INPUT_QUEUE_TRIM_THRESHOLD = 6
/** When trimming backlog, keep this many recent inputs */
const INPUT_QUEUE_TRIM_TO = 3

/** When queue is briefly empty, reuse last input for a few ticks to avoid edge glitches */
const INPUT_HOLD_TICKS = 3

/** Neutral input (all zeros) used when a player's queue is empty. Frozen to prevent accidental mutation. */
const neutralInput: NetworkInput = Object.freeze({
  ...createInputState(),
  seq: 0,
  clientTick: 0,
  clientTimeMs: 0,
  estimatedServerTimeMs: 0,
  viewInterpDelayMs: 0,
  shootSeq: 0,
})

const REWIND_MAX_MS = 120
const REWIND_MAX_TICKS = Math.max(1, Math.floor((REWIND_MAX_MS / 1000) * TICK_RATE))
const REWIND_HISTORY_TICKS = REWIND_MAX_TICKS + 8
const REWIND_MAX_VIEW_INTERP_DELAY_MS = 200
const REWIND_HISTORICAL_RADIUS_PADDING = 2
const REWIND_LATENCY_WEIGHT = 0.45
const REWIND_VIEW_DELAY_WEIGHT = 0.35

/**
 * Action buttons that should survive queue trimming.
 * These are edge-sensitive gameplay actions where dropping a short tap
 * causes visible client/server divergence (e.g., dash not starting server-side).
 */
const TRANSIENT_ACTION_BUTTONS =
  Button.ROLL | Button.JUMP | Button.RELOAD | Button.ABILITY | Button.SHOOT

function mergeTransientButtons(inputs: NetworkInput[], baseButtons: number): number {
  let merged = baseButtons
  for (let i = 0; i < inputs.length; i++) {
    merged |= inputs[i]!.buttons & TRANSIENT_ACTION_BUTTONS
  }
  return merged
}

/** Per-player server state */
interface PlayerSlot {
  client: Client
  eid: number
  characterId: CharacterId
  inputQueue: NetworkInput[]
  lastProcessedSeq: number
  lastInput: NetworkInput
  heldInputTicks: number
  inputTokens: number
  inputTokenLastRefillMs: number
  rateLimitedDrops: number
  tickMapper: ClientTickMapper
  lastShootSeq: number
  protocolMismatchNotified: boolean
}

/** World coordinate clamp range (generous bounds for any reasonable arena) */
const WORLD_COORD_MAX = 10_000

interface JoinOptions {
  name?: string
  characterId?: unknown
}

interface ReadyMessage {
  ready: boolean
}

interface CharacterMessage {
  characterId: CharacterId
}

function isCharacterId(value: unknown): value is CharacterId {
  return value === 'sheriff' || value === 'undertaker' || value === 'prospector'
}

function parseReadyMessage(value: unknown): ReadyMessage | null {
  if (typeof value === 'boolean') {
    return { ready: value }
  }
  if (typeof value !== 'object' || value === null) return null
  const ready = (value as { ready?: unknown }).ready
  if (typeof ready !== 'boolean') return null
  return { ready }
}

function parseCharacterMessage(value: unknown): CharacterMessage | null {
  if (isCharacterId(value)) {
    return { characterId: value }
  }
  if (typeof value !== 'object' || value === null) return null
  const characterId = (value as { characterId?: unknown }).characterId
  if (!isCharacterId(characterId)) return null
  return { characterId }
}

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
    isFiniteNumber(d.clientTick) &&
    isFiniteNumber(d.clientTimeMs) &&
    isFiniteNumber(d.estimatedServerTimeMs) &&
    isFiniteNumber(d.viewInterpDelayMs) &&
    isFiniteNumber(d.shootSeq) &&
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
    seq: Math.max(1, Math.trunc(input.seq)),
    clientTick: Math.max(0, Math.trunc(input.clientTick)),
    clientTimeMs: Math.max(0, input.clientTimeMs),
    estimatedServerTimeMs: Math.max(0, input.estimatedServerTimeMs),
    viewInterpDelayMs: Math.max(0, Math.min(REWIND_MAX_VIEW_INTERP_DELAY_MS, input.viewInterpDelayMs)),
    shootSeq: Math.max(0, Math.trunc(input.shootSeq)),
    buttons: Math.trunc(input.buttons) & ~STRIPPED_BUTTONS,
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
  private rewindHistory!: RewindHistory
  private slots = new Map<string, PlayerSlot>()
  private accumulator = 0
  private readonly playerSeqs = new Map<number, number>()
  private lastRateLimitLogTick = 0
  private lastRewindLogTick = 0
  private rewindShotsTotal = 0
  private rewindShotsClamped = 0
  private rewindHistoryMisses = 0
  private rewindTicksAccum = 0
  private rewindTickSamples: number[] = []
  private rewindTimeBasedSamples = 0
  private rewindMapperFallbackSamples = 0
  private rewindHeldInputShotsSkipped = 0
  private rewindLatencyMsAccum = 0
  private rewindInterpMsAccum = 0
  private rewindEffectiveAgeMsAccum = 0
  private readonly campReadySessions = new Set<string>()
  private wasCampTransition = false

  override onAuth(_client: Client, options?: JoinOptions): boolean {
    if (options?.characterId !== undefined && !isCharacterId(options.characterId)) {
      throw new Error(`Invalid characterId: ${String(options.characterId)}`)
    }
    return true
  }

  override onCreate() {
    const seed = Date.now()
    this.world = createGameWorld(seed)
    this.world.lagCompEnabled = true
    this.world.lagCompMaxRewindTicks = REWIND_MAX_TICKS
    this.world.lagCompHistoricalRadiusPadding = REWIND_HISTORICAL_RADIUS_PADDING
    this.rewindHistory = new RewindHistory(REWIND_HISTORY_TICKS)
    this.world.lagCompGetPlayerPosAtTick = (eid, tick) => this.rewindHistory.getPlayerAtTick(eid, tick)
    this.world.lagCompGetEnemyStateAtTick = (eid, tick) => this.rewindHistory.getEnemyStateAtTick(eid, tick)
    const stage0Config = DEFAULT_RUN_STAGES[0]!.mapConfig
    setWorldTilemap(this.world, generateArena(stage0Config, seed, 0))

    this.systems = createSystemRegistry()
    registerAllSystems(this.systems)

    this.setState(new GameRoomState())
    this.setPatchRate(100) // 10Hz Schema sync for lobby metadata

    // Input message handler
    this.onMessage('input', (client, data) => {
      if (this.state.phase !== 'playing') return
      const slot = this.slots.get(client.sessionId)
      if (!slot) return
      if (!isValidInput(data)) {
        const payload = data as Record<string, unknown> | null
        const hasRequiredTiming =
          !!payload &&
          isFiniteNumber(payload.clientTick) &&
          isFiniteNumber(payload.clientTimeMs) &&
          isFiniteNumber(payload.estimatedServerTimeMs) &&
          isFiniteNumber(payload.viewInterpDelayMs) &&
          isFiniteNumber(payload.shootSeq)
        if (!hasRequiredTiming && !slot.protocolMismatchNotified) {
          slot.protocolMismatchNotified = true
          client.send(
            'incompatible-protocol',
            'Input protocol mismatch: expected clientTick + timing metadata',
          )
        }
        return
      }
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

    // Re-send authoritative game config when requested by clients (used after reconnect).
    this.onMessage('request-game-config', (client) => {
      const slot = this.slots.get(client.sessionId)
      if (!slot) return
      this.sendGameConfig(client, slot)
    })

    this.onMessage('set-ready', (client, data) => {
      if (this.state.phase !== 'lobby') return
      const slot = this.slots.get(client.sessionId)
      if (!slot) return
      const msg = parseReadyMessage(data)
      if (!msg) return

      const meta = this.state.players.get(client.sessionId)
      if (!meta) return
      meta.ready = msg.ready
      this.maybeStartMatch()
    })

    this.onMessage('set-camp-ready', (client, data) => {
      if (this.state.phase !== 'playing') return
      const slot = this.slots.get(client.sessionId)
      if (!slot) return
      const run = this.world.run
      if (!run || run.completed || run.transition !== 'camp') return

      const msg = parseReadyMessage(data)
      if (!msg) return
      if (msg.ready) {
        this.campReadySessions.add(client.sessionId)
      } else {
        this.campReadySessions.delete(client.sessionId)
      }
      this.maybeCompleteCamp()
    })

    this.onMessage('set-character', (client, data) => {
      if (this.state.phase !== 'lobby') return
      const slot = this.slots.get(client.sessionId)
      if (!slot) return
      const msg = parseCharacterMessage(data)
      if (!msg) return
      if (msg.characterId === slot.characterId) return

      const meta = this.state.players.get(client.sessionId)
      if (!meta) return

      this.replacePlayerCharacter(client.sessionId, slot, msg.characterId)
      meta.characterId = msg.characterId
      meta.ready = false
      this.sendGameConfig(slot.client, slot)
      this.broadcastPlayerRoster()
    })

    // Skill tree node selection (server-authoritative)
    this.onMessage('select-node', (client, data: SelectNodeRequest) => {
      const slot = this.slots.get(client.sessionId)
      if (!slot) return
      if (typeof data?.nodeId !== 'string' || data.nodeId.length === 0 || data.nodeId.length > 64) return
      const us = getUpgradeStateForPlayer(this.world, slot.eid)
      const success = takeNode(us, data.nodeId, this.world)
      if (success) {
        writeStatsToECS(this.world, slot.eid, us)
      }
      client.send('select-node-result', { success, nodeId: data.nodeId } satisfies SelectNodeResponse)
    })

    // Fixed-timestep simulation loop
    this.setSimulationInterval((deltaMs) => this.update(deltaMs), TICK_MS)

    console.log(`[GameRoom] Created with seed ${seed}`)
  }

  override onJoin(client: Client, options?: JoinOptions) {
    const characterId: CharacterId = isCharacterId(options?.characterId) ? options.characterId : 'sheriff'
    const upgradeState = initUpgradeState(getCharacterDef(characterId))
    const eid = addPlayer(this.world, client.sessionId, upgradeState)

    // Add to Colyseus Schema (for lobby metadata)
    const meta = new PlayerMeta()
    meta.name = options?.name ?? client.sessionId.slice(0, 8)
    meta.characterId = characterId
    this.state.players.set(client.sessionId, meta)

    // Add to server slot tracking
    const slot: PlayerSlot = {
      client,
      eid,
      characterId,
      inputQueue: [],
      lastProcessedSeq: 0,
      lastInput: neutralInput,
      heldInputTicks: 0,
      inputTokens: INPUT_RATE_BURST_CAPACITY,
      inputTokenLastRefillMs: performance.now(),
      rateLimitedDrops: 0,
      tickMapper: new ClientTickMapper(),
      lastShootSeq: 0,
      protocolMismatchNotified: false,
    }
    this.slots.set(client.sessionId, slot)

    // Send game config to the joining client
    this.sendGameConfig(client, slot)
    this.broadcastPlayerRoster()

    console.log(`[GameRoom] ${client.sessionId} joined (eid=${eid}, character=${characterId}, players=${this.slots.size})`)
  }

  override async onLeave(client: Client, consented?: boolean) {
    if (!consented) {
      try {
        const reconnectedClient = await this.allowReconnection(client, 30)
        console.log(`[GameRoom] ${client.sessionId} reconnected`)

        // Send game-config to the reconnected client (new page load needs config)
        const slot = this.slots.get(client.sessionId)
        if (slot) {
          slot.client = reconnectedClient
          slot.inputQueue = []  // Clear stale inputs from before disconnect
          slot.lastInput = neutralInput
          slot.heldInputTicks = 0
          slot.inputTokens = INPUT_RATE_BURST_CAPACITY
          slot.inputTokenLastRefillMs = performance.now()
          slot.rateLimitedDrops = 0
          slot.tickMapper = new ClientTickMapper()
          slot.lastShootSeq = 0
          slot.protocolMismatchNotified = false
          this.sendGameConfig(reconnectedClient, slot)
        }
        return // Slot preserved
      } catch {
        // Timed out — fall through to cleanup
      }
    }

    removePlayer(this.world, client.sessionId)
    this.state.players.delete(client.sessionId)
    this.slots.delete(client.sessionId)
    this.campReadySessions.delete(client.sessionId)
    this.maybeCompleteCamp()
    this.broadcastPlayerRoster()

    console.log(`[GameRoom] ${client.sessionId} left (players=${this.slots.size})`)
  }

  override onDispose() {
    this.slots.clear()
    this.rewindHistory.clear()
    this.world.lagCompShotTickByPlayer.clear()
    this.world.lagCompBulletShotTick.clear()
    this.rewindTickSamples.length = 0
    this.rewindLatencyMsAccum = 0
    this.rewindInterpMsAccum = 0
    this.rewindEffectiveAgeMsAccum = 0
    this.campReadySessions.clear()
    console.log('[GameRoom] Disposed')
  }

  private sendGameConfig(client: Client, slot: PlayerSlot): void {
    const us = getUpgradeStateForPlayer(this.world, slot.eid)
    client.send('game-config', {
      seed: this.world.initialSeed,
      sessionId: client.sessionId,
      playerEid: slot.eid,
      characterId: slot.characterId,
      roster: this.getPlayerRoster(),
      nodesTaken: us.nodesTaken.size > 0 ? Array.from(us.nodesTaken) : undefined,
    })
  }

  private getPlayerRoster(): PlayerRosterEntry[] {
    const roster: PlayerRosterEntry[] = []
    for (const slot of this.slots.values()) {
      roster.push({
        eid: slot.eid,
        characterId: slot.characterId,
      })
    }
    return roster
  }

  private broadcastPlayerRoster(): void {
    const roster = this.getPlayerRoster()
    for (const slot of this.slots.values()) {
      slot.client.send('player-roster', roster)
    }
  }

  private replacePlayerCharacter(sessionId: string, slot: PlayerSlot, characterId: CharacterId): void {
    removePlayer(this.world, sessionId)
    const upgradeState = initUpgradeState(getCharacterDef(characterId))
    slot.eid = addPlayer(this.world, sessionId, upgradeState)
    slot.characterId = characterId
    slot.inputQueue = []
    slot.lastProcessedSeq = 0
    slot.lastInput = neutralInput
    slot.heldInputTicks = 0
    slot.inputTokens = INPUT_RATE_BURST_CAPACITY
    slot.inputTokenLastRefillMs = performance.now()
    slot.rateLimitedDrops = 0
    slot.tickMapper = new ClientTickMapper()
    slot.lastShootSeq = 0
    slot.protocolMismatchNotified = false
  }

  private broadcastGameConfig(): void {
    for (const slot of this.slots.values()) {
      this.sendGameConfig(slot.client, slot)
    }
  }

  private maybeStartMatch(): void {
    if (this.state.phase !== 'lobby') return
    if (this.slots.size === 0) return

    let someoneReady = false
    for (const meta of this.state.players.values()) {
      if (meta.ready) {
        someoneReady = true
        break
      }
    }

    if (!someoneReady) return

    this.state.phase = 'playing'
    startRun(this.world, DEFAULT_RUN_STAGES)
    this.campReadySessions.clear()
    this.wasCampTransition = false
    this.broadcastPlayerRoster()
    this.broadcastGameConfig()
    console.log('[GameRoom] Phase → playing')
  }

  private syncCampTransitionState(): void {
    const run = this.world.run
    const isCamp = !!run && !run.completed && run.transition === 'camp'
    if (isCamp !== this.wasCampTransition) {
      this.campReadySessions.clear()
      this.wasCampTransition = isCamp
    }
  }

  private maybeCompleteCamp(): void {
    if (this.state.phase !== 'playing') return
    const run = this.world.run
    if (!run || run.completed || run.transition !== 'camp') return

    for (const sessionId of this.campReadySessions) {
      if (!this.slots.has(sessionId)) {
        this.campReadySessions.delete(sessionId)
      }
    }

    if (this.slots.size === 0) return
    if (this.campReadySessions.size < this.slots.size) return
    this.world.campComplete = true
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

  private buildHeldInput(slot: PlayerSlot): NetworkInput {
    const heldButtons = slot.lastInput.buttons & ~TRANSIENT_ACTION_BUTTONS
    return {
      ...slot.lastInput,
      clientTick: slot.lastInput.clientTick + 1,
      clientTimeMs: slot.lastInput.clientTimeMs + TICK_MS,
      estimatedServerTimeMs: slot.lastInput.estimatedServerTimeMs > 0
        ? slot.lastInput.estimatedServerTimeMs + TICK_MS
        : 0,
      buttons: heldButtons,
    }
  }

  private estimateShotTickFromInputTime(
    nowMs: number,
    input: NetworkInput,
  ): { tick: number; latencyMs: number; interpMs: number; effectiveAgeMs: number } | null {
    if (input.estimatedServerTimeMs <= 0) return null
    const oneWayLatencyMs = Math.max(0, nowMs - input.estimatedServerTimeMs)
    const interpMs = Math.max(0, Math.min(REWIND_MAX_VIEW_INTERP_DELAY_MS, input.viewInterpDelayMs))
    const effectiveAgeMs =
      oneWayLatencyMs * REWIND_LATENCY_WEIGHT +
      interpMs * REWIND_VIEW_DELAY_WEIGHT
    if (!Number.isFinite(effectiveAgeMs)) return null
    // Bias toward lower rewind to avoid over-rewinding on borderline fractions.
    const ageTicks = Math.max(0, Math.floor(effectiveAgeMs / TICK_MS))
    return {
      tick: this.world.tick - ageTicks,
      latencyMs: oneWayLatencyMs,
      interpMs,
      effectiveAgeMs,
    }
  }

  private applyLagCompShotTick(slot: PlayerSlot, input: NetworkInput, hadFreshInput: boolean, nowMs: number): void {
    if (hadFreshInput) {
      slot.tickMapper.updateOffset(this.world.tick, input.clientTick)
    }

    if ((input.buttons & Button.SHOOT) === 0) return
    if (!hadFreshInput) {
      this.rewindHeldInputShotsSkipped++
      return
    }

    const timeEstimated = this.estimateShotTickFromInputTime(nowMs, input)
    const estimatedTick = timeEstimated?.tick ?? slot.tickMapper.estimateServerTick(input.clientTick)
    if (timeEstimated !== null) {
      this.rewindTimeBasedSamples++
      this.rewindLatencyMsAccum += timeEstimated.latencyMs
      this.rewindInterpMsAccum += timeEstimated.interpMs
      this.rewindEffectiveAgeMsAccum += timeEstimated.effectiveAgeMs
    } else {
      this.rewindMapperFallbackSamples++
    }
    const rewind = slot.tickMapper.clampRewindTick(this.world.tick, estimatedTick, REWIND_MAX_TICKS)
    this.world.lagCompShotTickByPlayer.set(slot.eid, rewind.tick)
    this.rewindShotsTotal++
    const rewindTicks = this.world.tick - rewind.tick
    this.rewindTicksAccum += rewindTicks
    this.rewindTickSamples.push(rewindTicks)
    slot.lastShootSeq = Math.max(slot.lastShootSeq, input.shootSeq)

    if (rewind.clamped) {
      this.rewindShotsClamped++
    }
    if (!this.rewindHistory.hasTick(rewind.tick)) {
      this.rewindHistoryMisses++
    }
  }

  private serverTick() {
    const tickNowMs = performance.now()
    this.rewindHistory.record(this.world)
    this.world.lagCompShotTickByPlayer.clear()
    this.syncCampTransitionState()

    // 1. Pop one input per player into world.playerInputs (neutral if empty).
    //    Trim backlog aggressively: if queue depth exceeds threshold, discard
    //    oldest samples to cut latency while preserving transient actions.
    for (const [, slot] of this.slots) {
      if (slot.inputQueue.length > INPUT_QUEUE_TRIM_THRESHOLD) {
        const trimTo = Math.max(1, Math.min(INPUT_QUEUE_TRIM_TO, INPUT_QUEUE_TRIM_THRESHOLD))
        const dropCount = Math.max(0, slot.inputQueue.length - trimTo)
        if (dropCount > 0) {
          const dropped = slot.inputQueue.splice(0, dropCount)
          const next = slot.inputQueue[0]
          if (next) {
            slot.inputQueue[0] = {
              ...next,
              buttons: mergeTransientButtons(dropped, next.buttons),
            }
          }
        }
      }

      let input: NetworkInput
      let hadFreshInput = false
      const queued = slot.inputQueue.shift()
      if (queued) {
        input = queued
        hadFreshInput = true
        slot.lastProcessedSeq = queued.seq
        slot.lastInput = queued
        slot.heldInputTicks = 0
      } else {
        if (slot.heldInputTicks < INPUT_HOLD_TICKS) {
          slot.heldInputTicks++
          input = this.buildHeldInput(slot)
          slot.lastInput = input
        } else {
          input = neutralInput
        }
      }

      this.applyLagCompShotTick(slot, input, hadFreshInput, tickNowMs)
      this.world.playerInputs.set(slot.eid, input)
    }

    this.maybeCompleteCamp()

    // 2. Step simulation — DO NOT pass input param (that's the single-player bridge)
    stepWorld(this.world, this.systems)
    this.syncCampTransitionState()

    // 3. Update Schema tick
    this.state.serverTick = this.world.tick

    // 4. Broadcast snapshot every SNAPSHOT_INTERVAL ticks (30Hz)
    if (this.world.tick % SNAPSHOT_INTERVAL === 0) {
      this.broadcastSnapshot()
    }

    // 5. Send per-client HUD data at 10Hz (every 6 ticks)
    if (this.world.tick % 6 === 0) {
      this.sendHudUpdates()
    }

    this.maybeLogRateLimitDrops()
    this.maybeLogRewindStats()
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

  private percentile(samples: number[], p: number): number {
    if (samples.length === 0) return 0
    const sorted = [...samples].sort((a, b) => a - b)
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * p)))
    return sorted[idx]!
  }

  private maybeLogRewindStats(): void {
    const LOG_INTERVAL_TICKS = 60 * 5
    if (this.world.tick - this.lastRewindLogTick < LOG_INTERVAL_TICKS) return
    this.lastRewindLogTick = this.world.tick
    if (this.rewindShotsTotal <= 0 && this.rewindHistoryMisses <= 0 && this.rewindHeldInputShotsSkipped <= 0) return

    const avgRewindTicks = this.rewindShotsTotal > 0
      ? this.rewindTicksAccum / this.rewindShotsTotal
      : 0
    const p50 = this.percentile(this.rewindTickSamples, 0.5)
    const p95 = this.percentile(this.rewindTickSamples, 0.95)
    const avgLatencyMs = this.rewindTimeBasedSamples > 0
      ? this.rewindLatencyMsAccum / this.rewindTimeBasedSamples
      : 0
    const avgInterpMs = this.rewindTimeBasedSamples > 0
      ? this.rewindInterpMsAccum / this.rewindTimeBasedSamples
      : 0
    const avgEffectiveAgeMs = this.rewindTimeBasedSamples > 0
      ? this.rewindEffectiveAgeMsAccum / this.rewindTimeBasedSamples
      : 0

    console.log(
      `[GameRoom][rewind] shots=${this.rewindShotsTotal} clamped=${this.rewindShotsClamped} historyMiss=${this.rewindHistoryMisses} avgTicks=${avgRewindTicks.toFixed(2)} p50Ticks=${p50.toFixed(2)} p95Ticks=${p95.toFixed(2)} timeBased=${this.rewindTimeBasedSamples} mapperFallback=${this.rewindMapperFallbackSamples} heldSkip=${this.rewindHeldInputShotsSkipped} avgLatencyMs=${avgLatencyMs.toFixed(1)} avgInterpMs=${avgInterpMs.toFixed(1)} avgEffectiveAgeMs=${avgEffectiveAgeMs.toFixed(1)}`,
    )

    this.rewindShotsTotal = 0
    this.rewindShotsClamped = 0
    this.rewindHistoryMisses = 0
    this.rewindTicksAccum = 0
    this.rewindTickSamples.length = 0
    this.rewindTimeBasedSamples = 0
    this.rewindMapperFallbackSamples = 0
    this.rewindHeldInputShotsSkipped = 0
    this.rewindLatencyMsAccum = 0
    this.rewindInterpMsAccum = 0
    this.rewindEffectiveAgeMsAccum = 0
  }

  private sendHudUpdates() {
    // Wave status (global, same for all players — compute once)
    const enc = this.world.encounter
    const waveNumber = enc ? enc.currentWave + 1 : 0
    const totalWaves = enc ? enc.definition.waves.length : 0
    const waveStatus: HudData['waveStatus'] = enc
      ? (enc.completed ? 'completed' : enc.waveActive ? 'active' : 'delay')
      : 'none'

    // Stage progression (global)
    const run = this.world.run
    const stageNumber = run ? run.currentStage + 1 : 0
    const totalStages = run ? run.totalStages : 0
    const stageStatus: HudData['stageStatus'] = run
      ? (run.completed ? 'completed' : run.transition === 'camp' ? 'camp' : run.transition !== 'none' ? 'clearing' : 'active')
      : 'none'
    const goldCollected = this.world.goldCollected

    for (const [, slot] of this.slots) {
      const eid = slot.eid
      const state = getUpgradeStateForPlayer(this.world, eid)
      const hasShowdown = hasComponent(this.world, Showdown, eid)
      const hasCylinder = hasComponent(this.world, Cylinder, eid)
      const abilityHud = deriveAbilityHudState(
        slot.characterId,
        {
          showdownCooldown: state.showdownCooldown,
          showdownDuration: state.showdownDuration,
          dynamiteCooldown: state.dynamiteCooldown,
          dynamiteFuse: state.dynamiteFuse,
          dynamiteCooking: state.dynamiteCooking,
          dynamiteCookTimer: state.dynamiteCookTimer,
        },
        hasShowdown
          ? {
              showdownActive: Showdown.active[eid]! === 1,
              showdownCooldown: Showdown.cooldown[eid]!,
              showdownDuration: Showdown.duration[eid]!,
            }
          : undefined,
      )

      const xpForCurrent = LEVEL_THRESHOLDS[state.level] ?? 0
      const xpForNext = state.level < MAX_LEVEL ? LEVEL_THRESHOLDS[state.level + 1]! : xpForCurrent

      const hud: HudData = {
        characterId: slot.characterId,
        hp: Health.current[eid]!,
        maxHp: Health.max[eid]!,
        cylinderRounds: hasCylinder ? Cylinder.rounds[eid]! : 0,
        cylinderMax: hasCylinder ? Cylinder.maxRounds[eid]! : 0,
        isReloading: hasCylinder ? Cylinder.reloading[eid]! === 1 : false,
        reloadProgress: hasCylinder && Cylinder.reloading[eid]! === 1 && Cylinder.reloadTime[eid]! > 0
          ? Math.min(1, Cylinder.reloadTimer[eid]! / Cylinder.reloadTime[eid]!)
          : 0,
        showCylinder: hasCylinder,
        ...abilityHud,
        xp: state.xp,
        level: state.level,
        goldCollected,
        pendingPoints: state.pendingPoints,
        xpForCurrentLevel: xpForCurrent,
        xpForNextLevel: xpForNext,
        waveNumber,
        totalWaves,
        waveStatus,
        stageNumber,
        totalStages,
        stageStatus,
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
