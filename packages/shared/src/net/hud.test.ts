import { describe, expect, test } from 'bun:test'
import { deriveAbilityHudState, type AbilityHudStats } from './hud'

const baseStats: AbilityHudStats = {
  showdownCooldown: 8,
  showdownDuration: 5,
  dynamiteCooldown: 6,
  dynamiteFuse: 2,
  dynamiteCooking: false,
  dynamiteCookTimer: 0,
}

describe('deriveAbilityHudState', () => {
  test('sheriff uses showdown runtime state', () => {
    const hud = deriveAbilityHudState('sheriff', baseStats, {
      showdownActive: true,
      showdownCooldown: 2.5,
      showdownDuration: 1.2,
    })

    expect(hud.abilityName).toBe('SHOWDOWN')
    expect(hud.abilityActive).toBe(true)
    expect(hud.abilityCooldown).toBeCloseTo(2.5)
    expect(hud.abilityCooldownMax).toBeCloseTo(8)
    expect(hud.abilityTimeLeft).toBeCloseTo(1.2)
    expect(hud.abilityDurationMax).toBeCloseTo(5)
    expect(hud.showdownCooldown).toBeCloseTo(hud.abilityCooldown)
  })

  test('undertaker ability label maps to LAST RITES', () => {
    const hud = deriveAbilityHudState('undertaker', baseStats)
    expect(hud.abilityName).toBe('LAST RITES')
    expect(hud.abilityCooldownMax).toBeCloseTo(8)
    expect(hud.abilityDurationMax).toBeCloseTo(5)
  })

  test('prospector uses dynamite cook state and server cooldown channel', () => {
    const hud = deriveAbilityHudState(
      'prospector',
      {
        ...baseStats,
        dynamiteCooking: true,
        dynamiteCookTimer: 0.75,
      },
      {
        showdownCooldown: 1.25,
      },
    )

    expect(hud.abilityName).toBe('DYNAMITE')
    expect(hud.abilityActive).toBe(true)
    expect(hud.abilityCooldown).toBeCloseTo(1.25)
    expect(hud.abilityCooldownMax).toBeCloseTo(6)
    expect(hud.abilityTimeLeft).toBeCloseTo(1.25)
    expect(hud.abilityDurationMax).toBeCloseTo(2)
  })

  test('prospector fuse timer clamps at zero', () => {
    const hud = deriveAbilityHudState('prospector', {
      ...baseStats,
      dynamiteCooking: true,
      dynamiteCookTimer: 99,
    })

    expect(hud.abilityTimeLeft).toBe(0)
  })
})
