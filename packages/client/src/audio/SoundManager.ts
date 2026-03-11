import { Howl, Howler } from 'howler'
import type { SoundDef } from './sounds'
import { loadAudioPrefs } from './audioPrefs'

export class SoundManager {
  private howls = new Map<string, { howl: Howl; pitchVariance: number }>()
  private _muted = false

  constructor() {
    this.applyPrefs()
  }

  applyPrefs(): void {
    const prefs = loadAudioPrefs()
    Howler.volume(prefs.volume / 100)
    this._muted = prefs.muted
    Howler.mute(prefs.muted)
  }

  getMasterVolume(): number {
    return Howler.volume() * 100
  }

  loadAll(defs: Record<string, SoundDef>): void {
    for (const [name, def] of Object.entries(defs)) {
      const howl = new Howl({
        src: [def.src],
        volume: def.volume,
        pool: def.pool ?? 8,
        preload: true,
      })
      this.howls.set(name, { howl, pitchVariance: def.pitchVariance ?? 0 })
    }
  }

  play(name: string, opts?: { pitchVariance?: number; volume?: number; pan?: number; volumeScale?: number }): void {
    const entry = this.howls.get(name)
    if (!entry) return
    // Skip perceptually-silent spatial sounds to avoid exhausting the Howl pool.
    // With squared falloff, volumeScale < 0.02 corresponds to ~86% of maxDistance.
    if (opts?.volumeScale !== undefined && opts.volumeScale < 0.02) return
    const id = entry.howl.play()
    const variance = opts?.pitchVariance ?? entry.pitchVariance
    if (variance > 0) {
      const rate = 1 + (Math.random() * 2 - 1) * variance
      entry.howl.rate(rate, id)
    }
    if (opts?.pan !== undefined) {
      entry.howl.stereo(opts.pan, id)
    }
    if (opts?.volumeScale !== undefined) {
      // howl.volume() returns the Howl-level base (e.g. 0.3), not master-adjusted
      const base = opts.volume ?? entry.howl.volume()
      entry.howl.volume(base * opts.volumeScale, id)
    } else if (opts?.volume !== undefined) {
      entry.howl.volume(opts.volume, id)
    }
  }

  setMasterVolume(v: number): void {
    Howler.volume(v)
  }

  get muted(): boolean {
    return this._muted
  }

  set muted(v: boolean) {
    this._muted = v
    Howler.mute(v)
  }

  destroy(): void {
    for (const { howl } of this.howls.values()) {
      howl.unload()
    }
    this.howls.clear()
    // Reset global Howler state so the next SoundManager instance
    // does not inherit a leaked mute/volume from this one.
    Howler.mute(false)
    Howler.volume(1)
  }
}
