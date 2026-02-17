/**
 * Ring-buffer histogram with percentile computation.
 *
 * Pre-allocates a fixed-size Float64Array and writes in a ring. Percentile
 * queries copy the live window and sort — 600 elements at 4Hz is trivial.
 */
export class RollingHistogram {
  private readonly data: Float64Array
  private readonly capacity: number
  private head = 0
  private _count = 0
  private sum = 0

  constructor(windowSize = 600) {
    this.capacity = windowSize
    this.data = new Float64Array(windowSize)
  }

  push(value: number): void {
    if (this._count >= this.capacity) {
      this.sum -= this.data[this.head]!
    }
    this.data[this.head] = value
    this.sum += value
    this.head = (this.head + 1) % this.capacity
    if (this._count < this.capacity) this._count++
  }

  get count(): number {
    return this._count
  }

  mean(): number {
    return this._count === 0 ? 0 : this.sum / this._count
  }

  min(): number {
    if (this._count === 0) return 0
    let m = Infinity
    const start = this._count < this.capacity ? 0 : this.head
    for (let i = 0; i < this._count; i++) {
      const v = this.data[(start + i) % this.capacity]!
      if (v < m) m = v
    }
    return m
  }

  max(): number {
    if (this._count === 0) return 0
    let m = -Infinity
    const start = this._count < this.capacity ? 0 : this.head
    for (let i = 0; i < this._count; i++) {
      const v = this.data[(start + i) % this.capacity]!
      if (v > m) m = v
    }
    return m
  }

  /** Compute the p-th percentile (p in [0, 1]). */
  percentile(p: number): number {
    if (this._count === 0) return 0
    const live = this.getLiveWindow()
    live.sort((a, b) => a - b)
    const idx = Math.max(0, Math.min(live.length - 1, Math.round((live.length - 1) * p)))
    return live[idx]!
  }

  stddev(): number {
    if (this._count < 2) return 0
    const avg = this.mean()
    let sumSq = 0
    const start = this._count < this.capacity ? 0 : this.head
    for (let i = 0; i < this._count; i++) {
      const d = this.data[(start + i) % this.capacity]! - avg
      sumSq += d * d
    }
    return Math.sqrt(sumSq / this._count)
  }

  private getLiveWindow(): number[] {
    const arr: number[] = new Array(this._count)
    const start = this._count < this.capacity ? 0 : this.head
    for (let i = 0; i < this._count; i++) {
      arr[i] = this.data[(start + i) % this.capacity]!
    }
    return arr
  }
}
