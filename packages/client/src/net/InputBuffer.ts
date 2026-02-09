import type { NetworkInput } from '@high-noon/shared'

/**
 * Pending input buffer for client-side prediction.
 *
 * Stores recent inputs tagged with sequence numbers so they can be
 * replayed during server reconciliation. Inputs are acknowledged
 * (removed) when the server confirms processing via lastProcessedSeq.
 */
export class InputBuffer {
  private buffer: NetworkInput[] = []
  private readonly maxSize: number

  constructor(maxSize = 128) {
    this.maxSize = maxSize
  }

  /** Store an input for potential replay. Evicts oldest on overflow. */
  push(input: NetworkInput): void {
    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift()
    }
    this.buffer.push(input)
  }

  /** Remove all inputs with seq <= ackedSeq (binary search — buffer is sorted by seq) */
  acknowledgeUpTo(ackedSeq: number): void {
    const len = this.buffer.length
    if (len === 0 || this.buffer[0]!.seq > ackedSeq) return

    // Binary search for the last index where seq <= ackedSeq
    let lo = 0
    let hi = len - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1
      if (this.buffer[mid]!.seq <= ackedSeq) {
        lo = mid
      } else {
        hi = mid - 1
      }
    }
    // lo is the last index with seq <= ackedSeq; remove [0..lo]
    this.buffer.splice(0, lo + 1)
  }

  /** Get all unacknowledged inputs, ordered by seq */
  getPending(): readonly NetworkInput[] {
    return this.buffer
  }

  get length(): number {
    return this.buffer.length
  }

  clear(): void {
    this.buffer.length = 0
  }
}
