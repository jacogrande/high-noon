/**
 * Snapshot interpolation buffer.
 *
 * Stores recent server snapshots with receive timestamps and provides
 * interpolation state for smooth rendering between 20Hz snapshot updates.
 */

import type { WorldSnapshot } from '@high-noon/shared'

export interface TimestampedSnapshot {
  snapshot: WorldSnapshot
  receiveTime: number
}

export interface InterpolationState {
  from: WorldSnapshot
  to: WorldSnapshot
  alpha: number
}

/** Maximum number of snapshots to retain (5 = 250ms at 20Hz, plenty for 100ms interpolation delay) */
const MAX_BUFFER_SIZE = 10

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
   */
  getInterpolationState(): InterpolationState | null {
    if (this.buffer.length < 2) return null

    const renderTime = performance.now() - this.interpolationDelay

    // Find the bracketing pair: last entry where receiveTime <= renderTime
    let fromIdx = -1
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      if (this.buffer[i]!.receiveTime <= renderTime) {
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
    const span = to.receiveTime - from.receiveTime
    const alpha = span > 0
      ? Math.max(0, Math.min(1, (renderTime - from.receiveTime) / span))
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
