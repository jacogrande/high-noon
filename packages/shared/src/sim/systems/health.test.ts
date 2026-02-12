import { describe, expect, test, beforeEach } from 'bun:test'
import { hasComponent, addComponent, addEntity } from 'bitecs'
import { createGameWorld, type GameWorld } from '../world'
import { spawnPlayer } from '../prefabs'
import { healthSystem } from './health'
import { Health, Player, Dead } from '../components'

describe('healthSystem', () => {
  let world: GameWorld

  beforeEach(() => {
    world = createGameWorld()
  })

  function spawnHealthEntity(hp: number, iframes = 0, iframeDuration = 0.5): number {
    const eid = addEntity(world)
    addComponent(world, Health, eid)
    Health.current[eid] = hp
    Health.max[eid] = hp
    Health.iframes[eid] = iframes
    Health.iframeDuration[eid] = iframeDuration
    return eid
  }

  describe('i-frame timer', () => {
    test('decrements each tick', () => {
      const eid = spawnHealthEntity(10, 0.5)
      healthSystem(world, 1 / 60)
      expect(Health.iframes[eid]!).toBeCloseTo(0.5 - 1 / 60)
    })

    test('does not go below 0', () => {
      const eid = spawnHealthEntity(10, 0.01)
      healthSystem(world, 0.1)
      expect(Health.iframes[eid]!).toBe(0)
    })

    test('stays at 0 when already 0', () => {
      const eid = spawnHealthEntity(10, 0)
      healthSystem(world, 1 / 60)
      expect(Health.iframes[eid]!).toBe(0)
    })
  })

  describe('death', () => {
    test('removes non-player entity when HP reaches 0', () => {
      const eid = spawnHealthEntity(1)
      Health.current[eid] = 0

      healthSystem(world, 1 / 60)

      expect(hasComponent(world, Health, eid)).toBe(false)
    })

    test('removes non-player entity when HP goes negative', () => {
      const eid = spawnHealthEntity(5)
      Health.current[eid] = -2

      healthSystem(world, 1 / 60)

      expect(hasComponent(world, Health, eid)).toBe(false)
    })

    test('adds Dead component to player instead of removing', () => {
      const playerEid = spawnPlayer(world, 100, 100)
      Health.current[playerEid] = 0

      healthSystem(world, 1 / 60)

      expect(hasComponent(world, Dead, playerEid)).toBe(true)
      expect(hasComponent(world, Player, playerEid)).toBe(true)
    })

    test('does not re-process already-dead player', () => {
      const playerEid = spawnPlayer(world, 100, 100)
      Health.current[playerEid] = 0
      addComponent(world, Dead, playerEid)

      // Should not throw or re-add Dead
      healthSystem(world, 1 / 60)

      expect(hasComponent(world, Dead, playerEid)).toBe(true)
    })

    test('entity with positive HP is not removed', () => {
      const eid = spawnHealthEntity(5)
      Health.current[eid] = 3

      healthSystem(world, 1 / 60)

      expect(hasComponent(world, Health, eid)).toBe(true)
    })

    test('onKill is attributed to the recorded killer player', () => {
      const playerA = spawnPlayer(world, 100, 100)
      const playerB = spawnPlayer(world, 120, 100)
      const eid = spawnHealthEntity(1)
      Health.current[eid] = 0
      world.lastDamageByEntity.set(eid, { ownerPlayerEid: playerB, wasMelee: false })

      let capturedKiller = -1
      world.hooks.register('onKill', 'test_kill_credit', (_world, killerEid) => {
        capturedKiller = killerEid
      })

      healthSystem(world, 1 / 60)

      expect(capturedKiller).toBe(playerB)
      // Ensure we don't accidentally fall back to first player in query order.
      expect(capturedKiller).not.toBe(playerA)
    })

    test('melee attribution applies double gold drop', () => {
      const playerEid = spawnPlayer(world, 100, 100)
      const eid = spawnHealthEntity(1)
      Health.current[eid] = 0
      world.lastDamageByEntity.set(eid, { ownerPlayerEid: playerEid, wasMelee: true })

      healthSystem(world, 1 / 60)

      expect(world.goldNuggets.length).toBe(2)
    })
  })

  describe('bullet callback cleanup', () => {
    test('cleans up bullet collision callback on non-player death', () => {
      const eid = spawnHealthEntity(1)
      Health.current[eid] = 0
      world.bulletCollisionCallbacks.set(eid, () => {})

      healthSystem(world, 1 / 60)

      expect(world.bulletCollisionCallbacks.has(eid)).toBe(false)
    })
  })
})
