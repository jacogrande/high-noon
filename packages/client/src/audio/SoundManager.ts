import { Howl, Howler } from 'howler'
import type { SoundDef } from './sounds'

export class SoundManager {
  private howls = new Map<string, { howl: Howl; pitchVariance: number }>()
  private _muted = false

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

  play(name: string, opts?: { pitchVariance?: number; volume?: number }): void {
    const entry = this.howls.get(name)
    if (!entry) return
    const id = entry.howl.play()
    const variance = opts?.pitchVariance ?? entry.pitchVariance
    if (variance > 0) {
      const rate = 1 + (Math.random() * 2 - 1) * variance
      entry.howl.rate(rate, id)
    }
    if (opts?.volume !== undefined) {
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
  }
}
