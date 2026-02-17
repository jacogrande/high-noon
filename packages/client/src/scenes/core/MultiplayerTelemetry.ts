import { RollingHistogram } from '../../net/RollingHistogram'

/** Magnitude above which a correction counts as rubber-banding. */
const RUBBER_BAND_MAGNITUDE = 20
/** Window in ms to track large corrections for rubber-band event detection. */
const RUBBER_BAND_WINDOW = 1000
/** Number of large corrections within the window to flag a rubber-band event. */
const RUBBER_BAND_COUNT = 3

export type OverlayMode = 'off' | 'summary' | 'detailed' | 'graphs'

export class MultiplayerTelemetry {
  // --- existing counters ---
  private snapshotsReceived = 0
  private snapshotsApplied = 0
  private snapshotBacklog = 0
  private snapshotsDropped = 0
  private reconciliationCorrections = 0
  private reconciliationSnaps = 0
  private predictedBulletsSpawned = 0
  private predictedBulletsMatched = 0
  private predictedBulletsTimedOut = 0
  private lastLogAtMs = 0

  // --- histograms ---
  readonly rttHistory = new RollingHistogram(600)
  readonly jitterHistory = new RollingHistogram(600)
  readonly snapshotIntervalHistory = new RollingHistogram(200)
  readonly interpolationDelayHistory = new RollingHistogram(200)
  readonly correctionMagnitudeHistory = new RollingHistogram(600)
  readonly serverFrameTimeHistory = new RollingHistogram(200)

  // --- rubber-banding detection ---
  private recentLargeCorrections: number[] = []
  rubberBandEvents = 0
  directionReversals = 0
  private lastCorrectionDirX = 0
  private lastCorrectionDirY = 0

  // --- desync ---
  desyncCount = 0

  // --- snapshot timing ---
  private lastSnapshotReceiveTime: number | null = null
  private lastRtt: number | null = null

  // ==========================================================================
  // Existing callbacks (backward compatible)
  // ==========================================================================

  onSnapshotReceived(hadBacklog: boolean): void {
    this.snapshotsReceived++
    if (hadBacklog) this.snapshotBacklog++
  }

  onSnapshotDropped(): void {
    this.snapshotsDropped++
  }

  onSnapshotApplied(): void {
    this.snapshotsApplied++
  }

  onReconciliationCorrection(snapped: boolean): void {
    this.reconciliationCorrections++
    if (snapped) this.reconciliationSnaps++
  }

  onPredictedBulletsSpawned(count: number): void {
    this.predictedBulletsSpawned += count
  }

  onPredictedBulletsMatched(count: number): void {
    this.predictedBulletsMatched += count
  }

  onPredictedBulletsTimedOut(count: number): void {
    this.predictedBulletsTimedOut += count
  }

  // ==========================================================================
  // New telemetry feeds
  // ==========================================================================

  onRTTSample(rtt: number): void {
    this.rttHistory.push(rtt)
    if (this.lastRtt !== null) {
      this.jitterHistory.push(Math.abs(rtt - this.lastRtt))
    }
    this.lastRtt = rtt
  }

  onReconciliationCorrectionDetailed(mag: number, snapped: boolean, dx: number, dy: number): void {
    this.reconciliationCorrections++
    if (snapped) this.reconciliationSnaps++
    this.correctionMagnitudeHistory.push(mag)

    // Rubber-banding detection
    const now = performance.now()
    if (mag >= RUBBER_BAND_MAGNITUDE) {
      this.recentLargeCorrections.push(now)
    }
    // Prune old entries
    while (this.recentLargeCorrections.length > 0 && now - this.recentLargeCorrections[0]! > RUBBER_BAND_WINDOW) {
      this.recentLargeCorrections.shift()
    }
    if (this.recentLargeCorrections.length >= RUBBER_BAND_COUNT) {
      this.rubberBandEvents++
      this.recentLargeCorrections.length = 0
    }

    // Direction reversal detection
    if (this.lastCorrectionDirX !== 0 || this.lastCorrectionDirY !== 0) {
      const dot = dx * this.lastCorrectionDirX + dy * this.lastCorrectionDirY
      if (dot < 0) {
        this.directionReversals++
      }
    }
    this.lastCorrectionDirX = dx
    this.lastCorrectionDirY = dy
  }

  onSnapshotReceivedTimed(): void {
    const now = performance.now()
    if (this.lastSnapshotReceiveTime !== null) {
      const interval = now - this.lastSnapshotReceiveTime
      if (interval > 0 && interval < 1000) {
        this.snapshotIntervalHistory.push(interval)
      }
    }
    this.lastSnapshotReceiveTime = now
  }

