/**
 * Entity Prefabs
 *
 * Factory functions for creating common entity types with
 * all required components and default values.
 */

import { addEntity, addComponent, removeEntity } from 'bitecs'
import type { GameWorld, BulletCollisionCallback } from './world'
import type { UpgradeState } from './upgrade'
import {
  Position,
  Velocity,
  Player,
  PlayerState,
  PlayerStateType,
  Speed,
  ZPosition,
  Collider,
  Weapon,
  Cylinder,
  Bullet,
  Health,
  Enemy,
  BossPhase,
  EnemyAI,
  Detection,
  AttackConfig,
  Steering,
  EnemyType,
  AIState,
  Showdown,
  MeleeWeapon,
} from './components'
import {
  PLAYER_RADIUS,
  PLAYER_START_X,
  PLAYER_START_Y,
} from './content/player'
import {
  BULLET_RADIUS,
  BULLET_LIFETIME,
} from './content/weapons'
import { clampDamage } from './damage'
import {
  SWARMER_SPEED, SWARMER_RADIUS, SWARMER_HP, SWARMER_AGGRO_RANGE, SWARMER_ATTACK_RANGE,
  SWARMER_TELEGRAPH, SWARMER_RECOVERY, SWARMER_COOLDOWN, SWARMER_DAMAGE, SWARMER_BULLET_SPEED,
  SWARMER_BULLET_ACCEL, SWARMER_BULLET_DRAG,
  SWARMER_SEPARATION_RADIUS, SWARMER_TIER,
  GRUNT_SPEED, GRUNT_RADIUS, GRUNT_HP, GRUNT_AGGRO_RANGE, GRUNT_ATTACK_RANGE,
  GRUNT_TELEGRAPH, GRUNT_RECOVERY, GRUNT_COOLDOWN, GRUNT_DAMAGE, GRUNT_BULLET_SPEED,
  GRUNT_BULLET_ACCEL, GRUNT_BULLET_DRAG,
  GRUNT_SEPARATION_RADIUS, GRUNT_TIER,
  SHOOTER_SPEED, SHOOTER_RADIUS, SHOOTER_HP, SHOOTER_AGGRO_RANGE, SHOOTER_ATTACK_RANGE,
  SHOOTER_TELEGRAPH, SHOOTER_RECOVERY, SHOOTER_COOLDOWN, SHOOTER_DAMAGE, SHOOTER_BULLET_SPEED,
  SHOOTER_BULLET_ACCEL, SHOOTER_BULLET_DRAG,
  SHOOTER_BULLET_COUNT, SHOOTER_SPREAD_ANGLE, SHOOTER_PREFERRED_RANGE,
  SHOOTER_SEPARATION_RADIUS, SHOOTER_TIER,
  CHARGER_SPEED, CHARGER_RADIUS, CHARGER_HP, CHARGER_AGGRO_RANGE, CHARGER_ATTACK_RANGE,
  CHARGER_TELEGRAPH, CHARGER_RECOVERY, CHARGER_COOLDOWN, CHARGER_DAMAGE,
  CHARGER_SEPARATION_RADIUS, CHARGER_TIER,
  BOOMSTICK_SPEED, BOOMSTICK_RADIUS, BOOMSTICK_HP, BOOMSTICK_AGGRO_RANGE, BOOMSTICK_ATTACK_RANGE,
  BOOMSTICK_TELEGRAPH, BOOMSTICK_RECOVERY, BOOMSTICK_COOLDOWN, BOOMSTICK_DAMAGE,
  BOOMSTICK_BULLET_SPEED, BOOMSTICK_BULLET_ACCEL, BOOMSTICK_BULLET_DRAG,
  BOOMSTICK_BULLET_COUNT, BOOMSTICK_SPREAD_ANGLE,
  BOOMSTICK_PREFERRED_RANGE, BOOMSTICK_SEPARATION_RADIUS, BOOMSTICK_TIER,
  GOBLIN_BARBARIAN_SPEED, GOBLIN_BARBARIAN_RADIUS, GOBLIN_BARBARIAN_HP,
  GOBLIN_BARBARIAN_AGGRO_RANGE, GOBLIN_BARBARIAN_ATTACK_RANGE,
  GOBLIN_BARBARIAN_TELEGRAPH, GOBLIN_BARBARIAN_RECOVERY, GOBLIN_BARBARIAN_COOLDOWN,
  GOBLIN_BARBARIAN_DAMAGE, GOBLIN_BARBARIAN_SEPARATION_RADIUS, GOBLIN_BARBARIAN_TIER,
  GOBLIN_ROGUE_SPEED, GOBLIN_ROGUE_RADIUS, GOBLIN_ROGUE_HP,
  GOBLIN_ROGUE_AGGRO_RANGE, GOBLIN_ROGUE_ATTACK_RANGE,
  GOBLIN_ROGUE_TELEGRAPH, GOBLIN_ROGUE_RECOVERY, GOBLIN_ROGUE_COOLDOWN,
  GOBLIN_ROGUE_DAMAGE, GOBLIN_ROGUE_SEPARATION_RADIUS, GOBLIN_ROGUE_TIER,
} from './content/enemies'

