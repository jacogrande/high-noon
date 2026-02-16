const STORAGE_KEY = 'high-noon-audio'

interface AudioPrefs {
  volume: number
  muted: boolean
}

const DEFAULTS: AudioPrefs = { volume: 100, muted: false }

export function loadAudioPrefs(): AudioPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw)
    return {
      volume: typeof parsed.volume === 'number'
        ? Math.max(0, Math.min(100, parsed.volume))
        : DEFAULTS.volume,
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : DEFAULTS.muted,
    }
  } catch {
    return DEFAULTS
  }
}

export function saveAudioPrefs(volume: number, muted: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume, muted }))
  } catch {
    // localStorage may be unavailable
  }
}
