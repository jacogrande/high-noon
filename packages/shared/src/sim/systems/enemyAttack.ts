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

import { addComponent, defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import {
  EnemyAI, AIState, Enemy, EnemyType, EnemyTier, AttackConfig,
  Position, Velocity, Collider, Health, Invincible, Dead, Bullet, Knockback, Player,
} from '../components'
import { spawnBullet, CollisionLayer, NO_TARGET } from '../prefabs'
import { transition } from './enemyAI'
import {
  CHARGER_CHARGE_SPEED, CHARGER_CHARGE_DURATION,
  GOBLIN_BARBARIAN_MELEE_REACH, GOBLIN_BARBARIAN_ATTACK_DURATION,
  GOBLIN_ROGUE_MELEE_REACH, GOBLIN_ROGUE_ATTACK_DURATION,
  GOBLIN_MELEE_KB_SPEED, GOBLIN_MELEE_KB_DURATION,
  DUELIST_MELEE_REACH, DUELIST_ATTACK_DURATION,
  DUELIST_MELEE_KB_SPEED, DUELIST_MELEE_KB_DURATION,
} from '../content/enemies'
import { ENEMY_BULLET_RANGE } from '../content/weapons'
import { applyDamage } from './applyDamage'
import { isBoss, getBoss } from '../content/bosses'

function isMeleeEnemy(type: number): boolean {
  return type === EnemyType.GOBLIN_BARBARIAN || type === EnemyType.GOBLIN_ROGUE || type === EnemyType.DUELIST
}

const BARBARIAN_MELEE_CFG = { meleeReach: GOBLIN_BARBARIAN_MELEE_REACH, attackDuration: GOBLIN_BARBARIAN_ATTACK_DURATION, kbSpeed: GOBLIN_MELEE_KB_SPEED, kbDuration: GOBLIN_MELEE_KB_DURATION }
const ROGUE_MELEE_CFG = { meleeReach: GOBLIN_ROGUE_MELEE_REACH, attackDuration: GOBLIN_ROGUE_ATTACK_DURATION, kbSpeed: GOBLIN_MELEE_KB_SPEED, kbDuration: GOBLIN_MELEE_KB_DURATION }
const DUELIST_MELEE_CFG = { meleeReach: DUELIST_MELEE_REACH, attackDuration: DUELIST_ATTACK_DURATION, kbSpeed: DUELIST_MELEE_KB_SPEED, kbDuration: DUELIST_MELEE_KB_DURATION }

function getMeleeConfig(type: number) {
  if (type === EnemyType.DUELIST) return DUELIST_MELEE_CFG
  return type === EnemyType.GOBLIN_BARBARIAN ? BARBARIAN_MELEE_CFG : ROGUE_MELEE_CFG
}

const attackQuery = defineQuery([EnemyAI, AttackConfig, Position, Enemy])
const bulletQuery = defineQuery([Bullet])

export function enemyAttackSystem(world: GameWorld, _dt: number): void {
  const enemies = attackQuery(world)

  // Fodder projectile cap: track active + spawned-this-tick to prevent overshoot
  let activeBulletCount = bulletQuery(world).length

  for (const eid of enemies) {
    const state = EnemyAI.state[eid]!
    const targetEid = EnemyAI.targetEid[eid]!
    const hasTarget = targetEid !== NO_TARGET && hasComponent(world, Position, targetEid) && !hasComponent(world, Dead, targetEid)

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

    const type = Enemy.type[eid]!

    // Zero velocity for non-charger, non-boss attackers (bosses manage their own velocity)
    if (type !== EnemyType.CHARGER && !isBoss(type)) {
      Velocity.x[eid] = 0
      Velocity.y[eid] = 0
    }

    if (type === EnemyType.CHARGER) {
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

      // Duel guard: non-duelist chargers can't damage player during active duel
      const chargerObj = world.objective
      const chargerDuelActive = chargerObj && chargerObj.type === 'duel' && chargerObj.status === 'active'
      const chargerBlockedByDuel = chargerDuelActive && eid !== chargerObj!.duelistEid && hasComponent(world, Player, targetEid)

      if (
        !chargerBlockedByDuel &&
        distSq <= minDist * minDist &&
        Health.iframes[targetEid]! <= 0 &&
        !hasComponent(world, Invincible, targetEid)
      ) {
        applyDamage(world, targetEid, {
          amount: AttackConfig.damage[eid]!,
          attackerEid: eid,
          setIframes: true,
        })

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
    } else if (isMeleeEnemy(type)) {
      // Melee enemy: proximity check + contact damage
      const meleeCfg = getMeleeConfig(type)
      const meleeR = Collider.radius[eid]!
      const targetR = Collider.radius[targetEid]!
      const mdx = targetX - ex
      const mdy = targetY - ey
      const distSq = mdx * mdx + mdy * mdy
      const hitDist = meleeR + targetR + meleeCfg.meleeReach

      // Duel guard: non-duelist melee enemies can't damage a player during active duel
      const obj = world.objective
      const duelActive = obj && obj.type === 'duel' && obj.status === 'active'
      const blockedByDuel = duelActive && eid !== obj!.duelistEid && hasComponent(world, Player, targetEid)

      if (
        !blockedByDuel &&
        distSq <= hitDist * hitDist &&
        Health.iframes[targetEid]! <= 0 &&
        !hasComponent(world, Invincible, targetEid)
      ) {
        // Deal damage
        applyDamage(world, targetEid, {
          amount: AttackConfig.damage[eid]!,
          attackerEid: eid,
          setIframes: true,
        })

        // Store hit direction for camera kick
        const dist = Math.sqrt(distSq)
        const nx = dist > 0 ? mdx / dist : 0
        const ny = dist > 0 ? mdy / dist : 1
        world.lastPlayerHitDir.set(targetEid, { x: nx, y: ny })

        // Apply knockback to player
        addComponent(world, Knockback, targetEid)
        Knockback.vx[targetEid] = nx * meleeCfg.kbSpeed
        Knockback.vy[targetEid] = ny * meleeCfg.kbSpeed
        Knockback.duration[targetEid] = meleeCfg.kbDuration

        transition(eid, AIState.RECOVERY)
      } else if (EnemyAI.stateTimer[eid]! >= meleeCfg.attackDuration) {
        // Whiffed — transition to recovery
        transition(eid, AIState.RECOVERY)
      }
    } else if (isBoss(type)) {
      // Delegate to boss module's attack handler
      getBoss(type)!.attack(world, eid, _dt)
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
      const accel = AttackConfig.projectileAccel[eid]!
      const drag = AttackConfig.projectileDrag[eid]!
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
          accel,
          drag,
          range: ENEMY_BULLET_RANGE,
          ownerId: eid,
          layer: CollisionLayer.ENEMY_BULLET,
        })
      }

      activeBulletCount += count
      transition(eid, AIState.RECOVERY)
    }
  }
}
