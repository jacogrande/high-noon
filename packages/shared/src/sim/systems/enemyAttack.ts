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
  Position, Velocity, Collider, Health, Invincible, Dead, Bullet, Knockback, BossPhase,
} from '../components'
import { spawnBullet, CollisionLayer, NO_TARGET } from '../prefabs'
import { transition } from './enemyAI'
import {
  CHARGER_CHARGE_SPEED, CHARGER_CHARGE_DURATION,
  BOOMSTICK_PHASE_1_RING_BULLETS,
  BOOMSTICK_PHASE_2_RING_BULLETS,
  BOOMSTICK_PHASE_3_RING_BULLETS,
  BOOMSTICK_BOOM_DAMAGE,
  BOOMSTICK_BOOM_RADIUS,
  BOOMSTICK_BOOM_FUSE,
  BOOMSTICK_BOOM_THROW_RANGE,
  BOOMSTICK_BOOM_AIM_JITTER,
  BOOMSTICK_BOOM_DELAY_PHASE_2_MIN,
  BOOMSTICK_BOOM_DELAY_PHASE_2_MAX,
  BOOMSTICK_BOOM_DELAY_PHASE_3_MIN,
  BOOMSTICK_BOOM_DELAY_PHASE_3_MAX,
  GOBLIN_BARBARIAN_MELEE_REACH, GOBLIN_BARBARIAN_ATTACK_DURATION,
  GOBLIN_ROGUE_MELEE_REACH, GOBLIN_ROGUE_ATTACK_DURATION,
  GOBLIN_MELEE_KB_SPEED, GOBLIN_MELEE_KB_DURATION,
} from '../content/enemies'
import { ENEMY_BULLET_RANGE, DYNAMITE_KNOCKBACK } from '../content/weapons'

function isGoblinMelee(type: number): boolean {
  return type === EnemyType.GOBLIN_BARBARIAN || type === EnemyType.GOBLIN_ROGUE
}

const BARBARIAN_MELEE_CFG = { meleeReach: GOBLIN_BARBARIAN_MELEE_REACH, attackDuration: GOBLIN_BARBARIAN_ATTACK_DURATION }
const ROGUE_MELEE_CFG = { meleeReach: GOBLIN_ROGUE_MELEE_REACH, attackDuration: GOBLIN_ROGUE_ATTACK_DURATION }

function getGoblinMeleeConfig(type: number) {
  return type === EnemyType.GOBLIN_BARBARIAN ? BARBARIAN_MELEE_CFG : ROGUE_MELEE_CFG
}

const attackQuery = defineQuery([EnemyAI, AttackConfig, Position, Enemy])
const bulletQuery = defineQuery([Bullet])

const BOOMSTICK_RING_DELAY_PHASE_1_MIN = 1
const BOOMSTICK_RING_DELAY_PHASE_1_MAX = 2
const BOOMSTICK_RING_DELAY_PHASE_2_MIN = 0
const BOOMSTICK_RING_DELAY_PHASE_2_MAX = 2
const BOOMSTICK_RING_DELAY_PHASE_3_MIN = 0
const BOOMSTICK_RING_DELAY_PHASE_3_MAX = 1
const BOOMSTICK_FAN_AIM_JITTER = 0.14
const BOOMSTICK_FAN_SPREAD_SCALE_MIN = 0.9
const BOOMSTICK_FAN_SPREAD_SCALE_MAX = 1.15
const BOOMSTICK_FAN_SPEED_SCALE_MIN = 0.96
const BOOMSTICK_FAN_SPEED_SCALE_MAX = 1.12
const BOOMSTICK_RING_SPEED_SCALE_MIN = 0.72
const BOOMSTICK_RING_SPEED_SCALE_MAX = 0.9

function getBoomstickPhase(eid: number, world: GameWorld): number {
  if (!hasComponent(world, BossPhase, eid)) return 1
  return Math.max(1, BossPhase.phase[eid]!)
}

function getBoomstickRingCount(phase: number): number {
  if (phase >= 3) return BOOMSTICK_PHASE_3_RING_BULLETS
  if (phase === 2) return BOOMSTICK_PHASE_2_RING_BULLETS
  return BOOMSTICK_PHASE_1_RING_BULLETS
}

