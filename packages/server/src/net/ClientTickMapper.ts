const OFFSET_BLEND = 0.15
const OFFSET_SNAP_THRESHOLD_TICKS = 12

export interface RewindClampResult {
  tick: number
  clamped: boolean
}

/**
 * Maintains a per-client estimate of (serverTick - clientTick) so the server
 * can project a client command tick into server simulation time.
 */
export class ClientTickMapper {
  private offsetTicks = 0
  private initialized = false

  updateOffset(serverTick: number, clientTick: number): void {
    if (!Number.isFinite(serverTick) || !Number.isFinite(clientTick)) return

    const observed = serverTick - clientTick
    if (!this.initialized) {
      this.offsetTicks = observed
      this.initialized = true
      return
    }

    const delta = observed - this.offsetTicks
    if (Math.abs(delta) > OFFSET_SNAP_THRESHOLD_TICKS) {
      this.offsetTicks = observed
      return
    }

    this.offsetTicks += delta * OFFSET_BLEND
  }

  estimateServerTick(clientTick: number): number {
    if (!Number.isFinite(clientTick)) return 0
    const base = this.initialized ? this.offsetTicks : 0
    return Math.round(clientTick + base)
  }

  clampRewindTick(nowTick: number, estimatedTick: number, maxRewindTicks: number): RewindClampResult {
    const safeNow = Number.isFinite(nowTick) ? Math.trunc(nowTick) : 0
    const safeEstimated = Number.isFinite(estimatedTick) ? Math.trunc(estimatedTick) : safeNow
    const safeMax = Number.isFinite(maxRewindTicks)
      ? Math.max(0, Math.trunc(maxRewindTicks))
      : 0

    const minTick = safeNow - safeMax
    const tick = Math.max(minTick, Math.min(safeNow, safeEstimated))
    return {
      tick,
      clamped: tick !== safeEstimated,
    }
  }

  getEstimatedOffsetTicks(): number {
    return this.offsetTicks
  }

  hasEstimate(): boolean {
    return this.initialized
  }
}
