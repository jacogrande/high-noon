import { describe, expect, test } from 'bun:test'
import { createGameWorld, type GameWorld } from '../world'
import { EnemyType } from '../components'
import { goldRewardSystem } from './goldReward'
import { addPlayer } from '../playerRegistry'
import { initUpgradeState } from '../upgrade'
import { PROSPECTOR } from '../content/characters/prospector'
import { SHERIFF } from '../content/characters/sheriff'

function queueReward(
  world: GameWorld,
  enemyType: number,
  killerPlayerEid: number | null,
  wasMelee: boolean,
): void {
  world.pendingGoldRewards.push({ enemyType, killerPlayerEid, wasMelee })
}

describe('goldRewardSystem', () => {
  test('awards stronger enemies more gold and clears queue', () => {
    const world = createGameWorld()
    queueReward(world, EnemyType.SWARMER, null, false)
    queueReward(world, EnemyType.BOOMSTICK, null, false)

    goldRewardSystem(world, 1 / 60)

    expect(world.goldCollected).toBeGreaterThan(0)
    expect(world.pendingGoldRewards).toHaveLength(0)
  })

  test('time scaling increases reward payout', () => {
    const early = createGameWorld()
    const late = createGameWorld()
    early.time = 0
    late.time = 15 * 60
    queueReward(early, EnemyType.CHARGER, null, false)
    queueReward(late, EnemyType.CHARGER, null, false)

    goldRewardSystem(early, 1 / 60)
    goldRewardSystem(late, 1 / 60)

    expect(late.goldCollected).toBeGreaterThan(early.goldCollected)
  })

  test('stage scaling increases reward payout', () => {
    const stage1 = createGameWorld()
    const stage3 = createGameWorld()
    stage1.run = {
      currentStage: 0,
      totalStages: 3,
      stages: [],
      completed: false,
      transition: 'none',
      transitionTimer: 0,
      pendingTilemap: null,
    }
    stage3.run = {
      currentStage: 2,
      totalStages: 3,
      stages: [],
      completed: false,
      transition: 'none',
      transitionTimer: 0,
      pendingTilemap: null,
    }
    queueReward(stage1, EnemyType.SHOOTER, null, false)
    queueReward(stage3, EnemyType.SHOOTER, null, false)

    goldRewardSystem(stage1, 1 / 60)
    goldRewardSystem(stage3, 1 / 60)

    expect(stage3.goldCollected).toBeGreaterThan(stage1.goldCollected)
  })

  test('prospector killer gains Gold Fever stacks from kill rewards', () => {
    const world = createGameWorld()
    const prospector = addPlayer(world, 'prospector', initUpgradeState(PROSPECTOR))
    const us = world.playerUpgradeStates.get(prospector)
    if (!us) throw new Error('Missing prospector upgrade state')

    queueReward(world, EnemyType.GRUNT, prospector, false)
    goldRewardSystem(world, 1 / 60)

    expect(us.goldFeverStacks).toBe(1)
    expect(us.goldFeverTimer).toBe(us.goldFeverDuration)
  })

  test('non-prospector killer does not gain Gold Fever stacks', () => {
    const world = createGameWorld()
    const sheriff = addPlayer(world, 'sheriff', initUpgradeState(SHERIFF))
    const us = world.playerUpgradeStates.get(sheriff)
    if (!us) throw new Error('Missing sheriff upgrade state')

    queueReward(world, EnemyType.GRUNT, sheriff, false)
    goldRewardSystem(world, 1 / 60)

    expect(us.goldFeverStacks).toBe(0)
  })
})
