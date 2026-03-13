/**
 * Pattern Executor
 *
 * Bridges the pattern system with the ECS bullet spawning.
 * Takes a PatternDefinition + PatternContext, generates BulletSpawnDescriptors,
 * and calls spawnBullet for each immediate bullet. Delayed bullets are queued
 * on world.pendingBullets for deterministic processing on future ticks.
 */

import type { GameWorld } from '../world'
import type { PatternDefinition, PatternContext, BulletSpawnDescriptor } from '../content/patterns'
import { spawnBullet, CollisionLayer } from '../prefabs'
import { ENEMY_BULLET_RANGE } from '../content/weapons'
import { TICK_RATE } from '../step'

/** Pending delayed bullet for deterministic future spawning */
export interface PendingBullet {
  /** Tick at which this bullet should spawn */
  spawnTick: number
  /** Bullet spawn descriptor */
  desc: BulletSpawnDescriptor
  /** Attacking entity (owner) */
  eid: number
  /** Pattern definition (for sprite/size) */
  patternDef: PatternDefinition
  /** Origin position at time of pattern execution */
  originX: number
  originY: number
}

/**
 * Execute a pattern: generate descriptors and spawn immediate bullets.
 * Delayed bullets (delay > 0) are queued on world.pendingBullets.
 *
 * @returns number of immediately spawned bullets
 */
export function executePattern(
  world: GameWorld,
  eid: number,
  patternDef: PatternDefinition,
  ctx: PatternContext,
): number {
  const descriptors = patternDef.generator(ctx)
  let spawnedCount = 0

  for (let i = 0; i < descriptors.length; i++) {
    const desc = descriptors[i]!
    if (desc.delay > 0) {
      // Queue for future tick
      const delayTicks = Math.round(desc.delay * TICK_RATE)
      world.pendingBullets.push({
        spawnTick: world.tick + delayTicks,
        desc,
        eid,
        patternDef,
        originX: ctx.originX,
        originY: ctx.originY,
      })
    } else {
      spawnPatternBullet(world, eid, desc, patternDef, ctx.originX, ctx.originY)
      spawnedCount++
    }
  }

  return spawnedCount
}

/**
 * Process pending delayed bullets. Called at the start of each tick.
 * @returns number of bullets spawned this tick from the queue
 */
export function processPendingBullets(world: GameWorld): number {
  const pending = world.pendingBullets
  let spawnedCount = 0
  let writeIdx = 0

  for (let i = 0; i < pending.length; i++) {
    const entry = pending[i]!
    if (world.tick >= entry.spawnTick) {
      spawnPatternBullet(world, entry.eid, entry.desc, entry.patternDef, entry.originX, entry.originY)
      spawnedCount++
    } else {
      pending[writeIdx++] = entry
    }
  }

  pending.length = writeIdx
  return spawnedCount
}

/** Spawn a single bullet from a pattern descriptor */
function spawnPatternBullet(
  world: GameWorld,
  eid: number,
  desc: BulletSpawnDescriptor,
  patternDef: PatternDefinition,
  originX: number,
  originY: number,
): void {
  spawnBullet(world, {
    x: originX,
    y: originY,
    vx: Math.cos(desc.angle) * desc.speed,
    vy: Math.sin(desc.angle) * desc.speed,
    damage: desc.damage,
    accel: desc.accel,
    drag: desc.drag,
    range: ENEMY_BULLET_RANGE,
    ownerId: eid,
    layer: CollisionLayer.ENEMY_BULLET,
    spriteId: patternDef.bulletSpriteId,
    size: patternDef.bulletSize,
  })
}
