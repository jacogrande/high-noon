import { describe, it, expect } from 'bun:test'
import { addComponent } from 'bitecs'
import { createGameWorld } from '../sim/world'
import {
  Position,
  Velocity,
  Health,
  PlayerState,
  PlayerStateType,
  Player,
  Roll,
  Dead,
  Invincible,
  EnemyAI,
  AIState,
  EnemyType,
  Enemy,
  Collider,
  ZPosition,
  Showdown,
} from '../sim/components'
import { spawnPlayer, spawnBullet, spawnSwarmer, spawnGrunt, CollisionLayer, NO_OWNER, NO_TARGET } from '../sim/prefabs'
import {
  encodeSnapshot,
  decodeSnapshot,
  SNAPSHOT_VERSION,
  HEADER_SIZE,
  PLAYER_SIZE,
  BULLET_SIZE,
  ENEMY_SIZE,
} from './snapshot'

describe('snapshot', () => {
  it('round-trip: encode → decode preserves all fields', () => {
    const world = createGameWorld(42)
    world.tick = 1000

    const pEid = spawnPlayer(world, 100.5, 200.25, 0)
    Player.aimAngle[pEid] = 1.5
    ZPosition.z[pEid] = 12
    ZPosition.zVelocity[pEid] = -45
    PlayerState.state[pEid] = PlayerStateType.MOVING
    Health.current[pEid] = 80

    const bEid = spawnBullet(world, {
      x: 50, y: 60, vx: 300, vy: -150,
      damage: 10, range: 500, ownerId: pEid, layer: CollisionLayer.PLAYER_BULLET,
    })

    const eEid = spawnSwarmer(world, 400, 500)
    Health.current[eEid] = 3
    EnemyAI.state[eEid] = AIState.CHASE

    const encoded = encodeSnapshot(world, 12345.678)
    const snap = decodeSnapshot(encoded)

    expect(snap.tick).toBe(1000)
    expect(snap.serverTime).toBe(Math.fround(12345.678))

    // Player
    expect(snap.players).toHaveLength(1)
    const p = snap.players[0]!
    expect(p.eid).toBe(pEid)
    expect(p.x).toBe(100.5)
    expect(p.y).toBe(200.25)
    expect(p.z).toBe(12)
    expect(p.zVelocity).toBe(-45)
    expect(p.aimAngle).toBeCloseTo(1.5, 5)
    expect(p.state).toBe(PlayerStateType.MOVING)
    expect(p.hp).toBe(80)
    expect(p.flags).toBe(0)
    expect(p.lastProcessedSeq).toBe(0)
    expect(p.rollElapsedMs).toBe(0)
    expect(p.rollDurationMs).toBe(0)
    expect(p.rollDirX).toBe(0)
    expect(p.rollDirY).toBe(0)
    expect(p.showdownActive).toBe(0)
    expect(p.showdownTargetEid).toBe(NO_TARGET)

    // Bullet
    expect(snap.bullets).toHaveLength(1)
    const b = snap.bullets[0]!
    expect(b.eid).toBe(bEid)
    expect(b.x).toBe(50)
    expect(b.y).toBe(60)
    expect(b.vx).toBe(300)
    expect(b.vy).toBe(-150)
    expect(b.layer).toBe(CollisionLayer.PLAYER_BULLET)
    expect(b.ownerEid).toBe(pEid)

    // Enemy
    expect(snap.enemies).toHaveLength(1)
    const e = snap.enemies[0]!
    expect(e.eid).toBe(eEid)
    expect(e.x).toBe(400)
    expect(e.y).toBe(500)
    expect(e.type).toBe(EnemyType.SWARMER)
    expect(e.hp).toBe(3)
    expect(e.aiState).toBe(AIState.CHASE)

    // Ability sections (empty)
    expect(snap.lastRitesZones).toHaveLength(0)
    expect(snap.dynamites).toHaveLength(0)
  })

  it('empty world: version + header + section headers', () => {
    const world = createGameWorld(1)
    const encoded = encodeSnapshot(world, 0)
    // HEADER_SIZE + 2 bytes for zone/dynamite count headers
    expect(encoded.byteLength).toBe(HEADER_SIZE + 2)

    const snap = decodeSnapshot(encoded)
    expect(snap.tick).toBe(0)
    expect(snap.serverTime).toBe(0)
    expect(snap.players).toHaveLength(0)
    expect(snap.bullets).toHaveLength(0)
    expect(snap.enemies).toHaveLength(0)
    expect(snap.lastRitesZones).toHaveLength(0)
    expect(snap.dynamites).toHaveLength(0)
  })

  it('player flags: Dead and Invincible encode correctly', () => {
    const world = createGameWorld(2)
    const eid = spawnPlayer(world, 0, 0, 0)
    addComponent(world, Dead, eid)
    addComponent(world, Invincible, eid)

    const snap = decodeSnapshot(encodeSnapshot(world, 0))
    const p = snap.players[0]!
    expect(p.flags & 1).toBe(1)  // Dead
    expect(p.flags & 2).toBe(2)  // Invincible
  })

  it('player flags: rollButtonWasDown encodes correctly', () => {
    const world = createGameWorld(2)
    const eid = spawnPlayer(world, 0, 0, 0)
    Player.rollButtonWasDown[eid] = 1

    const snap = decodeSnapshot(encodeSnapshot(world, 0))
    const p = snap.players[0]!
    expect(p.flags & 4).toBe(4)
  })

  it('player flags: jumpButtonWasDown encodes correctly', () => {
    const world = createGameWorld(2)
    const eid = spawnPlayer(world, 0, 0, 0)
    Player.jumpButtonWasDown[eid] = 1

    const snap = decodeSnapshot(encodeSnapshot(world, 0))
    const p = snap.players[0]!
    expect(p.flags & 8).toBe(8)
  })

  it('roll payload: elapsed/duration/direction round-trip for rolling players', () => {
    const world = createGameWorld(7)
    const eid = spawnPlayer(world, 0, 0, 0)
    addComponent(world, Roll, eid)
    PlayerState.state[eid] = PlayerStateType.ROLLING
    Roll.elapsed[eid] = 0.23
    Roll.duration[eid] = 0.6
    Roll.directionX[eid] = 0.8
    Roll.directionY[eid] = -0.6

    const snap = decodeSnapshot(encodeSnapshot(world, 0))
    const p = snap.players[0]!
    expect(p.rollElapsedMs).toBe(230)
    expect(p.rollDurationMs).toBe(600)
    expect(p.rollDirX).toBeCloseTo(0.8, 1)
    expect(p.rollDirY).toBeCloseTo(-0.6, 1)
  })

  it('HP clamping: values > 255 clamp to 255, < 0 clamp to 0', () => {
    const world = createGameWorld(3)
    const p1 = spawnPlayer(world, 0, 0, 0)
    const p2 = spawnPlayer(world, 10, 0, 1)
    Health.current[p1] = 999
    Health.current[p2] = -50

    const snap = decodeSnapshot(encodeSnapshot(world, 0))
    expect(snap.players[0]!.hp).toBe(255)
    expect(snap.players[1]!.hp).toBe(0)
  })

  it('multiple entities: 2 players + bullets + enemies', () => {
    const world = createGameWorld(4)
    world.tick = 42

    const p1 = spawnPlayer(world, 10, 20, 0)
    const p2 = spawnPlayer(world, 30, 40, 1)

    for (let i = 0; i < 5; i++) {
      spawnBullet(world, {
        x: i * 10, y: i * 10, vx: 100, vy: 0,
        damage: 5, range: 300, ownerId: p1,
      })
    }

    for (let i = 0; i < 3; i++) {
      spawnSwarmer(world, 100 + i * 50, 200)
    }

    const encoded = encodeSnapshot(world, 500.5)
    const snap = decodeSnapshot(encoded)
    expect(snap.tick).toBe(42)
    expect(snap.players.length).toBeGreaterThanOrEqual(2)
    expect(snap.bullets.length).toBeGreaterThanOrEqual(5)
    expect(snap.enemies.length).toBeGreaterThanOrEqual(3)

    // Byte size consistent with decoded counts (+2 for zone/dynamite count headers)
    const expectedSize =
      HEADER_SIZE +
      snap.players.length * PLAYER_SIZE +
      snap.bullets.length * BULLET_SIZE +
      snap.enemies.length * ENEMY_SIZE +
      2 // zone + dynamite count headers
    expect(encoded.byteLength).toBe(expectedSize)
  })

  it('f32 values survive round-trip exactly', () => {
    const world = createGameWorld(5)
    const eid = spawnPlayer(world, 0, 0, 0)
    const testVal = 1.23456789
    Position.x[eid] = testVal
    // f32 truncates precision — compare via Math.fround
    const expected = Math.fround(testVal)

    const snap = decodeSnapshot(encodeSnapshot(world, 0))
    expect(snap.players[0]!.x).toBe(expected)
  })

  it('version mismatch: decoder throws', () => {
    const world = createGameWorld(6)
    const encoded = encodeSnapshot(world, 0)
    // Corrupt version byte
    const corrupted = new Uint8Array(encoded)
    corrupted[0] = 99

    expect(() => decodeSnapshot(corrupted)).toThrow('Snapshot version mismatch')
  })

  it('dead enemies are excluded from snapshot', () => {
    const world = createGameWorld(7)
    const e1 = spawnSwarmer(world, 0, 0)
    const e2 = spawnGrunt(world, 100, 100)
    addComponent(world, Dead, e1)

    const snap = decodeSnapshot(encodeSnapshot(world, 0))
    expect(snap.enemies).toHaveLength(1)
    expect(snap.enemies[0]!.eid).toBe(e2)
  })

  it('dead players are included with Dead flag set', () => {
    const world = createGameWorld(8)
    const eid = spawnPlayer(world, 50, 50, 0)
    addComponent(world, Dead, eid)

    const snap = decodeSnapshot(encodeSnapshot(world, 0))
    expect(snap.players).toHaveLength(1)
    expect(snap.players[0]!.flags & 1).toBe(1)
  })

  it('enemy bullet layer encodes correctly', () => {
    const world = createGameWorld(9)
    spawnBullet(world, {
      x: 0, y: 0, vx: 100, vy: 0,
      damage: 5, range: 300, ownerId: NO_OWNER,
      layer: CollisionLayer.ENEMY_BULLET,
    })

    const snap = decodeSnapshot(encodeSnapshot(world, 0))
    expect(snap.bullets[0]!.layer).toBe(CollisionLayer.ENEMY_BULLET)
    expect(snap.bullets[0]!.ownerEid).toBe(NO_OWNER)
  })

  it('snapshot byte size matches spec for typical game', () => {
    const world = createGameWorld(10)
    world.tick = 500

    // 2 players
    spawnPlayer(world, 0, 0, 0)
    const p2 = spawnPlayer(world, 100, 100, 1)

    // 20 bullets
    for (let i = 0; i < 20; i++) {
      spawnBullet(world, {
        x: i, y: i, vx: 100, vy: 0,
        damage: 5, range: 300, ownerId: p2,
      })
    }

    // 30 enemies
    for (let i = 0; i < 30; i++) {
      spawnSwarmer(world, i * 10, i * 10)
    }

    const encoded = encodeSnapshot(world, 1000)
    const snap = decodeSnapshot(encoded)
    expect(snap.players.length).toBeGreaterThanOrEqual(2)
    expect(snap.bullets.length).toBeGreaterThanOrEqual(20)
    expect(snap.enemies.length).toBeGreaterThanOrEqual(30)

    // Byte size consistent with decoded counts (+2 for zone/dynamite count headers)
    const expectedSize =
      HEADER_SIZE +
      snap.players.length * PLAYER_SIZE +
      snap.bullets.length * BULLET_SIZE +
      snap.enemies.length * ENEMY_SIZE +
      2 // zone + dynamite count headers
    expect(encoded.byteLength).toBe(expectedSize)

    // Verify the per-entity sizes match spec (2 players + 20 bullets + 30 enemies + 2 section headers)
    // 14 + 76 + 420 + 390 + 2 = 902
    expect(HEADER_SIZE + 2 * PLAYER_SIZE + 20 * BULLET_SIZE + 30 * ENEMY_SIZE + 2).toBe(902)
  })

  it('lastProcessedSeq round-trip with playerSeqs map', () => {
    const world = createGameWorld(12)
    const eid = spawnPlayer(world, 0, 0, 0)

    const playerSeqs = new Map<number, number>([[eid, 12345]])
    const encoded = encodeSnapshot(world, 0, playerSeqs)
    const snap = decodeSnapshot(encoded)

    expect(snap.players).toHaveLength(1)
    expect(snap.players[0]!.lastProcessedSeq).toBe(12345)
  })

  it('lastProcessedSeq defaults to 0 without playerSeqs', () => {
    const world = createGameWorld(13)
    spawnPlayer(world, 0, 0, 0)

    const encoded = encodeSnapshot(world, 0)
    const snap = decodeSnapshot(encoded)

    expect(snap.players[0]!.lastProcessedSeq).toBe(0)
  })

  it('serverTime survives float32 round-trip', () => {
    const world = createGameWorld(11)
    const serverTime = 9876543.21

    const encoded = encodeSnapshot(world, serverTime)
    const snap = decodeSnapshot(encoded)
    expect(snap.serverTime).toBe(Math.fround(serverTime))
  })

  it('player with active Showdown round-trips correctly', () => {
    const world = createGameWorld(20)
    const eid = spawnPlayer(world, 0, 0, 0)
    addComponent(world, Showdown, eid)
    Showdown.active[eid] = 1
    Showdown.targetEid[eid] = 42

    const snap = decodeSnapshot(encodeSnapshot(world, 0))
    const p = snap.players[0]!
    expect(p.showdownActive).toBe(1)
    expect(p.showdownTargetEid).toBe(42)
  })

  it('Last Rites zones: empty round-trip', () => {
    const world = createGameWorld(21)
    spawnPlayer(world, 0, 0, 0)

    const snap = decodeSnapshot(encodeSnapshot(world, 0))
    expect(snap.lastRitesZones).toHaveLength(0)
  })

  it('Last Rites zones: encode/decode with zones', () => {
    const world = createGameWorld(22)
    const eid = spawnPlayer(world, 0, 0, 0)
    world.lastRitesZones.set(eid, {
      ownerEid: eid,
      active: true,
      x: 150.5,
      y: 250.75,
      radius: 80,
      timeRemaining: 5,
      chainCount: 0,
      chainDamageBonus: 0,
      pendingPulses: [],
      consecratedAccum: new Map(),
    })

    const snap = decodeSnapshot(encodeSnapshot(world, 0))
    expect(snap.lastRitesZones).toHaveLength(1)
    const z = snap.lastRitesZones[0]!
    expect(z.ownerEid).toBe(eid)
    expect(z.x).toBe(Math.fround(150.5))
    expect(z.y).toBe(Math.fround(250.75))
    expect(z.radius).toBe(80)
  })

  it('Last Rites zones: inactive zones are excluded', () => {
    const world = createGameWorld(23)
    const eid = spawnPlayer(world, 0, 0, 0)
    world.lastRitesZones.set(eid, {
      ownerEid: eid,
      active: false,
      x: 100,
      y: 200,
      radius: 50,
      timeRemaining: 0,
      chainCount: 0,
      chainDamageBonus: 0,
      pendingPulses: [],
      consecratedAccum: new Map(),
    })

    const snap = decodeSnapshot(encodeSnapshot(world, 0))
    expect(snap.lastRitesZones).toHaveLength(0)
  })

  it('Dynamites: empty round-trip', () => {
    const world = createGameWorld(24)
    const snap = decodeSnapshot(encodeSnapshot(world, 0))
    expect(snap.dynamites).toHaveLength(0)
  })

  it('Dynamites: encode/decode with items', () => {
    const world = createGameWorld(25)
    const eid = spawnPlayer(world, 0, 0, 0)
    world.dynamites.push({
      x: 300,
      y: 400.5,
      fuseRemaining: 2.5,
      damage: 50,
      radius: 64,
      knockback: 100,
      ownerId: eid,
    })
    world.dynamites.push({
      x: 500,
      y: 600,
      fuseRemaining: 1.0,
      damage: 30,
      radius: 48,
      knockback: 80,
      ownerId: eid,
    })

    const snap = decodeSnapshot(encodeSnapshot(world, 0))
    expect(snap.dynamites).toHaveLength(2)
    const d0 = snap.dynamites[0]!
    expect(d0.x).toBe(300)
    expect(d0.y).toBe(Math.fround(400.5))
    expect(d0.fuseRemaining).toBe(2.5)
    expect(d0.radius).toBe(64)
    expect(d0.ownerEid).toBe(eid)
    const d1 = snap.dynamites[1]!
    expect(d1.x).toBe(500)
    expect(d1.fuseRemaining).toBe(1)
  })
})
