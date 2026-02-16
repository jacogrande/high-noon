import { describe, expect, test, beforeEach } from 'bun:test'
import { hasComponent } from 'bitecs'
import { createGameWorld, setWorldTilemap, type GameWorld, type TrapZone } from '../world'
import { createTestArena } from '../content/maps/testArena'
import { spawnPlayer } from '../prefabs'
import { trapZoneSystem } from './trapZoneSystem'
import { Health, Position, SlowDebuff, Speed } from '../components'

describe('trapZoneSystem', () => {
  let world: GameWorld
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 800, 600)
  })

  function addBearTrap(x: number, y: number): TrapZone {
    const trap: TrapZone = {
      kind: 'bearTrap',
      x,
      y,
      radius: 18,
      damage: 10,
      immobilizeDuration: 1.0,
      hp: 3,
      ownerEid: 999,
    }
    world.trapZones.push(trap)
    return trap
  }

  function addCaltrop(x: number, y: number): TrapZone {
    const trap: TrapZone = {
      kind: 'caltrop',
      x,
      y,
      radius: 40,
      damage: 0,
      duration: 5.0,
      slowMultiplier: 0.3,
      ownerEid: 999,
    }
    world.trapZones.push(trap)
    return trap
  }

  test('bear trap triggers when player enters radius', () => {
    // Place trap at player position
    addBearTrap(800, 600)
    const initialHP = Health.current[playerEid]!

    trapZoneSystem(world, 1 / 60)

    // Trap should trigger: damage dealt, trap removed
    expect(Health.current[playerEid]!).toBe(initialHP - 10)
    expect(world.trapZones.length).toBe(0)
  })

  test('bear trap applies immobilize (zero-speed slow)', () => {
    addBearTrap(800, 600)

    trapZoneSystem(world, 1 / 60)

    expect(hasComponent(world, SlowDebuff, playerEid)).toBe(true)
    expect(SlowDebuff.multiplier[playerEid]!).toBe(0.0)
    expect(SlowDebuff.duration[playerEid]!).toBe(1.0)
  })

  test('bear trap does not trigger when player is far away', () => {
    addBearTrap(100, 100) // far from player at 800,600
    const initialHP = Health.current[playerEid]!

    trapZoneSystem(world, 1 / 60)

    expect(Health.current[playerEid]!).toBe(initialHP)
    expect(world.trapZones.length).toBe(1) // trap still exists
  })

  test('bear trap emits detonation event on trigger', () => {
    addBearTrap(800, 600)

    trapZoneSystem(world, 1 / 60)

    expect(world.trapDetonations.length).toBe(1)
    expect(world.trapDetonations[0]!.kind).toBe('bearTrap')
  })

  test('detonation events cleared each tick', () => {
    addBearTrap(800, 600)
    trapZoneSystem(world, 1 / 60)
    expect(world.trapDetonations.length).toBe(1)

    // Next tick: no new triggers, events should be cleared
    trapZoneSystem(world, 1 / 60)
    expect(world.trapDetonations.length).toBe(0)
  })

  test('caltrop applies slow to player inside radius', () => {
    addCaltrop(800, 600) // at player position

    trapZoneSystem(world, 1 / 60)

    expect(hasComponent(world, SlowDebuff, playerEid)).toBe(true)
    expect(SlowDebuff.multiplier[playerEid]!).toBeCloseTo(0.3)
  })

  test('caltrop does not affect player outside radius', () => {
    addCaltrop(100, 100) // far from player

    trapZoneSystem(world, 1 / 60)

    expect(hasComponent(world, SlowDebuff, playerEid)).toBe(false)
  })

  test('caltrop expires after duration', () => {
    addCaltrop(100, 100) // far from player so we just test expiry

    // Tick enough times to exceed duration (5.0 seconds at 60Hz = 300 ticks)
    for (let i = 0; i < 310; i++) {
      trapZoneSystem(world, 1 / 60)
    }

    expect(world.trapZones.length).toBe(0)
  })

  test('destructible traps lose HP when modified directly', () => {
    const trap = addBearTrap(100, 100)

    // Simulate bullet hit reducing HP
    trap.hp! -= 1
    expect(trap.hp).toBe(2)

    trap.hp! -= 2
    expect(trap.hp).toBe(0)
  })

  function addTripwire(x1: number, y1: number, x2: number, y2: number): void {
    world.trapZones.push({
      kind: 'tripwire',
      x: x1,
      y: y1,
      x2,
      y2,
      radius: 0,
      damage: 8,
      explosionRadius: 60,
      hp: 2,
      ownerEid: 999,
    })
  }

  test('tripwire triggers when player crosses line segment', () => {
    // Place a tripwire with player right on top of it
    addTripwire(790, 600, 810, 600) // horizontal line through player at 800,600
    const initialHP = Health.current[playerEid]!

    trapZoneSystem(world, 1 / 60)

    expect(Health.current[playerEid]!).toBe(initialHP - 8)
    expect(world.trapZones.length).toBe(0) // tripwire removed
  })

  test('tripwire does not trigger when player is far from line', () => {
    addTripwire(100, 100, 200, 100) // far from player at 800,600
    const initialHP = Health.current[playerEid]!

    trapZoneSystem(world, 1 / 60)

    expect(Health.current[playerEid]!).toBe(initialHP)
    expect(world.trapZones.length).toBe(1) // tripwire still exists
  })

  test('tripwire explosion damages in radius', () => {
    // Place tripwire at player position; explosion radius = 60
    addTripwire(795, 600, 805, 600)

    // Spawn a second player nearby (within explosion radius)
    const player2 = spawnPlayer(world, 830, 600) // ~30px from midpoint (800, 600)
    const hp2Before = Health.current[player2]!

    trapZoneSystem(world, 1 / 60)

    // Both players should take damage from the explosion
    expect(Health.current[player2]!).toBe(hp2Before - 8)
  })

  test('tripwire emits detonation event', () => {
    addTripwire(795, 600, 805, 600)

    trapZoneSystem(world, 1 / 60)

    expect(world.trapDetonations.length).toBe(1)
    expect(world.trapDetonations[0]!.kind).toBe('tripwire')
  })

  test('traps cleared on encounter reset', () => {
    addBearTrap(100, 100)
    addCaltrop(200, 200)

    expect(world.trapZones.length).toBe(2)

    // setEncounter clears trapZones
    const { setEncounter } = require('../world')
    const { STAGE_1_ENCOUNTER } = require('../content/waves')
    setEncounter(world, STAGE_1_ENCOUNTER)

    expect(world.trapZones.length).toBe(0)
  })
})
