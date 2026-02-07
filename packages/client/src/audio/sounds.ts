export interface SoundDef {
  src: string
  volume: number
  pool?: number
  pitchVariance?: number
}

export const SOUND_DEFS = {
  fire:           { src: '/assets/sfx/fire.ogg',           volume: 0.3, pitchVariance: 0.1 },
  hit:            { src: '/assets/sfx/hit.ogg',            volume: 0.4 },
  enemy_die:      { src: '/assets/sfx/enemy_die.ogg',      volume: 0.35, pitchVariance: 0.15 },
  player_hit:     { src: '/assets/sfx/player_hit.ogg',     volume: 0.5 },
  level_up:       { src: '/assets/sfx/level_up.ogg',       volume: 0.5 },
  upgrade_select: { src: '/assets/sfx/upgrade_select.ogg', volume: 0.4 },
  wave_start:     { src: '/assets/sfx/wave_start.ogg',     volume: 0.4 },
  reload_start:   { src: '/assets/sfx/reload_start.ogg',   volume: 0.4 },
  reload_complete: { src: '/assets/sfx/reload_complete.ogg', volume: 0.4 },
  dry_fire:          { src: '/assets/sfx/dry_fire.ogg',          volume: 0.3 },
  showdown_activate: { src: '/assets/sfx/showdown_activate.ogg', volume: 0.5 },
  showdown_kill:     { src: '/assets/sfx/showdown_kill.ogg',     volume: 0.4 },
} as const satisfies Record<string, SoundDef>

export type SoundName = keyof typeof SOUND_DEFS