/** Largest collider radius across all entity types (for spatial hash query padding) */
export const MAX_COLLIDER_RADIUS = Math.max(
  PLAYER_RADIUS,
  SWARMER_RADIUS,
  GRUNT_RADIUS,
  SHOOTER_RADIUS,
  CHARGER_RADIUS,
  BOOMSTICK_RADIUS,
  GOBLIN_BARBARIAN_RADIUS,
  GOBLIN_ROGUE_RADIUS,
)

/** Collision layers */
export const CollisionLayer = {
  PLAYER: 1 << 0,
  ENEMY: 1 << 1,
  PLAYER_BULLET: 1 << 2,
  ENEMY_BULLET: 1 << 3,
  WALL: 1 << 4,
} as const

/** Sentinel value for bullets with no owner entity */
export const NO_OWNER = -1

/** Sentinel value for EnemyAI.targetEid when no target is acquired (0xFFFF in Uint16Array) */
export const NO_TARGET = 0xFFFF

/**
 * Spawn a player entity
 *
 * @param world - The game world
 * @param x - Starting X position (default: center)
 * @param y - Starting Y position (default: center)
 * @param playerId - Player slot ID for multiplayer (0-7)
 * @returns The entity ID
 */
export function spawnPlayer(
  world: GameWorld,
  x = PLAYER_START_X,
  y = PLAYER_START_Y,
  playerId = 0,
  upgradeState?: UpgradeState,
): number {
  const eid = addEntity(world)

  // Add all player components
  addComponent(world, Position, eid)
  addComponent(world, Velocity, eid)
  addComponent(world, Player, eid)
  addComponent(world, PlayerState, eid)
  addComponent(world, Speed, eid)
  addComponent(world, ZPosition, eid)
  addComponent(world, Collider, eid)
  addComponent(world, Weapon, eid)
  addComponent(world, Health, eid)

  // Set initial position
  Position.x[eid] = x
  Position.y[eid] = y
  Position.prevX[eid] = x
  Position.prevY[eid] = y

  // Set initial velocity (stationary)
  Velocity.x[eid] = 0
  Velocity.y[eid] = 0
  ZPosition.z[eid] = 0
  ZPosition.zVelocity[eid] = 0

  // Set player data
  Player.id[eid] = playerId
  Player.aimAngle[eid] = 0

  // Set initial state
  PlayerState.state[eid] = PlayerStateType.IDLE

  // Read upgrade state for character-agnostic stats.
  // In multiplayer, each player can own a distinct state instance.
  const us = upgradeState ?? world.upgradeState
  world.playerUpgradeStates.set(eid, us)
  world.playerCharacters.set(eid, us.characterDef.id)
  if (world.playerUpgradeStates.size === 1) {
    world.upgradeState = us
    world.characterId = us.characterDef.id
  }

  // Set speed from upgrade state
  Speed.current[eid] = us.speed
  Speed.max[eid] = us.speed

  // Set collider
  Collider.radius[eid] = PLAYER_RADIUS
  Collider.layer[eid] = CollisionLayer.PLAYER

  // Set health from upgrade state
  Health.current[eid] = us.maxHP
  Health.max[eid] = us.maxHP
  Health.iframes[eid] = 0
  Health.iframeDuration[eid] = us.iframeDuration

  // Set weapon from upgrade state
  Weapon.fireRate[eid] = us.fireRate
  Weapon.bulletSpeed[eid] = us.bulletSpeed
  Weapon.bulletDamage[eid] = clampDamage(us.bulletDamage)
  Weapon.cooldown[eid] = 0
  Weapon.range[eid] = us.range

  // Character-specific weapon setup
  if (us.characterDef.id === 'prospector') {
    // Melee weapon (no cylinder)
    addComponent(world, MeleeWeapon, eid)
    MeleeWeapon.swingCooldown[eid] = 0
    MeleeWeapon.chargeTimer[eid] = 0
    MeleeWeapon.charging[eid] = 0
    MeleeWeapon.shootWasDown[eid] = 0
    MeleeWeapon.swungThisTick[eid] = 0
    MeleeWeapon.wasChargedSwing[eid] = 0
    MeleeWeapon.swingAngle[eid] = 0
  } else {
    // Cylinder (bullet-based characters)
    addComponent(world, Cylinder, eid)
    const cylinderSize = Math.round(us.cylinderSize)
    Cylinder.rounds[eid] = cylinderSize
    Cylinder.maxRounds[eid] = cylinderSize
    Cylinder.reloading[eid] = 0
    Cylinder.reloadTimer[eid] = 0
    Cylinder.reloadTime[eid] = us.reloadTime
    Cylinder.firstShotAfterReload[eid] = 0
    Cylinder.fireCooldown[eid] = 0
  }

  // Showdown ability (reused for dynamite cooldown on Prospector)
  addComponent(world, Showdown, eid)
  Showdown.active[eid] = 0
  Showdown.targetEid[eid] = NO_TARGET
  Showdown.duration[eid] = 0
  Showdown.cooldown[eid] = 0

  return eid
}

