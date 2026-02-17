/**
 * Hit agreement tracker for netcode observability.
 *
 * Tracks the agreement rate between client-predicted hits and server-confirmed hits
 * over a sliding window.
 */

export enum HitOutcome {
  TRUE_HIT = 'TRUE_HIT',
  TRUE_MISS = 'TRUE_MISS',
  NO_REG = 'NO_REG',
  FALSE_MISS = 'FALSE_MISS',
  TARGET_SWAP = 'TARGET_SWAP',
}

export interface HitAgreementStats {
  trueHits: number
  trueMisses: number
  noRegs: number
  falseMisses: number
  targetSwaps: number
  total: number
}

const DEFAULT_WINDOW_SIZE = 200

export class HitAgreementTracker {
  private readonly outcomes: HitOutcome[]
  private readonly capacity: number
  private head = 0
  private _count = 0

  constructor(windowSize = DEFAULT_WINDOW_SIZE) {
    this.capacity = windowSize
    this.outcomes = new Array(windowSize)
  }

  record(clientPredictedHit: number | null, serverConfirmedHit: number | null): void {
    let outcome: HitOutcome
    if (clientPredictedHit !== null && serverConfirmedHit !== null) {
      outcome = clientPredictedHit === serverConfirmedHit
        ? HitOutcome.TRUE_HIT
        : HitOutcome.TARGET_SWAP
    } else if (clientPredictedHit === null && serverConfirmedHit === null) {
      outcome = HitOutcome.TRUE_MISS
    } else if (clientPredictedHit !== null && serverConfirmedHit === null) {
      outcome = HitOutcome.NO_REG
    } else {
      outcome = HitOutcome.FALSE_MISS
    }

    this.outcomes[this.head] = outcome
    this.head = (this.head + 1) % this.capacity
    if (this._count < this.capacity) this._count++
  }

  getStats(): HitAgreementStats {
    let trueHits = 0
    let trueMisses = 0
    let noRegs = 0
    let falseMisses = 0
    let targetSwaps = 0

    const start = this._count < this.capacity ? 0 : this.head
    for (let i = 0; i < this._count; i++) {
      const idx = (start + i) % this.capacity
      switch (this.outcomes[idx]) {
        case HitOutcome.TRUE_HIT: trueHits++; break
        case HitOutcome.TRUE_MISS: trueMisses++; break
        case HitOutcome.NO_REG: noRegs++; break
        case HitOutcome.FALSE_MISS: falseMisses++; break
        case HitOutcome.TARGET_SWAP: targetSwaps++; break
      }
    }

    return { trueHits, trueMisses, noRegs, falseMisses, targetSwaps, total: this._count }
  }

  getAgreementRate(): number {
    if (this._count === 0) return 1
    const stats = this.getStats()
    return (stats.trueHits + stats.trueMisses) / stats.total
  }

  getNoRegRate(): number {
    if (this._count === 0) return 0
    const stats = this.getStats()
    return stats.noRegs / stats.total
  }

  get count(): number {
    return this._count
  }
}
