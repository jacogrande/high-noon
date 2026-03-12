/**
 * Typed analytics event dispatch helpers.
 *
 * Each function guards on analytics readiness so call sites never need to
 * check. When the SDK is not initialized (missing keys, user declined
 * consent, etc.) every call is a silent no-op.
 */

// Stub analytics readiness check — replaced by real SDK init in a later ticket.
function isAnalyticsReady(): boolean {
  return false
}

// --- Progression events ---

export function trackRunStart(params: {
  character: string
  seed: number
  mode: 'singleplayer' | 'multiplayer'
}): void {
  if (!isAnalyticsReady()) return
  void params
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
  void params
}

export function trackPlayerDeath(params: {
  character: string
  stageNumber: number
  waveNumber: number
  timeSurvivedSec: number
  killCount: number
}): void {
  if (!isAnalyticsReady()) return
  void params
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
  void params
}

// --- Gameplay telemetry events ---

export function trackUpgradeChosen(params: {
  nodeId: string
  character: string
  stageNumber: number
  level: number
}): void {
  if (!isAnalyticsReady()) return
  void params
}

export function trackBossEncounter(params: {
  bossName: string
  stageNumber: number
  result: 'victory' | 'defeat'
  timeSec: number
}): void {
  if (!isAnalyticsReady()) return
  void params
}

export function trackItemAcquired(params: {
  itemId: number
  itemName: string
  source: 'visitor' | 'stash' | 'drop' | 'draft'
  stageNumber: number
}): void {
  if (!isAnalyticsReady()) return
  void params
}

export function trackError(severity: 'warning' | 'error' | 'critical', message: string): void {
  if (!isAnalyticsReady()) return
  void severity
  void message
}
