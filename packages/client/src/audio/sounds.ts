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
} as const satisfies Record<string, SoundDef>

export type SoundName = keyof typeof SOUND_DEFS
