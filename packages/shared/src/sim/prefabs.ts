/**
 * Entity Prefabs
 *
 * Factory functions for creating common entity types with
 * all required components and default values.
 */

import { addEntity, addComponent } from 'bitecs'
import type { GameWorld, BulletCollisionCallback } from './world'
import {
  Position,
  Velocity,
  Player,
  PlayerState,
  PlayerStateType,
  Speed,
  Collider,
  Weapon,
  Bullet,
  Health,
  Enemy,
  EnemyAI,
  Detection,
  AttackConfig,
  Steering,
  EnemyType,
  AIState,
} from './components'
import {
  PLAYER_SPEED,
  PLAYER_RADIUS,
  PLAYER_START_X,
  PLAYER_START_Y,
  PLAYER_HP,
  PLAYER_IFRAME_DURATION,
} from './content/player'
import {
  PISTOL_FIRE_RATE,
  PISTOL_BULLET_SPEED,
  PISTOL_BULLET_DAMAGE,
  PISTOL_RANGE,
  BULLET_RADIUS,
  BULLET_LIFETIME,
} from './content/weapons'
import {
  SWARMER_SPEED, SWARMER_RADIUS, SWARMER_HP, SWARMER_AGGRO_RANGE, SWARMER_ATTACK_RANGE,
  SWARMER_TELEGRAPH, SWARMER_RECOVERY, SWARMER_COOLDOWN, SWARMER_DAMAGE, SWARMER_BULLET_SPEED,
  SWARMER_SEPARATION_RADIUS, SWARMER_TIER,
  GRUNT_SPEED, GRUNT_RADIUS, GRUNT_HP, GRUNT_AGGRO_RANGE, GRUNT_ATTACK_RANGE,
  GRUNT_TELEGRAPH, GRUNT_RECOVERY, GRUNT_COOLDOWN, GRUNT_DAMAGE, GRUNT_BULLET_SPEED,
  GRUNT_SEPARATION_RADIUS, GRUNT_TIER,
  SHOOTER_SPEED, SHOOTER_RADIUS, SHOOTER_HP, SHOOTER_AGGRO_RANGE, SHOOTER_ATTACK_RANGE,
  SHOOTER_TELEGRAPH, SHOOTER_RECOVERY, SHOOTER_COOLDOWN, SHOOTER_DAMAGE, SHOOTER_BULLET_SPEED,
  SHOOTER_BULLET_COUNT, SHOOTER_SPREAD_ANGLE, SHOOTER_PREFERRED_RANGE,
  SHOOTER_SEPARATION_RADIUS, SHOOTER_TIER,
  CHARGER_SPEED, CHARGER_RADIUS, CHARGER_HP, CHARGER_AGGRO_RANGE, CHARGER_ATTACK_RANGE,
  CHARGER_TELEGRAPH, CHARGER_RECOVERY, CHARGER_COOLDOWN, CHARGER_DAMAGE,
  CHARGER_SEPARATION_RADIUS, CHARGER_TIER,
} from './content/enemies'

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
  playerId = 0
): number {
  const eid = addEntity(world)

  // Add all player components
  addComponent(world, Position, eid)
  addComponent(world, Velocity, eid)
  addComponent(world, Player, eid)
  addComponent(world, PlayerState, eid)
  addComponent(world, Speed, eid)
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

  // Set player data
  Player.id[eid] = playerId
  Player.aimAngle[eid] = 0

  // Set initial state
  PlayerState.state[eid] = PlayerStateType.IDLE

  // Set speed
  Speed.current[eid] = PLAYER_SPEED
  Speed.max[eid] = PLAYER_SPEED

  // Set collider
  Collider.radius[eid] = PLAYER_RADIUS
  Collider.layer[eid] = CollisionLayer.PLAYER

  // Set health
  Health.current[eid] = PLAYER_HP
  Health.max[eid] = PLAYER_HP
  Health.iframes[eid] = 0
  Health.iframeDuration[eid] = PLAYER_IFRAME_DURATION

  // Set weapon (default pistol)
  Weapon.fireRate[eid] = PISTOL_FIRE_RATE
  Weapon.bulletSpeed[eid] = PISTOL_BULLET_SPEED
  Weapon.bulletDamage[eid] = PISTOL_BULLET_DAMAGE
  Weapon.cooldown[eid] = 0
  Weapon.range[eid] = PISTOL_RANGE

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
  const { x, y, vx, vy, damage, range, ownerId, onCollide, layer } = options
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
function setEnemyDefaults(eid: number, x: number, y: number): void {
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
  AttackConfig.cooldownRemaining[eid] = 0
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
  setEnemyDefaults(eid, x, y)

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
  AttackConfig.projectileCount[eid] = 1
  AttackConfig.spreadAngle[eid] = 0
  Steering.preferredRange[eid] = 0
  Steering.separationRadius[eid] = SWARMER_SEPARATION_RADIUS
  EnemyAI.initialDelay[eid] = 0.2 + Math.random() * 0.3

  return eid
}

/**
 * Spawn a Grunt enemy — sturdy melee fodder
 */
export function spawnGrunt(world: GameWorld, x: number, y: number): number {
  const eid = addEntity(world)
  addEnemyComponents(world, eid)
  setEnemyDefaults(eid, x, y)

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
  AttackConfig.projectileCount[eid] = 1
  AttackConfig.spreadAngle[eid] = 0
  Steering.preferredRange[eid] = 0
  Steering.separationRadius[eid] = GRUNT_SEPARATION_RADIUS
  EnemyAI.initialDelay[eid] = 0.2 + Math.random() * 0.3

  return eid
}

/**
 * Spawn a Shooter enemy — ranged threat that keeps distance
 */
export function spawnShooter(world: GameWorld, x: number, y: number): number {
  const eid = addEntity(world)
  addEnemyComponents(world, eid)
  setEnemyDefaults(eid, x, y)

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
  AttackConfig.projectileCount[eid] = SHOOTER_BULLET_COUNT
  AttackConfig.spreadAngle[eid] = SHOOTER_SPREAD_ANGLE
  Steering.preferredRange[eid] = SHOOTER_PREFERRED_RANGE
  Steering.separationRadius[eid] = SHOOTER_SEPARATION_RADIUS
  EnemyAI.initialDelay[eid] = 0.5 + Math.random() * 0.5

  return eid
}

/**
 * Spawn a Charger enemy — heavy threat with contact damage
 */
export function spawnCharger(world: GameWorld, x: number, y: number): number {
  const eid = addEntity(world)
  addEnemyComponents(world, eid)
  setEnemyDefaults(eid, x, y)

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
  EnemyAI.initialDelay[eid] = 0.5 + Math.random() * 0.5

  return eid
}
