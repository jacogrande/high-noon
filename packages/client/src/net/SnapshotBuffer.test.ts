import { describe, it, expect } from 'bun:test'
import { SnapshotBuffer } from './SnapshotBuffer'
import type { WorldSnapshot } from '@high-noon/shared'

/** Create a minimal snapshot with given tick and serverTime */
function makeSnapshot(tick: number, serverTime: number): WorldSnapshot {
  return { tick, serverTime, players: [], enemies: [], lastRitesZones: [], dynamites: [] }
}

describe('SnapshotBuffer', () => {
  // ---------------------------------------------------------------------------
  // Basic buffer behavior
  // ---------------------------------------------------------------------------

  it('returns null when buffer is empty', () => {
    const buf = new SnapshotBuffer()
    expect(buf.getInterpolationState()).toBeNull()
    expect(buf.latest).toBeNull()
  })

  it('returns null with only one snapshot', () => {
    const buf = new SnapshotBuffer()
    buf.push(makeSnapshot(1, 1000))
    expect(buf.getInterpolationState()).toBeNull()
    expect(buf.latest).not.toBeNull()
  })

  it('latest returns the most recently pushed snapshot', () => {
    const buf = new SnapshotBuffer()
    buf.push(makeSnapshot(1, 1000))
    buf.push(makeSnapshot(2, 1050))
    expect(buf.latest!.tick).toBe(2)
  })

  it('clear empties the buffer', () => {
    const buf = new SnapshotBuffer()
    buf.push(makeSnapshot(1, 1000))
    buf.push(makeSnapshot(2, 1050))
    buf.clear()
    expect(buf.latest).toBeNull()
    expect(buf.getInterpolationState()).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // Buffer eviction
  // ---------------------------------------------------------------------------

  it('evicts oldest snapshot when exceeding MAX_BUFFER_SIZE (8)', () => {
    const buf = new SnapshotBuffer()
    for (let i = 0; i < 10; i++) {
      buf.push(makeSnapshot(i, 1000 + i * 50))
    }
    // After 10 pushes with max 8, oldest 2 should be evicted.
    // latest should be tick=9
    expect(buf.latest!.tick).toBe(9)

    // Render time before all buffered snapshots returns the oldest pair.
    // If eviction worked, these are ticks 2 and 3.
    const state = buf.getInterpolationState(1000)
    expect(state).not.toBeNull()
    expect(state!.from.tick).toBe(2)
    expect(state!.to.tick).toBe(3)
  })

  // ---------------------------------------------------------------------------
  // Receive-time mode (no serverTimeNow)
  // ---------------------------------------------------------------------------

  it('returns interpolation state with two snapshots (receive-time mode)', () => {
    const buf = new SnapshotBuffer(0) // 0ms delay for easier testing
    buf.push(makeSnapshot(1, 1000))

    // Small delay so second snapshot has a later receiveTime
    buf.push(makeSnapshot(2, 1050))

    const state = buf.getInterpolationState()
    expect(state).not.toBeNull()
    // With 0ms delay, renderTime ≈ now, which is after both receiveTime values
    // so we should get alpha=1 (clamped, using last two)
    expect(state!.from.tick).toBe(1)
    expect(state!.to.tick).toBe(2)
  })

  // ---------------------------------------------------------------------------
  // Server-time mode
  // ---------------------------------------------------------------------------

  it('brackets on serverTime when serverTimeNow is provided', () => {
    const buf = new SnapshotBuffer(0) // 0ms delay
    buf.push(makeSnapshot(1, 1000))
    buf.push(makeSnapshot(2, 1050))
    buf.push(makeSnapshot(3, 1100))

    // renderTime = 1075 - 0 = 1075 → brackets between serverTime 1050 and 1100
    const state = buf.getInterpolationState(1075)
    expect(state).not.toBeNull()
    expect(state!.from.tick).toBe(2)
    expect(state!.to.tick).toBe(3)
    expect(state!.alpha).toBeCloseTo(0.5, 1)
  })

  it('computes correct alpha at boundaries', () => {
    const buf = new SnapshotBuffer(0)
    buf.push(makeSnapshot(1, 1000))
    buf.push(makeSnapshot(2, 1050))

    // Exactly at from time → alpha = 0
    const state0 = buf.getInterpolationState(1000)
    expect(state0).not.toBeNull()
    expect(state0!.alpha).toBeCloseTo(0, 5)

    // Exactly at to time → alpha = 1
    const state1 = buf.getInterpolationState(1050)
    expect(state1).not.toBeNull()
    expect(state1!.alpha).toBeCloseTo(1, 5)

    // Midpoint → alpha = 0.5
    const stateHalf = buf.getInterpolationState(1025)
    expect(stateHalf).not.toBeNull()
    expect(stateHalf!.alpha).toBeCloseTo(0.5, 5)
  })

  it('returns alpha=1 when extrapolation window is exceeded', () => {
    const buf = new SnapshotBuffer(0)
    buf.push(makeSnapshot(1, 1000))
    buf.push(makeSnapshot(2, 1050))

    // Far past the newest snapshot; outside extrapolation window.
    const state = buf.getInterpolationState(2000)
    expect(state).not.toBeNull()
    expect(state!.alpha).toBe(1)
  })

  it('allows short bounded extrapolation when render time is slightly ahead', () => {
    const buf = new SnapshotBuffer(0)
    buf.push(makeSnapshot(1, 1000))
    buf.push(makeSnapshot(2, 1050))

    // 10ms ahead of newest sample (inside extrapolation window).
    const state = buf.getInterpolationState(1060)
    expect(state).not.toBeNull()
    expect(state!.from.tick).toBe(1)
    expect(state!.to.tick).toBe(2)
    expect(state!.alpha).toBeGreaterThan(1)
    expect(state!.alpha).toBeLessThanOrEqual(1.25)
  })

  it('returns alpha=0 when render time is before all snapshots', () => {
    const buf = new SnapshotBuffer(0)
    buf.push(makeSnapshot(1, 1000))
    buf.push(makeSnapshot(2, 1050))

    // Render time before any snapshot
    const state = buf.getInterpolationState(500)
    expect(state).not.toBeNull()
    expect(state!.alpha).toBe(0)
    expect(state!.from.tick).toBe(1)
    expect(state!.to.tick).toBe(2)
  })

  // ---------------------------------------------------------------------------
  // Interpolation delay
  // ---------------------------------------------------------------------------

  it('applies interpolation delay to server time', () => {
    const buf = new SnapshotBuffer(100) // 100ms delay
    buf.push(makeSnapshot(1, 1000))
    buf.push(makeSnapshot(2, 1050))
    buf.push(makeSnapshot(3, 1100))

    // serverTimeNow = 1175 → renderTime = 1175 - 100 = 1075
    // brackets between 1050 (tick 2) and 1100 (tick 3)
    const state = buf.getInterpolationState(1175)
    expect(state).not.toBeNull()
    expect(state!.from.tick).toBe(2)
    expect(state!.to.tick).toBe(3)
    expect(state!.alpha).toBeCloseTo(0.5, 1)
  })

  it('increases adaptive delay from arrival jitter and stays bounded', () => {
    const buf = new SnapshotBuffer(80) as unknown as {
      updateAdaptiveDelay: (receiveTime: number) => void
      getInterpolationDelayMs: () => number
    }

    // Initialize baseline at stable 50ms cadence.
    buf.updateAdaptiveDelay(0)
    buf.updateAdaptiveDelay(50)
    buf.updateAdaptiveDelay(100)
    buf.updateAdaptiveDelay(150)
    expect(buf.getInterpolationDelayMs()).toBe(80)

    // Introduce bursty arrival intervals.
    buf.updateAdaptiveDelay(210) // +60
    buf.updateAdaptiveDelay(240) // +30
    buf.updateAdaptiveDelay(350) // +110
    buf.updateAdaptiveDelay(380) // +30
    buf.updateAdaptiveDelay(520) // +140

    const delay = buf.getInterpolationDelayMs()
    expect(delay).toBeGreaterThan(80)
    expect(delay).toBeLessThanOrEqual(160)
  })

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  it('handles identical serverTime timestamps (span=0) with alpha=1', () => {
    const buf = new SnapshotBuffer(0)
    buf.push(makeSnapshot(1, 1000))
    buf.push(makeSnapshot(2, 1000)) // Same timestamp

    const state = buf.getInterpolationState(1000)
    expect(state).not.toBeNull()
    // span=0 → alpha=1 (use the later snapshot)
    expect(state!.alpha).toBe(1)
  })

  it('handles many snapshots and finds correct bracket', () => {
    const buf = new SnapshotBuffer(0)
    // Push 5 snapshots at 50ms intervals
    for (let i = 0; i < 5; i++) {
      buf.push(makeSnapshot(i + 1, 1000 + i * 50))
    }

    // serverTime 1000, 1050, 1100, 1150, 1200
    // renderTime = 1125 → between 1100 (tick 3) and 1150 (tick 4)
    const state = buf.getInterpolationState(1125)
    expect(state).not.toBeNull()
    expect(state!.from.tick).toBe(3)
    expect(state!.to.tick).toBe(4)
    expect(state!.alpha).toBeCloseTo(0.5, 1)
  })

  it('stores serverTime from snapshot header', () => {
    const buf = new SnapshotBuffer(0)
    const snap = makeSnapshot(1, 42.5)
    buf.push(snap)
    buf.push(makeSnapshot(2, 92.5))

    // Use server-time mode — if serverTime wasn't stored, this would fail
    const state = buf.getInterpolationState(67.5)
    expect(state).not.toBeNull()
    expect(state!.from.tick).toBe(1)
    expect(state!.to.tick).toBe(2)
    expect(state!.alpha).toBeCloseTo(0.5, 1)
  })
})
