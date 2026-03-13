/**
 * Entity Prefabs
 *
 * Factory functions for creating common entity types with
 * all required components and default values.
 */

import { addEntity, addComponent, removeEntity } from 'bitecs'
import type { GameWorld, BulletCollisionCallback } from './world'
import { cleanupEntity } from './entityCleanup'
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
  EnemyTier,
  AIState,
  Showdown,
  MeleeWeapon,
  FrontArmor,
  Flying,
  Npc,
  NpcMovement,
  NpcMovementType,
  NpcDialogue,
  ObjectiveTarget,
  ObjTargetType,
  ObjectiveRole,
  ObjRole,
  Lifespan,
  HellfirePillar,
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
import { getNpcDef } from './content/npcs'
import { clampDamage } from './damage'
import { getEnemyDef, type EnemyDefinition } from './content/enemyRegistry'
import {
  RUNNER_SPEED, RUNNER_RADIUS, RUNNER_HP, RUNNER_TIER,
  DUELIST_HP, DUELIST_DAMAGE,
  ARMORED_BANDIT_FRONT_REDUCTION, ARMORED_BANDIT_ARC_HALF_ANGLE,
  GHOST_RIDER_LIFESPAN,
} from './content/enemies'
import { allEnemyDefs } from './content/enemyRegistry'
import { allBosses } from './content/bosses/registry'

/** Largest collider radius across all entity types (for spatial hash query padding).
 *  Lazily computed on first access so that boss & enemy registries are populated. */
let _maxColliderRadius = 0
export function getMaxColliderRadius(): number {
  if (_maxColliderRadius > 0) return _maxColliderRadius
  let max = PLAYER_RADIUS
  for (const def of allEnemyDefs()) {
    if (def.radius > max) max = def.radius
  }
  for (const boss of allBosses()) {
    if (boss.radius > max) max = boss.radius
  }
  _maxColliderRadius = max
  return max
}

/** Collision layers */
export const CollisionLayer = {
  PLAYER: 1 << 0,
  ENEMY: 1 << 1,
  PLAYER_BULLET: 1 << 2,
  ENEMY_BULLET: 1 << 3,
  WALL: 1 << 4,
  /** Objective targets (buildings, etc.) — damageable by enemy bullets */
  OBJECTIVE: 1 << 5,
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
  /** Visual sprite variant (BulletSpriteId, default: 0 = SLUG) */
  spriteId?: number
  /** Render scale multiplier (default: 1.0) */
  size?: number
}

/**
 * Spawn a bullet entity
 *
 * @param world - The game world
 * @param options - Bullet spawn configuration
 * @returns The entity ID
 */
