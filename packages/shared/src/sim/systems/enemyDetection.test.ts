import { describe, expect, test, beforeEach } from 'bun:test'
import { addComponent } from 'bitecs'
import { createGameWorld, type GameWorld } from '../world'
import { spawnPlayer, spawnSwarmer, NO_TARGET } from '../prefabs'
import { enemyDetectionSystem } from './enemyDetection'
import { EnemyAI, Position, Dead, Detection } from '../components'

describe('enemyDetectionSystem', () => {
  let world: GameWorld

  beforeEach(() => {
    world = createGameWorld(42)
  })

  describe('single player (backward compat)', () => {
    test('enemy targets the only player within aggro range', () => {
      const player = spawnPlayer(world, 200, 200)
      const enemy = spawnSwarmer(world, 250, 200)

      enemyDetectionSystem(world, 1 / 60)

      expect(EnemyAI.targetEid[enemy]).toBe(player)
    })

    test('enemy has NO_TARGET when player is out of aggro range', () => {
      spawnPlayer(world, 200, 200)
      const enemy = spawnSwarmer(world, 2000, 2000)

      enemyDetectionSystem(world, 1 / 60)

      expect(EnemyAI.targetEid[enemy]).toBe(NO_TARGET)
    })
  })

  describe('nearest targeting with 2 players', () => {
    test('enemy targets the closer of two alive players', () => {
      const farPlayer = spawnPlayer(world, 100, 100, 0)
      const nearPlayer = spawnPlayer(world, 250, 200, 1)
      const enemy = spawnSwarmer(world, 260, 200)

      enemyDetectionSystem(world, 1 / 60)

      expect(EnemyAI.targetEid[enemy]).toBe(nearPlayer)
    })

    test('two enemies target different nearest players', () => {
      const playerA = spawnPlayer(world, 100, 100, 0)
      const playerB = spawnPlayer(world, 400, 400, 1)
      const enemyA = spawnSwarmer(world, 120, 100) // closer to A
      const enemyB = spawnSwarmer(world, 380, 400) // closer to B

      enemyDetectionSystem(world, 1 / 60)

      expect(EnemyAI.targetEid[enemyA]).toBe(playerA)
      expect(EnemyAI.targetEid[enemyB]).toBe(playerB)
    })
  })

  describe('target stability', () => {
    test('enemy keeps current target within leash even if another player is slightly closer', () => {
      const playerA = spawnPlayer(world, 200, 200, 0)
      const playerB = spawnPlayer(world, 210, 200, 1)
      const enemy = spawnSwarmer(world, 250, 200)

      // First tick: enemy acquires playerB (closer)
      enemyDetectionSystem(world, 1 / 60)
      expect(EnemyAI.targetEid[enemy]).toBe(playerB)

      // Move playerA slightly closer than playerB
      Position.x[playerA] = 245
      Position.x[playerB] = 240

      // Second tick: enemy keeps playerB (stability)
      enemyDetectionSystem(world, 1 / 60)
      expect(EnemyAI.targetEid[enemy]).toBe(playerB)
    })
  })

  describe('dead player fallback', () => {
    test('enemy retargets to remaining alive player when target dies', () => {
      const playerA = spawnPlayer(world, 200, 200, 0)
      const playerB = spawnPlayer(world, 250, 200, 1)
      const enemy = spawnSwarmer(world, 260, 200)

      // First tick: targets playerB (nearest)
      enemyDetectionSystem(world, 1 / 60)
      expect(EnemyAI.targetEid[enemy]).toBe(playerB)

      // Kill playerB
      addComponent(world, Dead, playerB)

      // Second tick: retargets to playerA
      enemyDetectionSystem(world, 1 / 60)
      expect(EnemyAI.targetEid[enemy]).toBe(playerA)
    })
  })

  describe('all dead', () => {
    test('all players dead → all targets cleared to NO_TARGET', () => {
      const playerA = spawnPlayer(world, 200, 200, 0)
      const playerB = spawnPlayer(world, 250, 200, 1)
      const enemy = spawnSwarmer(world, 260, 200)

      // Acquire target
      enemyDetectionSystem(world, 1 / 60)
      expect(EnemyAI.targetEid[enemy]).not.toBe(NO_TARGET)

      // Kill both
      addComponent(world, Dead, playerA)
      addComponent(world, Dead, playerB)

      enemyDetectionSystem(world, 1 / 60)
      expect(EnemyAI.targetEid[enemy]).toBe(NO_TARGET)
    })

    test('no players at all → targets cleared', () => {
      const enemy = spawnSwarmer(world, 200, 200)

      enemyDetectionSystem(world, 1 / 60)
      expect(EnemyAI.targetEid[enemy]).toBe(NO_TARGET)
    })
  })

  describe('leash hysteresis', () => {
    test('enemy loses target at 2x aggro range from assigned target', () => {
      const player = spawnPlayer(world, 200, 200)
      const enemy = spawnSwarmer(world, 250, 200)
      const aggroRange = Detection.aggroRange[enemy]!

      // Acquire target
      enemyDetectionSystem(world, 1 / 60)
      expect(EnemyAI.targetEid[enemy]).toBe(player)

      // Move player just beyond 2x aggro from enemy
      Position.x[player] = Position.x[enemy]! + aggroRange * 2 + 10

      enemyDetectionSystem(world, 1 / 60)
      expect(EnemyAI.targetEid[enemy]).toBe(NO_TARGET)
    })

    test('enemy keeps target within 2x aggro range (hysteresis band)', () => {
      const player = spawnPlayer(world, 200, 200)
      const enemy = spawnSwarmer(world, 250, 200)
      const aggroRange = Detection.aggroRange[enemy]!

      // Acquire target
      enemyDetectionSystem(world, 1 / 60)
      expect(EnemyAI.targetEid[enemy]).toBe(player)

      // Move player beyond aggro but within 2x aggro (hysteresis band)
      Position.x[player] = Position.x[enemy]! + aggroRange * 1.5

      enemyDetectionSystem(world, 1 / 60)
      expect(EnemyAI.targetEid[enemy]).toBe(player)
    })
  })
})
