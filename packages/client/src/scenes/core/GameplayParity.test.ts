import { describe, expect, test } from 'bun:test'
import {
  Button,
  Cylinder,
  Player,
  Position,
  TICK_S,
  createGameWorld,
  createInputState,
  createSystemRegistry,
  createTestArena,
  registerAllSystems,
  registerPredictionSystems,
  setWorldTilemap,
  spawnPlayer,
  type InputState,
} from '@high-noon/shared'
import { GameplayEventBuffer } from './GameplayEvents'
import { emitCylinderPresentationEvents, emitShowdownCueEvents } from './PlayerPresentationEvents'
import { FullWorldSimulationDriver, LocalPlayerSimulationDriver } from './SimulationDriver'

function createTrace(ticks: number): InputState[] {
  const trace: InputState[] = []
  for (let i = 0; i < ticks; i++) {
    const input = createInputState()
    if (i < 85 || (i >= 100 && i < 118)) input.buttons |= Button.SHOOT
    if (i === 95) input.buttons |= Button.RELOAD
    trace.push(input)
  }
  return trace
}

function runSingleplayerTrace(trace: InputState[]): string[] {
  const world = createGameWorld(42)
  setWorldTilemap(world, createTestArena())
  const playerEid = spawnPlayer(world, 0, 0)
  const systems = createSystemRegistry()
  registerAllSystems(systems)
  const driver = new FullWorldSimulationDriver(world, systems)

  const events = new GameplayEventBuffer()
  const types: string[] = []
  let dryFireCooldown = 0

  for (const input of trace) {
    const prevRounds = Cylinder.rounds[playerEid]!
    const prevReloading = Cylinder.reloading[playerEid]!
    driver.step(input)

    dryFireCooldown = Math.max(0, dryFireCooldown - TICK_S)
    dryFireCooldown = emitCylinderPresentationEvents({
      events,
      actorEid: playerEid,
      prevRounds,
      newRounds: Cylinder.rounds[playerEid]!,
      prevReloading,
      nowReloading: Cylinder.reloading[playerEid]!,
      inputState: input,
      dryFireCooldown,
      dryFireCooldownSeconds: 0.3,
      aimAngle: Player.aimAngle[playerEid]!,
      muzzleX: Position.x[playerEid]!,
      muzzleY: Position.y[playerEid]!,
      fireTrauma: 0.15,
      fireKickStrength: 5,
    })
    emitShowdownCueEvents(events, world)

    for (const event of events.drain()) {
      types.push(event.type)
    }
  }

  return types
}

function runPredictedTrace(trace: InputState[]): string[] {
  const world = createGameWorld(42)
  setWorldTilemap(world, createTestArena())
  const playerEid = spawnPlayer(world, 0, 0)
  const systems = createSystemRegistry()
  registerPredictionSystems(systems)
  const driver = new LocalPlayerSimulationDriver(world, systems)

  const events = new GameplayEventBuffer()
  const types: string[] = []
  let dryFireCooldown = 0

  for (const input of trace) {
    const prevRounds = Cylinder.rounds[playerEid]!
    const prevReloading = Cylinder.reloading[playerEid]!
    driver.step(playerEid, input)

    dryFireCooldown = Math.max(0, dryFireCooldown - TICK_S)
    dryFireCooldown = emitCylinderPresentationEvents({
      events,
      actorEid: playerEid,
      prevRounds,
      newRounds: Cylinder.rounds[playerEid]!,
      prevReloading,
      nowReloading: Cylinder.reloading[playerEid]!,
      inputState: input,
      dryFireCooldown,
      dryFireCooldownSeconds: 0.3,
      aimAngle: Player.aimAngle[playerEid]!,
      muzzleX: Position.x[playerEid]!,
      muzzleY: Position.y[playerEid]!,
      fireTrauma: 0.15,
      fireKickStrength: 5,
    })
    emitShowdownCueEvents(events, world)

    for (const event of events.drain()) {
      types.push(event.type)
    }
  }

  return types
}

describe('Gameplay parity harness', () => {
  test('singleplayer and predicted-local paths emit the same player-facing event sequence', () => {
    const trace = createTrace(140)
    const singleplayerTypes = runSingleplayerTrace(trace)
    const predictedTypes = runPredictedTrace(trace)

    expect(predictedTypes).toEqual(singleplayerTypes)
    expect(singleplayerTypes.includes('player-fire')).toBe(true)
    expect(singleplayerTypes.includes('reload-start')).toBe(true)
  })
})
