/**
 * Session replay recording for netcode diagnostics.
 *
 * Records per-tick frames with input, position, and network state. Supports
 * lag report snapshots and JSON export for offline analysis.
 */

export interface ReplayFrame {
  tick: number
  time: number
  playerX: number
  playerY: number
  aimAngle: number
  buttons: number
  rtt: number
  interpDelay: number
  correctionMag: number
  bufferDepth: number
}

export interface LagReport {
  tick: number
  time: number
  rttMs: number
  correctionMagnitude: number
  bufferDepth: number
  interpAlpha: number
  recentCorrections: number[]
}

export interface SessionReplayData {
  version: number
  seed: number
  characterId: string
  startTime: number
  endTime: number
  frames: ReplayFrame[]
  lagReports: LagReport[]
  desyncEvents: Array<{ tick: number; clientHash: number; serverHash: number }>
  metadata: Record<string, unknown>
}

const MAX_FRAMES = 18000 // 5 minutes at 60Hz
const REPLAY_VERSION = 1

export class SessionReplayRecorder {
  private recording = false
  private seed = 0
  private characterId = ''
  private startTime = 0
  private frames: ReplayFrame[] = []
  private lagReports: LagReport[] = []
  private desyncEvents: Array<{ tick: number; clientHash: number; serverHash: number }> = []

  start(seed: number, characterId: string): void {
    this.recording = true
    this.seed = seed
    this.characterId = characterId
    this.startTime = performance.now()
    this.frames = []
    this.lagReports = []
    this.desyncEvents = []
  }

  get isRecording(): boolean {
    return this.recording
  }

  recordFrame(frame: ReplayFrame): void {
    if (!this.recording) return
    if (this.frames.length >= MAX_FRAMES) return
    this.frames.push(frame)
  }

  addLagReport(report: LagReport): void {
    this.lagReports.push(report)
  }

  addDesyncEvent(tick: number, clientHash: number, serverHash: number): void {
    this.desyncEvents.push({ tick, clientHash, serverHash })
  }

  stop(metadata?: Record<string, unknown>): SessionReplayData {
    this.recording = false
    return {
      version: REPLAY_VERSION,
      seed: this.seed,
      characterId: this.characterId,
      startTime: this.startTime,
      endTime: performance.now(),
      frames: this.frames,
      lagReports: this.lagReports,
      desyncEvents: this.desyncEvents,
      metadata: metadata ?? {},
    }
  }

  /** Serialize current state to JSON without stopping the recording. */
  exportJSON(metadata?: Record<string, unknown>): string {
    const data: SessionReplayData = {
      version: REPLAY_VERSION,
      seed: this.seed,
      characterId: this.characterId,
      startTime: this.startTime,
      endTime: performance.now(),
      frames: this.frames,
      lagReports: this.lagReports,
      desyncEvents: this.desyncEvents,
      metadata: metadata ?? {},
    }
    return JSON.stringify(data, (_key, val) =>
      typeof val === 'number' ? +val.toFixed(2) : val,
    )
  }

  get frameCount(): number {
    return this.frames.length
  }
}