  onInterpolationDelayUpdate(delayMs: number): void {
    this.interpolationDelayHistory.push(delayMs)
  }

  onServerFrameTime(ms: number): void {
    if (ms > 0) {
      this.serverFrameTimeHistory.push(ms)
    }
  }

  recordDesync(): void {
    this.desyncCount++
  }

  // ==========================================================================
  // Overlay text generation
  // ==========================================================================

  getOverlayText(mode?: OverlayMode): string {
    if (!mode || mode === 'off') return this.getLegacyOverlayText()
    if (mode === 'summary') return this.getSummaryOverlayText()
    if (mode === 'detailed') return this.getDetailedOverlayText()
    return '' // 'graphs' mode uses NetGraph, no text
  }

  /** Original compact format for backward compatibility. */
  private getLegacyOverlayText(): string {
    return [
      `Net rcv:${this.snapshotsReceived} app:${this.snapshotsApplied} back:${this.snapshotBacklog} drop:${this.snapshotsDropped}`,
      `Rec corr:${this.reconciliationCorrections} snap:${this.reconciliationSnaps}`,
      `PB spawn:${this.predictedBulletsSpawned} match:${this.predictedBulletsMatched} timeout:${this.predictedBulletsTimedOut}`,
    ].join(' | ')
  }

  getSummaryOverlayText(): string {
    const rtt = this.rttHistory.count > 0
      ? `RTT ${this.rttHistory.percentile(0.5).toFixed(0)}/${this.rttHistory.percentile(0.95).toFixed(0)}ms`
      : 'RTT --'
    const corr = this.correctionMagnitudeHistory.count > 0
      ? `Corr p50:${this.correctionMagnitudeHistory.percentile(0.5).toFixed(1)}px`
      : 'Corr --'
    const desyncs = this.desyncCount > 0 ? ` Desyncs:${this.desyncCount}` : ''
    return `${rtt} | ${corr}${desyncs}`
  }

  getDetailedOverlayText(): string {
    const sections: string[] = []

    // CONNECTION
    const rttP50 = this.rttHistory.percentile(0.5).toFixed(0)
    const rttP95 = this.rttHistory.percentile(0.95).toFixed(0)
    const jitterAvg = this.jitterHistory.mean().toFixed(1)
    const snapInt = this.snapshotIntervalHistory.count > 0
      ? this.snapshotIntervalHistory.mean().toFixed(0)
      : '--'
    const interpDelay = this.interpolationDelayHistory.count > 0
      ? this.interpolationDelayHistory.percentile(0.5).toFixed(0)
      : '--'
    sections.push(
      `[CONN] RTT p50:${rttP50} p95:${rttP95}ms Jitter:${jitterAvg}ms SnapInt:${snapInt}ms InterpDelay:${interpDelay}ms`
    )

    // SIMULATION
    const serverFt = this.serverFrameTimeHistory.count > 0
      ? `Srv p95:${this.serverFrameTimeHistory.percentile(0.95).toFixed(1)}ms`
      : 'Srv --'
    sections.push(
      `[SIM] ${serverFt} Snap rcv:${this.snapshotsReceived} app:${this.snapshotsApplied} drop:${this.snapshotsDropped}`
    )

    // PREDICTION
    const corrP50 = this.correctionMagnitudeHistory.count > 0
      ? this.correctionMagnitudeHistory.percentile(0.5).toFixed(1)
      : '--'
    const corrP95 = this.correctionMagnitudeHistory.count > 0
      ? this.correctionMagnitudeHistory.percentile(0.95).toFixed(1)
      : '--'
    sections.push(
      `[PRED] Corr p50:${corrP50} p95:${corrP95}px Snaps:${this.reconciliationSnaps} RB:${this.rubberBandEvents} Rev:${this.directionReversals}`
    )

    // BULLETS
    sections.push(
      `[SHOT] PB spawn:${this.predictedBulletsSpawned} match:${this.predictedBulletsMatched} timeout:${this.predictedBulletsTimedOut} Desyncs:${this.desyncCount}`
    )

    return sections.join('\n')
  }

  maybeLog(nowMs: number): void {
    if (nowMs - this.lastLogAtMs < 5000) return
    this.lastLogAtMs = nowMs

    if (this.snapshotsDropped > 0 || this.reconciliationSnaps > 0 || this.predictedBulletsTimedOut > 0) {
      console.log(
        `[MP][telemetry] ${this.getLegacyOverlayText()}`,
      )
    }
  }
}
