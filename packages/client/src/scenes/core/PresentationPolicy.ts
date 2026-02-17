export interface PlayerHitPresentationPolicy {
  trauma: number
  simHitStopSeconds: number
  renderPauseSeconds: number
  directionalKickStrength: number
}

export interface DeathPresentationPolicy {
  enabled: boolean
  deathAnimDurationSeconds: number
  fadeDurationSeconds: number
}

export interface DebugHotkeysPolicy {
  enableOverlayToggle: boolean
  enableSpawnPauseToggle: boolean
  enableNetOverlay: boolean
}

export interface ScenePresentationPolicy {
  playerHit: PlayerHitPresentationPolicy
  death: DeathPresentationPolicy
  debugHotkeys: DebugHotkeysPolicy
}

export const SINGLEPLAYER_PRESENTATION_POLICY: ScenePresentationPolicy = {
  playerHit: {
    trauma: 0.15,
    simHitStopSeconds: 0.05,
    renderPauseSeconds: 0,
    directionalKickStrength: 4,
  },
  death: {
    enabled: true,
    deathAnimDurationSeconds: 0.75,
    fadeDurationSeconds: 1.0,
  },
  debugHotkeys: {
    enableOverlayToggle: true,
    enableSpawnPauseToggle: true,
    enableNetOverlay: true,
  },
}

export const MULTIPLAYER_PRESENTATION_POLICY: ScenePresentationPolicy = {
  playerHit: {
    trauma: 0.15,
    simHitStopSeconds: 0,
    renderPauseSeconds: 0.035,
    directionalKickStrength: 0,
  },
  death: {
    enabled: true,
    deathAnimDurationSeconds: 0.75,
    fadeDurationSeconds: 1.0,
  },
  debugHotkeys: {
    enableOverlayToggle: true,
    enableSpawnPauseToggle: false,
    enableNetOverlay: true,
  },
}
