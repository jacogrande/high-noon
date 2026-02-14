import { describe, expect, test } from 'bun:test'
import { Button, createInputState, type NetworkInput } from '../../net/input'
import { generateArena } from '../content/maps/mapGenerator'
import { DEFAULT_RUN_STAGES } from '../content/waves'
import { spawnPlayer } from '../prefabs'
import { TICK_S } from '../step'
import { createGameWorld, setWorldTilemap, startRun } from '../world'
import { INTERACT_HOLD_TICKS, SHOVEL_MAX_STACK, getShovelPrice } from '../content/economy'
import { interactionSystem } from './interaction'
import { stashRewardSystem } from './stashReward'
import { Dead, Position } from '../components'
import { addComponent } from 'bitecs'

function createInput(buttons = 0) {
  return {
    ...createInputState(),
    buttons,
  }
}

function runTick(world: ReturnType<typeof createGameWorld>, playerEid: number, buttons = 0): void {
  world.playerInputs.set(playerEid, createInput(buttons))
  interactionSystem(world, TICK_S)
  stashRewardSystem(world, TICK_S)
  world.playerInputs.clear()
}

function createNetworkInput(seq: number, buttons = 0): NetworkInput {
  return {
    ...createInputState(),
    seq,
    clientTick: seq,
    clientTimeMs: seq * TICK_S * 1000,
    estimatedServerTimeMs: seq * TICK_S * 1000,
    viewInterpDelayMs: 0,
    shootSeq: 0,
    buttons,
  }
}

function runNetworkTick(world: ReturnType<typeof createGameWorld>, playerEid: number, input: NetworkInput): void {
  world.playerInputs.set(playerEid, input)
  interactionSystem(world, TICK_S)
  stashRewardSystem(world, TICK_S)
  world.playerInputs.clear()
}

function createStageWorld(seed = 123): { world: ReturnType<typeof createGameWorld>; playerEid: number } {
  const world = createGameWorld(seed)
  const stage0 = DEFAULT_RUN_STAGES[0]!
  const map = generateArena(stage0.mapConfig, world.initialSeed, 0)
  setWorldTilemap(world, map)
  startRun(world, DEFAULT_RUN_STAGES)
  const playerEid = spawnPlayer(world, map.width * map.tileSize * 0.5, map.height * map.tileSize * 0.5)
  return { world, playerEid }
}

