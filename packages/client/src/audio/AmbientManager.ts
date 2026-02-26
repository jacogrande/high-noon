import { Howl } from 'howler'

interface AmbientTrack {
  src: string
  volume: number
}

const STAGE_TRACKS: AmbientTrack[] = [
  { src: '/assets/sfx/ambient_desert.ogg', volume: 0.15 },   // Stage 1: Desert
  { src: '/assets/sfx/ambient_badlands.ogg', volume: 0.15 }, // Stage 2: Badlands
  { src: '/assets/sfx/ambient_canyon.ogg', volume: 0.18 },   // Stage 3: Canyon
  { src: '/assets/sfx/ambient_hellfire.ogg', volume: 0.2 },  // Stage 4: Hellfire
]

const CROSSFADE_DURATION = 2.0

export class AmbientManager {
  private currentStage = -1
  private currentHowl: Howl | null = null
  private currentBaseVolume = 0
  private fadingOutHowl: Howl | null = null
  private fadingOutVolume = 0
  private fadeProgress = 1 // 0→1 over CROSSFADE_DURATION

  setStage(stageIndex: number): void {
    if (stageIndex === this.currentStage) return
    if (stageIndex < 0 || stageIndex >= STAGE_TRACKS.length) return

    this.currentStage = stageIndex
    const track = STAGE_TRACKS[stageIndex]!

    // Start fading out old track — use actual current volume (not target)
    // to avoid a jump if called mid-crossfade
    if (this.fadingOutHowl) {
      this.fadingOutHowl.unload()
    }
    this.fadingOutHowl = this.currentHowl
    this.fadingOutVolume = this.currentHowl ? this.currentHowl.volume() as number : 0

    // Start new track
    this.currentHowl = new Howl({
      src: [track.src],
      volume: 0,
      loop: true,
      preload: true,
    })
    this.currentHowl.play()
    this.currentBaseVolume = track.volume
    this.fadeProgress = 0
  }

  update(dt: number): void {
    if (this.fadeProgress >= 1) return

    this.fadeProgress = Math.min(1, this.fadeProgress + dt / CROSSFADE_DURATION)

    // Fade in new track
    if (this.currentHowl) {
      this.currentHowl.volume(this.currentBaseVolume * this.fadeProgress)
    }

    // Fade out old track
    if (this.fadingOutHowl) {
      this.fadingOutHowl.volume(this.fadingOutVolume * (1 - this.fadeProgress))
      if (this.fadeProgress >= 1) {
        this.fadingOutHowl.unload()
        this.fadingOutHowl = null
        this.fadingOutVolume = 0
      }
    }
  }

  destroy(): void {
    this.currentHowl?.stop()
    this.currentHowl?.unload()
    this.currentHowl = null
    this.fadingOutHowl?.stop()
    this.fadingOutHowl?.unload()
    this.fadingOutHowl = null
    this.currentStage = -1
  }
}
