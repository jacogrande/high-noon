import { Room, type Client } from 'colyseus'
import { hasComponent, addComponent, removeComponent, defineQuery, removeEntity } from 'bitecs'
import {
  createGameWorld,
  setWorldTilemap,
  startRun,
  generateMap,
  createSystemRegistry,
  registerAllSystems,
  stepWorld,
  addPlayer,
  removePlayer,
  encodeSnapshot,
  createInputState,
  Button,
  Bullet,
  Position,
  Velocity,
  Collider,
  Cylinder,
  Showdown,
  Health,
  Dead,
  Downed,
  Disconnected,
  Player,
  Enemy,
  EnemyAI,
  BossPhase,
  getBoss,
  getCharacterDef,
  getUpgradeStateForPlayer,
  deriveAbilityHudState,
  getThread,
  initUpgradeState,
  getShovelPrice,
  takeNode,
  writeStatsToECS,
  LEVEL_THRESHOLDS,
  MAX_LEVEL,
  MAX_PLAYERS,
  DEFAULT_RUN_STAGES,
  TICK_RATE,
  TICK_MS,
  NO_TARGET,
  HP_POTION_MAX_STACK,
  type GameWorld,
  type SystemRegistry,
  type NetworkInput,
  type BulletSpawnMessage,
  type BulletDespawnMessage,
  type ShotResultMessage,
  type PingMessage,
  type PongMessage,
  type HudData,
  type InteractablesData,
  getItemDef,
  getVisitorDef,
  getWeaponModDef,
  tryVisitorPurchase,
  tryTinkererModSelect,
  FOOLS_ERRAND_ID,
  type SelectNodeRequest,
  type SelectNodeResponse,
  type CharacterId,
  type PlayerRosterEntry,
  computeQuickHash,
  ROOM_CODE_CHARS,
  ROOM_CODE_LENGTH,
  QUICK_PLAY_CODE,
  CAMP_AUTO_ADVANCE_SECONDS,
  type CampStatusMessage,
  type PlayerPingEvent,
  PING_COOLDOWN_S,
  PING_MAX_ACTIVE,
  PING_LIFETIME_S,
  getCurrentPicker,
  advanceDraft,
  autoPickBestItem,
  DRAFT_PICK_TIMER_S,
  addItemToPlayer,
  reapplyAllItemEffects,
  VOTEKICK_DURATION_S,
  VOTEKICK_COOLDOWN_S,
  type VotekickStartMessage,
  type VotekickCastMessage,
  type VotekickVoteMessage,
  type VotekickResultMessage,
  type RunCompleteMessage,
  type PlayerStatEntry,
  getOrCreatePlayerStats,
} from '@high-noon/shared'
import { GameRoomState, PlayerMeta } from './schema/GameRoomState'
import { ClientTickMapper } from '../net/ClientTickMapper'
import { RewindHistory } from '../net/RewindHistory'

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

/** AFK detection: ticks of inactivity before warning (60s at 60Hz) */
const AFK_WARNING_TICKS = 60 * TICK_RATE
/** AFK detection: ticks of inactivity before kick (90s at 60Hz) */
const AFK_KICK_TICKS = 90 * TICK_RATE

const REWIND_MAX_MS = 180
const REWIND_MAX_TICKS = Math.max(1, Math.floor((REWIND_MAX_MS / 1000) * TICK_RATE))
const REWIND_HISTORY_TICKS = REWIND_MAX_TICKS + 8
const REWIND_MAX_VIEW_INTERP_DELAY_MS = 200
const REWIND_MAX_QUEUE_DELAY_MS = 120
const REWIND_HISTORICAL_RADIUS_PADDING = 2

/**
 * Action buttons that should survive queue trimming.
 * These are edge-sensitive gameplay actions where dropping a short tap
 * causes visible client/server divergence (e.g., dash not starting server-side).
 */
const TRANSIENT_ACTION_BUTTONS =
  Button.ROLL | Button.JUMP | Button.RELOAD | Button.ABILITY | Button.SHOOT | Button.USE_HP_POTION

const bossQuery = defineQuery([Enemy, BossPhase, Health])
const bulletQuery = defineQuery([Bullet, Position, Velocity, Collider])
const enemyAIQuery = defineQuery([Enemy, EnemyAI])

function mergeTransientButtons(inputs: NetworkInput[], baseButtons: number): number {
  let merged = baseButtons
  for (let i = 0; i < inputs.length; i++) {
    merged |= inputs[i]!.buttons & TRANSIENT_ACTION_BUTTONS
  }
  return merged
}

function selectLatestDroppedShootInput(
  dropped: NetworkInput[],
  minShootSeq: number,
): NetworkInput | null {
  let latest: NetworkInput | null = null
  for (let i = 0; i < dropped.length; i++) {
    const input = dropped[i]!
    if ((input.buttons & Button.SHOOT) === 0) continue
    if (input.shootSeq <= minShootSeq) continue
    if (!latest || input.shootSeq > latest.shootSeq) {
      latest = input
    }
  }
  return latest
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
  /** Timestamp of last accepted player-ping (for cooldown enforcement) */
  lastPingMs: number
  /** Sorted array of tick numbers when each active ping expires */
  pingExpiryTicks: number[]
  /** Tick of last non-neutral input (for AFK detection) */
  lastActiveInputTick: number
  /** Whether this player has been sent an AFK warning */
  afkWarned: boolean
}

/** World coordinate clamp range (generous bounds for any reasonable arena) */
const WORLD_COORD_MAX = 10_000

interface JoinOptions {
  name?: string
  characterId?: unknown
  roomCode?: string
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

function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]
  }
  return code
}

export class GameRoom extends Room<GameRoomState> {
  override maxClients = MAX_PLAYERS

  private world!: GameWorld
  private systems!: SystemRegistry
  private rewindHistory!: RewindHistory
  private slots = new Map<string, PlayerSlot>()
  private pendingReconnects = new Set<string>()
  private consecutiveTickErrors = 0
  private createdAtMs = Date.now()
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
  private rewindQueueDelayMsAccum = 0
  private rewindEffectiveAgeMsAccum = 0
  private readonly bulletNetIdByEid = new Map<number, number>()
  private nextBulletNetId = 1
  private readonly campReadySessions = new Set<string>()
  private wasCampTransition = false
  private campTimerRemaining = 0
  private campStatusBroadcastAccum = 0
  private campAutoAdvanced = false
  private readonly rewindClampedByPlayer = new Map<number, boolean>()
  private lastTickDurationMs = 0
  private tickTimingSamples: number[] = []
  private metricsLogTick = 0
  private roomCode = ''
  private isQuickPlay = false
  /** Session ID of the room creator (host). Used to gate lobby config changes. */
  private ownerSessionId = ''
  private activeVote: {
    voteId: string
    targetSessionId: string
    initiatorSessionId: string
    votes: Map<string, boolean>
    /** Eligible voter count captured at vote-start time (excludes target) */
    eligibleCount: number
    timer: ReturnType<typeof setTimeout>
  } | null = null
  private readonly kickedSessionIds = new Set<string>()
  private readonly votekickCooldowns = new Map<string, number>()
  /** Whether the run-complete stat broadcast has been sent this run */
  private runCompleteSent = false
  /** Wall-clock time when the run started (for duration calculation) */
  private runStartedAtMs = 0

