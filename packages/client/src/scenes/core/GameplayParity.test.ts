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
  getCharacterDef,
  type InputState,
} from '@high-noon/shared'
import { GameplayEventBuffer } from './GameplayEvents'
import {
  emitCylinderPresentationEvents,
  emitMeleeSwingEvents,
  emitShowdownCueEvents,
} from './PlayerPresentationEvents'
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

function createProspectorTrace(ticks: number): InputState[] {
  const trace: InputState[] = []
  for (let i = 0; i < ticks; i++) {
    const input = createInputState()
    // Three click-release swings, spaced to respect pickaxe cooldown.
    if (i === 2 || i === 45 || i === 88) input.buttons |= Button.SHOOT
    trace.push(input)
  }
  return trace
}

function runSingleplayerProspectorTrace(trace: InputState[]): string[] {
  const world = createGameWorld(42, getCharacterDef('prospector'))
  setWorldTilemap(world, createTestArena())
  const playerEid = spawnPlayer(world, 0, 0)
  const systems = createSystemRegistry()
  registerAllSystems(systems)
  const driver = new FullWorldSimulationDriver(world, systems)

  const events = new GameplayEventBuffer()
  const types: string[] = []

  for (const input of trace) {
    driver.step(input)
    emitMeleeSwingEvents(events, world, playerEid)

    for (const event of events.drain()) {
      types.push(event.type)
    }
  }

  return types
}

function runPredictedProspectorTrace(trace: InputState[]): string[] {
  const world = createGameWorld(42, getCharacterDef('prospector'))
  setWorldTilemap(world, createTestArena())
  const playerEid = spawnPlayer(world, 0, 0)
  const systems = createSystemRegistry()
  registerPredictionSystems(systems)
  const driver = new LocalPlayerSimulationDriver(world, systems)

  const events = new GameplayEventBuffer()
  const types: string[] = []

  for (const input of trace) {
    driver.step(playerEid, input)
    emitMeleeSwingEvents(events, world, playerEid)

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

  test('prospector melee click-release parity across singleplayer and predicted-local', () => {
    const trace = createProspectorTrace(130)
    const singleplayerTypes = runSingleplayerProspectorTrace(trace)
    const predictedTypes = runPredictedProspectorTrace(trace)

    expect(predictedTypes).toEqual(singleplayerTypes)
    expect(singleplayerTypes.filter(type => type === 'player-melee-swing').length).toBe(3)
  })
})
