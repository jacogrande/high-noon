import { describe, it, expect } from 'bun:test'
import { HitAgreementTracker, HitOutcome } from './HitAgreementTracker'

describe('HitAgreementTracker', () => {
  it('starts with 100% agreement when empty', () => {
    const t = new HitAgreementTracker()
    expect(t.getAgreementRate()).toBe(1)
    expect(t.getNoRegRate()).toBe(0)
    expect(t.count).toBe(0)
  })

  it('records TRUE_HIT when both agree on same target', () => {
    const t = new HitAgreementTracker()
    t.record(42, 42)
    const stats = t.getStats()
    expect(stats.trueHits).toBe(1)
    expect(stats.total).toBe(1)
  })

  it('records TRUE_MISS when both are null', () => {
    const t = new HitAgreementTracker()
    t.record(null, null)
    const stats = t.getStats()
    expect(stats.trueMisses).toBe(1)
  })

  it('records NO_REG when client hit but server missed', () => {
    const t = new HitAgreementTracker()
    t.record(42, null)
    const stats = t.getStats()
    expect(stats.noRegs).toBe(1)
    expect(t.getNoRegRate()).toBe(1)
  })

  it('records FALSE_MISS when client missed but server hit', () => {
    const t = new HitAgreementTracker()
    t.record(null, 42)
    const stats = t.getStats()
    expect(stats.falseMisses).toBe(1)
  })

  it('records TARGET_SWAP when both hit different targets', () => {
    const t = new HitAgreementTracker()
    t.record(42, 99)
    const stats = t.getStats()
    expect(stats.targetSwaps).toBe(1)
  })

  it('computes agreement rate correctly', () => {
    const t = new HitAgreementTracker()
    t.record(1, 1)   // TRUE_HIT
    t.record(null, null)  // TRUE_MISS
    t.record(2, null) // NO_REG
    t.record(null, 3) // FALSE_MISS
    // 2 agreements out of 4 total
    expect(t.getAgreementRate()).toBe(0.5)
    expect(t.getNoRegRate()).toBe(0.25)
  })

  it('wraps the ring buffer', () => {
    const t = new HitAgreementTracker(3)
    t.record(1, 1)       // TRUE_HIT
    t.record(null, null)  // TRUE_MISS
    t.record(2, null)     // NO_REG
    t.record(3, null)     // NO_REG — evicts first TRUE_HIT
    expect(t.count).toBe(3)
    const stats = t.getStats()
    expect(stats.trueHits).toBe(0)
    expect(stats.trueMisses).toBe(1)
    expect(stats.noRegs).toBe(2)
  })
})