  private logLifecycle(event: string, data?: Record<string, unknown>): void {
    console.log(JSON.stringify({
      event: `room:${event}`,
      roomId: this.roomId,
      playerCount: this.slots.size,
      pendingReconnects: this.pendingReconnects.size,
      uptimeMs: Date.now() - this.createdAtMs,
      ...data,
    }))
  }

  override onAuth(client: Client, options?: JoinOptions): boolean {
    if (options?.characterId !== undefined && !isCharacterId(options.characterId)) {
      throw new Error(`Invalid characterId: ${String(options.characterId)}`)
    }
    // Block kicked players from rejoining
    if (this.kickedSessionIds.has(client.sessionId)) {
      throw new Error('You have been kicked from this room')
    }
    // Validate room code if the client specified one (case-insensitive)
    if (options?.roomCode) {
      const code = String(options.roomCode).trim().toUpperCase()
      if (code === QUICK_PLAY_CODE) {
        // Quick Play rooms accept any client with the sentinel code
        if (this.roomCode !== QUICK_PLAY_CODE) {
          throw new Error('Room is not a Quick Play room')
        }
      } else if (code !== this.roomCode) {
        throw new Error('Invalid room code')
      }
    }
    // Reject new joins once the room is locked (Quick Play game started)
    if (this.locked) {
      throw new Error('Game already in progress')
    }
    return true
  }

