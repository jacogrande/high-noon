/**
 * Seeded PRNG (mulberry32)
 *
 * A fast 32-bit seeded pseudo-random number generator for deterministic
 * gameplay. All simulation randomness MUST use this instead of Math.random()
 * to ensure identical results across client/server and for replay support.
 */

export class SeededRng {
  private seed: number

  constructor(seed: number) {
    this.seed = seed | 0
  }

  /** Returns a float in [0, 1) */
  next(): number {
    this.seed = (this.seed + 0x6d2b79f5) | 0
    let t = Math.imul(this.seed ^ (this.seed >>> 15), 1 | this.seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Returns an integer in [0, max) */
  nextInt(max: number): number {
    return Math.floor(this.next() * max)
  }

  /** Returns a float in [min, max) */
  nextRange(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  /** Reset to a new seed (for replay support) */
  reset(seed: number): void {
    this.seed = seed | 0
  }
}
