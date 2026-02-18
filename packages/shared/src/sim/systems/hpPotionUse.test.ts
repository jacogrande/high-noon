import { describe, expect, test } from 'bun:test'
import { addComponent } from 'bitecs'
import { Button, createInputState } from '../../net/input'
import { Dead, Health } from '../components'
import { SHERIFF } from '../content/characters'
import { spawnPlayer } from '../prefabs'
import { initUpgradeState } from '../upgrade'
import { createGameWorld } from '../world'
import { hpPotionUseSystem } from './hpPotionUse'

function runPotionTick(
  world: ReturnType<typeof createGameWorld>,
  inputs: Array<{ playerEid: number; buttons: number }>,
): void {
  for (const input of inputs) {
    world.playerInputs.set(input.playerEid, {
      ...createInputState(),
      buttons: input.buttons,
    })
  }
  hpPotionUseSystem(world, 1 / 60)
  world.playerInputs.clear()
}

describe('hpPotionUseSystem', () => {
  test('consumes one potion and heals instantly', () => {
    const world = createGameWorld(123)
    const playerEid = spawnPlayer(world, 100, 100)
    const state = world.playerUpgradeStates.get(playerEid)!
    state.hpPotionCount = 3
    Health.max[playerEid] = 100
    Health.current[playerEid] = 40

    let hookCalls = 0
    world.hooks.register('onHealthChanged', 'test_hp_potion_use', (_w, eid, oldHP, newHP) => {
      if (eid !== playerEid) return
      hookCalls++
      expect(oldHP).toBe(40)
      expect(newHP).toBe(60)
    })

    runPotionTick(world, [{ playerEid, buttons: Button.USE_HP_POTION }])

    expect(state.hpPotionCount).toBe(2)
    expect(Health.current[playerEid]).toBe(60)
    expect(hookCalls).toBe(1)
  })

  test('does not consume potion at full HP', () => {
    const world = createGameWorld(124)
    const playerEid = spawnPlayer(world, 100, 100)
    const state = world.playerUpgradeStates.get(playerEid)!
    state.hpPotionCount = 2
    Health.max[playerEid] = 80
    Health.current[playerEid] = 80

    runPotionTick(world, [{ playerEid, buttons: Button.USE_HP_POTION }])

    expect(state.hpPotionCount).toBe(2)
    expect(Health.current[playerEid]).toBe(80)
  })

  test('does not consume when out of potions', () => {
    const world = createGameWorld(125)
    const playerEid = spawnPlayer(world, 100, 100)
    const state = world.playerUpgradeStates.get(playerEid)!
    state.hpPotionCount = 0
    Health.max[playerEid] = 80
    Health.current[playerEid] = 30

    runPotionTick(world, [{ playerEid, buttons: Button.USE_HP_POTION }])

    expect(state.hpPotionCount).toBe(0)
    expect(Health.current[playerEid]).toBe(30)
  })

  test('does not consume when dead', () => {
    const world = createGameWorld(126)
    const playerEid = spawnPlayer(world, 100, 100)
    const state = world.playerUpgradeStates.get(playerEid)!
    state.hpPotionCount = 1
    Health.max[playerEid] = 80
    Health.current[playerEid] = 30
    addComponent(world, Dead, playerEid)

    runPotionTick(world, [{ playerEid, buttons: Button.USE_HP_POTION }])

    expect(state.hpPotionCount).toBe(1)
    expect(Health.current[playerEid]).toBe(30)
  })

  test('is scoped per player', () => {
    const world = createGameWorld(127)
    const player1 = spawnPlayer(world, 100, 100, 0, initUpgradeState(SHERIFF))
    const player2 = spawnPlayer(world, 160, 100, 1, initUpgradeState(SHERIFF))
    const state1 = world.playerUpgradeStates.get(player1)!
    const state2 = world.playerUpgradeStates.get(player2)!
    state1.hpPotionCount = 1
    state2.hpPotionCount = 2
    Health.max[player1] = 100
    Health.current[player1] = 70
    Health.max[player2] = 100
    Health.current[player2] = 60

    runPotionTick(world, [{ playerEid: player1, buttons: Button.USE_HP_POTION }])

    expect(state1.hpPotionCount).toBe(0)
    expect(Health.current[player1]).toBe(90)
    expect(state2.hpPotionCount).toBe(2)
    expect(Health.current[player2]).toBe(60)
  })

  test('consumes once per button press edge', () => {
    const world = createGameWorld(128)
    const playerEid = spawnPlayer(world, 100, 100)
    const state = world.playerUpgradeStates.get(playerEid)!
    state.hpPotionCount = 3
    Health.max[playerEid] = 100
    Health.current[playerEid] = 40

    runPotionTick(world, [{ playerEid, buttons: Button.USE_HP_POTION }])
    runPotionTick(world, [{ playerEid, buttons: Button.USE_HP_POTION }])

    expect(state.hpPotionCount).toBe(2)
    expect(Health.current[playerEid]).toBe(60)

    runPotionTick(world, [{ playerEid, buttons: 0 }])
    runPotionTick(world, [{ playerEid, buttons: Button.USE_HP_POTION }])

    expect(state.hpPotionCount).toBe(1)
    expect(Health.current[playerEid]).toBe(80)
  })
})
