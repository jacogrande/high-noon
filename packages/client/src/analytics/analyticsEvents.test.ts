/**
 * Analytics Event Dispatch Tests
 *
 * Tests for analyticsEvents.ts: no-op guard, correct event hierarchy strings,
 * numeric values, and progression status mapping.
 *
 * We mock only 'gameanalytics' to prevent the Node.js SDK bundle from executing
 * window.addEventListener in a non-DOM environment.  We do NOT mock './analytics'
 * — instead we use the real module and control isAnalyticsReady() by driving
 * consent state and env vars.
 *
 * This avoids the cross-file mock.module leak in bun:test (all test files share
 * one process; a mock.module() call in one file persists for subsequent files).
 *
 * Test phases:
 *   Phase 1 — No-op guard: analytics is NOT initialized → all helpers are no-ops.
 *   Phase 2 — Initialize: call initAnalytics() with consent + keys → flag flips true.
 *   Phase 3 — Dispatch: verify every helper sends the correct GA calls.
 *
 * Since the analytics module's `initialized` flag is permanent once set, tests
 * within each phase run in the declared order (no interleaving between phases).
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test'

// ---------------------------------------------------------------------------
// localStorage stub (required for consent.ts and analytics.ts)
// ---------------------------------------------------------------------------

const store: Record<string, string> = {}

globalThis.localStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { for (const key in store) delete store[key] },
  length: 0,
  key: () => null,
} as Storage

// ---------------------------------------------------------------------------
// gameanalytics SDK mock
// Must be registered before any dynamic import of analyticsEvents.ts.
// ---------------------------------------------------------------------------

const mockGA = {
  configureBuild: mock(() => {}),
  initialize: mock(() => {}),
  setEnabledEventSubmission: mock(() => {}),
  addDesignEvent: mock(() => {}),
  addProgressionEvent: mock(() => {}),
  addErrorEvent: mock(() => {}),
  EGAProgressionStatus: { Start: 1, Complete: 2, Fail: 3 },
  EGAErrorSeverity: { Warning: 1, Error: 2, Critical: 3 },
}

mock.module('gameanalytics', () => ({ default: mockGA }))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clearGA(): void {
  mockGA.addDesignEvent.mockClear()
  mockGA.addProgressionEvent.mockClear()
  mockGA.addErrorEvent.mockClear()
}

// ---------------------------------------------------------------------------
// Phase 1: No-op guard — analytics NOT initialized (isAnalyticsReady() === false)
// These tests must run before initAnalytics() is ever called so that the real
// analytics module's `initialized` flag stays false.
// ---------------------------------------------------------------------------

describe('no-op guard — analytics not initialized', () => {
  beforeEach(() => {
    localStorage.clear() // ensures consent is 'unset' → isAnalyticsReady() === false
    clearGA()
    delete process.env.VITE_GA_GAME_KEY
    delete process.env.VITE_GA_SECRET_KEY
  })

  test('trackRunStart does not call any GA methods', async () => {
    const { trackRunStart } = await import('./analyticsEvents')
    trackRunStart({ character: 'sheriff', seed: 42, mode: 'singleplayer' })
    expect(mockGA.addDesignEvent).not.toHaveBeenCalled()
    expect(mockGA.addProgressionEvent).not.toHaveBeenCalled()
  })

  test('trackStageComplete does not call any GA methods', async () => {
    const { trackStageComplete } = await import('./analyticsEvents')
    trackStageComplete({
      character: 'sheriff',
      stageNumber: 1,
      waveReached: 3,
      timeSec: 120,
      upgradesTaken: 2,
      killCount: 50,
      goldCollected: 200,
    })
    expect(mockGA.addDesignEvent).not.toHaveBeenCalled()
    expect(mockGA.addProgressionEvent).not.toHaveBeenCalled()
  })

  test('trackPlayerDeath does not call any GA methods', async () => {
    const { trackPlayerDeath } = await import('./analyticsEvents')
    trackPlayerDeath({
      character: 'sheriff',
      stageNumber: 2,
      waveNumber: 1,
      timeSurvivedSec: 60,
      killCount: 10,
    })
    expect(mockGA.addDesignEvent).not.toHaveBeenCalled()
    expect(mockGA.addProgressionEvent).not.toHaveBeenCalled()
  })

  test('trackRunComplete does not call any GA methods', async () => {
    const { trackRunComplete } = await import('./analyticsEvents')
    trackRunComplete({
      character: 'sheriff',
      totalTimeSec: 300,
      stagesCleared: 2,
      killCount: 100,
      goldCollected: 500,
      outcome: 'victory',
    })
    expect(mockGA.addDesignEvent).not.toHaveBeenCalled()
    expect(mockGA.addProgressionEvent).not.toHaveBeenCalled()
  })

  test('trackUpgradeChosen does not call any GA methods', async () => {
    const { trackUpgradeChosen } = await import('./analyticsEvents')
    trackUpgradeChosen({ nodeId: 'quick_draw', character: 'sheriff', stageNumber: 1, level: 2 })
    expect(mockGA.addDesignEvent).not.toHaveBeenCalled()
  })

  test('trackBossEncounter does not call any GA methods', async () => {
    const { trackBossEncounter } = await import('./analyticsEvents')
    trackBossEncounter({ bossName: 'the_outlaw', stageNumber: 1, result: 'victory', timeSec: 45 })
    expect(mockGA.addDesignEvent).not.toHaveBeenCalled()
  })

  test('trackItemAcquired does not call any GA methods', async () => {
    const { trackItemAcquired } = await import('./analyticsEvents')
    trackItemAcquired({ itemId: 1, itemName: 'revolver', source: 'visitor', stageNumber: 1 })
    expect(mockGA.addDesignEvent).not.toHaveBeenCalled()
  })

  test('trackError does not call any GA methods', async () => {
    const { trackError } = await import('./analyticsEvents')
    trackError('error', 'something went wrong')
    expect(mockGA.addErrorEvent).not.toHaveBeenCalled()
  })

  test('trackMultiplayerMatch does not call any GA methods', async () => {
    const { trackMultiplayerMatch } = await import('./analyticsEvents')
    trackMultiplayerMatch({ playerCount: 2, mode: 'quickplay' })
    expect(mockGA.addDesignEvent).not.toHaveBeenCalled()
  })

  test('trackMatchLatency does not call any GA methods', async () => {
    const { trackMatchLatency } = await import('./analyticsEvents')
    trackMatchLatency({ rttMedianMs: 40, rttP95Ms: 120, desyncCount: 1, rubberBandEvents: 0 })
    expect(mockGA.addDesignEvent).not.toHaveBeenCalled()
  })

  test('trackDisconnect does not call any GA methods', async () => {
    const { trackDisconnect } = await import('./analyticsEvents')
    trackDisconnect({ reason: 'timeout', timeSinceMatchStartSec: 90 })
    expect(mockGA.addDesignEvent).not.toHaveBeenCalled()
  })

  test('initAnalytics returns false when consent is denied', async () => {
    localStorage.setItem('hn_analytics_consent', 'denied')
    process.env.VITE_GA_GAME_KEY = 'test_game_key'
    process.env.VITE_GA_SECRET_KEY = 'test_secret_key'
    const { initAnalytics } = await import('./analytics')
    expect(initAnalytics()).toBe(false)
    expect(mockGA.initialize).not.toHaveBeenCalled()
  })

  test('initAnalytics returns false when consent is unset', async () => {
    localStorage.clear()
    process.env.VITE_GA_GAME_KEY = 'test_game_key'
    process.env.VITE_GA_SECRET_KEY = 'test_secret_key'
    const { initAnalytics } = await import('./analytics')
    expect(initAnalytics()).toBe(false)
    expect(mockGA.initialize).not.toHaveBeenCalled()
  })

  test('initAnalytics returns false when keys are missing but consent is granted', async () => {
    localStorage.setItem('hn_analytics_consent', 'granted')
    delete process.env.VITE_GA_GAME_KEY
    delete process.env.VITE_GA_SECRET_KEY
    const { initAnalytics } = await import('./analytics')
    expect(initAnalytics()).toBe(false)
    expect(mockGA.initialize).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Phase 2: Initialize the real analytics module
// After this block, isAnalyticsReady() returns true for all subsequent tests.
// ---------------------------------------------------------------------------

describe('analytics initialization (enables event dispatch)', () => {
  test('initAnalytics returns true with consent + keys', async () => {
    localStorage.clear()
    localStorage.setItem('hn_analytics_consent', 'granted')
    process.env.VITE_GA_GAME_KEY = 'test_game_key'
    process.env.VITE_GA_SECRET_KEY = 'test_secret_key'
    mockGA.configureBuild.mockClear()
    mockGA.initialize.mockClear()

    const { initAnalytics, isAnalyticsReady } = await import('./analytics')
    const result = initAnalytics()

    expect(result).toBe(true)
    expect(isAnalyticsReady()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Phase 3: Event dispatch tests — analytics IS initialized
// ---------------------------------------------------------------------------

describe('trackRunStart', () => {
  beforeEach(() => clearGA())

  test('fires design event with correct hierarchy when mode is singleplayer', async () => {
    const { trackRunStart } = await import('./analyticsEvents')
    trackRunStart({ character: 'sheriff', seed: 12345, mode: 'singleplayer' })
    expect(mockGA.addDesignEvent).toHaveBeenCalledWith('run:start:singleplayer:sheriff', 12345)
  })

  test('fires design event with correct hierarchy when mode is multiplayer', async () => {
    const { trackRunStart } = await import('./analyticsEvents')
    trackRunStart({ character: 'gunslinger', seed: 99, mode: 'multiplayer' })
    expect(mockGA.addDesignEvent).toHaveBeenCalledWith('run:start:multiplayer:gunslinger', 99)
  })

  test('design event value is the numeric seed', async () => {
    const { trackRunStart } = await import('./analyticsEvents')
    const seed = 777
    trackRunStart({ character: 'sheriff', seed, mode: 'singleplayer' })
    const [, value] = mockGA.addDesignEvent.mock.calls[0]!
    expect(typeof value).toBe('number')
    expect(value).toBe(seed)
  })

  test('fires progression event with EGAProgressionStatus.Start (value = 1)', async () => {
    const { trackRunStart } = await import('./analyticsEvents')
    trackRunStart({ character: 'sheriff', seed: 1, mode: 'singleplayer' })
    expect(mockGA.addProgressionEvent).toHaveBeenCalledWith(
      mockGA.EGAProgressionStatus.Start,
      'run',
      'sheriff',
      'singleplayer',
    )
    const [status] = mockGA.addProgressionEvent.mock.calls[0]!
    expect(status).toBe(1)
  })
})

describe('trackStageComplete', () => {
  beforeEach(() => clearGA())

  test('fires progression event with EGAProgressionStatus.Complete (value = 2)', async () => {
    const { trackStageComplete } = await import('./analyticsEvents')
    trackStageComplete({
      character: 'sheriff',
      stageNumber: 2,
      waveReached: 5,
      timeSec: 180,
      upgradesTaken: 3,
      killCount: 75,
      goldCollected: 300,
    })
    const [status] = mockGA.addProgressionEvent.mock.calls[0]!
    expect(status).toBe(mockGA.EGAProgressionStatus.Complete)
  })

  test('includes stage number in progression event', async () => {
    const { trackStageComplete } = await import('./analyticsEvents')
    trackStageComplete({
      character: 'sheriff',
      stageNumber: 3,
      waveReached: 4,
      timeSec: 90,
      upgradesTaken: 1,
      killCount: 30,
      goldCollected: 100,
    })
    expect(mockGA.addProgressionEvent).toHaveBeenCalledWith(
      mockGA.EGAProgressionStatus.Complete,
      'run',
      'sheriff',
      'stage_3',
      30,
    )
  })

  test('fires three design events for time, upgrades, and gold', async () => {
    const { trackStageComplete } = await import('./analyticsEvents')
    trackStageComplete({
      character: 'sheriff',
      stageNumber: 1,
      waveReached: 3,
      timeSec: 120.5,
      upgradesTaken: 2,
      killCount: 50,
      goldCollected: 250,
    })
    expect(mockGA.addDesignEvent).toHaveBeenCalledTimes(3)
    expect(mockGA.addDesignEvent).toHaveBeenCalledWith('stage:complete:1:time', 120.5)
    expect(mockGA.addDesignEvent).toHaveBeenCalledWith('stage:complete:1:upgrades', 2)
    expect(mockGA.addDesignEvent).toHaveBeenCalledWith('stage:complete:1:gold', 250)
  })

  test('design event values are all numeric', async () => {
    const { trackStageComplete } = await import('./analyticsEvents')
    trackStageComplete({
      character: 'sheriff',
      stageNumber: 1,
      waveReached: 2,
      timeSec: 60,
      upgradesTaken: 1,
      killCount: 20,
      goldCollected: 80,
    })
    for (const call of mockGA.addDesignEvent.mock.calls) {
      const [, value] = call
      expect(typeof value).toBe('number')
    }
  })
})

describe('trackPlayerDeath', () => {
  beforeEach(() => clearGA())

  test('fires progression event with EGAProgressionStatus.Fail (value = 3)', async () => {
    const { trackPlayerDeath } = await import('./analyticsEvents')
    trackPlayerDeath({
      character: 'sheriff',
      stageNumber: 1,
      waveNumber: 2,
      timeSurvivedSec: 45,
      killCount: 15,
    })
    const [status] = mockGA.addProgressionEvent.mock.calls[0]!
    expect(status).toBe(mockGA.EGAProgressionStatus.Fail)
  })

  test('includes stage and wave numbers in event hierarchy', async () => {
    const { trackPlayerDeath } = await import('./analyticsEvents')
    trackPlayerDeath({
      character: 'sheriff',
      stageNumber: 2,
      waveNumber: 3,
      timeSurvivedSec: 90,
      killCount: 30,
    })
    expect(mockGA.addProgressionEvent).toHaveBeenCalledWith(
      mockGA.EGAProgressionStatus.Fail,
      'run',
      'sheriff',
      'stage_2',
      30,
    )
    expect(mockGA.addDesignEvent).toHaveBeenCalledWith('death:stage_2:wave_3:time', 90)
  })

  test('design event value is numeric time', async () => {
    const { trackPlayerDeath } = await import('./analyticsEvents')
    trackPlayerDeath({
      character: 'sheriff',
      stageNumber: 1,
      waveNumber: 1,
      timeSurvivedSec: 30.75,
      killCount: 5,
    })
    const [, value] = mockGA.addDesignEvent.mock.calls[0]!
    expect(typeof value).toBe('number')
    expect(value).toBe(30.75)
  })
})

describe('trackRunComplete — outcome mapping', () => {
  beforeEach(() => clearGA())

  test('victory maps to EGAProgressionStatus.Complete', async () => {
    const { trackRunComplete } = await import('./analyticsEvents')
    trackRunComplete({
      character: 'sheriff', totalTimeSec: 600, stagesCleared: 3,
      killCount: 200, goldCollected: 800, outcome: 'victory',
    })
    const [status] = mockGA.addProgressionEvent.mock.calls[0]!
    expect(status).toBe(mockGA.EGAProgressionStatus.Complete)
  })

  test('defeat maps to EGAProgressionStatus.Fail', async () => {
    const { trackRunComplete } = await import('./analyticsEvents')
    trackRunComplete({
      character: 'sheriff', totalTimeSec: 200, stagesCleared: 1,
      killCount: 50, goldCollected: 100, outcome: 'defeat',
    })
    const [status] = mockGA.addProgressionEvent.mock.calls[0]!
    expect(status).toBe(mockGA.EGAProgressionStatus.Fail)
  })

  test('mutual_kill maps to EGAProgressionStatus.Fail', async () => {
    const { trackRunComplete } = await import('./analyticsEvents')
    trackRunComplete({
      character: 'sheriff', totalTimeSec: 350, stagesCleared: 2,
      killCount: 80, goldCollected: 300, outcome: 'mutual_kill',
    })
    const [status] = mockGA.addProgressionEvent.mock.calls[0]!
    expect(status).toBe(mockGA.EGAProgressionStatus.Fail)
  })

  test('fires three design events with correct outcome in hierarchy', async () => {
    const { trackRunComplete } = await import('./analyticsEvents')
    trackRunComplete({
      character: 'sheriff', totalTimeSec: 400, stagesCleared: 2,
      killCount: 100, goldCollected: 400, outcome: 'victory',
    })
    expect(mockGA.addDesignEvent).toHaveBeenCalledTimes(3)
    expect(mockGA.addDesignEvent).toHaveBeenCalledWith('run:victory:time', 400)
    expect(mockGA.addDesignEvent).toHaveBeenCalledWith('run:victory:gold', 400)
    expect(mockGA.addDesignEvent).toHaveBeenCalledWith('run:victory:stages', 2)
  })
})

describe('trackUpgradeChosen', () => {
  beforeEach(() => clearGA())

  test('fires design event with character and nodeId in hierarchy', async () => {
    const { trackUpgradeChosen } = await import('./analyticsEvents')
    trackUpgradeChosen({ nodeId: 'quick_draw', character: 'sheriff', stageNumber: 1, level: 3 })
    expect(mockGA.addDesignEvent).toHaveBeenCalledWith('upgrade:sheriff:quick_draw', 3)
  })

  test('design event value is the numeric level', async () => {
    const { trackUpgradeChosen } = await import('./analyticsEvents')
    trackUpgradeChosen({ nodeId: 'iron_will', character: 'gunslinger', stageNumber: 2, level: 5 })
    const [, value] = mockGA.addDesignEvent.mock.calls[0]!
    expect(typeof value).toBe('number')
    expect(value).toBe(5)
  })
})

describe('trackBossEncounter', () => {
  beforeEach(() => clearGA())

  test('fires design event with boss name and result in hierarchy', async () => {
    const { trackBossEncounter } = await import('./analyticsEvents')
    trackBossEncounter({ bossName: 'the_outlaw', stageNumber: 1, result: 'victory', timeSec: 42 })
    expect(mockGA.addDesignEvent).toHaveBeenCalledWith('boss:the_outlaw:victory', 42)
  })

  test('defeat result appears correctly in hierarchy', async () => {
    const { trackBossEncounter } = await import('./analyticsEvents')
    trackBossEncounter({ bossName: 'the_outlaw', stageNumber: 1, result: 'defeat', timeSec: 15 })
    expect(mockGA.addDesignEvent).toHaveBeenCalledWith('boss:the_outlaw:defeat', 15)
  })

  test('design event value is the numeric time', async () => {
    const { trackBossEncounter } = await import('./analyticsEvents')
    trackBossEncounter({ bossName: 'boss', stageNumber: 1, result: 'victory', timeSec: 30.5 })
    const [, value] = mockGA.addDesignEvent.mock.calls[0]!
    expect(typeof value).toBe('number')
    expect(value).toBe(30.5)
  })
})

describe('trackItemAcquired', () => {
  beforeEach(() => clearGA())

  test('fires design event with source and itemName in hierarchy', async () => {
    const { trackItemAcquired } = await import('./analyticsEvents')
    trackItemAcquired({ itemId: 1, itemName: 'double_barrel', source: 'visitor', stageNumber: 2 })
    expect(mockGA.addDesignEvent).toHaveBeenCalledWith('item:visitor:double_barrel', 2)
  })

  test('design event value is the numeric stageNumber', async () => {
    const { trackItemAcquired } = await import('./analyticsEvents')
    trackItemAcquired({ itemId: 3, itemName: 'boots', source: 'stash', stageNumber: 3 })
    const [, value] = mockGA.addDesignEvent.mock.calls[0]!
    expect(typeof value).toBe('number')
    expect(value).toBe(3)
  })

  test('all source types are reflected in the hierarchy', async () => {
    const { trackItemAcquired } = await import('./analyticsEvents')
    const sources = ['visitor', 'stash', 'drop', 'draft'] as const
    for (const source of sources) {
      clearGA()
      trackItemAcquired({ itemId: 0, itemName: 'item', source, stageNumber: 1 })
      const [eventId] = mockGA.addDesignEvent.mock.calls[0]!
      expect(eventId).toBe(`item:${source}:item`)
    }
  })
})

describe('trackError', () => {
  beforeEach(() => clearGA())

  test('maps "warning" severity to EGAErrorSeverity.Warning (value = 1)', async () => {
    const { trackError } = await import('./analyticsEvents')
    trackError('warning', 'low priority warning')
    expect(mockGA.addErrorEvent).toHaveBeenCalledWith(
      mockGA.EGAErrorSeverity.Warning,
      'low priority warning',
    )
    const [severity] = mockGA.addErrorEvent.mock.calls[0]!
    expect(severity).toBe(1)
  })

  test('maps "error" severity to EGAErrorSeverity.Error (value = 2)', async () => {
    const { trackError } = await import('./analyticsEvents')
    trackError('error', 'an error occurred')
    const [severity] = mockGA.addErrorEvent.mock.calls[0]!
    expect(severity).toBe(mockGA.EGAErrorSeverity.Error)
  })

  test('maps "critical" severity to EGAErrorSeverity.Critical (value = 3)', async () => {
    const { trackError } = await import('./analyticsEvents')
    trackError('critical', 'critical failure')
    const [severity] = mockGA.addErrorEvent.mock.calls[0]!
    expect(severity).toBe(mockGA.EGAErrorSeverity.Critical)
  })

  test('truncates message to 256 characters', async () => {
    const { trackError } = await import('./analyticsEvents')
    const longMessage = 'x'.repeat(300)
    trackError('error', longMessage)
    const [, message] = mockGA.addErrorEvent.mock.calls[0]!
    expect((message as string).length).toBe(256)
    expect(message).toBe('x'.repeat(256))
  })

  test('passes short messages through unchanged', async () => {
    const { trackError } = await import('./analyticsEvents')
    trackError('error', 'short message')
    const [, message] = mockGA.addErrorEvent.mock.calls[0]!
    expect(message).toBe('short message')
  })
})

describe('trackMultiplayerMatch', () => {
  beforeEach(() => clearGA())

  test('fires design event with mode and player count in hierarchy', async () => {
    const { trackMultiplayerMatch } = await import('./analyticsEvents')
    trackMultiplayerMatch({ playerCount: 4, mode: 'quickplay' })
    expect(mockGA.addDesignEvent).toHaveBeenCalledWith(
      'multiplayer:match:quickplay:players_4',
    )
  })

  test('private mode appears in hierarchy', async () => {
    const { trackMultiplayerMatch } = await import('./analyticsEvents')
    trackMultiplayerMatch({ playerCount: 2, mode: 'private' })
    expect(mockGA.addDesignEvent).toHaveBeenCalledWith(
      'multiplayer:match:private:players_2',
    )
  })
})

describe('trackMatchLatency', () => {
  beforeEach(() => clearGA())

  test('always fires rtt_median and rtt_p95 events', async () => {
    const { trackMatchLatency } = await import('./analyticsEvents')
    trackMatchLatency({ rttMedianMs: 35, rttP95Ms: 110, desyncCount: 0, rubberBandEvents: 0 })
    expect(mockGA.addDesignEvent).toHaveBeenCalledWith('multiplayer:latency:rtt_median', 35)
    expect(mockGA.addDesignEvent).toHaveBeenCalledWith('multiplayer:latency:rtt_p95', 110)
    expect(mockGA.addDesignEvent).toHaveBeenCalledTimes(2)
  })

  test('fires desyncs event only when desyncCount > 0', async () => {
    const { trackMatchLatency } = await import('./analyticsEvents')
    trackMatchLatency({ rttMedianMs: 40, rttP95Ms: 120, desyncCount: 3, rubberBandEvents: 0 })
    expect(mockGA.addDesignEvent).toHaveBeenCalledWith('multiplayer:latency:desyncs', 3)
    expect(mockGA.addDesignEvent).toHaveBeenCalledTimes(3)
  })

  test('does not fire desyncs event when desyncCount is 0', async () => {
    const { trackMatchLatency } = await import('./analyticsEvents')
    trackMatchLatency({ rttMedianMs: 40, rttP95Ms: 120, desyncCount: 0, rubberBandEvents: 0 })
    const ids = mockGA.addDesignEvent.mock.calls.map(([id]) => id)
    expect(ids).not.toContain('multiplayer:latency:desyncs')
  })

  test('fires rubber_band event only when rubberBandEvents > 0', async () => {
    const { trackMatchLatency } = await import('./analyticsEvents')
    trackMatchLatency({ rttMedianMs: 40, rttP95Ms: 120, desyncCount: 0, rubberBandEvents: 5 })
    expect(mockGA.addDesignEvent).toHaveBeenCalledWith('multiplayer:latency:rubber_band', 5)
    expect(mockGA.addDesignEvent).toHaveBeenCalledTimes(3)
  })

  test('fires all four events when both counters are nonzero', async () => {
    const { trackMatchLatency } = await import('./analyticsEvents')
    trackMatchLatency({ rttMedianMs: 50, rttP95Ms: 200, desyncCount: 2, rubberBandEvents: 7 })
    expect(mockGA.addDesignEvent).toHaveBeenCalledTimes(4)
  })

  test('RTT values are numeric', async () => {
    const { trackMatchLatency } = await import('./analyticsEvents')
    trackMatchLatency({ rttMedianMs: 35.5, rttP95Ms: 110.2, desyncCount: 0, rubberBandEvents: 0 })
    for (const call of mockGA.addDesignEvent.mock.calls) {
      const [, value] = call
      expect(typeof value).toBe('number')
    }
  })
})

describe('trackDisconnect', () => {
  beforeEach(() => clearGA())

  test('fires design event with reason in hierarchy and numeric time as value', async () => {
    const { trackDisconnect } = await import('./analyticsEvents')
    trackDisconnect({ reason: 'timeout', timeSinceMatchStartSec: 90 })
    expect(mockGA.addDesignEvent).toHaveBeenCalledWith('multiplayer:disconnect:timeout', 90)
  })

  test('design event value is numeric', async () => {
    const { trackDisconnect } = await import('./analyticsEvents')
    trackDisconnect({ reason: 'host_left', timeSinceMatchStartSec: 45.5 })
    const [, value] = mockGA.addDesignEvent.mock.calls[0]!
    expect(typeof value).toBe('number')
  })
})
