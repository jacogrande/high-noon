import { describe, expect, test } from 'bun:test'
import { createGameWorld, createInputState, createSystemRegistry } from '@high-noon/shared'
import { FullWorldSimulationDriver, LocalPlayerSimulationDriver } from './SimulationDriver'

describe('SimulationDriver', () => {
  test('FullWorldSimulationDriver delegates to stepWorld bridge', () => {
    const world = createGameWorld(1)
    const systems = createSystemRegistry()
    let sawInput = false
    systems.register((w) => {
      sawInput = w.playerInputs.size === 0
    })
    const driver = new FullWorldSimulationDriver(world, systems)

    driver.step(createInputState())

    expect(sawInput).toBe(true)
    expect(world.tick).toBe(1)
  })

  test('LocalPlayerSimulationDriver scopes step to local player and restores world flags', () => {
    const world = createGameWorld(2)
    const systems = createSystemRegistry()
    let scopeSeen = 'all'
    let localSeen = -1
    let inputSeen = false
    systems.register((w) => {
      scopeSeen = w.simulationScope
      localSeen = w.localPlayerEid
      inputSeen = w.playerInputs.has(42)
    })

    const driver = new LocalPlayerSimulationDriver(world, systems)
    const input = createInputState()
    input.moveX = 1
    driver.step(42, input)

    expect(scopeSeen).toBe('local-player')
    expect(localSeen).toBe(42)
    expect(inputSeen).toBe(true)
    expect(world.simulationScope).toBe('all')
    expect(world.localPlayerEid).toBe(-1)
    expect(world.playerInputs.size).toBe(0)
  })

  test('LocalPlayerSimulationDriver replays all pending inputs', () => {
    const world = createGameWorld(3)
    const systems = createSystemRegistry()
    let ticks = 0
    systems.register((w) => {
      if (w.playerInputs.has(7)) ticks++
    })

    const driver = new LocalPlayerSimulationDriver(world, systems)
    const a = createInputState()
    const b = createInputState()
    a.moveX = 1
    b.moveY = -1
    driver.replay(7, [a, b])

    expect(ticks).toBe(2)
    expect(world.simulationScope).toBe('all')
    expect(world.localPlayerEid).toBe(-1)
    expect(world.playerInputs.size).toBe(0)
  })
})
