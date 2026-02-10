import { describe, expect, test } from 'bun:test'
import {
  MULTIPLAYER_PRESENTATION_POLICY,
  SINGLEPLAYER_PRESENTATION_POLICY,
} from './PresentationPolicy'

describe('PresentationPolicy', () => {
  test('uses simulation hit-stop in singleplayer and render pause in multiplayer', () => {
    expect(SINGLEPLAYER_PRESENTATION_POLICY.playerHit.simHitStopSeconds).toBeGreaterThan(0)
    expect(SINGLEPLAYER_PRESENTATION_POLICY.playerHit.renderPauseSeconds).toBe(0)

    expect(MULTIPLAYER_PRESENTATION_POLICY.playerHit.simHitStopSeconds).toBe(0)
    expect(MULTIPLAYER_PRESENTATION_POLICY.playerHit.renderPauseSeconds).toBeGreaterThan(0)
  })

  test('keeps death sequence timing parity across modes', () => {
    expect(MULTIPLAYER_PRESENTATION_POLICY.death.enabled).toBe(true)
    expect(SINGLEPLAYER_PRESENTATION_POLICY.death.enabled).toBe(true)
    expect(MULTIPLAYER_PRESENTATION_POLICY.death.deathAnimDurationSeconds)
      .toBe(SINGLEPLAYER_PRESENTATION_POLICY.death.deathAnimDurationSeconds)
    expect(MULTIPLAYER_PRESENTATION_POLICY.death.fadeDurationSeconds)
      .toBe(SINGLEPLAYER_PRESENTATION_POLICY.death.fadeDurationSeconds)
  })

  test('allows spawn-pause debug toggle only in singleplayer', () => {
    expect(SINGLEPLAYER_PRESENTATION_POLICY.debugHotkeys.enableSpawnPauseToggle).toBe(true)
    expect(MULTIPLAYER_PRESENTATION_POLICY.debugHotkeys.enableSpawnPauseToggle).toBe(false)
  })
})
