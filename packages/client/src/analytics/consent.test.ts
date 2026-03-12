/**
 * Consent Persistence Utility Tests
 *
 * Tests for localStorage-backed consent read/write in consent.ts.
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import { getConsent, setConsent } from './consent'

// ---------------------------------------------------------------------------
// localStorage stub (bun:test does not provide a DOM environment, so we
// create a minimal in-memory implementation that mirrors the Web Storage API)
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
// Tests
// ---------------------------------------------------------------------------

describe('getConsent', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('returns "unset" when localStorage is empty', () => {
    expect(getConsent()).toBe('unset')
  })

  test('returns "granted" after setConsent("granted")', () => {
    setConsent('granted')
    expect(getConsent()).toBe('granted')
  })

  test('returns "denied" after setConsent("denied")', () => {
    setConsent('denied')
    expect(getConsent()).toBe('denied')
  })

  test('returns "unset" for an arbitrary corrupted value', () => {
    localStorage.setItem('hn_analytics_consent', 'yes_please')
    expect(getConsent()).toBe('unset')
  })

  test('returns "unset" for an empty string stored in the key', () => {
    localStorage.setItem('hn_analytics_consent', '')
    expect(getConsent()).toBe('unset')
  })

  test('returns "unset" for a numeric string stored in the key', () => {
    localStorage.setItem('hn_analytics_consent', '1')
    expect(getConsent()).toBe('unset')
  })

  test('returns "unset" for a JSON object stored in the key', () => {
    localStorage.setItem('hn_analytics_consent', '{"consent":true}')
    expect(getConsent()).toBe('unset')
  })
})

describe('setConsent', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('overwrites a previous "granted" value with "denied"', () => {
    setConsent('granted')
    expect(getConsent()).toBe('granted')

    setConsent('denied')
    expect(getConsent()).toBe('denied')
  })

  test('overwrites a previous "denied" value with "granted"', () => {
    setConsent('denied')
    expect(getConsent()).toBe('denied')

    setConsent('granted')
    expect(getConsent()).toBe('granted')
  })

  test('is idempotent — setting the same value twice is stable', () => {
    setConsent('granted')
    setConsent('granted')
    expect(getConsent()).toBe('granted')
  })
})
