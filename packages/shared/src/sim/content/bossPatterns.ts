/**
 * Boss Pattern Infrastructure
 *
 * Anti-safespot detection, soft enrage timer, and vulnerability windows
 * for boss encounters. These are shared utilities used by all boss modules.
 */

import { hasComponent, defineQuery } from 'bitecs'
import type { GameWorld } from '../world'
import { Player, Position, Health, Dead } from '../components'

const playerQuery = defineQuery([Player, Position, Health])

/** Detect if a player is camping in one spot */
export interface SafespotDetector {
  lastPlayerX: number
  lastPlayerY: number
  stationaryTime: number
  /** True when anti-safespot aimed layer should be added */
  triggered: boolean
}

export function createSafespotDetector(): SafespotDetector {
  return { lastPlayerX: 0, lastPlayerY: 0, stationaryTime: 0, triggered: false }
}

/** Threshold distance — player must move more than this to reset timer */
const SAFESPOT_MOVE_THRESHOLD = 30
/** Seconds of camping before anti-safespot triggers */
const SAFESPOT_TIME_THRESHOLD = 2.5

export function updateSafespotDetector(
  detector: SafespotDetector,
  playerX: number,
  playerY: number,
  dt: number,
): void {
  const dx = playerX - detector.lastPlayerX
  const dy = playerY - detector.lastPlayerY
  const distSq = dx * dx + dy * dy

  if (distSq > SAFESPOT_MOVE_THRESHOLD * SAFESPOT_MOVE_THRESHOLD) {
    detector.lastPlayerX = playerX
    detector.lastPlayerY = playerY
    detector.stationaryTime = 0
    detector.triggered = false
  } else {
    detector.stationaryTime += dt
    detector.triggered = detector.stationaryTime >= SAFESPOT_TIME_THRESHOLD
  }
}

/** Soft enrage state for bosses */
export interface EnrageState {
  fightDuration: number
  enrageTarget: number  // seconds before full enrage
}

export function createEnrageState(enrageTarget: number): EnrageState {
  return { fightDuration: 0, enrageTarget }
}

/** Get enrage progress (0 = fresh, 1 = fully enraged) */
export function getEnrageProgress(state: EnrageState): number {
  return Math.min(state.fightDuration / state.enrageTarget, 1.0)
}

/** Density multiplier from enrage (1.0 to 1.5) */
export function getEnrageDensityMul(state: EnrageState): number {
  return 1.0 + getEnrageProgress(state) * 0.5
}

/** Speed multiplier from enrage (1.0 to 1.3) */
export function getEnrageSpeedMul(state: EnrageState): number {
  return 1.0 + getEnrageProgress(state) * 0.3
}

/** Boss vulnerability state */
export interface VulnerabilityState {
  /** True when boss takes 1.5x damage */
  vulnerable: boolean
  /** Remaining vulnerability duration */
  timer: number
}

export function createVulnerabilityState(): VulnerabilityState {
  return { vulnerable: false, timer: 0 }
}

/** Vulnerability damage multiplier */
export const VULNERABILITY_DAMAGE_MUL = 1.5
/** Default vulnerability window duration */
export const VULNERABILITY_DURATION = 1.0

/** Tick vulnerability timer. Clears the vulnerable flag when the window expires. */
export function tickVulnerability(vuln: VulnerabilityState, dt: number): void {
  if (!vuln.vulnerable) return
  vuln.timer -= dt
  if (vuln.timer <= 0) {
    vuln.vulnerable = false
    vuln.timer = 0
  }
}

/**
 * Common per-tick boss bookkeeping: update safespot detector from first alive player
 * and increment enrage fight duration. Call once per boss per tick.
 */
export function tickSafespotAndEnrage(
  world: GameWorld,
  safespot: SafespotDetector,
  enrage: EnrageState,
  dt: number,
): void {
  const players = playerQuery(world)
  for (const peid of players) {
    if (!hasComponent(world, Dead, peid)) {
      updateSafespotDetector(safespot, Position.x[peid]!, Position.y[peid]!, dt)
      break
    }
  }
  enrage.fightDuration += dt
}

/**
 * Get desired phase for standard 3-phase bosses (70% / 35% HP thresholds).
 * Bosses with different thresholds (Dalton Boys, Old Scratch) use their own function.
 */
export function getStandardDesiredPhase(hpRatio: number): number {
  if (hpRatio <= 0.35) return 3
  if (hpRatio <= 0.70) return 2
  return 1
}
