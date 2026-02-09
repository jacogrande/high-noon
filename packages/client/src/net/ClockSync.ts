/**
 * Clock synchronization using Cristian's algorithm.
 *
 * Estimates the offset between the client's performance.now() and the
 * server's performance.now(). Uses periodic ping/pong round-trips to
 * maintain an accurate estimate over time.
 *
 * Usage:
 *   estimatedServerTime = performance.now() + offset
 */

const MAX_SAMPLES = 10
const SNAP_THRESHOLD = 500 // ms — snap offset if error exceeds this
const BLEND_FACTOR = 0.1 // Gradual drift correction per sample

export class ClockSync {
  private offset = 0
  private latestRTT = 0
  private samples: { offset: number; rtt: number }[] = []
  private intervalId: ReturnType<typeof setInterval> | null = null
  private converged = false
  private now: () => number

  constructor(now: () => number = () => performance.now()) {
    this.now = now
  }

  /** Begin periodic pinging. Caller provides the send function. */
  start(sendPing: (clientTime: number) => void, intervalMs = 5000): void {
    sendPing(this.now())
    this.intervalId = setInterval(() => sendPing(this.now()), intervalMs)
  }

  /** Process a pong response. */
  onPong(clientSendTime: number, serverTime: number): void {
    const receiveTime = this.now()
    const rtt = receiveTime - clientSendTime
    if (rtt < 0) return // Invalid (clock jump or stale)

    this.latestRTT = rtt
    const estimatedOffset = serverTime - (clientSendTime + rtt / 2)

    this.samples.push({ offset: estimatedOffset, rtt })
    this.samples.sort((a, b) => a.rtt - b.rtt)
    if (this.samples.length > MAX_SAMPLES) this.samples.length = MAX_SAMPLES

    // Median of best samples
    const medianOffset = this.samples[Math.floor(this.samples.length / 2)]!.offset

    if (!this.converged || Math.abs(medianOffset - this.offset) > SNAP_THRESHOLD) {
      this.offset = medianOffset // Snap on first sync or large error
      this.converged = true
    } else {
      this.offset += (medianOffset - this.offset) * BLEND_FACTOR
    }
  }

  /** Estimated current server time (performance.now domain). */
  getServerTime(): number {
    return this.now() + this.offset
  }

  /** Latest measured round-trip time in ms. */
  getRTT(): number {
    return this.latestRTT
  }

  /** Whether at least one pong has been processed. */
  isConverged(): boolean {
    return this.converged
  }

  /** Stop periodic pinging. */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }
}
