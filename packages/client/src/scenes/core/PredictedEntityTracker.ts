import { defineQuery, removeEntity } from 'bitecs'
import {
  Bullet,
  Collider,
  CollisionLayer,
  Position,
  Velocity,
  PISTOL_BULLET_SPEED,
  type BulletSnapshot,
  type GameWorld,
} from '@high-noon/shared'

/** Query for predicted bullet tracking */
const predictedBulletQuery = defineQuery([Bullet, Position, Velocity])

/** Predicted bullet constants */
const PREDICTED_BULLET_TIMEOUT = 30  // ticks (~500ms)
const BULLET_MATCH_TOLERANCE = 40    // pixels
const BULLET_MATCH_FALLBACK_TOLERANCE = 180 // pixels (high-latency safety net)

export class PredictedEntityTracker {
  private readonly predictedBullets = new Set<number>()
  private readonly predictedBulletSpawnTick = new Map<number, number>()
  private readonly localTimelineBullets = new Set<number>()
  private readonly serverBulletClientEids = new Set<number>()

  getLocalTimelineBullets(): ReadonlySet<number> {
    return this.localTimelineBullets
  }

  setBulletLocalTimeline(clientEid: number, localTimeline: boolean): void {
    if (localTimeline) {
      this.localTimelineBullets.add(clientEid)
    } else {
      this.localTimelineBullets.delete(clientEid)
    }
  }

  isLocalTimelineBullet(clientEid: number): boolean {
    return this.localTimelineBullets.has(clientEid)
  }

  clearLocalTimelineBullets(): void {
    this.localTimelineBullets.clear()
  }

  markServerBullet(clientEid: number): void {
    this.serverBulletClientEids.add(clientEid)
  }

  unmarkServerBullet(clientEid: number): void {
    this.serverBulletClientEids.delete(clientEid)
    this.localTimelineBullets.delete(clientEid)
  }

  detectNewPredictedBullets(world: GameWorld, myClientEid: number, predictionTick: number): number {
    let spawned = 0
    const allBullets = predictedBulletQuery(world)
    for (const eid of allBullets) {
      // Skip bullets already tracked (either server-mapped or predicted)
      if (this.predictedBullets.has(eid)) continue
      if (this.serverBulletClientEids.has(eid)) continue

      // Only track player bullets owned by local player
      if (Collider.layer[eid] !== CollisionLayer.PLAYER_BULLET) continue
      if (myClientEid < 0 || Bullet.ownerId[eid] !== myClientEid) continue

      this.predictedBullets.add(eid)
      this.predictedBulletSpawnTick.set(eid, predictionTick)
      this.localTimelineBullets.add(eid)
      spawned++
    }
    return spawned
  }

  findMatchingPredictedBullet(world: GameWorld, bullet: BulletSnapshot, rttMs: number): number {
    // Primary tolerance compensates for one-way network delay.
    const latencyComp = Math.min(120, (Math.max(0, rttMs) * 0.5 * PISTOL_BULLET_SPEED) / 1000)
    const primaryTolerance = BULLET_MATCH_TOLERANCE + latencyComp

    let bestEid = -1
    let bestDist = Number.POSITIVE_INFINITY

    for (const eid of this.predictedBullets) {
      const dx = Position.x[eid]! - bullet.x
      const dy = Position.y[eid]! - bullet.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < bestDist) {
        bestDist = dist
        bestEid = eid
      }
    }

    if (bestEid < 0) return -1
    if (bestDist <= primaryTolerance) return bestEid
    if (bestDist <= BULLET_MATCH_FALLBACK_TOLERANCE) return bestEid
    return -1
  }

  adoptMatchedPredictedBullet(clientEid: number): void {
    this.predictedBullets.delete(clientEid)
    this.predictedBulletSpawnTick.delete(clientEid)
    this.localTimelineBullets.add(clientEid)
  }

  cleanupPredictedBullets(world: GameWorld, predictionTick: number): number {
    const toRemove: number[] = []
    for (const eid of this.predictedBullets) {
      const spawnTick = this.predictedBulletSpawnTick.get(eid)!
      if (predictionTick - spawnTick > PREDICTED_BULLET_TIMEOUT) {
        toRemove.push(eid)
      }
    }

    for (const eid of toRemove) {
      removeEntity(world, eid)
      this.predictedBullets.delete(eid)
      this.predictedBulletSpawnTick.delete(eid)
      this.localTimelineBullets.delete(eid)
    }

    return toRemove.length
  }

  clear(world: GameWorld): void {
    for (const eid of this.predictedBullets) {
      removeEntity(world, eid)
    }
    this.predictedBullets.clear()
    this.predictedBulletSpawnTick.clear()
    this.localTimelineBullets.clear()
    this.serverBulletClientEids.clear()
  }
}
