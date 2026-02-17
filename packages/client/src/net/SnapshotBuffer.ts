/**
 * Snapshot interpolation buffer.
 *
 * Stores recent server snapshots with receive timestamps and provides
 * interpolation state for smooth rendering between snapshot updates.
 */

import type { WorldSnapshot } from '@high-noon/shared'

export interface TimestampedSnapshot {
  snapshot: WorldSnapshot
  receiveTime: number   // local performance.now() — fallback
  serverTime: number    // snapshot.serverTime — used when clock sync converged
}

export interface InterpolationState {
  from: WorldSnapshot
  to: WorldSnapshot
  alpha: number
}

/** Maximum number of snapshots to retain (8 ~= 400ms at 20Hz). */
const MAX_BUFFER_SIZE = 8
/** Default interpolation delay in ms for responsive multiplayer presentation. */
const DEFAULT_INTERPOLATION_DELAY = 80
/** Upper bound to keep remote presentation responsive */
const MAX_INTERPOLATION_DELAY = 160
/** Convert observed interval jitter into delay headroom */
const DELAY_JITTER_MULTIPLIER = 2
/** EWMA smoothing for interval jitter estimation */
const JITTER_SMOOTHING = 0.1
/** EWMA smoothing for expected interval estimate */
const INTERVAL_SMOOTHING = 0.2
/** Decrease delay slowly to avoid oscillation */
const DELAY_DECAY = 0.1
/** Short extrapolation window when interpolation buffer runs dry. */
const MAX_EXTRAPOLATION_MS = 100
/** Hard cap on extrapolated alpha to avoid runaway projections. */
const MAX_EXTRAPOLATION_ALPHA = 1.25

export class SnapshotBuffer {
  private buffer: TimestampedSnapshot[] = []
  private readonly baseInterpolationDelay: number
  private dynamicInterpolationDelay: number
  private lastReceiveTime: number | null = null
  private expectedReceiveInterval: number | null = null
  private intervalJitter = 0
  private _starvationCount = 0
  private _lastAlpha = 0

  constructor(interpolationDelay = DEFAULT_INTERPOLATION_DELAY) {
    this.baseInterpolationDelay = interpolationDelay
    this.dynamicInterpolationDelay = interpolationDelay
  }

