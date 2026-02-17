import { describe, it, expect } from 'bun:test'
import { ShotTraceBuffer, HitResult } from './ShotTrace'
import type { ShotResultMessage } from '@high-noon/shared'

function makeResult(overrides: Partial<ShotResultMessage> = {}): ShotResultMessage {
  return {
    shooterServerEid: 1,
    shootSeq: 1,
    tick: 100,
    hit: false,
    hitX: 0,
    hitY: 0,
    ...overrides,
  }
}

describe('ShotTraceBuffer', () => {
  it('opens and attaches a trace', () => {
    const buf = new ShotTraceBuffer()
    buf.open(1, 10, 1000, 60, 0.5, 100, 200, 50)
    expect(buf.count).toBe(1)

    const trace = buf.attachServerResult(1, makeResult({
      shootSeq: 1,
      hit: true,
      hitX: 110,
      hitY: 210,
      targetServerEid: 42,
    }))
    expect(trace).not.toBeNull()
    expect(trace!.hitResult).toBe(HitResult.HIT)
    expect(trace!.serverImpactX).toBe(110)
  })

  it('classifies MISS correctly', () => {
    const buf = new ShotTraceBuffer()
    buf.open(1, 10, 1000, 60, 0, 0, 0, 0)
    const trace = buf.attachServerResult(1, makeResult({ shootSeq: 1, hit: false }))
    expect(trace!.hitResult).toBe(HitResult.MISS)
  })

  it('classifies REWIND_CLAMPED', () => {
    const buf = new ShotTraceBuffer()
    buf.open(1, 10, 1000, 60, 0, 0, 0, 0)
    const trace = buf.attachServerResult(1, makeResult({
      shootSeq: 1,
      hit: true,
      rewindClamped: true,
    }))
    expect(trace!.hitResult).toBe(HitResult.REWIND_CLAMPED)
  })

  it('returns null for unknown shootSeq', () => {
    const buf = new ShotTraceBuffer()
    buf.open(1, 10, 1000, 60, 0, 0, 0, 0)
    const trace = buf.attachServerResult(999, makeResult({ shootSeq: 999 }))
    expect(trace).toBeNull()
  })

  it('ring buffer wraps correctly', () => {
    const buf = new ShotTraceBuffer(4)
    for (let i = 1; i <= 6; i++) {
      buf.open(i, i * 10, i * 1000, i * 60, 0, 0, 0, 0)
    }
    expect(buf.count).toBe(4)
    // First two traces should be gone
    expect(buf.getByShootSeq(1)).toBeNull()
    expect(buf.getByShootSeq(2)).toBeNull()
    expect(buf.getByShootSeq(3)).not.toBeNull()
    expect(buf.getByShootSeq(6)).not.toBeNull()
  })

  it('getCompletedTraces returns only completed', () => {
    const buf = new ShotTraceBuffer()
    buf.open(1, 10, 1000, 60, 0, 0, 0, 0)
    buf.open(2, 20, 2000, 120, 0, 0, 0, 0)
    buf.attachServerResult(1, makeResult({ shootSeq: 1, hit: false }))
    // Only seq 1 is completed
    const completed = buf.getCompletedTraces()
    expect(completed.length).toBe(1)
    expect(completed[0]!.shootSeq).toBe(1)
  })

  it('getSummary computes stats', () => {
    const buf = new ShotTraceBuffer()
    for (let i = 1; i <= 5; i++) {
      buf.open(i, i * 10, i * 100, i * 60, 0, 0, 0, 0)
      buf.attachServerResult(i, makeResult({
        shootSeq: i,
        hit: i <= 3,
        targetServerEid: i <= 3 ? i * 10 : undefined,
      }))
    }
    const summary = buf.getSummary()
    expect(summary.totalTraces).toBe(5)
    expect(summary.completedTraces).toBe(5)
    expect(summary.hits).toBe(3)
    expect(summary.misses).toBe(2)
  })
})
