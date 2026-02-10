export class MultiplayerTelemetry {
  private snapshotsReceived = 0
  private snapshotsApplied = 0
  private snapshotOverwrites = 0
  private reconciliationCorrections = 0
  private reconciliationSnaps = 0
  private predictedBulletsSpawned = 0
  private predictedBulletsMatched = 0
  private predictedBulletsTimedOut = 0
  private lastLogAtMs = 0

  onSnapshotReceived(overwrotePending: boolean): void {
    this.snapshotsReceived++
    if (overwrotePending) this.snapshotOverwrites++
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

  getOverlayText(): string {
    return [
      `Net rcv:${this.snapshotsReceived} app:${this.snapshotsApplied} ovw:${this.snapshotOverwrites}`,
      `Rec corr:${this.reconciliationCorrections} snap:${this.reconciliationSnaps}`,
      `PB spawn:${this.predictedBulletsSpawned} match:${this.predictedBulletsMatched} timeout:${this.predictedBulletsTimedOut}`,
    ].join(' | ')
  }

  maybeLog(nowMs: number): void {
    if (nowMs - this.lastLogAtMs < 5000) return
    this.lastLogAtMs = nowMs

    if (this.snapshotOverwrites > 0 || this.reconciliationSnaps > 0 || this.predictedBulletsTimedOut > 0) {
      console.log(
        `[MP][telemetry] ${this.getOverlayText()}`,
      )
    }
  }
}