function rollBoomstickRingDelay(world: GameWorld, phase: number): number {
  let min = BOOMSTICK_RING_DELAY_PHASE_1_MIN
  let max = BOOMSTICK_RING_DELAY_PHASE_1_MAX
  if (phase >= 3) {
    min = BOOMSTICK_RING_DELAY_PHASE_3_MIN
    max = BOOMSTICK_RING_DELAY_PHASE_3_MAX
  } else if (phase === 2) {
    min = BOOMSTICK_RING_DELAY_PHASE_2_MIN
    max = BOOMSTICK_RING_DELAY_PHASE_2_MAX
  }
  return min + world.rng.nextInt(max - min + 1)
}

function rollBoomstickBoomDelay(world: GameWorld, phase: number): number {
  let min = BOOMSTICK_BOOM_DELAY_PHASE_2_MIN
  let max = BOOMSTICK_BOOM_DELAY_PHASE_2_MAX
  if (phase >= 3) {
    min = BOOMSTICK_BOOM_DELAY_PHASE_3_MIN
    max = BOOMSTICK_BOOM_DELAY_PHASE_3_MAX
  }
  return min + world.rng.nextInt(max - min + 1)
}

export function enemyAttackSystem(world: GameWorld, _dt: number): void {
  const enemies = attackQuery(world)

  // Fodder projectile cap: track active + spawned-this-tick to prevent overshoot
  let activeBulletCount = bulletQuery(world).length

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

    const type = Enemy.type[eid]!

    // Zero velocity for non-charger attackers (steering delegates ATTACK to this system)
    if (type !== EnemyType.CHARGER) {
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
    } else if (isGoblinMelee(type)) {
      // Goblin melee: proximity check + contact damage
      const { meleeReach, attackDuration } = getGoblinMeleeConfig(type)
      const goblinR = Collider.radius[eid]!
      const targetR = Collider.radius[targetEid]!
      const mdx = targetX - ex
      const mdy = targetY - ey
      const distSq = mdx * mdx + mdy * mdy
      const hitDist = goblinR + targetR + meleeReach

      if (
        distSq <= hitDist * hitDist &&
        Health.iframes[targetEid]! <= 0 &&
        !hasComponent(world, Invincible, targetEid)
      ) {
        // Deal damage
        Health.current[targetEid] = Health.current[targetEid]! - AttackConfig.damage[eid]!
        Health.iframes[targetEid] = Health.iframeDuration[targetEid]!

        // Store hit direction for camera kick
        const dist = Math.sqrt(distSq)
        const nx = dist > 0 ? mdx / dist : 0
        const ny = dist > 0 ? mdy / dist : 1
        world.lastPlayerHitDir.set(targetEid, { x: nx, y: ny })

        // Apply knockback to player
        addComponent(world, Knockback, targetEid)
        Knockback.vx[targetEid] = nx * GOBLIN_MELEE_KB_SPEED
        Knockback.vy[targetEid] = ny * GOBLIN_MELEE_KB_SPEED
        Knockback.duration[targetEid] = GOBLIN_MELEE_KB_DURATION

        transition(eid, AIState.RECOVERY)
      } else if (EnemyAI.stateTimer[eid]! >= attackDuration) {
        // Whiffed — transition to recovery
        transition(eid, AIState.RECOVERY)
      }
    } else if (type === EnemyType.BOOMSTICK) {
      // Stage 1 boss cadence: fan and halo are offset, with jittered timings/angles.
      const speed = AttackConfig.projectileSpeed[eid]!
      const accel = AttackConfig.projectileAccel[eid]!
      const drag = AttackConfig.projectileDrag[eid]!
      const damage = AttackConfig.damage[eid]!
      const baseAngle = Math.atan2(targetY - ey, targetX - ex)
      const phase = getBoomstickPhase(eid, world)
      const ringDelayRemaining = Math.max(0, Math.floor(AttackConfig.aimX[eid]!))
      const fireRing = ringDelayRemaining <= 0
      const fireFan = !fireRing

      if (fireFan) {
        const fanCount = AttackConfig.projectileCount[eid]!
        const fanSpread = AttackConfig.spreadAngle[eid]! * world.rng.nextRange(
          BOOMSTICK_FAN_SPREAD_SCALE_MIN,
          BOOMSTICK_FAN_SPREAD_SCALE_MAX,
        )
        const fanBaseAngle = baseAngle + world.rng.nextRange(-BOOMSTICK_FAN_AIM_JITTER, BOOMSTICK_FAN_AIM_JITTER)

        for (let i = 0; i < fanCount; i++) {
          const fanAngle = fanCount === 1
            ? fanBaseAngle
            : fanBaseAngle + fanSpread * (i / (fanCount - 1) - 0.5)
          const fanBulletSpeed = speed * world.rng.nextRange(
            BOOMSTICK_FAN_SPEED_SCALE_MIN,
            BOOMSTICK_FAN_SPEED_SCALE_MAX,
          )
          spawnBullet(world, {
            x: ex,
            y: ey,
            vx: Math.cos(fanAngle) * fanBulletSpeed,
            vy: Math.sin(fanAngle) * fanBulletSpeed,
            damage,
            accel,
            drag,
            range: ENEMY_BULLET_RANGE,
            ownerId: eid,
            layer: CollisionLayer.ENEMY_BULLET,
          })
        }
        activeBulletCount += fanCount
      }

      if (fireRing) {
        const ringCount = getBoomstickRingCount(phase)
        const ringStep = (Math.PI * 2) / ringCount
        const ringOffset = world.rng.nextRange(0, Math.PI * 2)
        const ringBulletSpeed = speed * world.rng.nextRange(
          BOOMSTICK_RING_SPEED_SCALE_MIN,
          BOOMSTICK_RING_SPEED_SCALE_MAX,
        )
        for (let i = 0; i < ringCount; i++) {
          const ringAngle = ringOffset + i * ringStep
          spawnBullet(world, {
            x: ex,
            y: ey,
            vx: Math.cos(ringAngle) * ringBulletSpeed,
            vy: Math.sin(ringAngle) * ringBulletSpeed,
            damage,
            accel,
            drag,
            range: ENEMY_BULLET_RANGE,
            ownerId: eid,
            layer: CollisionLayer.ENEMY_BULLET,
          })
        }
        activeBulletCount += ringCount
        AttackConfig.aimX[eid] = rollBoomstickRingDelay(world, phase)
      } else {
        AttackConfig.aimX[eid] = ringDelayRemaining - 1
      }

      // Phase 2+ also gains "boom" throws (prospector-style dynamite telegraphs).
      if (phase >= 2) {
        const boomDelayRemaining = Math.max(0, Math.floor(AttackConfig.aimY[eid]!))
        if (boomDelayRemaining <= 0) {
          let boomX = targetX + world.rng.nextRange(-BOOMSTICK_BOOM_AIM_JITTER, BOOMSTICK_BOOM_AIM_JITTER)
          let boomY = targetY + world.rng.nextRange(-BOOMSTICK_BOOM_AIM_JITTER, BOOMSTICK_BOOM_AIM_JITTER)
          const bdx = boomX - ex
          const bdy = boomY - ey
          const distSq = bdx * bdx + bdy * bdy
          const maxRangeSq = BOOMSTICK_BOOM_THROW_RANGE * BOOMSTICK_BOOM_THROW_RANGE
          if (distSq > maxRangeSq) {
            const dist = Math.sqrt(distSq)
            boomX = ex + (bdx / dist) * BOOMSTICK_BOOM_THROW_RANGE
            boomY = ey + (bdy / dist) * BOOMSTICK_BOOM_THROW_RANGE
          }
          world.dynamites.push({
            x: boomX,
            y: boomY,
            startX: ex,
            startY: ey,
            fuseRemaining: BOOMSTICK_BOOM_FUSE,
            maxFuse: BOOMSTICK_BOOM_FUSE,
            damage: BOOMSTICK_BOOM_DAMAGE,
            radius: BOOMSTICK_BOOM_RADIUS,
            knockback: DYNAMITE_KNOCKBACK,
            ownerId: eid,
          })
          AttackConfig.aimY[eid] = rollBoomstickBoomDelay(world, phase)
        } else {
          AttackConfig.aimY[eid] = boomDelayRemaining - 1
        }
      }

      transition(eid, AIState.RECOVERY)
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
