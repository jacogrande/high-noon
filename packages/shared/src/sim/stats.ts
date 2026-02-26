/**
 * Per-player run statistics tracked in the shared simulation.
 * Deterministic — tracked in shared so single-player and multiplayer produce identical stats.
 */

export interface PlayerRunStats {
  damageDealt: number
  damageReceived: number
  enemiesKilled: number
  bossesKilled: number
  shotsFired: number
  shotsHit: number
  goldCollected: number
  itemsCollected: number
  timesDown: number
  revivesGiven: number
  rollDodges: number
  longestKillStreak: number
  /** Internal: current streak counter (not sent to clients) */
  _currentStreak: number
}

export function createPlayerRunStats(): PlayerRunStats {
  return {
    damageDealt: 0,
    damageReceived: 0,
    enemiesKilled: 0,
    bossesKilled: 0,
    shotsFired: 0,
    shotsHit: 0,
    goldCollected: 0,
    itemsCollected: 0,
    timesDown: 0,
    revivesGiven: 0,
    rollDodges: 0,
    longestKillStreak: 0,
    _currentStreak: 0,
  }
}

export function getOrCreatePlayerStats(
  statsMap: Map<number, PlayerRunStats>,
  playerEid: number,
): PlayerRunStats {
  let stats = statsMap.get(playerEid)
  if (!stats) {
    stats = createPlayerRunStats()
    statsMap.set(playerEid, stats)
  }
  return stats
}
