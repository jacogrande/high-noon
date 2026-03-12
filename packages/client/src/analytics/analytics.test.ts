/**
 * Analytics Singleton Tests
 *
 * Tests for the analytics.ts module: initialization gating, idempotency,
 * and enable/disable toggle.
 *
 * ---- bun:test module isolation note ----
 * All test files in a bun test run share a single process and module cache.
 * Because analytics.ts has a module-level `initialized` flag, any test file
 * that successfully calls initAnalytics() leaves that flag permanently true
 * for every subsequent file in the same run.
 *
 * analyticsEvents.test.ts handles the pre-init guard tests AND performs the
 * first successful initAnalytics() call (it must run the guard tests before
 * anything else initializes the module).  By the time this file runs, the
 * module is already initialized.
 *
 * Therefore this file focuses on:
 *   1. The post-init idempotency contract (double-init is a no-op).
 *   2. The enable/disable toggle via setAnalyticsEnabled().
 *   3. The initialization gate logic — tested by temporarily manipulating
 *      consent and keys and verifying GA.initialize() is NOT called again
 *      (because the idempotency guard fires first, returning early).
 *
 * The pre-init gate tests ("returns false when consent is unset/denied",
 * "returns false when keys are missing") live in analyticsEvents.test.ts
 * Phase 1, where the module is guaranteed to be uninitialized.
 */

import { describe, test, expect, mock, beforeEach, beforeAll } from 'bun:test'

// ---------------------------------------------------------------------------
// localStorage stub
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
  mockGA.configureBuild.mockClear()
  mockGA.initialize.mockClear()
  mockGA.setEnabledEventSubmission.mockClear()
  mockGA.addDesignEvent.mockClear()
  mockGA.addProgressionEvent.mockClear()
  mockGA.addErrorEvent.mockClear()
}

// ---------------------------------------------------------------------------
// Ensure analytics is initialized before the tests in this file run.
// In the full test suite, analyticsEvents.test.ts runs first and initializes
// analytics.  When this file runs alone, we perform the initialization here.
// ---------------------------------------------------------------------------

beforeAll(async () => {
  localStorage.clear()
  localStorage.setItem('hn_analytics_consent', 'granted')
  process.env.VITE_GA_GAME_KEY = 'test_game_key'
  process.env.VITE_GA_SECRET_KEY = 'test_secret_key'
  const { initAnalytics } = await import('./analytics')
  initAnalytics() // idempotent: safe to call even if already initialized
  clearGA() // reset mock call counts so tests start clean
})

// ---------------------------------------------------------------------------
// Idempotency — module-level `initialized` flag is true after the beforeAll above
// ---------------------------------------------------------------------------

describe('initAnalytics — idempotency (double-init is a no-op)', () => {
  beforeEach(() => {
    // Arrange valid consent + keys so that, if the guard were bypassed,
    // initialize() would get called.  The idempotency guard must prevent it.
    localStorage.clear()
    localStorage.setItem('hn_analytics_consent', 'granted')
    process.env.VITE_GA_GAME_KEY = 'test_game_key'
    process.env.VITE_GA_SECRET_KEY = 'test_secret_key'
    clearGA()
  })

  test('returns true immediately without calling initialize a second time', async () => {
    // Arrange — module is already initialized from analyticsEvents.test.ts Phase 2
    const { initAnalytics, isAnalyticsReady } = await import('./analytics')

    // Verify precondition: module is initialized
    expect(isAnalyticsReady()).toBe(true)

    // Act
    const result = initAnalytics()

    // Assert — short-circuits without calling GA SDK again
    expect(result).toBe(true)
    expect(mockGA.initialize).not.toHaveBeenCalled()
    expect(mockGA.configureBuild).not.toHaveBeenCalled()
  })

  test('returns true even when consent is subsequently revoked', async () => {
    // Arrange — revoke consent after initialization
    localStorage.setItem('hn_analytics_consent', 'denied')
    const { initAnalytics } = await import('./analytics')

    // Act — still returns true because initialized flag is set
    const result = initAnalytics()

    // Assert — idempotency trumps consent check
    expect(result).toBe(true)
    expect(mockGA.initialize).not.toHaveBeenCalled()
  })

  test('returns true even when keys are removed after init', async () => {
    // Arrange — remove keys after initialization
    delete process.env.VITE_GA_GAME_KEY
    delete process.env.VITE_GA_SECRET_KEY
    const { initAnalytics } = await import('./analytics')

    // Act
    const result = initAnalytics()

    // Assert — idempotency trumps key check
    expect(result).toBe(true)
    expect(mockGA.initialize).not.toHaveBeenCalled()
  })
})

describe('isAnalyticsReady', () => {
  test('returns true after successful initialization', async () => {
    const { isAnalyticsReady } = await import('./analytics')
    expect(isAnalyticsReady()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// setAnalyticsEnabled
// ---------------------------------------------------------------------------

describe('setAnalyticsEnabled', () => {
  beforeEach(() => {
    clearGA()
    // Restore valid consent + keys for re-init path
    localStorage.setItem('hn_analytics_consent', 'granted')
    process.env.VITE_GA_GAME_KEY = 'test_game_key'
    process.env.VITE_GA_SECRET_KEY = 'test_secret_key'
  })

  test('setAnalyticsEnabled(false) calls setEnabledEventSubmission(false)', async () => {
    // Arrange
    const { setAnalyticsEnabled } = await import('./analytics')

    // Act
    setAnalyticsEnabled(false)

    // Assert
    expect(mockGA.setEnabledEventSubmission).toHaveBeenCalledWith(false)
    expect(mockGA.setEnabledEventSubmission).toHaveBeenCalledTimes(1)
  })

  test('setAnalyticsEnabled(true) calls setEnabledEventSubmission(true) when already initialized', async () => {
    // Arrange — disable first, then re-enable
    const { setAnalyticsEnabled } = await import('./analytics')
    setAnalyticsEnabled(false)
    clearGA()

    // Act
    setAnalyticsEnabled(true)

    // Assert — since initialized is true, calls setEnabledEventSubmission rather than initialize
    expect(mockGA.setEnabledEventSubmission).toHaveBeenCalledWith(true)
    expect(mockGA.setEnabledEventSubmission).toHaveBeenCalledTimes(1)
    expect(mockGA.initialize).not.toHaveBeenCalled()
  })

  test('setAnalyticsEnabled(true) does not call initialize again', async () => {
    // Act
    const { setAnalyticsEnabled } = await import('./analytics')
    setAnalyticsEnabled(true)

    // Assert
    expect(mockGA.initialize).not.toHaveBeenCalled()
  })

  test('setAnalyticsEnabled(false) updates localStorage consent to "denied"', async () => {
    // Arrange
    const { setAnalyticsEnabled } = await import('./analytics')

    // Act
    setAnalyticsEnabled(false)

    // Assert — consent is persisted to localStorage
    expect(localStorage.getItem('hn_analytics_consent')).toBe('denied')
  })

  test('setAnalyticsEnabled(true) updates localStorage consent to "granted"', async () => {
    // Arrange — start with denied consent
    localStorage.setItem('hn_analytics_consent', 'denied')
    const { setAnalyticsEnabled } = await import('./analytics')

    // Act
    setAnalyticsEnabled(true)

    // Assert
    expect(localStorage.getItem('hn_analytics_consent')).toBe('granted')
  })
})
