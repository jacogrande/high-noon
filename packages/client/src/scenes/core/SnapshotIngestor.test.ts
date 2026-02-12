import { describe, expect, test } from 'bun:test'
import { createGameWorld, EnemyType, Health, NO_TARGET, Velocity, type WorldSnapshot } from '@high-noon/shared'
import { PredictedEntityTracker } from './PredictedEntityTracker'
import { SnapshotIngestor, type SnapshotIngestContext } from './SnapshotIngestor'

function makeSnapshot(
  serverTime: number,
  enemy: { eid: number; x: number; y: number; hp: number },
): WorldSnapshot {
  return {
    tick: Math.floor(serverTime),
    serverTime,
    players: [],
    bullets: [],
    enemies: [{
      eid: enemy.eid,
      x: enemy.x,
      y: enemy.y,
      type: EnemyType.GRUNT,
      hp: enemy.hp,
      aiState: 0,
      targetEid: NO_TARGET,
    }],
    lastRitesZones: [],
    dynamites: [],
  }
}

function makeContext(): SnapshotIngestContext {
  const world = createGameWorld(7)
  return {
    world,
    tracker: new PredictedEntityTracker(),
    playerEntities: new Map(),
    bulletEntities: new Map(),
    enemyEntities: new Map(),
    myServerEid: -1,
    myClientEid: -1,
    localCharacterId: 'sheriff',
    resolveCharacterIdForServerEid: () => undefined,
    setMyClientEid: () => {},
    setLocalPlayerRenderEid: () => {},
    resolveRttMs: () => 100,
  }
}

describe('SnapshotIngestor', () => {
  test('estimates enemy velocity from successive authoritative snapshots', () => {
    const ingestor = new SnapshotIngestor()
    const ctx = makeContext()

    ingestor.applyEntityLifecycle(makeSnapshot(1000, { eid: 42, x: 10, y: 20, hp: 10 }), ctx, 0)
    ingestor.applyEntityLifecycle(makeSnapshot(1050, { eid: 42, x: 20, y: 20, hp: 10 }), ctx, 0)

    const enemyClientEid = ctx.enemyEntities.get(42)!
    expect(Velocity.x[enemyClientEid]).toBeCloseTo(200)
    expect(Velocity.y[enemyClientEid]).toBeCloseTo(0)
  })

  test('holds optimistic enemy HP briefly instead of immediate rollback', () => {
    const ingestor = new SnapshotIngestor()
    const ctx = makeContext()

    ingestor.applyEntityLifecycle(makeSnapshot(2000, { eid: 7, x: 0, y: 0, hp: 10 }), ctx, 0)
    const enemyClientEid = ctx.enemyEntities.get(7)!

    // Simulate optimistic local-prediction damage before server confirmation.
    Health.current[enemyClientEid] = 8

    // Server still reports old HP in the next snapshot.
    ingestor.applyEntityLifecycle(makeSnapshot(2050, { eid: 7, x: 0, y: 0, hp: 10 }), ctx, 0)

    // Do not flash back immediately to 10.
    expect(Health.current[enemyClientEid]).toBe(8)
  })
})