  push(snapshot: WorldSnapshot): void {
    const receiveTime = performance.now()
    const entry: TimestampedSnapshot = {
      snapshot,
      receiveTime,
      serverTime: snapshot.serverTime,
    }
    this.buffer.push(entry)
    this.updateAdaptiveDelay(receiveTime)

    // Evict old snapshots
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.buffer.shift()
    }
  }

  private updateAdaptiveDelay(receiveTime: number): void {
    if (this.lastReceiveTime === null) {
      this.lastReceiveTime = receiveTime
      return
    }

    const interval = receiveTime - this.lastReceiveTime
    this.lastReceiveTime = receiveTime

    // Guard against invalid or stale timestamps.
    if (!Number.isFinite(interval) || interval <= 0 || interval > 1000) return

    if (this.expectedReceiveInterval === null) {
      this.expectedReceiveInterval = interval
      return
    }

    const deviation = Math.abs(interval - this.expectedReceiveInterval)
    this.expectedReceiveInterval += (interval - this.expectedReceiveInterval) * INTERVAL_SMOOTHING
    this.intervalJitter += (deviation - this.intervalJitter) * JITTER_SMOOTHING

    const target = Math.max(
      this.baseInterpolationDelay,
      Math.min(
        MAX_INTERPOLATION_DELAY,
        this.baseInterpolationDelay + this.intervalJitter * DELAY_JITTER_MULTIPLIER
      )
    )

    // Increase quickly for resilience; decrease slowly for stability.
    if (target > this.dynamicInterpolationDelay) {
      this.dynamicInterpolationDelay = target
    } else {
      this.dynamicInterpolationDelay += (target - this.dynamicInterpolationDelay) * DELAY_DECAY
    }
  }

  /** The most recently received snapshot, or null if buffer is empty */
  get latest(): WorldSnapshot | null {
    return this.buffer.length > 0
      ? this.buffer[this.buffer.length - 1]!.snapshot
      : null
  }

  /** Current adaptive interpolation delay in milliseconds. */
  getInterpolationDelayMs(): number {
    return this.dynamicInterpolationDelay
  }

  /**
   * Compute interpolation state for the current render frame.
   *
   * Finds two snapshots bracketing `now - interpolationDelay` and returns
   * the pair with a bounded alpha. In rare dry-buffer cases, alpha may
   * extend slightly beyond 1 for short extrapolation.
   *
   * When `serverTimeNow` is provided (from ClockSync), brackets on
   * server-time timestamps for jitter-resilient interpolation. Otherwise
   * falls back to local receive-time timestamps.
   */
  getInterpolationState(serverTimeNow?: number): InterpolationState | null {
    if (this.buffer.length < 2) {
      this._starvationCount++
      this._lastAlpha = 0
      return null
    }

    const useServerTime = serverTimeNow !== undefined
    const renderTime = useServerTime
      ? serverTimeNow - this.dynamicInterpolationDelay
      : performance.now() - this.dynamicInterpolationDelay

    // Find the bracketing pair: last entry where timestamp <= renderTime
    let fromIdx = -1
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      const t = useServerTime ? this.buffer[i]!.serverTime : this.buffer[i]!.receiveTime
      if (t <= renderTime) {
        fromIdx = i
        break
      }
    }

    // No snapshot old enough — we're too far ahead, use oldest two
    if (fromIdx === -1) {
      this._lastAlpha = 0
      return {
        from: this.buffer[0]!.snapshot,
        to: this.buffer[1]!.snapshot,
        alpha: 0,
      }
    }

    // No snapshot after from — we're ahead of available data.
    // Use last two with short bounded extrapolation for smoother stalls.
    if (fromIdx >= this.buffer.length - 1) {
      const last = this.buffer.length - 1
      const from = this.buffer[last - 1]!
      const to = this.buffer[last]!
      const fromT = useServerTime ? from.serverTime : from.receiveTime
      const toT = useServerTime ? to.serverTime : to.receiveTime
      const span = toT - fromT
      const aheadMs = renderTime - toT
      let alpha = 1
      if (aheadMs > 0 && span > 0 && aheadMs <= MAX_EXTRAPOLATION_MS) {
        const t = Math.min(aheadMs, MAX_EXTRAPOLATION_MS)
        const decay = Math.exp(-2 * (t / MAX_EXTRAPOLATION_MS))
        const extraAlpha = (t / span) * decay
        alpha = Math.min(MAX_EXTRAPOLATION_ALPHA, 1 + extraAlpha)
      }
      this._lastAlpha = alpha
      return {
        from: from.snapshot,
        to: to.snapshot,
        alpha,
      }
    }

    const from = this.buffer[fromIdx]!
    const to = this.buffer[fromIdx + 1]!
    const fromT = useServerTime ? from.serverTime : from.receiveTime
    const toT = useServerTime ? to.serverTime : to.receiveTime
    const span = toT - fromT
    const alpha = span > 0
      ? Math.max(0, Math.min(1, (renderTime - fromT) / span))
      : 1

    this._lastAlpha = alpha
    return {
      from: from.snapshot,
      to: to.snapshot,
      alpha,
    }
  }

  /** Number of snapshots currently in the buffer. */
  getBufferDepth(): number { return this.buffer.length }

  /** Cumulative count of interpolation starvation events (buffer had < 2 snapshots). */
  getStarvationCount(): number { return this._starvationCount }

  /** The interpolation alpha from the most recent getInterpolationState() call. */
  getLastAlpha(): number { return this._lastAlpha }

  clear(): void {
    this.buffer.length = 0
    this.dynamicInterpolationDelay = this.baseInterpolationDelay
    this.lastReceiveTime = null
    this.expectedReceiveInterval = null
    this.intervalJitter = 0
  }
}