describe('interactionSystem', () => {
  test('buying shovel spends gold after hold confirm', () => {
    const { world, playerEid } = createStageWorld(777)
    runTick(world, playerEid, 0)

    const salesman = world.salesman
    if (!salesman) throw new Error('Expected salesman to be generated')

    Position.x[playerEid] = salesman.x
    Position.y[playerEid] = salesman.y
    world.goldCollected = 100

    for (let i = 0; i < INTERACT_HOLD_TICKS; i++) {
      runTick(world, playerEid, Button.INTERACT)
    }

    const price = getShovelPrice(salesman.stageIndex)
    expect(world.shovelCount).toBe(1)
    expect(world.goldCollected).toBe(100 - price)
  })

  test('network input gaps do not re-arm interaction hold without explicit release', () => {
    const { world, playerEid } = createStageWorld(783)
    runTick(world, playerEid, 0)

    const salesman = world.salesman
    if (!salesman) throw new Error('Expected salesman to be generated')

    world.stashes = []
    Position.x[playerEid] = salesman.x
    Position.y[playerEid] = salesman.y

    const price = getShovelPrice(salesman.stageIndex)
    world.goldCollected = price * 2 + 5

    let seq = 1
    for (let i = 0; i < INTERACT_HOLD_TICKS; i++) {
      runNetworkTick(world, playerEid, createNetworkInput(seq++, Button.INTERACT))
    }

    const goldAfterFirstBuy = world.goldCollected
    expect(world.shovelCount).toBe(1)
    expect(goldAfterFirstBuy).toBe(price + 5)

    for (let i = 0; i < INTERACT_HOLD_TICKS + 4; i++) {
      runNetworkTick(world, playerEid, createNetworkInput(0, 0))
      runNetworkTick(world, playerEid, createNetworkInput(seq++, Button.INTERACT))
    }

    expect(world.shovelCount).toBe(1)
    expect(world.goldCollected).toBe(goldAfterFirstBuy)

    runNetworkTick(world, playerEid, createNetworkInput(seq++, 0))
    for (let i = 0; i < INTERACT_HOLD_TICKS; i++) {
      runNetworkTick(world, playerEid, createNetworkInput(seq++, Button.INTERACT))
    }

    expect(world.shovelCount).toBe(2)
    expect(world.goldCollected).toBe(5)
  })

  test('opening stash consumes shovel and grants gold', () => {
    const { world, playerEid } = createStageWorld(778)
    runTick(world, playerEid, 0)

    const stash = world.stashes[0]
    if (!stash) throw new Error('Expected at least one stash')

    Position.x[playerEid] = stash.x
    Position.y[playerEid] = stash.y
    world.shovelCount = 1
    world.goldCollected = 0

    for (let i = 0; i < INTERACT_HOLD_TICKS; i++) {
      runTick(world, playerEid, Button.INTERACT)
    }

    expect(stash.opened).toBe(true)
    expect(world.shovelCount).toBe(0)
    expect(world.goldCollected).toBeGreaterThan(0)
  })

  test('shows missing shovel prompt near stash', () => {
    const { world, playerEid } = createStageWorld(779)
    runTick(world, playerEid, 0)

    const stash = world.stashes[0]
    if (!stash) throw new Error('Expected at least one stash')

    Position.x[playerEid] = stash.x
    Position.y[playerEid] = stash.y
    world.shovelCount = 0

    runTick(world, playerEid, 0)
    expect(world.interactionPromptByPlayer.get(playerEid)).toContain('Need shovel')
  })

  test('shovel buy rejects when gold is insufficient', () => {
    const { world, playerEid } = createStageWorld(780)
    runTick(world, playerEid, 0)

    const salesman = world.salesman
    if (!salesman) throw new Error('Expected salesman to be generated')

    Position.x[playerEid] = salesman.x
    Position.y[playerEid] = salesman.y
    world.shovelCount = 0
    world.goldCollected = getShovelPrice(salesman.stageIndex) - 1

    for (let i = 0; i < INTERACT_HOLD_TICKS; i++) {
      runTick(world, playerEid, Button.INTERACT)
    }

    expect(world.shovelCount).toBe(0)
    expect(world.goldCollected).toBe(getShovelPrice(salesman.stageIndex) - 1)
    expect(world.interactionPromptByPlayer.get(playerEid)).toContain('Need $')
  })

  test('shovel buy rejects at max stack', () => {
    const { world, playerEid } = createStageWorld(781)
    runTick(world, playerEid, 0)

    const salesman = world.salesman
    if (!salesman) throw new Error('Expected salesman to be generated')

    Position.x[playerEid] = salesman.x
    Position.y[playerEid] = salesman.y
    world.shovelCount = SHOVEL_MAX_STACK
    world.goldCollected = 999

    for (let i = 0; i < INTERACT_HOLD_TICKS; i++) {
      runTick(world, playerEid, Button.INTERACT)
    }

    expect(world.shovelCount).toBe(SHOVEL_MAX_STACK)
    expect(world.goldCollected).toBe(999)
    expect(world.interactionPromptByPlayer.get(playerEid)).toContain('Shovels full')
  })

  test('dead players clear hold-tracking entries', () => {
    const { world, playerEid } = createStageWorld(782)
    runTick(world, playerEid, 0)

    const stash = world.stashes[0]
    if (!stash) throw new Error('Expected at least one stash')

    Position.x[playerEid] = stash.x
    Position.y[playerEid] = stash.y
    world.interactionHoldTicksByPlayer.set(playerEid, 4)
    world.interactionTargetByPlayer.set(playerEid, `stash:${stash.stageIndex}:${stash.id}`)
    addComponent(world, Dead, playerEid)

    runTick(world, playerEid, 0)

    expect(world.interactionHoldTicksByPlayer.has(playerEid)).toBe(false)
    expect(world.interactionTargetByPlayer.has(playerEid)).toBe(false)
  })
})
