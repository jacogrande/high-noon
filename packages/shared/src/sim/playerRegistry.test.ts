import { describe, expect, test, beforeEach } from 'bun:test'
import { hasComponent } from 'bitecs'
import { createGameWorld, type GameWorld } from './world'
import { addPlayer, removePlayer, getPlayerEntity, MAX_PLAYERS } from './playerRegistry'
import { Player, Position } from './components'
import { getArenaCenter } from './content/maps/testArena'
import { createInputState } from '../net/input'

describe('playerRegistry', () => {
  let world: GameWorld

  beforeEach(() => {
    world = createGameWorld(42)
  })

  describe('addPlayer', () => {
    test('creates entity with Player component', () => {
      const eid = addPlayer(world, 'session-a')
      expect(hasComponent(world, Player, eid)).toBe(true)
    })

    test('assigns slot 0 to first player, slot 1 to second', () => {
      addPlayer(world, 'session-a')
      addPlayer(world, 'session-b')

      const infoA = world.players.get('session-a')!
      const infoB = world.players.get('session-b')!
      expect(infoA.slot).toBe(0)
      expect(infoB.slot).toBe(1)
    })

    test('spawns at correct offset position from arena center', () => {
      const { x: cx, y: cy } = getArenaCenter()

      const eidA = addPlayer(world, 'session-a') // slot 0: center
      expect(Position.x[eidA]).toBe(cx)
      expect(Position.y[eidA]).toBe(cy)

      const eidB = addPlayer(world, 'session-b') // slot 1: left (-64, 0)
      expect(Position.x[eidB]).toBe(cx - 64)
      expect(Position.y[eidB]).toBe(cy)
    })

    test('registers in world.players map', () => {
      const eid = addPlayer(world, 'session-a')
      const info = world.players.get('session-a')
      expect(info).toBeDefined()
      expect(info!.eid).toBe(eid)
      expect(info!.slot).toBe(0)
    })

    test('throws on duplicate session', () => {
      addPlayer(world, 'session-a')
      expect(() => addPlayer(world, 'session-a')).toThrow('already registered')
    })

    test('throws when room is full', () => {
      for (let i = 0; i < MAX_PLAYERS; i++) {
        addPlayer(world, `session-${i}`)
      }
      expect(() => addPlayer(world, 'session-overflow')).toThrow('full')
    })
  })

  describe('removePlayer', () => {
    test('removes entity from ECS', () => {
      const eid = addPlayer(world, 'session-a')
      expect(hasComponent(world, Player, eid)).toBe(true)

      removePlayer(world, 'session-a')
      expect(hasComponent(world, Player, eid)).toBe(false)
    })

    test('removes from world.players', () => {
      addPlayer(world, 'session-a')
      removePlayer(world, 'session-a')
      expect(world.players.has('session-a')).toBe(false)
    })

    test('cleans up playerInputs and rollDodgedBullets', () => {
      const eid = addPlayer(world, 'session-a')
      world.playerInputs.set(eid, createInputState())
      world.rollDodgedBullets.set(eid, new Set([1, 2, 3]))

      removePlayer(world, 'session-a')
      expect(world.playerInputs.has(eid)).toBe(false)
      expect(world.rollDodgedBullets.has(eid)).toBe(false)
    })

    test('is idempotent for unknown sessions', () => {
      expect(() => removePlayer(world, 'nonexistent')).not.toThrow()
    })
  })

  describe('getPlayerEntity', () => {
    test('returns eid for known session', () => {
      const eid = addPlayer(world, 'session-a')
      expect(getPlayerEntity(world, 'session-a')).toBe(eid)
    })

    test('returns undefined for unknown session', () => {
      expect(getPlayerEntity(world, 'nonexistent')).toBeUndefined()
    })
  })

  describe('slot reuse', () => {
    test('after removing slot 0, next add gets slot 0 back', () => {
      addPlayer(world, 'session-a') // slot 0
      addPlayer(world, 'session-b') // slot 1
      removePlayer(world, 'session-a')

      addPlayer(world, 'session-c') // should get slot 0
      const infoC = world.players.get('session-c')!
      expect(infoC.slot).toBe(0)
    })

    test('reused slot spawns at correct position', () => {
      const { x: cx, y: cy } = getArenaCenter()

      addPlayer(world, 'session-a') // slot 0
      removePlayer(world, 'session-a')

      const eid = addPlayer(world, 'session-b') // slot 0 again
      expect(Position.x[eid]).toBe(cx)
      expect(Position.y[eid]).toBe(cy)
    })
  })
})
