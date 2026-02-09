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

/** Maximum number of snapshots to retain (5 = 250ms at 20Hz, plenty for 100ms interpolation delay) */
const MAX_BUFFER_SIZE = 5

/** Default interpolation delay in ms (2x snapshot interval for jitter resilience) */
const DEFAULT_INTERPOLATION_DELAY = 100

export class SnapshotBuffer {
  private buffer: TimestampedSnapshot[] = []
  private interpolationDelay: number

  constructor(interpolationDelay = DEFAULT_INTERPOLATION_DELAY) {
    this.interpolationDelay = interpolationDelay
  }

  push(snapshot: WorldSnapshot): void {
    const entry: TimestampedSnapshot = {
      snapshot,
      receiveTime: performance.now(),
      serverTime: snapshot.serverTime,
    }
    this.buffer.push(entry)

    // Evict old snapshots
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.buffer.shift()
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
      ? serverTimeNow - this.interpolationDelay
      : performance.now() - this.interpolationDelay

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
  }
}
