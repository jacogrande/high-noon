import { describe, expect, test } from 'bun:test'
import {
  createGameWorld,
  EnemyType,
  Health,
  NO_TARGET,
  Position,
  Velocity,
  spawnBullet,
  CollisionLayer,
  type WorldSnapshot,
} from '@high-noon/shared'
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

function makeContext(overrides: Partial<SnapshotIngestContext> = {}): SnapshotIngestContext {
  const world = overrides.world ?? createGameWorld(7)
  return {
    world,
    tracker: overrides.tracker ?? new PredictedEntityTracker(),
    playerEntities: overrides.playerEntities ?? new Map(),
    bulletEntities: overrides.bulletEntities ?? new Map(),
    enemyEntities: overrides.enemyEntities ?? new Map(),
    myServerEid: overrides.myServerEid ?? -1,
    myClientEid: overrides.myClientEid ?? -1,
    localCharacterId: overrides.localCharacterId ?? 'sheriff',
    resolveCharacterIdForServerEid: overrides.resolveCharacterIdForServerEid ?? (() => undefined),
    setMyClientEid: overrides.setMyClientEid ?? (() => {}),
    setLocalPlayerRenderEid: overrides.setLocalPlayerRenderEid ?? (() => {}),
    resolveRttMs: overrides.resolveRttMs ?? (() => 0),
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

  test('applies authoritative enemy HP immediately', () => {
    const ingestor = new SnapshotIngestor()
    const ctx = makeContext()

    ingestor.applyEntityLifecycle(makeSnapshot(2000, { eid: 7, x: 0, y: 0, hp: 10 }), ctx, 0)
    const enemyClientEid = ctx.enemyEntities.get(7)!

    // Simulate stale local enemy HP before authoritative correction.
    Health.current[enemyClientEid] = 8

    // Server reports authoritative HP in the next snapshot.
    ingestor.applyEntityLifecycle(makeSnapshot(2050, { eid: 7, x: 0, y: 0, hp: 10 }), ctx, 0)

    expect(Health.current[enemyClientEid]).toBe(10)
  })

  test('adopts local predicted bullet only when server owner matches local player', () => {
    const world = createGameWorld(8)
    const tracker = new PredictedEntityTracker()
    const myClientEid = 17
    const myServerEid = 170
    const predictedEid = spawnBullet(world, {
      x: 100,
      y: 120,
      vx: 300,
      vy: 0,
      damage: 10,
      range: 500,
      ownerId: myClientEid,
      layer: CollisionLayer.PLAYER_BULLET,
    })
    expect(tracker.detectNewPredictedBullets(world, myClientEid, 10)).toBe(1)
    const predictedX = Position.x[predictedEid]!
    const predictedY = Position.y[predictedEid]!
    const predictedVx = Velocity.x[predictedEid]!
    const predictedVy = Velocity.y[predictedEid]!

    const ingestor = new SnapshotIngestor()
    const ctx = makeContext({
      world,
      tracker,
      myServerEid,
      myClientEid,
    })

    const matched = ingestor.applyBulletSpawn(
      {
        bulletId: 1,
        tick: 10,
        serverTime: 5000,
        ownerServerEid: myServerEid,
        x: predictedX - 40,
        y: predictedY + 30,
        vx: -200,
        vy: 140,
        layer: CollisionLayer.PLAYER_BULLET,
      },
      ctx,
    )

    expect(matched).toBe(true)
    expect(ctx.bulletEntities.get(1)).toBe(predictedEid)
    expect(ctx.tracker.isLocalTimelineBullet(predictedEid)).toBe(true)
    expect(Position.x[predictedEid]).toBe(predictedX)
    expect(Position.y[predictedEid]).toBe(predictedY)
    expect(Velocity.x[predictedEid]).toBe(predictedVx)
    expect(Velocity.y[predictedEid]).toBe(predictedVy)
  })

  test('does not adopt local predicted bullet for remote-owner bullet spawn', () => {
    const world = createGameWorld(9)
    const tracker = new PredictedEntityTracker()
    const myClientEid = 21
    const predictedEid = spawnBullet(world, {
      x: 50,
      y: 60,
      vx: 200,
      vy: 0,
      damage: 10,
      range: 500,
      ownerId: myClientEid,
      layer: CollisionLayer.PLAYER_BULLET,
    })
    expect(tracker.detectNewPredictedBullets(world, myClientEid, 10)).toBe(1)

    const ingestor = new SnapshotIngestor()
    const ctx = makeContext({
      world,
      tracker,
      myServerEid: 210,
      myClientEid,
    })

    const matched = ingestor.applyBulletSpawn(
      {
        bulletId: 2,
        tick: 11,
        serverTime: 5050,
        ownerServerEid: 9999,
        x: 50,
        y: 60,
        vx: 200,
        vy: 0,
        layer: CollisionLayer.PLAYER_BULLET,
      },
      ctx,
    )

    expect(matched).toBe(false)
    const serverBulletEid = ctx.bulletEntities.get(2)
    expect(serverBulletEid).toBeDefined()
    expect(serverBulletEid).not.toBe(predictedEid)
    expect(ctx.tracker.isLocalTimelineBullet(predictedEid)).toBe(true)
    expect(ctx.tracker.isLocalTimelineBullet(serverBulletEid!)).toBe(false)
  })
})
