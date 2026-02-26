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
  showdown_expire:   { src: '/assets/sfx/showdown_expire.ogg',   volume: 0.35 },
  footstep:          { src: '/assets/sfx/footstep.ogg',          volume: 0.15, pool: 4, pitchVariance: 0.25 },
  roll:              { src: '/assets/sfx/roll.ogg',              volume: 0.3 },
  explosion:         { src: '/assets/sfx/explosion.ogg',         volume: 0.5 },
  boss_intro:        { src: '/assets/sfx/boss_intro.ogg',        volume: 0.5 },
  boss_death:        { src: '/assets/sfx/boss_death.ogg',        volume: 0.6 },
  player_death:      { src: '/assets/sfx/player_death.ogg',      volume: 0.5 },
  gold_pickup:       { src: '/assets/sfx/gold_pickup.ogg',       volume: 0.25, pitchVariance: 0.1 },
  stage_complete:    { src: '/assets/sfx/stage_complete.ogg',     volume: 0.5 },
  wave_clear:        { src: '/assets/sfx/wave_clear.ogg',        volume: 0.35 },
  ui_click:          { src: '/assets/sfx/ui_click.ogg',          volume: 0.2 },
  ui_hover:          { src: '/assets/sfx/ui_hover.ogg',          volume: 0.1, pool: 2 },
} as const satisfies Record<string, SoundDef>

export type SoundName = keyof typeof SOUND_DEFS
