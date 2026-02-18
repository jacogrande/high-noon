import { describe, expect, test } from 'bun:test'
import { createGameWorld } from '../world'
import { spawnPlayer } from '../prefabs'
import { SHERIFF } from '../content/characters'
import { HP_POTION_MAX_STACK } from '../content/hpPotion'
import { getUpgradeStateForPlayer, initUpgradeState } from '../upgrade'
import { itemPickupSystem } from './itemPickup'

describe('itemPickupSystem (HP potions)', () => {
  test('player picks up HP potion when under cap', () => {
    const world = createGameWorld(101)
    const playerEid = spawnPlayer(world, 100, 100)
    const state = getUpgradeStateForPlayer(world, playerEid)
    state.hpPotionCount = 0

    world.hpPotionPickups.push({
      id: world.nextHpPotionPickupId++,
      x: 100,
      y: 100,
      lifetime: 10,
      collected: false,
    })

    itemPickupSystem(world, 1 / 60)

    expect(state.hpPotionCount).toBe(1)
    expect(world.hpPotionPickups[0]?.collected).toBe(true)
  })

  test('full player does not consume potion; another player can pick it up', () => {
    const world = createGameWorld(102)
    const player1 = spawnPlayer(world, 100, 100, 0, initUpgradeState(SHERIFF))
    const player2 = spawnPlayer(world, 100, 100, 1, initUpgradeState(SHERIFF))
    const state1 = getUpgradeStateForPlayer(world, player1)
    const state2 = getUpgradeStateForPlayer(world, player2)
    state1.hpPotionCount = HP_POTION_MAX_STACK
    state2.hpPotionCount = 0

    world.hpPotionPickups.push({
      id: world.nextHpPotionPickupId++,
      x: 100,
      y: 100,
      lifetime: 10,
      collected: false,
    })

    itemPickupSystem(world, 1 / 60)

    expect(state1.hpPotionCount).toBe(HP_POTION_MAX_STACK)
    expect(state2.hpPotionCount).toBe(1)
    expect(world.hpPotionPickups[0]?.collected).toBe(true)
  })
})
