import { describe, expect, test } from 'bun:test'
import { getDeathSequencePhase } from './DeathSequencePresentation'
import { SINGLEPLAYER_PRESENTATION_POLICY } from './PresentationPolicy'

describe('DeathSequencePresentation', () => {
  test('death phases progress from animating to fading to game-over', () => {
    const policy = SINGLEPLAYER_PRESENTATION_POLICY.death
    const deathStart = 0
    const fadeStart = policy.deathAnimDurationSeconds + 0.01
    const gameOverStart = policy.deathAnimDurationSeconds + policy.fadeDurationSeconds + 0.01

    expect(getDeathSequencePhase(false, deathStart, policy)).toBe('alive')
    expect(getDeathSequencePhase(true, deathStart, policy)).toBe('animating')
    expect(getDeathSequencePhase(true, fadeStart, policy)).toBe('fading')
    expect(getDeathSequencePhase(true, gameOverStart, policy)).toBe('game-over')
  })
})