  override onCreate(options?: JoinOptions) {
    const seed = Date.now()
    this.world = createGameWorld(seed)
    this.world.playerFireMode = 'hitscan'
    this.world.lagComp.enabled = true
    this.world.lagComp.maxRewindTicks = REWIND_MAX_TICKS
    this.world.lagComp.historicalRadiusPadding = REWIND_HISTORICAL_RADIUS_PADDING
    this.rewindHistory = new RewindHistory(REWIND_HISTORY_TICKS)
    this.world.lagComp.getPlayerPosAtTick = (eid, tick) => this.rewindHistory.getPlayerAtTick(eid, tick)
    this.world.lagComp.getEnemyStateAtTick = (eid, tick) => this.rewindHistory.getEnemyStateAtTick(eid, tick)
    const stage0Config = DEFAULT_RUN_STAGES[0]!.mapConfig
    setWorldTilemap(this.world, generateMap(stage0Config, seed, 0))

    this.systems = createSystemRegistry()
    registerAllSystems(this.systems)

    // Generate room code before setState so the first state broadcast includes it.
    // Quick Play rooms use a sentinel code for Colyseus filterBy matching.
    // Room codes are always generated server-side to prevent collisions.
    const incomingCode = typeof options?.roomCode === 'string'
      ? options.roomCode.trim().toUpperCase()
      : ''
    if (incomingCode === QUICK_PLAY_CODE) {
      this.roomCode = QUICK_PLAY_CODE
      this.isQuickPlay = true
    } else {
      this.roomCode = generateRoomCode()
    }

    this.setState(new GameRoomState())
    this.state.roomCode = this.roomCode
    this.setMetadata({ roomCode: this.roomCode })
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

      // AFK tracking: any non-zero button press or movement resets the timer
      if (input.buttons !== 0 || input.moveX !== 0 || input.moveY !== 0) {
        slot.lastActiveInputTick = this.world.tick
        slot.afkWarned = false
      }
    })

    // Clock sync ping/pong handler
    this.onMessage('ping', (client, data: PingMessage) => {
      client.send('pong', {
        clientTime: data.clientTime,
        serverTime: performance.now(),
      } satisfies PongMessage)
    })

    // Player ping relay (map markers, NOT clock sync)
    this.onMessage('player-ping', (client, data: unknown) => {
      if (this.state.phase !== 'playing') return
      const slot = this.slots.get(client.sessionId)
      if (!slot) return

      // Validate shape
      if (typeof data !== 'object' || data === null) return
      const d = data as Record<string, unknown>
      if (d.type !== 'location' && d.type !== 'enemy' && d.type !== 'danger') return
      if (!isFiniteNumber(d.worldX) || !isFiniteNumber(d.worldY)) return
      if (d.targetEid !== undefined && !isFiniteNumber(d.targetEid)) return

      // Player must be alive
      if (hasComponent(this.world, Dead, slot.eid) || hasComponent(this.world, Downed, slot.eid)) return

      // Cooldown check (server-enforced). lastPingMs starts at 0 so first ping always passes.
      const now = performance.now()
      if (now - slot.lastPingMs < PING_COOLDOWN_S * 1000) return

      // Expire old pings (tick-based instead of setTimeout to avoid dangling closures on disconnect)
      const currentTick = this.world.tick
      const lifetimeTicks = Math.ceil(PING_LIFETIME_S * TICK_RATE)
      while (slot.pingExpiryTicks.length > 0 && slot.pingExpiryTicks[0]! <= currentTick) {
        slot.pingExpiryTicks.shift()
      }
      if (slot.pingExpiryTicks.length >= PING_MAX_ACTIVE) return

      // Enemy ping validation: target must be a valid alive enemy
      let resolvedType = d.type as PlayerPingEvent['type']
      let targetEid: number | undefined
      if (d.type === 'enemy' && d.targetEid !== undefined) {
        const eid = Math.trunc(d.targetEid)
        // Entity ID 0 is the bitECS sentinel — never a valid target
        if (eid > 0 && hasComponent(this.world, Enemy, eid) && !hasComponent(this.world, Dead, eid)) {
          targetEid = eid
        } else {
          // Invalid enemy target — degrade to location ping at the given coords
          resolvedType = 'location'
        }
      }

      slot.lastPingMs = now
      slot.pingExpiryTicks.push(currentTick + lifetimeTicks)

      const event: PlayerPingEvent = {
        type: resolvedType,
        worldX: Math.max(-WORLD_COORD_MAX, Math.min(WORLD_COORD_MAX, d.worldX)),
        worldY: Math.max(-WORLD_COORD_MAX, Math.min(WORLD_COORD_MAX, d.worldY)),
        senderEid: slot.eid,
        tick: currentTick,
        ...(targetEid !== undefined ? { targetEid } : {}),
      }

      this.broadcast('player-ping', event)
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

    this.onMessage('camp-purchase', (client, data) => {
      if (this.state.phase !== 'playing') return
      const slot = this.slots.get(client.sessionId)
      if (!slot) return
      const run = this.world.run
      if (!run || run.completed || run.transition !== 'camp') return
      if (typeof data?.offerIndex !== 'number' || !Number.isInteger(data.offerIndex) || data.offerIndex < 0) return

      tryVisitorPurchase(this.world, slot.eid, data.offerIndex)
    })

    this.onMessage('tinkerer-mod-select', (client, data) => {
      if (this.state.phase !== 'playing') return
      const slot = this.slots.get(client.sessionId)
      if (!slot) return
      const run = this.world.run
      if (!run || run.completed || run.transition !== 'camp') return
      if (typeof data?.offerIndex !== 'number' || !Number.isInteger(data.offerIndex)) return

      const success = tryTinkererModSelect(this.world, slot.eid, data.offerIndex)
      client.send('tinkerer-mod-result', { success, offerIndex: data.offerIndex })
    })

    this.onMessage('draft-pick', (client, data) => {
      if (this.state.phase !== 'playing') return
      const slot = this.slots.get(client.sessionId)
      if (!slot) return
      const run = this.world.run
      if (!run || run.completed || run.transition !== 'camp') return

      const draft = this.world.draftState
      if (!draft || draft.phase !== 'picking') return
      if (typeof data?.poolIndex !== 'number' || !Number.isInteger(data.poolIndex)
          || data.poolIndex < 0 || data.poolIndex >= draft.offers.length) return

      // Must be this player's turn
      if (getCurrentPicker(draft) !== slot.eid) return

      // Validate the pick
      const offer = draft.offers[data.poolIndex]
      if (!offer || offer.pickedBy !== -1) return

      // Apply the pick
      offer.pickedBy = slot.eid
      addItemToPlayer(this.world, slot.eid, offer.itemId, reapplyAllItemEffects)
      advanceDraft(draft)
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

    // Friendly fire toggle (lobby only, host-only)
    this.onMessage('set-friendly-fire', (client, data) => {
      if (this.state.phase !== 'lobby') return
      if (client.sessionId !== this.ownerSessionId) return
      const mode = typeof data === 'string' ? data : (data as { mode?: string })?.mode
      if (mode !== 'none' && mode !== 'reduced' && mode !== 'full') return
      this.state.friendlyFire = mode
      this.world.friendlyFireMode = mode
    })

    // Skill tree node selection (server-authoritative)
    this.onMessage('select-node', (client, data: SelectNodeRequest) => {
      if (this.state.phase !== 'playing') return
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

    // Vote-kick: start a vote (requires >= 3 players to prevent 1v1 abuse)
    this.onMessage('votekick-start', (client, data: VotekickStartMessage) => {
      const initiator = this.slots.get(client.sessionId)
      if (!initiator) return
      if (this.state.phase !== 'playing') return // Only during gameplay
      if (this.activeVote) return // One vote at a time
      if (this.slots.size < 3) return // Need at least 3 players for a fair vote
      if (!data?.targetSessionId || typeof data.targetSessionId !== 'string') return
      if (data.targetSessionId === client.sessionId) return // Can't kick yourself
      if (!this.slots.has(data.targetSessionId)) return // Target not in room

      // Cooldown check
      const lastVoteTime = this.votekickCooldowns.get(client.sessionId) ?? 0
      if (Date.now() - lastVoteTime < VOTEKICK_COOLDOWN_S * 1000) return

      const voteId = `vk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const targetMeta = this.state.players.get(data.targetSessionId)
      const initiatorMeta = this.state.players.get(client.sessionId)
      // Snapshot eligible voter count at vote-start. If players disconnect mid-vote,
      // their absent votes count as implicit "no" (eligibleCount is not reduced).
      // This prevents a small minority from forcing a kick after others leave.
      const eligibleCount = this.slots.size - 1

      this.activeVote = {
        voteId,
        targetSessionId: data.targetSessionId,
        initiatorSessionId: client.sessionId,
        votes: new Map([[client.sessionId, true]]), // Initiator auto-votes yes
        eligibleCount,
        timer: setTimeout(() => this.resolveVotekick(), VOTEKICK_DURATION_S * 1000),
      }

      this.votekickCooldowns.set(client.sessionId, Date.now())

      const voteMsg: VotekickVoteMessage = {
        voteId,
        targetSessionId: data.targetSessionId,
        targetName: targetMeta?.name ?? data.targetSessionId.slice(0, 8),
        initiatorName: initiatorMeta?.name ?? client.sessionId.slice(0, 8),
        expiresInS: VOTEKICK_DURATION_S,
      }
      this.broadcast('votekick-vote', voteMsg)
      this.logLifecycle('votekick-start', { voteId, initiator: client.sessionId, target: data.targetSessionId })
    })

    // Vote-kick: cast a vote
    this.onMessage('votekick-cast', (client, data: VotekickCastMessage) => {
      if (!this.activeVote) return
      if (!data?.voteId || data.voteId !== this.activeVote.voteId) return
      if (typeof data.approve !== 'boolean') return
      // Target cannot vote on their own kick
      if (client.sessionId === this.activeVote.targetSessionId) return
      // Only allow one vote per person
      if (this.activeVote.votes.has(client.sessionId)) return
      if (!this.slots.has(client.sessionId)) return

      this.activeVote.votes.set(client.sessionId, data.approve)

      // Check if all eligible voters have voted — resolve early
      if (this.activeVote.votes.size >= this.activeVote.eligibleCount) {
        this.resolveVotekick()
      }
    })

    this.onMessage('debug-spawn-pause', () => {
      this.world.spawnsPaused = !this.world.spawnsPaused
      if (this.world.spawnsPaused) {
        const enemies = enemyAIQuery(this.world)
        for (const eid of enemies) {
          Health.current[eid] = 0
        }
        console.log(`[GameRoom] Spawns PAUSED — killed ${enemies.length} enemies`)
      } else {
        console.log('[GameRoom] Spawns RESUMED')
      }
    })

    // Fixed-timestep simulation loop
    this.setSimulationInterval((deltaMs) => this.update(deltaMs), TICK_MS)

    // Periodic stale entity audit (safety net)
    this.clock.setInterval(() => this.auditEntities(), 60_000)

    this.logLifecycle('create', { seed })
  }

  override onJoin(client: Client, options?: JoinOptions) {
    if (this.slots.size >= MAX_PLAYERS) {
      throw new Error('Room is full')
    }
    const characterId: CharacterId = isCharacterId(options?.characterId) ? options.characterId : 'sheriff'
    const upgradeState = initUpgradeState(getCharacterDef(characterId))
    const eid = addPlayer(this.world, client.sessionId, upgradeState)

    // Add to Colyseus Schema (for lobby metadata)
    const meta = new PlayerMeta()
    const MAX_NAME_LENGTH = 24
    const rawName = String(options?.name ?? '')
      .trim()
      .replace(/[^\x20-\x7E]/g, '')
      .slice(0, MAX_NAME_LENGTH)
    meta.name = rawName || client.sessionId.slice(0, 8)
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
      lastPingMs: 0,
      pingExpiryTicks: [],
      lastActiveInputTick: this.world.tick,
      afkWarned: false,
    }
    this.slots.set(client.sessionId, slot)

    // First player to join is the room owner (host)
    if (this.ownerSessionId === '') {
      this.ownerSessionId = client.sessionId
    }

    // Send game config to the joining client
    this.sendGameConfig(client, slot)
    this.sendCurrentBullets(client)
    this.broadcastPlayerRoster()

    this.logLifecycle('join', { sessionId: client.sessionId, eid, characterId })
  }

  override async onLeave(client: Client, consented?: boolean) {
    this.logLifecycle('leave-start', { sessionId: client.sessionId, consented: !!consented })
    if (!consented) {
      this.pendingReconnects.add(client.sessionId)
      // Mark entity as disconnected so AI takes over
      const dcSlot = this.slots.get(client.sessionId)
      if (dcSlot && hasComponent(this.world, Player, dcSlot.eid)
          && !hasComponent(this.world, Dead, dcSlot.eid)
          && !hasComponent(this.world, Downed, dcSlot.eid)) {
        addComponent(this.world, Disconnected, dcSlot.eid)
      }
      try {
        const reconnectedClient = await this.allowReconnection(client, 30)
        this.pendingReconnects.delete(client.sessionId)
        this.logLifecycle('reconnect-success', { sessionId: client.sessionId })

        // Remove disconnected AI tag — player resumes full control
        const slot = this.slots.get(client.sessionId)
        if (slot && hasComponent(this.world, Disconnected, slot.eid)) {
          removeComponent(this.world, Disconnected, slot.eid)
        }

        // Send game-config to the reconnected client (new page load needs config)
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
          slot.lastProcessedSeq = 0
          slot.protocolMismatchNotified = false
          this.sendGameConfig(reconnectedClient, slot)
          this.sendCurrentBullets(reconnectedClient)

          // Send immediate snapshot so client doesn't wait for next 20Hz broadcast
          this.playerSeqs.clear()
          for (const [, s] of this.slots) {
            this.playerSeqs.set(s.eid, s.lastProcessedSeq)
          }
          const snapshot = encodeSnapshot(this.world, performance.now(), this.playerSeqs)
          reconnectedClient.sendBytes('snapshot', snapshot)

          // Send HUD and interactables immediately
          this.sendHudToClient(slot)
          this.sendInteractablesToClient(reconnectedClient)
        }
        return // Slot preserved
      } catch {
        this.pendingReconnects.delete(client.sessionId)
        this.logLifecycle('reconnect-timeout', { sessionId: client.sessionId })
        // Timed out — fall through to cleanup
      }
    }

    const leavingSlot = this.slots.get(client.sessionId)
    if (leavingSlot) {
      // Sweep owned bullets so they don't linger as ghosts
      for (const [eid, bulletId] of this.bulletNetIdByEid) {
        if (Bullet.ownerId[eid] === leavingSlot.eid) {
          removeEntity(this.world, eid)
          // broadcastBulletEvents() will detect removal and send despawn next tick
        }
      }
      this.rewindClampedByPlayer.delete(leavingSlot.eid)
    }
    removePlayer(this.world, client.sessionId)
    this.state.players.delete(client.sessionId)
    this.slots.delete(client.sessionId)
    this.campReadySessions.delete(client.sessionId)

    // Cancel active vote if the target leaves
    if (this.activeVote && this.activeVote.targetSessionId === client.sessionId) {
      clearTimeout(this.activeVote.timer)
      this.broadcast('votekick-result', {
        voteId: this.activeVote.voteId,
        targetSessionId: this.activeVote.targetSessionId,
        passed: false,
      } satisfies VotekickResultMessage)
      this.logLifecycle('votekick-cancelled', { voteId: this.activeVote.voteId, reason: 'target left' })
      this.activeVote = null
    }

    this.maybeCompleteCamp()
    this.broadcastPlayerRoster()

    this.logLifecycle('leave-complete', { sessionId: client.sessionId })

    // Auto-dispose empty rooms when all players have permanently left
    if (this.slots.size === 0 && this.pendingReconnects.size === 0) {
      this.logLifecycle('auto-dispose', { reason: 'all players gone' })
      this.disconnect()
    }
  }

  override onDispose() {
    this.logLifecycle('dispose')
    this.slots.clear()
    this.pendingReconnects.clear()
    this.rewindHistory.clear()
    this.world.lagComp.shotTickByPlayer.clear()
    this.world.lagComp.bulletShotTick.clear()
    this.world.lagComp.bulletSpawnTick.clear()
    this.world.lagComp.bulletSweepStart.clear()
    this.getPendingShotResults().length = 0
    this.rewindTickSamples.length = 0
    this.rewindLatencyMsAccum = 0
    this.rewindInterpMsAccum = 0
    this.rewindQueueDelayMsAccum = 0
    this.rewindEffectiveAgeMsAccum = 0
    this.bulletNetIdByEid.clear()
    this.nextBulletNetId = 1
    this.campReadySessions.clear()
    if (this.activeVote) {
      clearTimeout(this.activeVote.timer)
      this.activeVote = null
    }
  }

  private getPendingShotResults() {
    return this.world.pendingShotResults
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
      weaponMods: us.weaponMods.size > 0 ? Array.from(us.weaponMods) : undefined,
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

  private buildBulletSpawnMessage(eid: number, bulletId: number): BulletSpawnMessage {
    const shotTick = this.world.lagComp.bulletShotTick.get(eid)
    const base: BulletSpawnMessage = {
      bulletId,
      tick: this.world.tick,
      serverTime: performance.now(),
      ownerServerEid: Bullet.ownerId[eid]!,
      x: Position.x[eid]!,
      y: Position.y[eid]!,
      vx: Velocity.x[eid]!,
      vy: Velocity.y[eid]!,
      layer: Collider.layer[eid]!,
    }
    return shotTick !== undefined
      ? { ...base, shotTick }
      : base
  }

  private sendCurrentBullets(client: Client): void {
    if (this.state.phase !== 'playing') return
    for (const [eid, bulletId] of this.bulletNetIdByEid) {
      if (!hasComponent(this.world, Bullet, eid)) continue
      client.send('bullet-spawn', this.buildBulletSpawnMessage(eid, bulletId))
    }
  }

  private sendShotResults(): void {
    const pending = this.getPendingShotResults()
    if (pending.length <= 0) return

    for (const result of pending) {
      let slot: PlayerSlot | undefined
      for (const candidate of this.slots.values()) {
        if (candidate.eid === result.shooterEid) {
          slot = candidate
          break
        }
      }
      if (!slot) continue

      const msg: ShotResultMessage = {
        shooterServerEid: result.shooterEid,
        shootSeq: result.shootSeq,
        tick: result.tick,
        hit: result.hit,
        hitX: result.hitX,
        hitY: result.hitY,
        rewindTicks: result.rewindTicks,
        rewindClamped: this.rewindClampedByPlayer.get(result.shooterEid) ?? result.rewindClamped,
        serverFrameTimeMs: this.lastTickDurationMs,
      }
      if (result.hit && result.targetEid !== NO_TARGET) {
        msg.targetServerEid = result.targetEid
      }
      if (result.damageApplied > 0) {
        msg.damageApplied = result.damageApplied
      }

      if (process.env.TRACE_SHOTS) {
        console.log(JSON.stringify({
          event: 'shot',
          tick: result.tick,
          shooter: result.shooterEid,
          shootSeq: result.shootSeq,
          hit: result.hit,
          targetEid: result.targetEid,
          rewindTicks: msg.rewindTicks,
          rewindClamped: msg.rewindClamped,
        }))
      }

      // Broadcast to all clients so remote players can render visual bullets
      for (const otherSlot of this.slots.values()) {
        otherSlot.client.send('shot-result', msg)
      }
    }

    pending.length = 0
  }

  private broadcastBulletEvents(): void {
    const seen = new Set<number>()
    const bullets = bulletQuery(this.world)

    for (const eid of bullets) {
      seen.add(eid)
      let bulletId = this.bulletNetIdByEid.get(eid)
      if (bulletId === undefined) {
        bulletId = this.nextBulletNetId++
        this.bulletNetIdByEid.set(eid, bulletId)
        const spawn = this.buildBulletSpawnMessage(eid, bulletId)
        for (const slot of this.slots.values()) {
          slot.client.send('bullet-spawn', spawn)
        }
      }
    }

    for (const [eid, bulletId] of this.bulletNetIdByEid) {
      if (seen.has(eid)) continue
      const despawn: BulletDespawnMessage = {
        bulletId,
        tick: this.world.tick,
      }
      for (const slot of this.slots.values()) {
        slot.client.send('bullet-despawn', despawn)
      }
      this.bulletNetIdByEid.delete(eid)
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

    // Lock Quick Play rooms BEFORE phase transition so the matcher sees it immediately
    if (this.isQuickPlay) {
      this.lock()
    }
    this.state.phase = 'playing'
    startRun(this.world, DEFAULT_RUN_STAGES)
    this.bulletNetIdByEid.clear()
    this.nextBulletNetId = 1
    this.campReadySessions.clear()
    this.wasCampTransition = false
    this.runCompleteSent = false
    this.runStartedAtMs = Date.now()
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
      if (isCamp) {
        // Start auto-advance timer on camp entry
        this.campTimerRemaining = CAMP_AUTO_ADVANCE_SECONDS
        this.campStatusBroadcastAccum = 0
        this.campAutoAdvanced = false
        this.broadcastCampStatus()
      } else {
        // Transitioning back to combat — reset AFK timers so idle time during
        // camp doesn't count toward the AFK kick threshold.
        for (const slot of this.slots.values()) {
          slot.lastActiveInputTick = this.world.tick
          slot.afkWarned = false
        }
      }
    }
  }

  /** Tick the camp auto-advance timer and broadcast status at ~1Hz. */
  private tickCampTimer(): void {
    if (!this.wasCampTransition || this.campAutoAdvanced) return

    const dtS = TICK_MS / 1000

    // Tick draft-pick timer (auto-pick on timeout)
    const draft = this.world.draftState
    if (draft && draft.phase === 'picking') {
      draft.pickTimer -= dtS
      if (draft.pickTimer <= 0) {
        const pickerEid = getCurrentPicker(draft)
        const bestIndex = autoPickBestItem(draft)
        // Verify the picker's slot still exists (may have disconnected during pick window)
        const pickerSlotExists = pickerEid >= 0 &&
          [...this.slots.values()].some(s => s.eid === pickerEid)
        if (bestIndex >= 0 && pickerEid >= 0 && pickerSlotExists) {
          const offer = draft.offers[bestIndex]!
          offer.pickedBy = pickerEid
          addItemToPlayer(this.world, pickerEid, offer.itemId, reapplyAllItemEffects)
          advanceDraft(draft)
        } else if (pickerEid >= 0 && !pickerSlotExists) {
          // Picker disconnected — skip their turn and advance
          advanceDraft(draft)
        } else {
          // No items left — force completion
          draft.phase = 'complete'
        }
      }
    }

    this.campTimerRemaining -= dtS
    this.campStatusBroadcastAccum += dtS

    // Auto-advance when timer expires (fire once)
    if (this.campTimerRemaining <= 0) {
      this.campTimerRemaining = 0
      this.campAutoAdvanced = true
      this.world.campComplete = true
      this.broadcastCampStatus()
      return
    }

    // Broadcast camp status at ~1Hz (preserve overshoot for accuracy)
    if (this.campStatusBroadcastAccum >= 1) {
      this.campStatusBroadcastAccum -= 1
      this.broadcastCampStatus()
    }
  }

  private broadcastCampStatus(): void {
    const msg: CampStatusMessage = {
      readyCount: this.campReadySessions.size,
      totalPlayers: this.slots.size,
      remainingSeconds: Math.max(0, Math.ceil(this.campTimerRemaining)),
    }
    this.broadcast('camp-status', msg)
  }

  private maybeCompleteCamp(): void {
    if (this.state.phase !== 'playing') return
    const run = this.world.run
    if (!run || run.completed || run.transition !== 'camp') return

    // Prune stale ready entries for disconnected players.
    // (Deleting from a Set during for..of iteration is safe in JS — skipped entries.)
    for (const sessionId of this.campReadySessions) {
      if (!this.slots.has(sessionId)) {
        this.campReadySessions.delete(sessionId)
      }
    }

    // Broadcast updated ready status immediately on change
    this.broadcastCampStatus()

    if (this.slots.size === 0) return
    if (this.campReadySessions.size < this.slots.size) return
    this.world.campComplete = true
  }


  private update(deltaMs: number) {
    if (this.state.phase !== 'playing') return

    this.accumulator += deltaMs
    let ticks = 0

    while (this.accumulator >= TICK_MS && ticks < MAX_CATCHUP_TICKS) {
      try {
        this.serverTick()
        this.consecutiveTickErrors = 0
      } catch (err) {
        this.consecutiveTickErrors++
        this.logLifecycle('tick-error', { consecutiveErrors: this.consecutiveTickErrors, error: String(err) })
        console.error(`[GameRoom] ${this.roomId} tick error (${this.consecutiveTickErrors}):`, err)
        if (this.consecutiveTickErrors > 10) {
          this.logLifecycle('tick-error-dispose', { reason: 'too many consecutive tick errors' })
          this.disconnect()
          return
        }
      }
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
    queueDepth: number,
  ): {
      tick: number
      latencyMs: number
      interpMs: number
      queueDelayMs: number
      effectiveAgeMs: number
    } | null {
    if (input.estimatedServerTimeMs <= 0) return null
    const oneWayLatencyMs = Math.max(0, nowMs - input.estimatedServerTimeMs)
    const interpMs = Math.max(0, Math.min(REWIND_MAX_VIEW_INTERP_DELAY_MS, input.viewInterpDelayMs))
    const queueDelayMs = Math.max(0, Math.min(REWIND_MAX_QUEUE_DELAY_MS, queueDepth * TICK_MS))
    // Do not include render interpolation delay in rewind age:
    // the client's view delay is not command transit latency.
    // Also do not add queueDelayMs into effective age: it is already reflected in
    // now - estimatedServerTimeMs when a sample waits in the server input queue.
    const effectiveAgeMs = oneWayLatencyMs
    if (!Number.isFinite(effectiveAgeMs)) return null
    const ageTicks = Math.max(0, Math.round(effectiveAgeMs / TICK_MS))
    return {
      tick: this.world.tick - ageTicks,
      latencyMs: oneWayLatencyMs,
      interpMs,
      queueDelayMs,
      effectiveAgeMs,
    }
  }

  private applyLagCompShotTick(
    slot: PlayerSlot,
    input: NetworkInput,
    hadFreshInput: boolean,
    nowMs: number,
    queueDepth: number,
  ): void {
    if (hadFreshInput) {
      slot.tickMapper.updateOffset(this.world.tick, input.clientTick)
    }

    if ((input.buttons & Button.SHOOT) === 0) return
    if (!hadFreshInput) {
      this.rewindHeldInputShotsSkipped++
      return
    }
    const isNewShootCommand = input.shootSeq > slot.lastShootSeq
    if (isNewShootCommand) {
      slot.lastShootSeq = input.shootSeq
    }

    const timeEstimated = this.estimateShotTickFromInputTime(nowMs, input, queueDepth)
    const estimatedTick = timeEstimated?.tick ?? slot.tickMapper.estimateServerTick(input.clientTick)
    if (timeEstimated !== null) {
      if (isNewShootCommand) {
        this.rewindTimeBasedSamples++
        this.rewindLatencyMsAccum += timeEstimated.latencyMs
        this.rewindInterpMsAccum += timeEstimated.interpMs
        this.rewindQueueDelayMsAccum += timeEstimated.queueDelayMs
        this.rewindEffectiveAgeMsAccum += timeEstimated.effectiveAgeMs
      }
    } else {
      if (isNewShootCommand) {
        this.rewindMapperFallbackSamples++
      }
    }
    const rewind = slot.tickMapper.clampRewindTick(this.world.tick, estimatedTick, REWIND_MAX_TICKS)
    this.world.lagComp.shotTickByPlayer.set(slot.eid, rewind.tick)
    this.rewindClampedByPlayer.set(slot.eid, rewind.clamped)
    if (isNewShootCommand) {
      this.rewindShotsTotal++
      const rewindTicks = this.world.tick - rewind.tick
      this.rewindTicksAccum += rewindTicks
      this.rewindTickSamples.push(rewindTicks)

      if (rewind.clamped) {
        this.rewindShotsClamped++
      }
      if (!this.rewindHistory.hasTick(rewind.tick)) {
        this.rewindHistoryMisses++
      }
    }
  }

  private serverTick() {
    const tickStartMs = performance.now()
    this.rewindHistory.record(this.world)
    this.world.lagComp.shotTickByPlayer.clear()
    this.syncCampTransitionState()

    // Update active player count for co-op scaling (before systems run).
    // Count connected players only (exclude disconnected/AI-driven slots) so
    // difficulty doesn't stay inflated while a player is absent. Dead-but-connected
    // players still count — they're in the run, just not alive.
    let connectedCount = 0
    for (const [sid] of this.slots) {
      if (!this.pendingReconnects.has(sid)) connectedCount++
    }
    this.world.activePlayerCount = Math.max(1, connectedCount)

    // 1. Pop one input per player into world.playerInputs (neutral if empty).
    //    Trim backlog aggressively: if queue depth exceeds threshold, discard
    //    oldest samples to cut latency while preserving transient actions.
    for (const [, slot] of this.slots) {
      if (slot.inputQueue.length > INPUT_QUEUE_TRIM_THRESHOLD) {
        const trimTo = Math.max(1, Math.min(INPUT_QUEUE_TRIM_TO, INPUT_QUEUE_TRIM_THRESHOLD))
        const dropCount = Math.max(0, slot.inputQueue.length - trimTo)
        if (dropCount > 0) {
          slot.client.send('input-warning', { dropped: dropCount, queueDepth: slot.inputQueue.length })
          const dropped = slot.inputQueue.splice(0, dropCount)
          const next = slot.inputQueue[0]
          if (next) {
            const carriedShoot = selectLatestDroppedShootInput(dropped, slot.lastShootSeq)
            let merged: NetworkInput = {
              ...next,
              buttons: mergeTransientButtons(dropped, next.buttons),
            }
            if (carriedShoot && carriedShoot.shootSeq > merged.shootSeq) {
              merged = {
                ...merged,
                shootSeq: carriedShoot.shootSeq,
                clientTick: carriedShoot.clientTick,
                clientTimeMs: carriedShoot.clientTimeMs,
                estimatedServerTimeMs: carriedShoot.estimatedServerTimeMs,
                viewInterpDelayMs: carriedShoot.viewInterpDelayMs,
                // Preserve shot-time aim metadata when we carry a dropped shoot edge.
                aimAngle: carriedShoot.aimAngle,
                cursorWorldX: carriedShoot.cursorWorldX,
                cursorWorldY: carriedShoot.cursorWorldY,
              }
            }
            slot.inputQueue[0] = merged
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

      this.applyLagCompShotTick(slot, input, hadFreshInput, tickStartMs, slot.inputQueue.length)
      this.world.playerInputs.set(slot.eid, input)
    }

    this.maybeCompleteCamp()

    // 2. Step simulation — DO NOT pass input param (that's the single-player bridge)
    stepWorld(this.world, this.systems)
    this.sendShotResults()
    this.syncCampTransitionState()
    this.tickCampTimer()
    this.maybeBroadcastRunComplete()
    this.broadcastBulletEvents()

    // 3. Update Schema tick
    this.state.serverTick = this.world.tick

    // 4. Broadcast snapshot every SNAPSHOT_INTERVAL ticks (20Hz)
    if (this.world.tick % SNAPSHOT_INTERVAL === 0) {
      this.broadcastSnapshot()
    }

    // 5. Send per-client HUD data at 10Hz (every 6 ticks)
    if (this.world.tick % 6 === 0) {
      this.sendHudUpdates()
      this.sendInteractablesUpdates()
    }

    // 6. AFK detection — only during active combat (not camp/looting/completed)
    this.checkAfk()

    // Tick duration tracking
    this.lastTickDurationMs = performance.now() - tickStartMs
    this.tickTimingSamples.push(this.lastTickDurationMs)

    // State hash broadcast at ~1Hz (every 60 ticks), gated on DESYNC_CHECK
    if (process.env.DESYNC_CHECK && this.world.tick % 60 === 0) {
      const hash = computeQuickHash(this.world)
      for (const slot of this.slots.values()) {
        slot.client.send('state-hash', { tick: this.world.tick, hash })
      }
    }

    this.maybeLogRateLimitDrops()
    this.maybeLogRewindStats()
    this.maybeLogRoomMetrics()
  }

  private resolveVotekick(): void {
    const vote = this.activeVote
    if (!vote) return
    clearTimeout(vote.timer)
    this.activeVote = null

    let yesCount = 0
    let noCount = 0
    for (const approved of vote.votes.values()) {
      if (approved) yesCount++
      else noCount++
    }

    // Majority of non-target players must approve (use snapshot from vote-start)
    const passed = yesCount > vote.eligibleCount / 2

    const result: VotekickResultMessage = {
      voteId: vote.voteId,
      targetSessionId: vote.targetSessionId,
      passed,
    }
    this.broadcast('votekick-result', result)

    this.logLifecycle('votekick-result', {
      voteId: vote.voteId,
      target: vote.targetSessionId,
      passed,
      yes: yesCount,
      no: noCount,
      eligible: vote.eligibleCount,
    })

    if (passed) {
      this.kickedSessionIds.add(vote.targetSessionId)
      const targetSlot = this.slots.get(vote.targetSessionId)
      if (targetSlot) {
        targetSlot.client.send('afk-kick', { reason: 'You have been vote-kicked' })
        targetSlot.client.leave(4101) // Custom close code for vote-kick
      }
    }
  }

  private checkAfk(): void {
    const run = this.world.run
    // Only check during active combat — skip camp, looting, completed, pre-run
    if (!run || run.completed || run.transition !== 'none') return

    const tick = this.world.tick
    for (const [sessionId, slot] of this.slots) {
      // Skip disconnected players (already handled by Disconnected component)
      if (hasComponent(this.world, Disconnected, slot.eid)) continue
      // Skip dead players
      if (hasComponent(this.world, Dead, slot.eid)) continue

      const idleTicks = tick - slot.lastActiveInputTick

      if (idleTicks >= AFK_KICK_TICKS) {
        this.logLifecycle('afk-kick', { sessionId, eid: slot.eid, idleTicks })
        slot.client.send('afk-kick', { reason: 'Kicked for being AFK' })
        slot.client.leave(4100) // Custom close code for AFK
        continue
      }

      if (idleTicks >= AFK_WARNING_TICKS && !slot.afkWarned) {
        slot.afkWarned = true
        const secondsLeft = Math.ceil((AFK_KICK_TICKS - idleTicks) / TICK_RATE)
        slot.client.send('afk-warning', { secondsLeft })
      }
    }
  }

  /**
   * Detect end-of-run (victory or TPK) and broadcast stats once.
   */
  private maybeBroadcastRunComplete(): void {
    if (this.runCompleteSent) return
    if (this.state.phase !== 'playing') return

    const run = this.world.run
    if (!run) return

    // Victory: run.completed is set by stageProgression when final stage cleared
    const victory = run.completed

    // Defeat: all players are Dead or Disconnected (disconnected players count as
    // dead for TPK — they can't be revived and shouldn't hold the room open)
    let allDead = false
    if (!victory && this.slots.size > 0) {
      allDead = true
      for (const slot of this.slots.values()) {
        // Disconnected players are treated as dead for TPK purposes
        if (hasComponent(this.world, Disconnected, slot.eid)) continue
        if (!hasComponent(this.world, Dead, slot.eid)) {
          allDead = false
          break
        }
      }
    }

    if (!victory && !allDead) return

    this.runCompleteSent = true

    const duration = Math.max(0, (Date.now() - this.runStartedAtMs) / 1000)
    const stagesCleared = victory ? run.totalStages : run.currentStage

    const playerStats: PlayerStatEntry[] = []
    for (const [sessionId, slot] of this.slots) {
      const meta = this.state.players.get(sessionId)
      const stats = getOrCreatePlayerStats(this.world.playerStats, slot.eid)
      // Strip internal _currentStreak field
      const { _currentStreak: _, ...publicStats } = stats
      playerStats.push({
        sessionId,
        characterId: slot.characterId,
        name: meta?.name ?? 'Unknown',
        stats: publicStats,
      })
    }

    const msg: RunCompleteMessage = {
      victory,
      duration,
      stagesCleared,
      totalStages: run.totalStages,
      playerStats,
    }
    this.broadcast('run-complete', msg)

    this.logLifecycle('run-complete', {
      victory,
      duration: Math.round(duration),
      stagesCleared,
      playerCount: playerStats.length,
    })
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
    const avgQueueDelayMs = this.rewindTimeBasedSamples > 0
      ? this.rewindQueueDelayMsAccum / this.rewindTimeBasedSamples
      : 0
    const avgEffectiveAgeMs = this.rewindTimeBasedSamples > 0
      ? this.rewindEffectiveAgeMsAccum / this.rewindTimeBasedSamples
      : 0

    console.log(
      `[GameRoom][rewind] shots=${this.rewindShotsTotal} clamped=${this.rewindShotsClamped} historyMiss=${this.rewindHistoryMisses} avgTicks=${avgRewindTicks.toFixed(2)} p50Ticks=${p50.toFixed(2)} p95Ticks=${p95.toFixed(2)} timeBased=${this.rewindTimeBasedSamples} mapperFallback=${this.rewindMapperFallbackSamples} heldSkip=${this.rewindHeldInputShotsSkipped} avgLatencyMs=${avgLatencyMs.toFixed(1)} avgInterpMs=${avgInterpMs.toFixed(1)} avgQueueDelayMs=${avgQueueDelayMs.toFixed(1)} avgEffectiveAgeMs=${avgEffectiveAgeMs.toFixed(1)}`,
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
    this.rewindQueueDelayMsAccum = 0
    this.rewindEffectiveAgeMsAccum = 0
  }

  private maybeLogRoomMetrics(): void {
    const METRICS_INTERVAL_TICKS = 600 // 10s at 60Hz
    if (this.world.tick - this.metricsLogTick < METRICS_INTERVAL_TICKS) return
    this.metricsLogTick = this.world.tick
    if (this.tickTimingSamples.length === 0) return

    const sorted = [...this.tickTimingSamples].sort((a, b) => a - b)
    const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length
    const p95Idx = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * 0.95)))
    const p95 = sorted[p95Idx]!
    const overbudget = sorted.filter(v => v > TICK_MS).length
    const overbudgetRate = overbudget / sorted.length
    const effectiveTickRate = sorted.length / (METRICS_INTERVAL_TICKS / TICK_RATE)

    console.log(
      JSON.stringify({
        event: 'room-metrics',
        tick: this.world.tick,
        players: this.slots.size,
        avgTickMs: +avg.toFixed(2),
        p95TickMs: +p95.toFixed(2),
        overbudgetRate: +overbudgetRate.toFixed(3),
        effectiveTickRate: +effectiveTickRate.toFixed(2),
        samples: sorted.length,
      }),
    )

    if (overbudgetRate > 0.05) {
      console.warn(`[GameRoom][alert] overbudget rate ${(overbudgetRate * 100).toFixed(1)}% > 5%`)
    }
    if (effectiveTickRate * TICK_RATE < 55) {
      console.warn(`[GameRoom][alert] effective tick rate ${(effectiveTickRate * TICK_RATE).toFixed(1)} < 55Hz`)
    }

    this.tickTimingSamples.length = 0
  }

  /** Build the full HUD payload for a single player slot. */
  private buildHudForSlot(slot: PlayerSlot): HudData {
    const eid = slot.eid
    const state = getUpgradeStateForPlayer(this.world, eid)
    const enc = this.world.encounter
    const run = this.world.run

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

    // Build items array from player's inventory
    const items: HudData['items'] = []
    for (const [itemId, stacks] of state.items) {
      const def = getItemDef(itemId)
      if (def) {
        items.push({ itemId, key: def.key, name: def.name, description: def.description, rarity: def.rarity, stacks, downside: def.downside })
      }
    }

    const feedbackDesc = this.world.interactionFeedbackByPlayer.get(eid)?.description ?? ''

    // Camp visitor data (per-player mod offers)
    const cv = this.world.campVisitor
    const campVisitorHud: HudData['campVisitor'] = cv
      ? (() => {
          const vDef = getVisitorDef(cv.visitorId)
          return {
            visitorId: cv.visitorId,
            visitorName: vDef?.name ?? 'Visitor',
            greeting: cv.greeting,
            offers: cv.offers.map(o => {
              const oDef = getItemDef(o.itemId)
              return {
                itemId: o.itemId,
                itemName: oDef?.name ?? '???',
                itemDescription: oDef?.description ?? '',
                rarity: oDef?.rarity ?? 'brass',
                price: o.price,
                sold: o.sold,
                downside: oDef?.downside,
              }
            }),
            modOffers: (cv.modOffersByPlayer.get(eid) ?? cv.modOffers).map(mo => {
              const mDef = getWeaponModDef(mo.modId)
              return {
                modId: mo.modId,
                modName: mDef?.name ?? '???',
                modDescription: mDef?.description ?? '',
                taken: mo.taken,
                flavor: mDef?.flavor,
              }
            }),
          }
        })()
      : null

    // Objective data
    const obj = this.world.objective
    let objectiveHud: HudData['objective'] = null
    if (obj) {
      const baseObj = {
        type: obj.type,
        description: obj.description,
        status: obj.status,
        progress: obj.type === 'protect'
          ? (obj.targetEids.length > 0
              ? Health.current[obj.targetEids[0]!]! / (Health.max[obj.targetEids[0]!]! || 1)
              : 1)
          : obj.type === 'duel'
            ? (obj.duelistEid && Health.max[obj.duelistEid]! > 0
                ? Health.current[obj.duelistEid]! / Health.max[obj.duelistEid]!
                : 0)
            : obj.escapedCount / (obj.escapeThreshold || 1),
      }
      objectiveHud = obj.type === 'duel'
        ? { ...baseObj, forfeitTimer: obj.forfeitTimer }
        : baseObj
    }

    // Boss HP bar — aggregate across all boss entities
    let bossHud: HudData['boss'] = null
    const bosses = bossQuery(this.world)
    if (bosses.length > 0) {
      let totalHP = 0, totalMaxHP = 0, bossName = 'BOSS', anyAlive = false
      for (const beid of bosses) {
        totalMaxHP += Health.max[beid]!
        const hp = Health.current[beid]!
        if (hp > 0) { anyAlive = true; totalHP += hp }
        bossName = getBoss(Enemy.type[beid]!)?.displayName ?? bossName
      }
      if (anyAlive) {
        bossHud = { name: bossName, hp: totalHP, maxHP: totalMaxHP }
      }
    }

    // Draft-pick state
    const ds = this.world.draftState
    let draftHud: HudData['draft'] = null
    if (ds) {
      const draftPlayerNames: Record<number, string> = {}
      for (const [sid, s] of this.slots) {
        const meta = this.state.players.get(sid)
        draftPlayerNames[s.eid] = meta?.name ?? sid.slice(0, 8)
      }
      draftHud = {
        phase: ds.phase,
        offers: ds.offers.map(o => ({
          itemId: o.itemId,
          name: o.name,
          description: o.description,
          rarity: o.rarity,
          poolIndex: o.poolIndex,
          pickedBy: o.pickedBy,
          downside: o.downside,
        })),
        currentPickerEid: ds.pickOrder[ds.currentPickIndex] ?? -1,
        pickTimer: ds.pickTimer,
        picksCompleted: ds.picksCompleted,
        totalPicks: ds.totalPicks,
        pickOrder: ds.pickOrder,
        playerNames: draftPlayerNames,
      }
    }

    const stageNumber = run ? run.currentStage + 1 : 0
    const stageStatus: HudData['stageStatus'] = run
      ? (run.completed ? 'completed' : run.transition === 'camp' ? 'camp' : run.transition === 'looting' ? 'looting' : run.transition !== 'none' ? 'clearing' : 'active')
      : 'none'
    const narrativeThreadId = this.world.narrative?.threadId ?? null

    return {
      characterId: slot.characterId,
      hp: Health.current[eid]!,
      maxHp: Health.max[eid]!,
      hpPotions: state.hpPotionCount,
      hpPotionsMax: HP_POTION_MAX_STACK,
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
      goldCollected: this.world.goldCollected,
      killCount: this.world.killCount,
      shovelCount: this.world.shovelCount,
      interactionPrompt: this.world.interactionPromptByPlayer.get(eid) ?? null,
      interactionFeedbackDescription: feedbackDesc,
      pendingPoints: state.pendingPoints,
      xpForCurrentLevel: xpForCurrent,
      xpForNextLevel: xpForNext,
      waveNumber: enc ? enc.currentWave + 1 : 0,
      totalWaves: enc ? enc.definition.waves.length : 0,
      waveStatus: enc
        ? (enc.completed ? 'completed' : enc.waveActive ? 'active' : 'delay')
        : 'none',
      stageNumber,
      totalStages: run ? run.totalStages : 0,
      stageStatus,
      narrativeThreadId,
      narrativeThreadName: narrativeThreadId ? (getThread(narrativeThreadId)?.name ?? null) : null,
      campNarrativeLine: this.world.campNarrativeLine,
      resolutionText: this.world.resolutionText,
      runIntroTitle: this.world.runIntroTitle,
      runIntroText: this.world.runIntroText,
      runIntroSequence: this.world.runIntroSequence,
      items,
      hasFoolsErrand: (state.items.get(FOOLS_ERRAND_ID) ?? 0) > 0,
      objective: objectiveHud,
      campVisitor: campVisitorHud,
      draft: draftHud,
      boss: bossHud,
    }
  }

  private sendHudUpdates() {
    for (const [, slot] of this.slots) {
      slot.client.send('hud', this.buildHudForSlot(slot))
    }
  }

  private sendInteractablesUpdates() {
    const salesman = this.world.salesman
    const payload: InteractablesData = {
      salesman: salesman
        ? {
            x: salesman.x,
            y: salesman.y,
            stageIndex: salesman.stageIndex,
            camp: salesman.camp,
            active: salesman.active,
            shovelPrice: getShovelPrice(salesman.stageIndex),
          }
        : null,
      stashes: this.world.stashes.map((stash) => ({
        id: stash.id,
        x: stash.x,
        y: stash.y,
        stageIndex: stash.stageIndex,
        opened: stash.opened,
      })),
      itemPickups: this.world.itemPickups
        .filter(p => !p.collected)
        .map(p => {
          const def = getItemDef(p.itemId)
          return {
            id: p.id,
            itemId: p.itemId,
            x: p.x,
            y: p.y,
            rarity: def?.rarity ?? 'brass',
          }
        }),
      hpPotionPickups: this.world.hpPotionPickups
        .filter(p => !p.collected)
        .map(p => ({
          id: p.id,
          x: p.x,
          y: p.y,
        })),
      horse: this.world.horse?.active ? { x: this.world.horse.x, y: this.world.horse.y } : null,
    }

    for (const [, slot] of this.slots) {
      slot.client.send('interactables', payload)
    }
  }

  /** Periodic safety net — detect entities that have no matching slot. */
  private auditEntities(): void {
    if (this.state.phase !== 'playing') return

    // Check Schema players
    for (const [sessionId] of this.state.players) {
      if (!this.slots.has(sessionId) && !this.pendingReconnects.has(sessionId)) {
        this.logLifecycle('audit-orphan-schema', { sessionId })
        this.state.players.delete(sessionId)
      }
    }
  }

  /** Broadcast a shutdown warning to all clients. */
  broadcastShutdown(reason: string, countdownMs: number): void {
    this.broadcast('server-shutdown', { reason, countdownMs })
    this.logLifecycle('shutdown-broadcast', { reason, countdownMs })
    this.clock.setTimeout(() => this.disconnect(), countdownMs)
  }

  /** Send HUD to a single client (used on reconnect). */
  private sendHudToClient(slot: PlayerSlot): void {
    slot.client.send('hud', this.buildHudForSlot(slot))
  }

  /** Send interactables to a single client (used on reconnect). */
  private sendInteractablesToClient(client: Client): void {
    const salesman = this.world.salesman
    const payload: InteractablesData = {
      salesman: salesman
        ? {
            x: salesman.x,
            y: salesman.y,
            stageIndex: salesman.stageIndex,
            camp: salesman.camp,
            active: salesman.active,
            shovelPrice: getShovelPrice(salesman.stageIndex),
          }
        : null,
      stashes: this.world.stashes.map((stash) => ({
        id: stash.id,
        x: stash.x,
        y: stash.y,
        stageIndex: stash.stageIndex,
        opened: stash.opened,
      })),
      itemPickups: this.world.itemPickups
        .filter(p => !p.collected)
        .map(p => {
          const def = getItemDef(p.itemId)
          return {
            id: p.id,
            itemId: p.itemId,
            x: p.x,
            y: p.y,
            rarity: def?.rarity ?? 'brass',
          }
        }),
      hpPotionPickups: this.world.hpPotionPickups
        .filter(p => !p.collected)
        .map(p => ({
          id: p.id,
          x: p.x,
          y: p.y,
        })),
      horse: this.world.horse?.active ? { x: this.world.horse.x, y: this.world.horse.y } : null,
    }
    client.send('interactables', payload)
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
