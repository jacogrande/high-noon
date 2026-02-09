import { describe, it, expect } from 'bun:test'
import { ClockSync } from './ClockSync'

describe('ClockSync', () => {
  it('is not converged before any pong', () => {
    const clock = new ClockSync(() => 0)
    expect(clock.isConverged()).toBe(false)
    expect(clock.getRTT()).toBe(0)
  })

  it('converges after first pong', () => {
    const clock = new ClockSync(() => 100)
    // Client sent ping at t=0, server replied with serverTime=5000, client receives at t=100
    // RTT = 100, estimated offset = 5000 - (0 + 50) = 4950
    clock.onPong(0, 5000)
    expect(clock.isConverged()).toBe(true)
  })

  it('computes correct offset with zero latency', () => {
    let now = 1000
    const clock = new ClockSync(() => now)

    // Ping sent at t=1000, server time=5000, received at t=1000 (instant)
    // RTT = 0, offset = 5000 - (1000 + 0) = 4000
    clock.onPong(1000, 5000)

    now = 2000
    expect(clock.getServerTime()).toBe(6000) // 2000 + 4000
  })

  it('computes correct offset with symmetric latency', () => {
    let now = 120
    const clock = new ClockSync(() => now)

    // Ping sent at t=100, server time=5050, received at t=120
    // RTT = 20, offset = 5050 - (100 + 10) = 4940
    clock.onPong(100, 5050)

    now = 200
    expect(clock.getServerTime()).toBe(200 + 4940)
  })

  it('tracks latest RTT', () => {
    let now = 0
    const clock = new ClockSync(() => now)

    now = 30
    clock.onPong(0, 1000)
    expect(clock.getRTT()).toBe(30)

    now = 80
    clock.onPong(60, 2000)
    expect(clock.getRTT()).toBe(20)
  })

  it('rejects negative RTT (stale/clock jump)', () => {
    let now = 50
    const clock = new ClockSync(() => now)

    // clientSendTime in the future (stale pong or clock jumped back)
    clock.onPong(100, 5000)
    expect(clock.isConverged()).toBe(false)
    expect(clock.getRTT()).toBe(0)
  })

  it('keeps only best 10 samples sorted by RTT', () => {
    let now = 0
    const clock = new ClockSync(() => now)

    // Send 12 pongs with varying RTT
    for (let i = 0; i < 12; i++) {
      const rtt = (i + 1) * 10 // 10, 20, 30, ..., 120
      now = rtt
      clock.onPong(0, 5000 + rtt / 2)
    }

    // After 12 samples, only 10 best (lowest RTT) should remain
    // The latest RTT should be 120 (the last one processed)
    expect(clock.getRTT()).toBe(120)
    expect(clock.isConverged()).toBe(true)
  })

  it('uses median offset of best samples', () => {
    let now = 0
    const clock = new ClockSync(() => now)

    // 3 samples with different offsets, sorted by RTT:
    //   RTT=10, offset = 1000 - (0 + 5) = 995
    //   RTT=20, offset = 2000 - (0 + 10) = 1990
    //   RTT=30, offset = 1500 - (0 + 15) = 1485
    // Sorted by RTT: [995, 1990, 1485]
    // Median (index 1) = 1990? No — let me compute carefully.
    // After sorting by RTT: [{rtt:10, off:995}, {rtt:20, off:1990}, {rtt:30, off:1485}]
    // Median index = floor(3/2) = 1, so median offset = 1990

    now = 10
    clock.onPong(0, 1000) // RTT=10, offset=995

    now = 20
    clock.onPong(0, 2000) // RTT=20, offset=1990

    now = 30
    clock.onPong(0, 1500) // RTT=30, offset=1485

    // First pong snaps offset to 995 (first convergence)
    // Second pong: median of [995, 1990] is at index 1 = 1990
    //   |1990 - 995| = 995 > 500 → snap to 1990
    // Third pong: median of [995, 1990, 1485] at index 1 = 1990
    //   |1990 - 1990| = 0 → blend (no change)
    now = 50
    expect(clock.getServerTime()).toBe(50 + 1990)
  })

  it('snaps offset on large change (>500ms)', () => {
    let now = 0
    const clock = new ClockSync(() => now)

    // First pong: offset = 1000
    now = 10
    clock.onPong(0, 1005) // RTT=10, offset = 1005 - 5 = 1000

    // Second pong with drastically different server time: offset = 5000
    now = 20
    clock.onPong(10, 5015) // RTT=10, offset = 5015 - 15 = 5000

    // Median of [{rtt:10, off:1000}, {rtt:10, off:5000}] at index 1 = 5000
    // |5000 - 1000| = 4000 > 500 → snap
    now = 100
    expect(clock.getServerTime()).toBe(100 + 5000)
  })

  it('blends offset on small change (<500ms)', () => {
    let now = 0
    const clock = new ClockSync(() => now)

    // First pong: offset = 1000, snap
    now = 10
    clock.onPong(0, 1005) // RTT=10, offset=1000

    // Second pong: offset = 1050 (small drift)
    now = 20
    clock.onPong(10, 1065) // RTT=10, offset = 1065 - 15 = 1050

    // Median of [1000, 1050] at index 1 = 1050
    // |1050 - 1000| = 50 < 500 → blend
    // newOffset = 1000 + (1050 - 1000) * 0.1 = 1005
    now = 100
    expect(clock.getServerTime()).toBe(100 + 1005)
  })

  it('start sends ping immediately then periodically', () => {
    const clock = new ClockSync(() => 42)
    const pings: number[] = []

    clock.start((t) => pings.push(t), 100_000) // long interval to avoid timing issues
    expect(pings).toEqual([42]) // Immediate ping

    clock.stop()
  })

  it('stop clears interval', () => {
    const clock = new ClockSync(() => 0)
    const pings: number[] = []

    clock.start((t) => pings.push(t), 100_000)
    clock.stop()
    clock.stop() // Double-stop is safe

    expect(pings).toHaveLength(1) // Only the immediate one
  })

  it('getServerTime returns now + offset', () => {
    let now = 500
    const clock = new ClockSync(() => now)

    // Before any sync, offset is 0
    expect(clock.getServerTime()).toBe(500)

    // After sync, offset applied
    now = 10
    clock.onPong(0, 3005) // RTT=10, offset = 3005 - 5 = 3000

    now = 1000
    expect(clock.getServerTime()).toBe(4000)
  })
})
