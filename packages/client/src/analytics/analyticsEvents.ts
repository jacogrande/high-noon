import GameAnalytics from 'gameanalytics'
import { isAnalyticsReady } from './analytics'

// --- Progression events (Epic 3) ---

export function trackRunStart(params: {
  character: string
  seed: number
  mode: 'singleplayer' | 'multiplayer'
}): void {
  if (!isAnalyticsReady()) return
  GameAnalytics.addDesignEvent(
    `run:start:${params.mode}:${params.character}`,
    params.seed,
  )
  GameAnalytics.addProgressionEvent(
    GameAnalytics.EGAProgressionStatus.Start,
    'run',
    params.character,
    params.mode,
  )
}

export function trackStageComplete(params: {
  character: string
  stageNumber: number
  waveReached: number
  timeSec: number
  upgradesTaken: number
  killCount: number
  goldCollected: number
}): void {
  if (!isAnalyticsReady()) return
  GameAnalytics.addProgressionEvent(
    GameAnalytics.EGAProgressionStatus.Complete,
    'run',
    params.character,
    `stage_${params.stageNumber}`,
    params.killCount,
  )
  GameAnalytics.addDesignEvent(
    `stage:complete:${params.stageNumber}:time`,
    params.timeSec,
  )
  GameAnalytics.addDesignEvent(
    `stage:complete:${params.stageNumber}:upgrades`,
    params.upgradesTaken,
  )
  GameAnalytics.addDesignEvent(
    `stage:complete:${params.stageNumber}:gold`,
    params.goldCollected,
  )
}

export function trackPlayerDeath(params: {
  character: string
  stageNumber: number
  waveNumber: number
  timeSurvivedSec: number
  killCount: number
}): void {
  if (!isAnalyticsReady()) return
  GameAnalytics.addProgressionEvent(
    GameAnalytics.EGAProgressionStatus.Fail,
    'run',
    params.character,
    `stage_${params.stageNumber}`,
    params.killCount,
  )
  GameAnalytics.addDesignEvent(
    `death:stage_${params.stageNumber}:wave_${params.waveNumber}:time`,
    params.timeSurvivedSec,
  )
}

export function trackRunComplete(params: {
  character: string
  totalTimeSec: number
  stagesCleared: number
  killCount: number
  goldCollected: number
  outcome: 'victory' | 'defeat' | 'mutual_kill'
}): void {
  if (!isAnalyticsReady()) return
  const status = params.outcome === 'victory'
    ? GameAnalytics.EGAProgressionStatus.Complete
    : GameAnalytics.EGAProgressionStatus.Fail
  GameAnalytics.addProgressionEvent(
    status,
    'run',
    params.character,
    'complete',
    params.killCount,
  )
  GameAnalytics.addDesignEvent(
    `run:${params.outcome}:time`,
    params.totalTimeSec,
  )
  GameAnalytics.addDesignEvent(
    `run:${params.outcome}:gold`,
    params.goldCollected,
  )
  GameAnalytics.addDesignEvent(
    `run:${params.outcome}:stages`,
    params.stagesCleared,
  )
}

// --- Gameplay telemetry events (Epic 4) ---

export function trackUpgradeChosen(params: {
  nodeId: string
  character: string
  stageNumber: number
  level: number
}): void {
  if (!isAnalyticsReady()) return
  GameAnalytics.addDesignEvent(
    `upgrade:${params.character}:${params.nodeId}`,
    params.level,
  )
}

export function trackBossEncounter(params: {
  bossName: string
  stageNumber: number
  result: 'victory' | 'defeat'
  timeSec: number
}): void {
  if (!isAnalyticsReady()) return
  GameAnalytics.addDesignEvent(
    `boss:${params.bossName}:${params.result}`,
    params.timeSec,
  )
}

export function trackItemAcquired(params: {
  itemId: number
  itemName: string
  source: 'visitor' | 'stash' | 'drop' | 'draft'
  stageNumber: number
}): void {
  if (!isAnalyticsReady()) return
  GameAnalytics.addDesignEvent(
    `item:${params.source}:${params.itemName}`,
    params.stageNumber,
  )
}

export function trackError(severity: 'warning' | 'error' | 'critical', message: string): void {
  if (!isAnalyticsReady()) return
  const gaSeverity = {
    warning: GameAnalytics.EGAErrorSeverity.Warning,
    error: GameAnalytics.EGAErrorSeverity.Error,
    critical: GameAnalytics.EGAErrorSeverity.Critical,
  }[severity]
  GameAnalytics.addErrorEvent(gaSeverity, message.slice(0, 256))
}

// --- Multiplayer session events (Epic 5) ---

export function trackMultiplayerMatch(params: {
  playerCount: number
  mode: 'quickplay' | 'private'
}): void {
  if (!isAnalyticsReady()) return
  GameAnalytics.addDesignEvent(
    `multiplayer:match:${params.mode}:players_${params.playerCount}`,
  )
}

export function trackMatchLatency(params: {
  rttMedianMs: number
  rttP95Ms: number
  desyncCount: number
  rubberBandEvents: number
}): void {
  if (!isAnalyticsReady()) return
  GameAnalytics.addDesignEvent('multiplayer:latency:rtt_median', params.rttMedianMs)
  GameAnalytics.addDesignEvent('multiplayer:latency:rtt_p95', params.rttP95Ms)
  if (params.desyncCount > 0) {
    GameAnalytics.addDesignEvent('multiplayer:latency:desyncs', params.desyncCount)
  }
  if (params.rubberBandEvents > 0) {
    GameAnalytics.addDesignEvent('multiplayer:latency:rubber_band', params.rubberBandEvents)
  }
}

export function trackDisconnect(params: {
  reason: string
  timeSinceMatchStartSec: number
}): void {
  if (!isAnalyticsReady()) return
  GameAnalytics.addDesignEvent(
    `multiplayer:disconnect:${params.reason}`,
    params.timeSinceMatchStartSec,
  )
}