/** Options for spawning a bullet */
export interface SpawnBulletOptions {
  /** Starting X position */
  x: number
  /** Starting Y position */
  y: number
  /** Velocity X component */
  vx: number
  /** Velocity Y component */
  vy: number
  /** Damage dealt on hit */
  damage: number
  /** Signed acceleration along travel direction (px/s^2) */
  accel?: number
  /** Fractional speed loss per second (0.2 = 20%/s) */
  drag?: number
  /** Maximum travel distance in pixels */
  range: number
  /** Entity ID of the owner (for friendly fire prevention) */
  ownerId: number
  /** Optional callback when bullet collides with something */
  onCollide?: BulletCollisionCallback
  /** Collision layer (default: PLAYER_BULLET) */
  layer?: number
}

/**
 * Spawn a bullet entity
 *
 * @param world - The game world
 * @param options - Bullet spawn configuration
 * @returns The entity ID
 */
export function spawnBullet(world: GameWorld, options: SpawnBulletOptions): number {
  const { x, y, vx, vy, damage, accel, drag, range, ownerId, onCollide, layer } = options
  const eid = addEntity(world)

  // Add bullet components
  addComponent(world, Position, eid)
  addComponent(world, Velocity, eid)
  addComponent(world, Bullet, eid)
  addComponent(world, Collider, eid)

  // Set position
  Position.x[eid] = x
  Position.y[eid] = y
  Position.prevX[eid] = x
  Position.prevY[eid] = y

  // Set velocity
  Velocity.x[eid] = vx
  Velocity.y[eid] = vy

  // Set bullet data
  Bullet.ownerId[eid] = ownerId
  Bullet.damage[eid] = damage
  Bullet.accel[eid] = accel ?? 0
  Bullet.drag[eid] = drag ?? 0
  Bullet.lifetime[eid] = BULLET_LIFETIME
  Bullet.range[eid] = range
  Bullet.distanceTraveled[eid] = 0

  // Set collider
  Collider.radius[eid] = BULLET_RADIUS
  Collider.layer[eid] = layer ?? CollisionLayer.PLAYER_BULLET

  // Register collision callback if provided
  if (onCollide) {
    world.bulletCollisionCallbacks.set(eid, onCollide)
  }

  return eid
}

/**
 * Remove a bullet entity and clean up all associated world state.
 * Centralizes cleanup that was previously duplicated across bullet.ts,
 * bulletCollision.ts, and health.ts.
 */
export function removeBullet(world: GameWorld, eid: number): void {
  world.bulletCollisionCallbacks.delete(eid)
  world.bulletPierceHits.delete(eid)
  world.hookPierceCount.delete(eid)
  removeEntity(world, eid)
}

// ============================================================================
// Enemy Prefabs
// ============================================================================

