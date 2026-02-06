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
  EnemyAI, AIState, Enemy, EnemyType, AttackConfig,
  Position, Velocity, Collider, Health, Invincible, Dead, Player,
} from '../components'
import { spawnBullet, CollisionLayer } from '../prefabs'
import { transition } from './enemyAI'
import { CHARGER_CHARGE_SPEED, CHARGER_CHARGE_DURATION } from '../content/enemies'
import { ENEMY_BULLET_RANGE } from '../content/weapons'

const attackQuery = defineQuery([EnemyAI, AttackConfig, Position, Enemy])
const playerQuery = defineQuery([Player, Position])

export function enemyAttackSystem(world: GameWorld, _dt: number): void {
  const enemies = attackQuery(world)
  const players = playerQuery(world)

  // Find first alive player
  let playerEid: number | null = null
  for (const pid of players) {
    if (!hasComponent(world, Dead, pid)) {
      playerEid = pid
      break
    }
  }

  for (const eid of enemies) {
    const state = EnemyAI.state[eid]!

    // Lock charger aim direction on first tick of TELEGRAPH
    if (
      state === AIState.TELEGRAPH &&
      EnemyAI.stateTimer[eid]! === 0 &&
      Enemy.type[eid] === EnemyType.CHARGER &&
      playerEid !== null
    ) {
      const dx = Position.x[playerEid]! - Position.x[eid]!
      const dy = Position.y[playerEid]! - Position.y[eid]!
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len > 0) {
        AttackConfig.aimX[eid] = dx / len
        AttackConfig.aimY[eid] = dy / len
      }
    }

    // Only process entities in ATTACK state
    if (state !== AIState.ATTACK) continue

    // Skip if no alive player
    if (playerEid === null) {
      transition(eid, AIState.RECOVERY)
      continue
    }

    const ex = Position.x[eid]!
    const ey = Position.y[eid]!
    const playerX = Position.x[playerEid]!
    const playerY = Position.y[playerEid]!

    if (Enemy.type[eid] === EnemyType.CHARGER) {
      // Charger: rush in locked aim direction
      const aimX = AttackConfig.aimX[eid]!
      const aimY = AttackConfig.aimY[eid]!
      Velocity.x[eid] = aimX * CHARGER_CHARGE_SPEED
      Velocity.y[eid] = aimY * CHARGER_CHARGE_SPEED

      // Contact damage check
      const chargerR = Collider.radius[eid]!
      const playerR = Collider.radius[playerEid]!
      const cdx = Position.x[playerEid]! - ex
      const cdy = Position.y[playerEid]! - ey
      const distSq = cdx * cdx + cdy * cdy
      const minDist = chargerR + playerR

      if (
        distSq <= minDist * minDist &&
        Health.iframes[playerEid]! <= 0 &&
        !hasComponent(world, Invincible, playerEid)
      ) {
        Health.current[playerEid] = Health.current[playerEid]! - AttackConfig.damage[eid]!
        Health.iframes[playerEid] = Health.iframeDuration[playerEid]!
      }

      // Check charge duration
      if (EnemyAI.stateTimer[eid]! >= CHARGER_CHARGE_DURATION) {
        transition(eid, AIState.RECOVERY)
      }
    } else {
      // Projectile enemies: spawn bullets aimed at player
      const baseAngle = Math.atan2(playerY - ey, playerX - ex)
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
