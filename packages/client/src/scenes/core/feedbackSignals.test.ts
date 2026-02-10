import { describe, expect, test } from 'bun:test'
import { Button, createInputState } from '@high-noon/shared'
import {
  didCompleteReload,
  didFireRound,
  didStartReload,
  didTakeDamageFromHp,
  didTakeDamageFromIframes,
  shouldTriggerDryFire,
} from './feedbackSignals'

describe('feedbackSignals', () => {
  test('detects damage transition by iframes', () => {
    expect(didTakeDamageFromIframes(0, 0)).toBe(false)
    expect(didTakeDamageFromIframes(0, 0.2)).toBe(true)
    expect(didTakeDamageFromIframes(0.1, 0.2)).toBe(false)
  })

  test('detects damage transition by hp drop', () => {
    expect(didTakeDamageFromHp(-1, 5)).toBe(false)
    expect(didTakeDamageFromHp(5, 5)).toBe(false)
    expect(didTakeDamageFromHp(5, 4)).toBe(true)
  })

  test('detects fire and reload transitions', () => {
    expect(didFireRound(6, 5)).toBe(true)
    expect(didFireRound(6, 6)).toBe(false)
    expect(didStartReload(0, 1)).toBe(true)
    expect(didStartReload(1, 1)).toBe(false)
    expect(didCompleteReload(1, 0)).toBe(true)
    expect(didCompleteReload(0, 0)).toBe(false)
  })

  test('dry fire requires shoot input, empty cylinder, no reload, no cooldown', () => {
    const input = createInputState()
    expect(shouldTriggerDryFire(0, 0, input, 0)).toBe(false)

    input.buttons |= Button.SHOOT
    expect(shouldTriggerDryFire(1, 0, input, 0)).toBe(false)
    expect(shouldTriggerDryFire(0, 1, input, 0)).toBe(false)
    expect(shouldTriggerDryFire(0, 0, input, 0.1)).toBe(false)
    expect(shouldTriggerDryFire(0, 0, input, 0)).toBe(true)
  })
})
