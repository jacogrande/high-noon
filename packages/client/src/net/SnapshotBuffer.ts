/**
 * Snapshot interpolation buffer.
 *
 * Stores recent server snapshots with receive timestamps and provides
 * interpolation state for smooth rendering between 20Hz snapshot updates.
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

/** Maximum number of snapshots to retain (5 = 250ms at 20Hz, ample for adaptive 75-200ms delay) */
const MAX_BUFFER_SIZE = 5

/** Snapshot send cadence: 20Hz */
const SNAPSHOT_INTERVAL_MS = 50
/** Default interpolation delay in ms (1.5x snapshot interval) */
const DEFAULT_INTERPOLATION_DELAY = 75
/** Upper bound to keep remote presentation responsive */
const MAX_INTERPOLATION_DELAY = 200
/** Convert observed interval jitter into delay headroom */
const DELAY_JITTER_MULTIPLIER = 2
/** EWMA smoothing for interval jitter estimation */
const JITTER_SMOOTHING = 0.1
/** Decrease delay slowly to avoid oscillation */
const DELAY_DECAY = 0.1

export class SnapshotBuffer {
  private buffer: TimestampedSnapshot[] = []
  private readonly baseInterpolationDelay: number
  private dynamicInterpolationDelay: number
  private lastServerTime: number | null = null
  private intervalJitter = 0

  constructor(interpolationDelay = DEFAULT_INTERPOLATION_DELAY) {
    this.baseInterpolationDelay = interpolationDelay
    this.dynamicInterpolationDelay = interpolationDelay
  }

  push(snapshot: WorldSnapshot): void {
    const entry: TimestampedSnapshot = {
      snapshot,
      receiveTime: performance.now(),
      serverTime: snapshot.serverTime,
    }
    this.buffer.push(entry)
    this.updateAdaptiveDelay(snapshot.serverTime)

    // Evict old snapshots
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.buffer.shift()
    }
  }

  private updateAdaptiveDelay(serverTime: number): void {
    if (this.lastServerTime === null) {
      this.lastServerTime = serverTime
      return
    }

    const interval = serverTime - this.lastServerTime
    this.lastServerTime = serverTime

    // Guard against invalid or stale timestamps.
    if (!Number.isFinite(interval) || interval <= 0 || interval > 1000) return

    // Estimate irregularity in snapshot spacing.
    const deviation = Math.abs(interval - SNAPSHOT_INTERVAL_MS)
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

  /**
   * Compute interpolation state for the current render frame.
   *
   * Finds two snapshots bracketing `now - interpolationDelay` and returns
   * the pair with a clamped alpha in [0, 1].
   *
   * When `serverTimeNow` is provided (from ClockSync), brackets on
   * server-time timestamps for jitter-resilient interpolation. Otherwise
   * falls back to local receive-time timestamps.
   */
  getInterpolationState(serverTimeNow?: number): InterpolationState | null {
    if (this.buffer.length < 2) return null

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
      return {
        from: this.buffer[0]!.snapshot,
        to: this.buffer[1]!.snapshot,
        alpha: 0,
      }
    }

    // No snapshot after from — use last two
    if (fromIdx >= this.buffer.length - 1) {
      const last = this.buffer.length - 1
      return {
        from: this.buffer[last - 1]!.snapshot,
        to: this.buffer[last]!.snapshot,
        alpha: 1,
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

    return {
      from: from.snapshot,
      to: to.snapshot,
      alpha,
    }
  }

  clear(): void {
    this.buffer.length = 0
    this.dynamicInterpolationDelay = this.baseInterpolationDelay
    this.lastServerTime = null
    this.intervalJitter = 0
  }
}
