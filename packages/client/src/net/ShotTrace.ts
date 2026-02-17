/**
 * Shot tracing for netcode observability.
 *
 * Correlates client fire events with server shot-result messages to track
 * hit agreement, latency, and rewind behaviour per shot.
 */

import type { ShotResultMessage } from '@high-noon/shared'

export enum HitResult {
  HIT = 'HIT',
  MISS = 'MISS',
  NO_REG = 'NO_REG',
  TARGET_MISMATCH = 'TARGET_MISMATCH',
  REWIND_CLAMPED = 'REWIND_CLAMPED',
}

export interface ShotTrace {
  // Client-side fields (filled at fire time)
  shootSeq: number
  inputSeq: number
  clientFireTime: number
  clientSimTick: number
  aimAngle: number
  playerX: number
  playerY: number
  clientRTT: number

  // Server-side fields (filled when shot-result arrives)
  serverAckTime: number | null
  serverHitEnemyEid: number | null
  serverImpactX: number | null
  serverImpactY: number | null
  rewindTicks: number | null
  rewindClamped: boolean | null
  serverFrameTimeMs: number | null

  // Classification
  hitResult: HitResult | null
}

export interface ShotTraceSummary {
  totalTraces: number
  completedTraces: number
  hits: number
  misses: number
  noRegs: number
  targetMismatches: number
  rewindClamped: number
  latencyP50Ms: number
  latencyP95Ms: number
  noRegRate: number
  rewindClampRate: number
  avgRewindTicks: number
}

const DEFAULT_CAPACITY = 256

export class ShotTraceBuffer {
  private readonly traces: (ShotTrace | null)[]
  private readonly capacity: number
  private head = 0
  private _count = 0

  constructor(capacity = DEFAULT_CAPACITY) {
    this.capacity = capacity
    this.traces = new Array(capacity).fill(null)
  }

  open(
    shootSeq: number,
    inputSeq: number,
    fireTime: number,
    simTick: number,
    aimAngle: number,
    playerX: number,
    playerY: number,
    rtt: number,
  ): void {
    const trace: ShotTrace = {
      shootSeq,
      inputSeq,
      clientFireTime: fireTime,
      clientSimTick: simTick,
      aimAngle,
      playerX,
      playerY,
      clientRTT: rtt,
      serverAckTime: null,
      serverHitEnemyEid: null,
      serverImpactX: null,
      serverImpactY: null,
      rewindTicks: null,
      rewindClamped: null,
      serverFrameTimeMs: null,
      hitResult: null,
    }
    this.traces[this.head] = trace
    this.head = (this.head + 1) % this.capacity
    if (this._count < this.capacity) this._count++
  }

  attachServerResult(shootSeq: number, result: ShotResultMessage): ShotTrace | null {
    // Scan backwards to find matching trace
    for (let i = 0; i < this._count; i++) {
      const idx = (this.head - 1 - i + this.capacity) % this.capacity
      const trace = this.traces[idx]
      if (!trace) continue
      if (trace.shootSeq === shootSeq) {
        trace.serverAckTime = performance.now()
        trace.serverHitEnemyEid = result.targetServerEid ?? null
        trace.serverImpactX = result.hitX
        trace.serverImpactY = result.hitY
        trace.rewindTicks = result.rewindTicks ?? null
        trace.rewindClamped = result.rewindClamped ?? null
        trace.serverFrameTimeMs = result.serverFrameTimeMs ?? null
        trace.hitResult = this.classify(trace, result)
        return trace
      }
    }
    return null
  }

  getByShootSeq(seq: number): ShotTrace | null {
    for (let i = 0; i < this._count; i++) {
      const idx = (this.head - 1 - i + this.capacity) % this.capacity
      const trace = this.traces[idx]
      if (trace && trace.shootSeq === seq) return trace
    }
    return null
  }

  getCompletedTraces(last?: number): ShotTrace[] {
    const result: ShotTrace[] = []
    const limit = last ?? this._count
    for (let i = 0; i < this._count && result.length < limit; i++) {
      const idx = (this.head - 1 - i + this.capacity) % this.capacity
      const trace = this.traces[idx]
      if (trace && trace.hitResult !== null) {
        result.push(trace)
      }
    }
    return result
  }

  getSummary(): ShotTraceSummary {
    let total = 0
    let completed = 0
    let hits = 0
    let misses = 0
    let noRegs = 0
    let targetMismatches = 0
    let rewindClamped = 0
    const latencies: number[] = []
    let rewindTickSum = 0
    let rewindTickCount = 0

    for (let i = 0; i < this._count; i++) {
      const idx = (this.head - 1 - i + this.capacity) % this.capacity
      const trace = this.traces[idx]
      if (!trace) continue
      total++
      if (trace.hitResult === null) continue
      completed++

      switch (trace.hitResult) {
        case HitResult.HIT: hits++; break
        case HitResult.MISS: misses++; break
        case HitResult.NO_REG: noRegs++; break
        case HitResult.TARGET_MISMATCH: targetMismatches++; break
        case HitResult.REWIND_CLAMPED: rewindClamped++; break
      }

      if (trace.serverAckTime !== null) {
        latencies.push(trace.serverAckTime - trace.clientFireTime)
      }
      if (trace.rewindTicks !== null) {
        rewindTickSum += trace.rewindTicks
        rewindTickCount++
      }
    }

    latencies.sort((a, b) => a - b)
    const p50 = latencies.length > 0
      ? latencies[Math.max(0, Math.min(latencies.length - 1, Math.round((latencies.length - 1) * 0.5)))]!
      : 0
    const p95 = latencies.length > 0
      ? latencies[Math.max(0, Math.min(latencies.length - 1, Math.round((latencies.length - 1) * 0.95)))]!
      : 0

    return {
      totalTraces: total,
      completedTraces: completed,
      hits,
      misses,
      noRegs,
      targetMismatches,
      rewindClamped,
      latencyP50Ms: p50,
      latencyP95Ms: p95,
      noRegRate: completed > 0 ? noRegs / completed : 0,
      rewindClampRate: completed > 0 ? rewindClamped / completed : 0,
      avgRewindTicks: rewindTickCount > 0 ? rewindTickSum / rewindTickCount : 0,
    }
  }

  get count(): number {
    return this._count
  }

  /**
   * Classify a shot trace. Currently simplified — only HIT, MISS, and
   * REWIND_CLAMPED are produced. NO_REG and TARGET_MISMATCH require
   * per-bullet client prediction attachment (deferred).
   */
  private classify(_trace: ShotTrace, result: ShotResultMessage): HitResult {
    if (result.rewindClamped) return HitResult.REWIND_CLAMPED
    if (result.hit) return HitResult.HIT
    return HitResult.MISS
  }
}
