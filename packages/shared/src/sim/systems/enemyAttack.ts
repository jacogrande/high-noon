/**
 * Enemy Attack System
 *
 * Handles attack execution for enemies in the ATTACK state:
 * - Projectile enemies (Swarmer, Grunt, Shooter): spawn bullets aimed at player
 * - Charger: rush in locked direction with contact damage
 *
 * Runs after enemySteeringSystem (which zeros velocity for non-CHASE states)
 * and before movementSystem (which applies velocity).
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import {
  EnemyAI, AIState, Enemy, EnemyType, EnemyTier, AttackConfig,
  Position, Velocity, Collider, Health, Invincible, Dead, Bullet,
} from '../components'
import { spawnBullet, CollisionLayer, NO_TARGET } from '../prefabs'
import { transition } from './enemyAI'
import { CHARGER_CHARGE_SPEED, CHARGER_CHARGE_DURATION } from '../content/enemies'
import { ENEMY_BULLET_RANGE } from '../content/weapons'

const attackQuery = defineQuery([EnemyAI, AttackConfig, Position, Enemy])
const bulletQuery = defineQuery([Bullet])

export function enemyAttackSystem(world: GameWorld, _dt: number): void {
  const enemies = attackQuery(world)

  // Hoist bullet count for fodder projectile cap (avoid per-enemy query)
  const activeBulletCount = bulletQuery(world).length

  for (const eid of enemies) {
    const state = EnemyAI.state[eid]!
    const targetEid = EnemyAI.targetEid[eid]!
    const hasTarget = targetEid !== NO_TARGET && !hasComponent(world, Dead, targetEid)

    // Lock charger aim direction on first tick of TELEGRAPH
    if (
      state === AIState.TELEGRAPH &&
      EnemyAI.stateTimer[eid]! === 0 &&
      Enemy.type[eid] === EnemyType.CHARGER &&
      hasTarget
    ) {
      const dx = Position.x[targetEid]! - Position.x[eid]!
      const dy = Position.y[targetEid]! - Position.y[eid]!
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len > 0) {
        AttackConfig.aimX[eid] = dx / len
        AttackConfig.aimY[eid] = dy / len
      }
    }

    // Only process entities in ATTACK state
    if (state !== AIState.ATTACK) continue

    // No valid target → abort to recovery
    if (!hasTarget) {
      transition(eid, AIState.RECOVERY)
      continue
    }

    const ex = Position.x[eid]!
    const ey = Position.y[eid]!
    const targetX = Position.x[targetEid]!
    const targetY = Position.y[targetEid]!

    // Zero velocity for non-charger attackers (steering delegates ATTACK to this system)
    if (Enemy.type[eid] !== EnemyType.CHARGER) {
      Velocity.x[eid] = 0
      Velocity.y[eid] = 0
    }

    if (Enemy.type[eid] === EnemyType.CHARGER) {
      // Charger: set rush velocity once on ATTACK entry (aimX/aimY locked at TELEGRAPH)
      if (EnemyAI.stateTimer[eid]! === 0) {
        Velocity.x[eid] = AttackConfig.aimX[eid]! * CHARGER_CHARGE_SPEED
        Velocity.y[eid] = AttackConfig.aimY[eid]! * CHARGER_CHARGE_SPEED
      }

      // Contact damage check against assigned target
      const chargerR = Collider.radius[eid]!
      const targetR = Collider.radius[targetEid]!
      const cdx = targetX - ex
      const cdy = targetY - ey
      const distSq = cdx * cdx + cdy * cdy
      const minDist = chargerR + targetR

      if (
        distSq <= minDist * minDist &&
        Health.iframes[targetEid]! <= 0 &&
        !hasComponent(world, Invincible, targetEid)
      ) {
        Health.current[targetEid] = Health.current[targetEid]! - AttackConfig.damage[eid]!
        Health.iframes[targetEid] = Health.iframeDuration[targetEid]!

        // Store hit direction per-player for camera kick (charger charge direction)
        world.lastPlayerHitDir.set(targetEid, {
          x: AttackConfig.aimX[eid]!,
          y: AttackConfig.aimY[eid]!,
        })
      }

      // Check charge duration
      if (EnemyAI.stateTimer[eid]! >= CHARGER_CHARGE_DURATION) {
        transition(eid, AIState.RECOVERY)
      }
    } else {
      // Fodder projectile cap — skip shot if at limit
      if (Enemy.tier[eid] === EnemyTier.FODDER) {
        if (activeBulletCount >= world.maxProjectiles) {
          transition(eid, AIState.RECOVERY)
          continue
        }
      }

      // Projectile enemies: spawn bullets aimed at assigned target
      const baseAngle = Math.atan2(targetY - ey, targetX - ex)
      const count = AttackConfig.projectileCount[eid]!
      const spread = AttackConfig.spreadAngle[eid]!
      const speed = AttackConfig.projectileSpeed[eid]!
      const damage = AttackConfig.damage[eid]!

      for (let i = 0; i < count; i++) {
        let bulletAngle: number
        if (count === 1) {
          bulletAngle = baseAngle
        } else {
          bulletAngle = baseAngle + spread * (i / (count - 1) - 0.5)
        }

        spawnBullet(world, {
          x: ex,
          y: ey,
          vx: Math.cos(bulletAngle) * speed,
          vy: Math.sin(bulletAngle) * speed,
          damage,
          range: ENEMY_BULLET_RANGE,
          ownerId: eid,
          layer: CollisionLayer.ENEMY_BULLET,
        })
      }

      transition(eid, AIState.RECOVERY)
    }
  }
}