/** Add all shared enemy components to an entity */
function addEnemyComponents(world: GameWorld, eid: number): void {
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

/** Set common enemy defaults shared by all types */
function setEnemyDefaults(world: GameWorld, eid: number, x: number, y: number): void {
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

/**
 * Spawn a Swarmer enemy — fast, fragile fodder
 */
export function spawnSwarmer(world: GameWorld, x: number, y: number): number {
  const eid = addEntity(world)
  addEnemyComponents(world, eid)
  setEnemyDefaults(world, eid, x, y)

  Enemy.type[eid] = EnemyType.SWARMER
  Enemy.tier[eid] = SWARMER_TIER
  Speed.current[eid] = SWARMER_SPEED
  Speed.max[eid] = SWARMER_SPEED
  Collider.radius[eid] = SWARMER_RADIUS
  Health.current[eid] = SWARMER_HP
  Health.max[eid] = SWARMER_HP
  Detection.aggroRange[eid] = SWARMER_AGGRO_RANGE
  Detection.attackRange[eid] = SWARMER_ATTACK_RANGE
  Detection.losRequired[eid] = 0
  AttackConfig.telegraphDuration[eid] = SWARMER_TELEGRAPH
  AttackConfig.recoveryDuration[eid] = SWARMER_RECOVERY
  AttackConfig.cooldown[eid] = SWARMER_COOLDOWN
  AttackConfig.damage[eid] = SWARMER_DAMAGE
  AttackConfig.projectileSpeed[eid] = SWARMER_BULLET_SPEED
  AttackConfig.projectileAccel[eid] = SWARMER_BULLET_ACCEL
  AttackConfig.projectileDrag[eid] = SWARMER_BULLET_DRAG
  AttackConfig.projectileCount[eid] = 1
  AttackConfig.spreadAngle[eid] = 0
  Steering.preferredRange[eid] = 0
  Steering.separationRadius[eid] = SWARMER_SEPARATION_RADIUS
  EnemyAI.initialDelay[eid] = world.rng.nextRange(0.2, 0.5)

  return eid
}

/**
 * Spawn a Grunt enemy — sturdy melee fodder
 */
export function spawnGrunt(world: GameWorld, x: number, y: number): number {
  const eid = addEntity(world)
  addEnemyComponents(world, eid)
  setEnemyDefaults(world, eid, x, y)

  Enemy.type[eid] = EnemyType.GRUNT
  Enemy.tier[eid] = GRUNT_TIER
  Speed.current[eid] = GRUNT_SPEED
  Speed.max[eid] = GRUNT_SPEED
  Collider.radius[eid] = GRUNT_RADIUS
  Health.current[eid] = GRUNT_HP
  Health.max[eid] = GRUNT_HP
  Detection.aggroRange[eid] = GRUNT_AGGRO_RANGE
  Detection.attackRange[eid] = GRUNT_ATTACK_RANGE
  Detection.losRequired[eid] = 0
  AttackConfig.telegraphDuration[eid] = GRUNT_TELEGRAPH
  AttackConfig.recoveryDuration[eid] = GRUNT_RECOVERY
  AttackConfig.cooldown[eid] = GRUNT_COOLDOWN
  AttackConfig.damage[eid] = GRUNT_DAMAGE
  AttackConfig.projectileSpeed[eid] = GRUNT_BULLET_SPEED
  AttackConfig.projectileAccel[eid] = GRUNT_BULLET_ACCEL
  AttackConfig.projectileDrag[eid] = GRUNT_BULLET_DRAG
  AttackConfig.projectileCount[eid] = 1
  AttackConfig.spreadAngle[eid] = 0
  Steering.preferredRange[eid] = 0
  Steering.separationRadius[eid] = GRUNT_SEPARATION_RADIUS
  EnemyAI.initialDelay[eid] = world.rng.nextRange(0.2, 0.5)

  return eid
}

/**
 * Spawn a Shooter enemy — ranged threat that keeps distance
 */
export function spawnShooter(world: GameWorld, x: number, y: number): number {
  const eid = addEntity(world)
  addEnemyComponents(world, eid)
  setEnemyDefaults(world, eid, x, y)

  Enemy.type[eid] = EnemyType.SHOOTER
  Enemy.tier[eid] = SHOOTER_TIER
  Speed.current[eid] = SHOOTER_SPEED
  Speed.max[eid] = SHOOTER_SPEED
  Collider.radius[eid] = SHOOTER_RADIUS
  Health.current[eid] = SHOOTER_HP
  Health.max[eid] = SHOOTER_HP
  Detection.aggroRange[eid] = SHOOTER_AGGRO_RANGE
  Detection.attackRange[eid] = SHOOTER_ATTACK_RANGE
  Detection.losRequired[eid] = 0
  AttackConfig.telegraphDuration[eid] = SHOOTER_TELEGRAPH
  AttackConfig.recoveryDuration[eid] = SHOOTER_RECOVERY
  AttackConfig.cooldown[eid] = SHOOTER_COOLDOWN
  AttackConfig.damage[eid] = SHOOTER_DAMAGE
  AttackConfig.projectileSpeed[eid] = SHOOTER_BULLET_SPEED
  AttackConfig.projectileAccel[eid] = SHOOTER_BULLET_ACCEL
  AttackConfig.projectileDrag[eid] = SHOOTER_BULLET_DRAG
  AttackConfig.projectileCount[eid] = SHOOTER_BULLET_COUNT
  AttackConfig.spreadAngle[eid] = SHOOTER_SPREAD_ANGLE
  Steering.preferredRange[eid] = SHOOTER_PREFERRED_RANGE
  Steering.separationRadius[eid] = SHOOTER_SEPARATION_RADIUS
  EnemyAI.initialDelay[eid] = world.rng.nextRange(0.5, 1.0)

  return eid
}

/**
 * Spawn a Charger enemy — heavy threat with contact damage
 */
export function spawnCharger(world: GameWorld, x: number, y: number): number {
  const eid = addEntity(world)
  addEnemyComponents(world, eid)
  setEnemyDefaults(world, eid, x, y)

  Enemy.type[eid] = EnemyType.CHARGER
  Enemy.tier[eid] = CHARGER_TIER
  Speed.current[eid] = CHARGER_SPEED
  Speed.max[eid] = CHARGER_SPEED
  Collider.radius[eid] = CHARGER_RADIUS
  Health.current[eid] = CHARGER_HP
  Health.max[eid] = CHARGER_HP
  Detection.aggroRange[eid] = CHARGER_AGGRO_RANGE
  Detection.attackRange[eid] = CHARGER_ATTACK_RANGE
  Detection.losRequired[eid] = 0
  AttackConfig.telegraphDuration[eid] = CHARGER_TELEGRAPH
  AttackConfig.recoveryDuration[eid] = CHARGER_RECOVERY
  AttackConfig.cooldown[eid] = CHARGER_COOLDOWN
  AttackConfig.damage[eid] = CHARGER_DAMAGE
  AttackConfig.projectileSpeed[eid] = 0
  AttackConfig.projectileCount[eid] = 0
  AttackConfig.spreadAngle[eid] = 0
  Steering.preferredRange[eid] = 0
  Steering.separationRadius[eid] = CHARGER_SEPARATION_RADIUS
  EnemyAI.initialDelay[eid] = world.rng.nextRange(0.5, 1.0)

  return eid
}

/**
 * Spawn a Boomstick enemy — Stage 1 test boss threat
 */
export function spawnBoomstick(world: GameWorld, x: number, y: number): number {
  const eid = addEntity(world)
  addEnemyComponents(world, eid)
  addComponent(world, BossPhase, eid)
  setEnemyDefaults(world, eid, x, y)

  Enemy.type[eid] = EnemyType.BOOMSTICK
  Enemy.tier[eid] = BOOMSTICK_TIER
  BossPhase.phase[eid] = 1
  Speed.current[eid] = BOOMSTICK_SPEED
  Speed.max[eid] = BOOMSTICK_SPEED
  Collider.radius[eid] = BOOMSTICK_RADIUS
  Health.current[eid] = BOOMSTICK_HP
  Health.max[eid] = BOOMSTICK_HP
  Detection.aggroRange[eid] = BOOMSTICK_AGGRO_RANGE
  Detection.attackRange[eid] = BOOMSTICK_ATTACK_RANGE
  Detection.losRequired[eid] = 0
  AttackConfig.telegraphDuration[eid] = BOOMSTICK_TELEGRAPH
  AttackConfig.recoveryDuration[eid] = BOOMSTICK_RECOVERY
  AttackConfig.cooldown[eid] = BOOMSTICK_COOLDOWN
  AttackConfig.damage[eid] = BOOMSTICK_DAMAGE
  AttackConfig.projectileSpeed[eid] = BOOMSTICK_BULLET_SPEED
  AttackConfig.projectileAccel[eid] = BOOMSTICK_BULLET_ACCEL
  AttackConfig.projectileDrag[eid] = BOOMSTICK_BULLET_DRAG
  AttackConfig.projectileCount[eid] = BOOMSTICK_BULLET_COUNT
  AttackConfig.spreadAngle[eid] = BOOMSTICK_SPREAD_ANGLE
  // Boomstick uses AttackConfig.aimX as "attacks until next halo" cadence state.
  AttackConfig.aimX[eid] = world.rng.nextInt(2) + 1
  Steering.preferredRange[eid] = BOOMSTICK_PREFERRED_RANGE
  Steering.separationRadius[eid] = BOOMSTICK_SEPARATION_RADIUS
  EnemyAI.initialDelay[eid] = world.rng.nextRange(0.8, 1.2)

  return eid
}

/**
 * Spawn a Goblin Barbarian enemy — heavy melee fodder
 */
export function spawnGoblinBarbarian(world: GameWorld, x: number, y: number): number {
  const eid = addEntity(world)
  addEnemyComponents(world, eid)
  setEnemyDefaults(world, eid, x, y)

  Enemy.type[eid] = EnemyType.GOBLIN_BARBARIAN
  Enemy.tier[eid] = GOBLIN_BARBARIAN_TIER
  Speed.current[eid] = GOBLIN_BARBARIAN_SPEED
  Speed.max[eid] = GOBLIN_BARBARIAN_SPEED
  Collider.radius[eid] = GOBLIN_BARBARIAN_RADIUS
  Health.current[eid] = GOBLIN_BARBARIAN_HP
  Health.max[eid] = GOBLIN_BARBARIAN_HP
  Detection.aggroRange[eid] = GOBLIN_BARBARIAN_AGGRO_RANGE
  Detection.attackRange[eid] = GOBLIN_BARBARIAN_ATTACK_RANGE
  Detection.losRequired[eid] = 0
  AttackConfig.telegraphDuration[eid] = GOBLIN_BARBARIAN_TELEGRAPH
  AttackConfig.recoveryDuration[eid] = GOBLIN_BARBARIAN_RECOVERY
  AttackConfig.cooldown[eid] = GOBLIN_BARBARIAN_COOLDOWN
  AttackConfig.damage[eid] = GOBLIN_BARBARIAN_DAMAGE
  AttackConfig.projectileSpeed[eid] = 0
  AttackConfig.projectileCount[eid] = 0
  AttackConfig.spreadAngle[eid] = 0
  Steering.preferredRange[eid] = 0
  Steering.separationRadius[eid] = GOBLIN_BARBARIAN_SEPARATION_RADIUS
  EnemyAI.initialDelay[eid] = world.rng.nextRange(0.2, 0.5)

  return eid
}

/**
 * Spawn a Goblin Rogue enemy — fast agile melee fodder
 */
export function spawnGoblinRogue(world: GameWorld, x: number, y: number): number {
  const eid = addEntity(world)
  addEnemyComponents(world, eid)
  setEnemyDefaults(world, eid, x, y)

  Enemy.type[eid] = EnemyType.GOBLIN_ROGUE
  Enemy.tier[eid] = GOBLIN_ROGUE_TIER
  Speed.current[eid] = GOBLIN_ROGUE_SPEED
  Speed.max[eid] = GOBLIN_ROGUE_SPEED
  Collider.radius[eid] = GOBLIN_ROGUE_RADIUS
  Health.current[eid] = GOBLIN_ROGUE_HP
  Health.max[eid] = GOBLIN_ROGUE_HP
  Detection.aggroRange[eid] = GOBLIN_ROGUE_AGGRO_RANGE
  Detection.attackRange[eid] = GOBLIN_ROGUE_ATTACK_RANGE
  Detection.losRequired[eid] = 0
  AttackConfig.telegraphDuration[eid] = GOBLIN_ROGUE_TELEGRAPH
  AttackConfig.recoveryDuration[eid] = GOBLIN_ROGUE_RECOVERY
  AttackConfig.cooldown[eid] = GOBLIN_ROGUE_COOLDOWN
  AttackConfig.damage[eid] = GOBLIN_ROGUE_DAMAGE
  AttackConfig.projectileSpeed[eid] = 0
  AttackConfig.projectileCount[eid] = 0
  AttackConfig.spreadAngle[eid] = 0
  Steering.preferredRange[eid] = 0
  Steering.separationRadius[eid] = GOBLIN_ROGUE_SEPARATION_RADIUS
  EnemyAI.initialDelay[eid] = world.rng.nextRange(0.2, 0.5)

  return eid
}