export function spawnBullet(world: GameWorld, options: SpawnBulletOptions): number {
  const { x, y, vx, vy, damage, accel, drag, range, ownerId, onCollide, layer, spriteId, size } = options
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
  Bullet.spriteId[eid] = spriteId ?? 0
  Bullet.size[eid] = size ?? 1.0

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
  cleanupEntity(world, eid)
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
 * Apply an EnemyDefinition to an entity's ECS components.
 * Called by spawnFromRegistry and also usable for per-entity overrides.
 */
function applyEnemyDef(world: GameWorld, eid: number, def: EnemyDefinition): void {
  Enemy.type[eid] = def.type
  Enemy.tier[eid] = def.tier
  Speed.current[eid] = def.speed
  Speed.max[eid] = def.speed
  Collider.radius[eid] = def.radius
  Health.current[eid] = def.hp
  Health.max[eid] = def.hp
  Detection.aggroRange[eid] = def.aggroRange
  Detection.attackRange[eid] = def.attackRange
  Detection.losRequired[eid] = def.losRequired ? 1 : 0
  AttackConfig.telegraphDuration[eid] = def.telegraphDuration
  AttackConfig.recoveryDuration[eid] = def.recoveryDuration
  AttackConfig.cooldown[eid] = def.cooldown
  AttackConfig.damage[eid] = def.damage
  AttackConfig.projectileSpeed[eid] = def.projectileSpeed ?? 0
  AttackConfig.projectileAccel[eid] = def.projectileAccel ?? 0
  AttackConfig.projectileDrag[eid] = def.projectileDrag ?? 0
  AttackConfig.projectileCount[eid] = def.projectileCount ?? 0
  AttackConfig.spreadAngle[eid] = def.spreadAngle ?? 0
  Steering.preferredRange[eid] = def.preferredRange
  Steering.separationRadius[eid] = def.separationRadius
  EnemyAI.initialDelay[eid] = world.rng.nextRange(def.initialDelayMin, def.initialDelayMax)
}

/**
 * Spawn any registered enemy type by its EnemyType value.
 * Reads all stats from the enemy registry. Throws if type is not registered.
 */
export function spawnFromRegistry(world: GameWorld, type: number, x: number, y: number): number {
  const def = getEnemyDef(type)
  if (!def) throw new Error(`Enemy type ${type} not found in registry`)
  const eid = addEntity(world)
  addEnemyComponents(world, eid)
  setEnemyDefaults(world, eid, x, y)
  applyEnemyDef(world, eid, def)
  return eid
}

/** Spawn a Swarmer enemy */
export function spawnSwarmer(world: GameWorld, x: number, y: number): number {
  return spawnFromRegistry(world, EnemyType.SWARMER, x, y)
}

/** Spawn a Grunt enemy */
export function spawnGrunt(world: GameWorld, x: number, y: number): number {
  return spawnFromRegistry(world, EnemyType.GRUNT, x, y)
}

/** Spawn a Shooter enemy */
export function spawnShooter(world: GameWorld, x: number, y: number): number {
  return spawnFromRegistry(world, EnemyType.SHOOTER, x, y)
}

/** Spawn a Charger enemy */
export function spawnCharger(world: GameWorld, x: number, y: number): number {
  return spawnFromRegistry(world, EnemyType.CHARGER, x, y)
}

/** Spawn a Goblin Barbarian enemy */
export function spawnGoblinBarbarian(world: GameWorld, x: number, y: number): number {
  return spawnFromRegistry(world, EnemyType.GOBLIN_BARBARIAN, x, y)
}

/** Spawn a Goblin Rogue enemy */
export function spawnGoblinRogue(world: GameWorld, x: number, y: number): number {
  return spawnFromRegistry(world, EnemyType.GOBLIN_ROGUE, x, y)
}

/** Spawn a Coyote enemy */
export function spawnCoyote(world: GameWorld, x: number, y: number): number {
  return spawnFromRegistry(world, EnemyType.COYOTE, x, y)
}

/** Spawn a Ghost Rider enemy (adds Lifespan component for timed despawn) */
export function spawnGhostRider(world: GameWorld, x: number, y: number): number {
  const eid = spawnFromRegistry(world, EnemyType.GHOST_RIDER, x, y)
  addComponent(world, Lifespan, eid)
  Lifespan.remaining[eid] = GHOST_RIDER_LIFESPAN
  return eid
}

/** Spawn a Lasso Bandit enemy */
export function spawnLassoBandit(world: GameWorld, x: number, y: number): number {
  return spawnFromRegistry(world, EnemyType.LASSO_BANDIT, x, y)
}

/** Spawn a Dynamite Tosser enemy */
export function spawnDynamiteTosser(world: GameWorld, x: number, y: number): number {
  return spawnFromRegistry(world, EnemyType.DYNAMITE_TOSSER, x, y)
}

/** Spawn a Healer Shaman enemy */
export function spawnHealerShaman(world: GameWorld, x: number, y: number): number {
  return spawnFromRegistry(world, EnemyType.HEALER_SHAMAN, x, y)
}

/** Spawn a Rattlesnake enemy */
export function spawnRattlesnake(world: GameWorld, x: number, y: number): number {
  return spawnFromRegistry(world, EnemyType.RATTLESNAKE, x, y)
}

/** Spawn a Vulture enemy (adds Flying component, starts airborne) */
export function spawnVulture(world: GameWorld, x: number, y: number): number {
  const eid = spawnFromRegistry(world, EnemyType.VULTURE, x, y)
  addComponent(world, Flying, eid)
  Flying.airborne[eid] = 1
  return eid
}

/** Spawn an Armored Bandit enemy (adds FrontArmor component) */
export function spawnArmoredBandit(world: GameWorld, x: number, y: number): number {
  const eid = spawnFromRegistry(world, EnemyType.ARMORED_BANDIT, x, y)
  addComponent(world, FrontArmor, eid)
  FrontArmor.reductionMultiplier[eid] = ARMORED_BANDIT_FRONT_REDUCTION
  FrontArmor.arcHalfAngle[eid] = ARMORED_BANDIT_ARC_HALF_ANGLE
  FrontArmor.facingAngle[eid] = 0
  return eid
}

/**
 * Spawn a Duelist enemy — supports optional HP/damage overrides for difficulty scaling
 */
export function spawnDuelist(world: GameWorld, x: number, y: number, hp?: number, damage?: number): number {
  const eid = spawnFromRegistry(world, EnemyType.DUELIST, x, y)
  if (hp !== undefined) {
    Health.current[eid] = hp
    Health.max[eid] = hp
  }
  if (damage !== undefined) {
    AttackConfig.damage[eid] = damage
  }
  return eid
}

/** Spawn a Hellfire Pillar — stationary destructible hazard (Old Scratch Phase 3) */
export function spawnHellfirePillar(
  world: GameWorld, x: number, y: number,
  bossEid: number, slotIndex: number,
): number {
  const eid = addEntity(world)

  addComponent(world, Position, eid)
  addComponent(world, Collider, eid)
  addComponent(world, Health, eid)
  addComponent(world, Enemy, eid)
  addComponent(world, HellfirePillar, eid)

  Position.x[eid] = x
  Position.y[eid] = y
  Position.prevX[eid] = x
  Position.prevY[eid] = y

  Collider.radius[eid] = 24
  Collider.layer[eid] = CollisionLayer.ENEMY

  Health.current[eid] = 40
  Health.max[eid] = 40
  Health.iframes[eid] = 0
  Health.iframeDuration[eid] = 0

  Enemy.type[eid] = EnemyType.HELLFIRE_PILLAR
  Enemy.tier[eid] = EnemyTier.THREAT

  HellfirePillar.bossEid[eid] = bossEid
  HellfirePillar.healPerSecond[eid] = 2
  HellfirePillar.contactDps[eid] = 6
  HellfirePillar.damageRadius[eid] = 48
  HellfirePillar.slotIndex[eid] = slotIndex

  return eid
}

// ============================================================================
// Stage 1 Rework Enemies
// ============================================================================

/** Spawn a Drifter (pistol) enemy */
export function spawnDrifter(world: GameWorld, x: number, y: number): number {
  return spawnFromRegistry(world, EnemyType.DRIFTER, x, y)
}

/** Spawn a Knife Drifter (melee) enemy */
export function spawnKnifeDrifter(world: GameWorld, x: number, y: number): number {
  return spawnFromRegistry(world, EnemyType.KNIFE_DRIFTER, x, y)
}

/** Spawn a Deadeye (sniper) enemy */
export function spawnDeadeye(world: GameWorld, x: number, y: number): number {
  return spawnFromRegistry(world, EnemyType.DEADEYE, x, y)
}

/** Spawn a Spitter (pattern sprayer) enemy */
export function spawnSpitter(world: GameWorld, x: number, y: number): number {
  return spawnFromRegistry(world, EnemyType.SPITTER, x, y)
}

/** Spawn a Dustdevil (area denial) enemy */
export function spawnDustdevil(world: GameWorld, x: number, y: number): number {
  return spawnFromRegistry(world, EnemyType.DUSTDEVIL, x, y)
}

// ============================================================================
// Objective Prefabs
// ============================================================================

/** Collider radius for protect target entities */
const PROTECT_TARGET_RADIUS = 16

/**
 * Spawn a protect target — the entity players must defend.
 */
export function spawnProtectTarget(world: GameWorld, x: number, y: number, hp: number): number {
  const eid = addEntity(world)

  addComponent(world, Position, eid)
  addComponent(world, Collider, eid)
  addComponent(world, Health, eid)
  addComponent(world, ObjectiveTarget, eid)

  Position.x[eid] = x
  Position.y[eid] = y
  Position.prevX[eid] = x
  Position.prevY[eid] = y

  Collider.radius[eid] = PROTECT_TARGET_RADIUS
  Collider.layer[eid] = CollisionLayer.OBJECTIVE

  Health.current[eid] = hp
  Health.max[eid] = hp
  Health.iframes[eid] = 0
  Health.iframeDuration[eid] = 0

  ObjectiveTarget.type[eid] = ObjTargetType.PROTECT_ENTITY

  return eid
}

/**
 * Spawn an invisible destination marker for intercept objectives.
 */
export function spawnInterceptDest(world: GameWorld, x: number, y: number): number {
  const eid = addEntity(world)

  addComponent(world, Position, eid)
  addComponent(world, ObjectiveTarget, eid)

  Position.x[eid] = x
  Position.y[eid] = y
  Position.prevX[eid] = x
  Position.prevY[eid] = y

  ObjectiveTarget.type[eid] = ObjTargetType.INTERCEPT_DEST

  return eid
}

/**
 * Spawn an objective runner — fast fragile enemy heading to a destination.
 */
export function spawnObjectiveRunner(
  world: GameWorld,
  x: number,
  y: number,
  destEid: number,
  speed: number,
  hp: number,
): number {
  const eid = addEntity(world)
  addEnemyComponents(world, eid)
  addComponent(world, ObjectiveRole, eid)
  setEnemyDefaults(world, eid, x, y)

  Enemy.type[eid] = EnemyType.RUNNER
  Enemy.tier[eid] = RUNNER_TIER
  Speed.current[eid] = speed
  Speed.max[eid] = speed
  Collider.radius[eid] = RUNNER_RADIUS
  Health.current[eid] = hp
  Health.max[eid] = hp

  // No aggro, no attacks
  Detection.aggroRange[eid] = 0
  Detection.attackRange[eid] = 0
  Detection.losRequired[eid] = 0
  AttackConfig.telegraphDuration[eid] = 0
  AttackConfig.recoveryDuration[eid] = 0
  AttackConfig.cooldown[eid] = 0
  AttackConfig.damage[eid] = 0
  AttackConfig.projectileSpeed[eid] = 0
  AttackConfig.projectileCount[eid] = 0
  AttackConfig.spreadAngle[eid] = 0
  Steering.preferredRange[eid] = 0
  Steering.separationRadius[eid] = 0

  ObjectiveRole.role[eid] = ObjRole.RUNNER
  ObjectiveRole.targetEid[eid] = destEid

  // No initial delay — runners start moving immediately
  EnemyAI.initialDelay[eid] = 0

  return eid
}

/**
 * Spawn an objective attacker — regular enemy that targets the objective entity.
 * Uses GRUNT stats (ranged fodder).
 */
export function spawnObjectiveAttacker(world: GameWorld, x: number, y: number, targetEid: number): number {
  const eid = spawnGrunt(world, x, y)

  // Shorter spawn-in delay so attackers engage the objective quickly
  EnemyAI.initialDelay[eid] = world.rng.nextRange(0.1, 0.2)

  addComponent(world, ObjectiveRole, eid)
  ObjectiveRole.role[eid] = ObjRole.ATTACKER
  ObjectiveRole.targetEid[eid] = targetEid

  return eid
}

// ============================================================================
// NPC Prefabs
// ============================================================================

/**
 * Spawn a discovery NPC entity (non-combat, flavor only)
 */
export function spawnNpc(world: GameWorld, type: number, x: number, y: number): number {
  const def = getNpcDef(type)
  if (!def) return -1

  const eid = addEntity(world)

  addComponent(world, Position, eid)
  addComponent(world, Velocity, eid)
  addComponent(world, Speed, eid)
  addComponent(world, Npc, eid)
  addComponent(world, NpcMovement, eid)
  addComponent(world, NpcDialogue, eid)

  // Position
  Position.x[eid] = x
  Position.y[eid] = y
  Position.prevX[eid] = x
  Position.prevY[eid] = y

  // Velocity (starts stationary)
  Velocity.x[eid] = 0
  Velocity.y[eid] = 0

  // Speed
  Speed.current[eid] = def.speed
  Speed.max[eid] = def.speed

  // NPC identity
  Npc.type[eid] = type

  // Movement
  NpcMovement.pattern[eid] = def.movement
  NpcMovement.homeX[eid] = x
  NpcMovement.homeY[eid] = y
  NpcMovement.range[eid] = def.moveRange
  NpcMovement.timer[eid] = 0
  NpcMovement.paceDir[eid] = 0
  NpcMovement.pauseTimer[eid] = world.rng.nextRange(0, 1.5)

  // Wander: set initial random target
  if (def.movement === NpcMovementType.WANDER) {
    const angle = world.rng.nextRange(0, Math.PI * 2)
    const r = world.rng.nextRange(def.moveRange * 0.3, def.moveRange)
    NpcMovement.targetX[eid] = x + Math.cos(angle) * r
    NpcMovement.targetY[eid] = y + Math.sin(angle) * r
  } else {
    NpcMovement.targetX[eid] = x
    NpcMovement.targetY[eid] = y
  }

  // Dialogue (starts inactive)
  NpcDialogue.active[eid] = 0
  NpcDialogue.lineIndex[eid] = 0
  NpcDialogue.timer[eid] = 0
  NpcDialogue.duration[eid] = 0
  NpcDialogue.cooldown[eid] = 0
  NpcDialogue.triggered[eid] = 0

  // Track for cleanup
  world.npcEntities.add(eid)

  return eid
}
