import { describe, expect, test } from 'bun:test'
import { PLAYER_HP } from './player'
import { PISTOL_BULLET_DAMAGE, SAWED_OFF_BULLET_DAMAGE, PICKAXE_SWING_DAMAGE } from './weapons'
import {
  SWARMER_HP,
  GRUNT_HP,
  GOBLIN_ROGUE_HP,
  GOBLIN_BARBARIAN_HP,
  SHOOTER_HP,
  CHARGER_HP,
  BOOMSTICK_HP,
  SWARMER_DAMAGE,
  GOBLIN_ROGUE_DAMAGE,
  GRUNT_DAMAGE,
  SHOOTER_DAMAGE,
  GOBLIN_BARBARIAN_DAMAGE,
  CHARGER_DAMAGE,
  BOOMSTICK_DAMAGE,
} from './enemies'

describe('combat balance baselines', () => {
  test('player starts at 40 HP', () => {
    expect(PLAYER_HP).toBe(40)
  })

  test('fodder enemies are not one-tap at game start', () => {
    const baselineSingleHit = Math.max(
      PISTOL_BULLET_DAMAGE,
      SAWED_OFF_BULLET_DAMAGE,
      PICKAXE_SWING_DAMAGE,
    )

    expect(SWARMER_HP).toBeGreaterThan(baselineSingleHit)
    expect(GOBLIN_ROGUE_HP).toBeGreaterThan(baselineSingleHit)
    expect(GRUNT_HP).toBeGreaterThan(baselineSingleHit)
    expect(GOBLIN_BARBARIAN_HP).toBeGreaterThan(baselineSingleHit)
  })

  test('enemy damage spans a wide range across types', () => {
    const damages = [
      SWARMER_DAMAGE,
      GOBLIN_ROGUE_DAMAGE,
      GRUNT_DAMAGE,
      SHOOTER_DAMAGE,
      GOBLIN_BARBARIAN_DAMAGE,
      CHARGER_DAMAGE,
      BOOMSTICK_DAMAGE,
    ]

    const minDamage = Math.min(...damages)
    const maxDamage = Math.max(...damages)

    expect(minDamage).toBeGreaterThan(0)
    expect(maxDamage).toBeGreaterThanOrEqual(minDamage * 4)
  })

  test('enemy health varies strongly by type', () => {
    const healthPool = [
      SWARMER_HP,
      GOBLIN_ROGUE_HP,
      GRUNT_HP,
      SHOOTER_HP,
      GOBLIN_BARBARIAN_HP,
      CHARGER_HP,
      BOOMSTICK_HP,
    ]

    const minHealth = Math.min(...healthPool)
    const maxHealth = Math.max(...healthPool)

    expect(maxHealth).toBeGreaterThanOrEqual(minHealth * 10)
    expect(BOOMSTICK_HP).toBeGreaterThan(CHARGER_HP)
  })
})
