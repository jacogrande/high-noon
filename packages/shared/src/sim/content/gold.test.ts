import { describe, expect, test } from 'bun:test'
import { EnemyType } from '../components'
import {
  GOLD_MELEE_BONUS_MULTIPLIER,
  getGoldDifficultyCoefficient,
  getGoldRewardForKill,
} from './gold'

describe('gold pacing', () => {
  test('difficulty coefficient increases with elapsed time', () => {
    const early = getGoldDifficultyCoefficient({ time: 0, run: null } as any)
    const later = getGoldDifficultyCoefficient({ time: 10 * 60, run: null } as any)
    expect(later).toBeGreaterThan(early)
  })

  test('difficulty coefficient increases by stage', () => {
    const stage1 = getGoldDifficultyCoefficient({
      time: 0,
      run: { currentStage: 0, totalStages: 3, completed: false },
    } as any)
    const stage3 = getGoldDifficultyCoefficient({
      time: 0,
      run: { currentStage: 2, totalStages: 3, completed: false },
    } as any)
    expect(stage3).toBeGreaterThan(stage1)
  })

  test('stronger enemies grant more gold than fodder', () => {
    const world = { time: 0, run: null } as any
    const swarmer = getGoldRewardForKill(world, EnemyType.SWARMER, false)
    const charger = getGoldRewardForKill(world, EnemyType.CHARGER, false)
    const boomstick = getGoldRewardForKill(world, EnemyType.BOOMSTICK, false)
    expect(charger).toBeGreaterThan(swarmer)
    expect(boomstick).toBeGreaterThan(charger)
  })

  test('melee kill bonus applies multiplicatively', () => {
    const world = { time: 0, run: null } as any
    const ranged = getGoldRewardForKill(world, EnemyType.GRUNT, false)
    const melee = getGoldRewardForKill(world, EnemyType.GRUNT, true)
    expect(melee).toBe(Math.round(ranged * GOLD_MELEE_BONUS_MULTIPLIER))
  })
})
