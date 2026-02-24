/**
 * Enemy Attack System
 *
 * Handles attack execution for enemies in the ATTACK state:
 * - Projectile enemies (Swarmer, Grunt, Shooter): spawn bullets aimed at player
 * - Rush enemies (Charger, Coyote): dash in locked direction with contact damage
 * - Melee enemies (Goblin Barbarian/Rogue, Duelist): proximity hit with knockback
 *
 * Runs after enemySteeringSystem (which zeros velocity for non-CHASE states)
 * and before movementSystem (which applies velocity).
 */

import { addComponent, defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import {
  EnemyAI, AIState, Enemy, EnemyType, EnemyTier, AttackConfig, Detection,
  Position, Velocity, Collider, Health, Invincible, Dead, Bullet, Knockback, Player,
  Root,
} from '../components'
import { spawnBullet, CollisionLayer, NO_TARGET } from '../prefabs'
import { transition } from './enemyAI'
import { ENEMY_BULLET_RANGE, BulletSpriteId, ENEMY_BULLET_SIZE_THREAT, ENEMY_BULLET_SIZE_FODDER } from '../content/weapons'
import { LASSO_ROOT_DURATION, DYNAMITE_TOSSER_FUSE_TIME, DYNAMITE_TOSSER_BLAST_RADIUS, RATTLESNAKE_POISON_DPS, RATTLESNAKE_POISON_DURATION } from '../content/enemies'
import { applyDamage } from './applyDamage'
import { applyPoison } from './poison'
import { isBoss, getBoss } from '../content/bosses'
import { getEnemyDef } from '../content/enemyRegistry'
import { forEachAliveEnemyInRadius } from './damageHelpers'

/**
 * Shared rush-attack handler for charger and coyote (dart-and-bite).
 * Sets velocity on first tick, checks contact damage, transitions to RECOVERY after duration.
 */
function handleRushAttack(
  world: GameWorld,
  eid: number,
  targetEid: number,
  rushSpeed: number,
  rushDuration: number,
  blockedByDuel: boolean,
): void {
  if (EnemyAI.stateTimer[eid]! === 0) {
    Velocity.x[eid] = AttackConfig.aimX[eid]! * rushSpeed
    Velocity.y[eid] = AttackConfig.aimY[eid]! * rushSpeed
  }

  const attackerR = Collider.radius[eid]!
  const targetR = Collider.radius[targetEid]!
  const dx = Position.x[targetEid]! - Position.x[eid]!
  const dy = Position.y[targetEid]! - Position.y[eid]!
  const distSq = dx * dx + dy * dy
  const minDist = attackerR + targetR

  if (
    !blockedByDuel &&
    distSq <= minDist * minDist &&
    Health.iframes[targetEid]! <= 0 &&
    !hasComponent(world, Invincible, targetEid)
  ) {
    applyDamage(world, targetEid, {
      amount: AttackConfig.damage[eid]!,
      attackerEid: eid,
      setIframes: true,
    })
    world.lastPlayerHitDir.set(targetEid, {
      x: AttackConfig.aimX[eid]!,
      y: AttackConfig.aimY[eid]!,
    })
  }

  if (EnemyAI.stateTimer[eid]! >= rushDuration) {
    transition(eid, AIState.RECOVERY)
  }
}

/** Get melee config from registry. Falls back to safe defaults. */
function getMeleeConfig(type: number) {
  const def = getEnemyDef(type)
  return {
    meleeReach: def?.meleeReach ?? 10,
    attackDuration: def?.attackDuration ?? 0.25,
    kbSpeed: def?.knockbackSpeed ?? 200,
    kbDuration: def?.knockbackDuration ?? 0.12,
  }
}

/** Get rush config from registry. Falls back to safe defaults. */
function getRushConfig(type: number) {
  const def = getEnemyDef(type)
  return {
    rushSpeed: def?.rushSpeed ?? 300,
    rushDuration: def?.rushDuration ?? 0.4,
  }
}

const attackQuery = defineQuery([EnemyAI, AttackConfig, Position, Enemy])
const bulletQuery = defineQuery([Bullet])

export function enemyAttackSystem(world: GameWorld, _dt: number): void {
  const enemies = attackQuery(world)

  // Clear healer pulse events from previous tick
  world.healerPulses.length = 0

  // Fodder projectile cap: track active + spawned-this-tick to prevent overshoot
  let activeBulletCount = bulletQuery(world).length

  for (const eid of enemies) {
    const state = EnemyAI.state[eid]!
    const targetEid = EnemyAI.targetEid[eid]!
    const hasTarget = targetEid !== NO_TARGET && hasComponent(world, Position, targetEid) && !hasComponent(world, Dead, targetEid)

    const type = Enemy.type[eid]!
    const def = getEnemyDef(type)

    // Lock rush-attack aim direction on first tick of TELEGRAPH
    if (
      state === AIState.TELEGRAPH &&
      EnemyAI.stateTimer[eid]! === 0 &&
      def?.attackStyle === 'rush' &&
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

    // Determine attack style: boss > registry > fallback projectile
    const attackStyle = def?.attackStyle

    // Zero velocity for non-rush, non-boss attackers (bosses manage their own velocity)
    if (attackStyle !== 'rush' && !isBoss(type)) {
      Velocity.x[eid] = 0
      Velocity.y[eid] = 0
    }

    if (isBoss(type)) {
      // Delegate to boss module's attack handler
      getBoss(type)!.attack(world, eid, _dt)
    } else if (attackStyle === 'rush') {
      const rushCfg = getRushConfig(type)
      // Duel guard: non-duelist rush enemies can't damage player during active duel
      const obj = world.objective
      const duelActive = obj && obj.type === 'duel' && obj.status === 'active'
      const blockedByDuel = !!duelActive && eid !== obj!.duelistEid && hasComponent(world, Player, targetEid)
      handleRushAttack(world, eid, targetEid, rushCfg.rushSpeed, rushCfg.rushDuration, blockedByDuel)
    } else if (attackStyle === 'melee') {
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

        // Rattlesnake bite applies poison
        if (type === EnemyType.RATTLESNAKE && hasComponent(world, Player, targetEid)) {
          applyPoison(world, targetEid, RATTLESNAKE_POISON_DPS, RATTLESNAKE_POISON_DURATION)
        }

        transition(eid, AIState.RECOVERY)
      } else if (EnemyAI.stateTimer[eid]! >= meleeCfg.attackDuration) {
        // Whiffed — transition to recovery
        transition(eid, AIState.RECOVERY)
      }
    } else if (type === EnemyType.LASSO_BANDIT && attackStyle === 'custom') {
      // Lasso Bandit: fire a slow lasso projectile that roots on hit
      const angle = Math.atan2(targetY - ey, targetX - ex)
      const speed = AttackConfig.projectileSpeed[eid]!
      const damage = AttackConfig.damage[eid]!
      spawnBullet(world, {
        x: ex,
        y: ey,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage,
        range: ENEMY_BULLET_RANGE,
        ownerId: eid,
        layer: CollisionLayer.ENEMY_BULLET,
        spriteId: BulletSpriteId.SPIRIT_ANIM,
        size: ENEMY_BULLET_SIZE_THREAT * 1.5,
        onCollide: (w, _bulletEid, info) => {
          if (info.type === 'entity' && info.hitEntity !== undefined && hasComponent(w, Player, info.hitEntity)) {
            addComponent(w, Root, info.hitEntity)
            Root.duration[info.hitEntity] = LASSO_ROOT_DURATION
          }
        },
      })
      activeBulletCount += 1
      transition(eid, AIState.RECOVERY)
    } else if (type === EnemyType.DYNAMITE_TOSSER && attackStyle === 'custom') {
      // Dynamite Tosser: lob a dynamite at target position (reuses existing dynamiteSystem)
      const damage = AttackConfig.damage[eid]!
      world.dynamites.push({
        x: targetX,
        y: targetY,
        startX: ex,
        startY: ey,
        fuseRemaining: DYNAMITE_TOSSER_FUSE_TIME,
        maxFuse: DYNAMITE_TOSSER_FUSE_TIME,
        damage,
        radius: DYNAMITE_TOSSER_BLAST_RADIUS,
        knockback: 150,
        ownerId: eid,
      })
      transition(eid, AIState.RECOVERY)
    } else if (type === EnemyType.HEALER_SHAMAN && attackStyle === 'custom') {
      // Healer Shaman: heal nearby allies (not self)
      const healAmount = AttackConfig.damage[eid]!
      const healRadius = Detection.attackRange[eid]!
      forEachAliveEnemyInRadius(world, ex, ey, healRadius, (allyEid) => {
        if (allyEid === eid) return
        const cur = Health.current[allyEid]!
        const max = Health.max[allyEid]!
        if (cur < max && cur > 0) {
          Health.current[allyEid] = Math.min(max, cur + healAmount)
        }
      })
      world.healerPulses.push({ x: ex, y: ey, radius: healRadius })
      transition(eid, AIState.RECOVERY)
    } else {
      // Projectile attack (default for 'projectile', 'custom' with projectile config, or unknown)

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

      const isThreat = Enemy.tier[eid] === EnemyTier.THREAT
      const enemyBulletSize = isThreat ? ENEMY_BULLET_SIZE_THREAT : ENEMY_BULLET_SIZE_FODDER
      const bulletSprite = def?.bulletSpriteId ?? BulletSpriteId.SLUG

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
          spriteId: bulletSprite,
          size: enemyBulletSize,
        })
      }

      activeBulletCount += count
      transition(eid, AIState.RECOVERY)
    }
  }
}
