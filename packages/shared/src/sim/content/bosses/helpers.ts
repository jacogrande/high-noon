/**
 * Shared Boss Spawn Helpers
 *
 * Common component setup and default initialization used by all boss modules.
 */

import { addComponent, defineQuery } from 'bitecs'
import type { GameWorld } from '../../world'
import {
  Position, Velocity, Speed, Collider, Health,
  Enemy, EnemyAI, AIState, Detection, AttackConfig, Steering,
  Bullet,
} from '../../components'
import { CollisionLayer, NO_TARGET, removeBullet } from '../../prefabs'
import { isSolidAt } from '../../tilemap'

const enemyBulletQuery = defineQuery([Bullet, Collider])

/** Add all standard enemy components to an entity. */
export function addEnemyComponents(world: GameWorld, eid: number): void {
  addComponent(world, Position, eid)
  addComponent(world, Velocity, eid)
  addComponent(world, Speed, eid)
  addComponent(world, Collider, eid)
  addComponent(world, Health, eid)
  addComponent(world, Enemy, eid)
  addComponent(world, EnemyAI, eid)
  addComponent(world, Detection, eid)
  addComponent(world, AttackConfig, eid)
  addComponent(world, Steering, eid)
}

/** Set standard enemy defaults for position, collision, AI, and steering. */
export function setEnemyDefaults(world: GameWorld, eid: number, x: number, y: number): void {
  Position.x[eid] = x
  Position.y[eid] = y
  Position.prevX[eid] = x
  Position.prevY[eid] = y
  Velocity.x[eid] = 0
  Velocity.y[eid] = 0
  Collider.layer[eid] = CollisionLayer.ENEMY
  Health.iframes[eid] = 0
  Health.iframeDuration[eid] = 0
  EnemyAI.state[eid] = AIState.IDLE
  EnemyAI.stateTimer[eid] = 0
  EnemyAI.targetEid[eid] = NO_TARGET
  EnemyAI.initialDelay[eid] = 0
  Detection.staggerOffset[eid] = world.tick % 5
  AttackConfig.cooldownRemaining[eid] = 0
  AttackConfig.projectileAccel[eid] = 0
  AttackConfig.projectileDrag[eid] = 0
  AttackConfig.aimX[eid] = 0
  AttackConfig.aimY[eid] = 0
  Steering.seekWeight[eid] = 1.0
  Steering.separationWeight[eid] = 1.0
}

/** Remove all enemy bullets currently in the world. Called on boss phase transitions for breathing room. */
export function cancelEnemyBullets(world: GameWorld): void {
  for (const eid of enemyBulletQuery(world)) {
    if (Collider.layer[eid] === CollisionLayer.ENEMY_BULLET) {
      removeBullet(world, eid)
    }
  }
}

/** Default summon placement constants */
const DEFAULT_SUMMON_MIN_RADIUS = 64
const DEFAULT_SUMMON_MAX_RADIUS = 160
const DEFAULT_SUMMON_MAX_ATTEMPTS = 12

/**
 * Pick a non-solid spawn position near a center point.
 * Used by multiple boss modules for add spawning.
 *
 * @param baseAngle - If provided, jitters around this angle. Otherwise picks fully random angle.
 * @param minRadius / maxRadius - Override default radius range.
 */
export function pickSummonPosition(
  world: GameWorld,
  centerX: number,
  centerY: number,
  opts?: {
    baseAngle?: number
    minRadius?: number
    maxRadius?: number
    maxAttempts?: number
    fallbackRadius?: number
  },
): { x: number; y: number } {
  const tilemap = world.tilemap
  const minRadius = opts?.minRadius ?? DEFAULT_SUMMON_MIN_RADIUS
  const maxRadius = opts?.maxRadius ?? DEFAULT_SUMMON_MAX_RADIUS
  const maxAttempts = opts?.maxAttempts ?? DEFAULT_SUMMON_MAX_ATTEMPTS
  const hasBaseAngle = opts?.baseAngle !== undefined

  for (let i = 0; i < maxAttempts; i++) {
    const angle = hasBaseAngle
      ? opts!.baseAngle! + world.rng.nextRange(-0.6, 0.6)
      : world.rng.next() * Math.PI * 2
    const dist = hasBaseAngle
      ? world.rng.nextRange(minRadius, maxRadius)
      : minRadius + world.rng.next() * (maxRadius - minRadius)
    const x = centerX + Math.cos(angle) * dist
    const y = centerY + Math.sin(angle) * dist
    if (tilemap && isSolidAt(tilemap, x, y)) continue
    return { x, y }
  }

  // Fallback position
  if (hasBaseAngle) {
    const fallbackRadius = opts?.fallbackRadius ?? 96
    const fallbackX = centerX + Math.cos(opts!.baseAngle!) * fallbackRadius
    const fallbackY = centerY + Math.sin(opts!.baseAngle!) * fallbackRadius
    if (tilemap && isSolidAt(tilemap, fallbackX, fallbackY)) {
      return { x: centerX, y: centerY }
    }
    return { x: fallbackX, y: fallbackY }
  }

  return { x: centerX + minRadius, y: centerY }
}
