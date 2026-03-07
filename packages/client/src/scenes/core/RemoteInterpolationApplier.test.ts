import { describe, expect, test } from 'bun:test'
import { createGameWorld, Position, spawnGrunt, spawnPlayer, type WorldSnapshot } from '@high-noon/shared'
import { RemoteInterpolationApplier } from './RemoteInterpolationApplier'

function makeSnapshot(overrides: Partial<WorldSnapshot> = {}): WorldSnapshot {
  return {
    tick: 100,
    serverTime: 1000,
    players: [],
    enemies: [],
    lastRitesZones: [],
    dynamites: [],
    ...overrides,
  }
}

describe('RemoteInterpolationApplier', () => {
  test('samples remote render state without mutating ECS positions', () => {
    const world = createGameWorld(1)
    const remotePlayerClientEid = spawnPlayer(world, 5, 6)
    const remoteEnemyClientEid = spawnGrunt(world, 25, 30)
    const applier = new RemoteInterpolationApplier()

    const playerEntities = new Map([[11, remotePlayerClientEid]])
    const enemyEntities = new Map([[21, remoteEnemyClientEid]])

    const from = makeSnapshot({
      tick: 100,
      serverTime: 1000,
      players: [{
        eid: 11,
        x: 10,
        y: 20,
        z: 0,
        zVelocity: 0,
        aimAngle: 0,
        state: 0,
        hp: 10,
        flags: 0,
        lastProcessedSeq: 0,
        rollElapsedMs: 0,
        rollDurationMs: 0,
        rollDirX: 0,
        rollDirY: 0,
        showdownActive: 0,
        showdownTargetEid: 0,
        reviveProgress: 0,
      }],
      enemies: [{
        eid: 21,
        x: 40,
        y: 50,
        type: 1,
        hp: 10,
        aiState: 1,
        targetEid: 0,
      }],
    })
    const to = makeSnapshot({
      tick: 101,
      serverTime: 1050,
      players: [{
        ...from.players[0]!,
        x: 20,
        y: 30,
        z: 4,
        aimAngle: Math.PI / 2,
      }],
      enemies: [{
        ...from.enemies[0]!,
        x: 55,
        y: 65,
      }],
    })

    const initialPlayerX = Position.x[remotePlayerClientEid]!
    const initialPlayerY = Position.y[remotePlayerClientEid]!
    const initialEnemyX = Position.x[remoteEnemyClientEid]!
    const initialEnemyY = Position.y[remoteEnemyClientEid]!

    const sample = applier.sample(
      { from, to, alpha: 0.5 },
      {
        world,
        playerEntities,
        enemyEntities,
        myClientEid: -1,
      },
    )

    expect(sample.worldTick).toBe(101)
    expect(sample.playerStates.get(remotePlayerClientEid)).toEqual({
      x: 15,
      y: 25,
      z: 2,
      aimAngle: Math.PI / 4,
    })
    expect(sample.enemyStates.get(remoteEnemyClientEid)).toEqual({
      x: 47.5,
      y: 57.5,
    })
    expect(Position.x[remotePlayerClientEid]).toBe(initialPlayerX)
    expect(Position.y[remotePlayerClientEid]).toBe(initialPlayerY)
    expect(Position.x[remoteEnemyClientEid]).toBe(initialEnemyX)
    expect(Position.y[remoteEnemyClientEid]).toBe(initialEnemyY)
  })
})
