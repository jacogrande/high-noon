import { describe, expect, test } from 'bun:test'
import { hasComponent, removeComponent } from 'bitecs'
import {
  createGameWorld,
  spawnPlayer,
  Cylinder,
  Player,
  Showdown,
  type GameWorld,
} from '@high-noon/shared'
import { captureReplayExcludedState, restoreReplayExcludedState } from './ReplayExcludedState'

function createWorldWithPlayer(seed = 1): { world: GameWorld; eid: number } {
  const world = createGameWorld(seed)
  const eid = spawnPlayer(world, 100, 100, 0)
  return { world, eid }
}

describe('ReplayExcludedState', () => {
  test('capture + restore round-trips excluded cylinder/showdown/button state', () => {
    const { world, eid } = createWorldWithPlayer(10)

    Player.shootWasDown[eid] = 1
    Player.abilityWasDown[eid] = 1
    Cylinder.fireCooldown[eid] = 0.42
    Showdown.active[eid] = 1
    Showdown.targetEid[eid] = 123
    Showdown.duration[eid] = 0.9
    Showdown.cooldown[eid] = 4.5

    const snapshot = captureReplayExcludedState(world, eid)

    Player.shootWasDown[eid] = 0
    Player.abilityWasDown[eid] = 0
    Cylinder.fireCooldown[eid] = 0
    Showdown.active[eid] = 0
    Showdown.targetEid[eid] = 0
    Showdown.duration[eid] = 0
    Showdown.cooldown[eid] = 0

    restoreReplayExcludedState(world, eid, snapshot)

    expect(Player.shootWasDown[eid]).toBe(1)
    expect(Player.abilityWasDown[eid]).toBe(1)
    expect(Cylinder.fireCooldown[eid]).toBeCloseTo(0.42, 6)
    expect(Showdown.active[eid]).toBe(1)
    expect(Showdown.targetEid[eid]).toBe(123)
    expect(Showdown.duration[eid]).toBeCloseTo(0.9, 6)
    expect(Showdown.cooldown[eid]).toBeCloseTo(4.5, 6)
  })

  test('restore preserves missing optional components', () => {
    const { world, eid } = createWorldWithPlayer(11)

    removeComponent(world, Cylinder, eid)
    removeComponent(world, Showdown, eid)
    expect(hasComponent(world, Cylinder, eid)).toBe(false)
    expect(hasComponent(world, Showdown, eid)).toBe(false)

    Player.shootWasDown[eid] = 1
    Player.abilityWasDown[eid] = 0
    const snapshot = captureReplayExcludedState(world, eid)

    Player.shootWasDown[eid] = 0
    Player.abilityWasDown[eid] = 1
    restoreReplayExcludedState(world, eid, snapshot)

    expect(Player.shootWasDown[eid]).toBe(1)
    expect(Player.abilityWasDown[eid]).toBe(0)
    expect(hasComponent(world, Cylinder, eid)).toBe(false)
    expect(hasComponent(world, Showdown, eid)).toBe(false)
  })
})
