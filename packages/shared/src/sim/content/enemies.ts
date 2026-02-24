/**
 * Enemy Content Definitions
 *
 * Constants for all enemy types. Balance values for HP, speed, detection,
 * attack timing, and steering behaviors.
 */

import { EnemyTier } from '../components'

// ============================================================================
// Swarmer — fast, fragile fodder that rushes the player
// ============================================================================

export const SWARMER_SPEED = 100
export const SWARMER_RADIUS = 8
export const SWARMER_HP = 12
export const SWARMER_AGGRO_RANGE = 400
export const SWARMER_ATTACK_RANGE = 150
export const SWARMER_TELEGRAPH = 0.2
export const SWARMER_RECOVERY = 0.3
export const SWARMER_COOLDOWN = 1.5
export const SWARMER_DAMAGE = 2
export const SWARMER_BULLET_SPEED = 240
export const SWARMER_BULLET_ACCEL = 120
export const SWARMER_BULLET_DRAG = 0.30
export const SWARMER_SEPARATION_RADIUS = 16
export const SWARMER_BUDGET_COST = 1
export const SWARMER_TIER = EnemyTier.FODDER

// ============================================================================
// Grunt — sturdy melee fodder
// ============================================================================

export const GRUNT_SPEED = 80
export const GRUNT_RADIUS = 10
export const GRUNT_HP = 22
export const GRUNT_AGGRO_RANGE = 300
export const GRUNT_ATTACK_RANGE = 200
export const GRUNT_TELEGRAPH = 0.4
export const GRUNT_RECOVERY = 0.5
export const GRUNT_COOLDOWN = 2.0
export const GRUNT_DAMAGE = 4
export const GRUNT_BULLET_SPEED = 320
export const GRUNT_BULLET_ACCEL = 220
export const GRUNT_BULLET_DRAG = 0.14
export const GRUNT_SEPARATION_RADIUS = 24
export const GRUNT_BUDGET_COST = 2
export const GRUNT_TIER = EnemyTier.FODDER

// ============================================================================
// Shooter — ranged threat that keeps distance
// ============================================================================

export const SHOOTER_SPEED = 60
export const SHOOTER_RADIUS = 10
export const SHOOTER_HP = 18
export const SHOOTER_AGGRO_RANGE = 350
export const SHOOTER_ATTACK_RANGE = 250
export const SHOOTER_TELEGRAPH = 0.35
export const SHOOTER_RECOVERY = 0.6
export const SHOOTER_COOLDOWN = 2.5
export const SHOOTER_DAMAGE = 5
export const SHOOTER_BULLET_SPEED = 460
export const SHOOTER_BULLET_ACCEL = 0
export const SHOOTER_BULLET_DRAG = 0.06
export const SHOOTER_BULLET_COUNT = 3
export const SHOOTER_SPREAD_ANGLE = 0.35
export const SHOOTER_PREFERRED_RANGE = 200
export const SHOOTER_SEPARATION_RADIUS = 24
export const SHOOTER_BUDGET_COST = 3
export const SHOOTER_TIER = EnemyTier.THREAT

// ============================================================================
// Charger — heavy threat that charges at the player
// ============================================================================

export const CHARGER_SPEED = 60
export const CHARGER_RADIUS = 12
export const CHARGER_HP = 45
export const CHARGER_AGGRO_RANGE = 250
export const CHARGER_ATTACK_RANGE = 150
export const CHARGER_TELEGRAPH = 0.5
export const CHARGER_RECOVERY = 0.8
export const CHARGER_COOLDOWN = 3.0
export const CHARGER_DAMAGE = 11
export const CHARGER_CHARGE_SPEED = 300
/** Duration of charger's ATTACK rush in seconds */
export const CHARGER_CHARGE_DURATION = 0.4
export const CHARGER_SEPARATION_RADIUS = 28
export const CHARGER_BUDGET_COST = 3
export const CHARGER_TIER = EnemyTier.THREAT

// ============================================================================
// Goblin Barbarian — heavy melee fodder
// ============================================================================

export const GOBLIN_BARBARIAN_SPEED = 70
export const GOBLIN_BARBARIAN_RADIUS = 10
export const GOBLIN_BARBARIAN_HP = 28
export const GOBLIN_BARBARIAN_AGGRO_RANGE = 250
export const GOBLIN_BARBARIAN_ATTACK_RANGE = 35
export const GOBLIN_BARBARIAN_TELEGRAPH = 0.5
export const GOBLIN_BARBARIAN_RECOVERY = 0.6
export const GOBLIN_BARBARIAN_COOLDOWN = 2.0
export const GOBLIN_BARBARIAN_DAMAGE = 7
export const GOBLIN_BARBARIAN_MELEE_REACH = 12
export const GOBLIN_BARBARIAN_ATTACK_DURATION = 0.25
export const GOBLIN_BARBARIAN_SEPARATION_RADIUS = 24
export const GOBLIN_BARBARIAN_BUDGET_COST = 2
export const GOBLIN_BARBARIAN_TIER = EnemyTier.FODDER

// ============================================================================
// Goblin Rogue — fast agile melee fodder
// ============================================================================

export const GOBLIN_ROGUE_SPEED = 110
export const GOBLIN_ROGUE_RADIUS = 8
export const GOBLIN_ROGUE_HP = 14
export const GOBLIN_ROGUE_AGGRO_RANGE = 300
export const GOBLIN_ROGUE_ATTACK_RANGE = 30
export const GOBLIN_ROGUE_TELEGRAPH = 0.2
export const GOBLIN_ROGUE_RECOVERY = 0.3
export const GOBLIN_ROGUE_COOLDOWN = 1.5
export const GOBLIN_ROGUE_DAMAGE = 3
export const GOBLIN_ROGUE_MELEE_REACH = 10
export const GOBLIN_ROGUE_ATTACK_DURATION = 0.25
export const GOBLIN_ROGUE_SEPARATION_RADIUS = 18
export const GOBLIN_ROGUE_BUDGET_COST = 1
export const GOBLIN_ROGUE_TIER = EnemyTier.FODDER

// ============================================================================
// Goblin shared melee constants
// ============================================================================

/** Knockback speed applied to player on goblin melee hit (px/s) */
export const GOBLIN_MELEE_KB_SPEED = 200
/** Knockback duration for goblin melee hit (seconds) */
export const GOBLIN_MELEE_KB_DURATION = 0.12

// ============================================================================
// Runner — fast fragile objective enemy (intercept)
// ============================================================================

export const RUNNER_SPEED = 140
export const RUNNER_RADIUS = 8
export const RUNNER_HP = 2
export const RUNNER_TIER = EnemyTier.FODDER

// ============================================================================
// Duelist — tough melee challenger for duel ring objective
// ============================================================================

export const DUELIST_SPEED = 85
export const DUELIST_RADIUS = 12
export const DUELIST_HP = 60
export const DUELIST_AGGRO_RANGE = 300
export const DUELIST_ATTACK_RANGE = 40
export const DUELIST_TELEGRAPH = 0.45
export const DUELIST_RECOVERY = 0.5
export const DUELIST_COOLDOWN = 1.8
export const DUELIST_DAMAGE = 8
export const DUELIST_MELEE_REACH = 14
export const DUELIST_ATTACK_DURATION = 0.3
export const DUELIST_MELEE_KB_SPEED = 250
export const DUELIST_MELEE_KB_DURATION = 0.15
export const DUELIST_SEPARATION_RADIUS = 28
export const DUELIST_TIER = EnemyTier.THREAT
export const DUEL_RING_RADIUS = 120
export const DUEL_FORFEIT_GRACE = 1.0

// ============================================================================
// Coyote — tough, fast pack predator (summoned by Coyote Jane)
// ============================================================================

export const COYOTE_SPEED = 160
export const COYOTE_RADIUS = 10
export const COYOTE_HP = 18
export const COYOTE_AGGRO_RANGE = 400
export const COYOTE_ATTACK_RANGE = 70
export const COYOTE_PREFERRED_RANGE = 80
export const COYOTE_TELEGRAPH = 0.15
export const COYOTE_RECOVERY = 0.35
export const COYOTE_COOLDOWN = 1.8
export const COYOTE_DAMAGE = 8
export const COYOTE_SEPARATION_RADIUS = 16
export const COYOTE_DART_SPEED = 320
export const COYOTE_DART_DURATION = 0.25
export const COYOTE_BUDGET_COST = 1
export const COYOTE_TIER = EnemyTier.THREAT

// ============================================================================
// Item Drop Chances (per enemy type)
// ============================================================================

import { EnemyType } from '../components'
import type { ItemRarity } from './items'
import { BulletSpriteId } from './weapons'
import { registerEnemy } from './enemyRegistry'

/**
 * @deprecated Use getEnemyDef(type)?.dropChance instead.
 * Kept for backward compatibility during migration.
 */
export const ENEMY_DROP_CHANCE: Record<number, number> = {
  [EnemyType.SWARMER]: 0.02,
  [EnemyType.GRUNT]: 0.03,
  [EnemyType.SHOOTER]: 0.05,
  [EnemyType.CHARGER]: 0.08,
  [EnemyType.GOBLIN_BARBARIAN]: 0.03,
  [EnemyType.GOBLIN_ROGUE]: 0.02,
  [EnemyType.RUNNER]: 0,
  [EnemyType.DUELIST]: 0.30,
}

/** Rarity weights for enemy item drops, by tier */
export const DROP_RARITY_WEIGHTS_FODDER: [ItemRarity, number][] = [
  ['brass', 70],
  ['silver', 25],
  ['gold', 5],
]

export const DROP_RARITY_WEIGHTS_THREAT: [ItemRarity, number][] = [
  ['brass', 30],
  ['silver', 45],
  ['gold', 20],
  ['cursed', 5],
]

// ============================================================================
// Enemy Registry — self-contained definitions for each type
// ============================================================================

registerEnemy({
  type: EnemyType.SWARMER,
  name: 'Swarmer',
  tier: SWARMER_TIER,
  speed: SWARMER_SPEED,
  radius: SWARMER_RADIUS,
  hp: SWARMER_HP,
  budgetCost: SWARMER_BUDGET_COST,
  dropChance: 0.02,
  aggroRange: SWARMER_AGGRO_RANGE,
  attackRange: SWARMER_ATTACK_RANGE,
  losRequired: false,
  telegraphDuration: SWARMER_TELEGRAPH,
  recoveryDuration: SWARMER_RECOVERY,
  cooldown: SWARMER_COOLDOWN,
  damage: SWARMER_DAMAGE,
  attackStyle: 'projectile',
  projectileSpeed: SWARMER_BULLET_SPEED,
  projectileAccel: SWARMER_BULLET_ACCEL,
  projectileDrag: SWARMER_BULLET_DRAG,
  projectileCount: 1,
  spreadAngle: 0,
  bulletSpriteId: BulletSpriteId.FIRE_ANIM,
  preferredRange: 0,
  separationRadius: SWARMER_SEPARATION_RADIUS,
  initialDelayMin: 0.2,
  initialDelayMax: 0.5,
  color: 0xffaaaa,
  spriteId: 'swarmer',
  spriteScale: 1.5,
})

registerEnemy({
  type: EnemyType.GRUNT,
  name: 'Grunt',
  tier: GRUNT_TIER,
  speed: GRUNT_SPEED,
  radius: GRUNT_RADIUS,
  hp: GRUNT_HP,
  budgetCost: GRUNT_BUDGET_COST,
  dropChance: 0.03,
  aggroRange: GRUNT_AGGRO_RANGE,
  attackRange: GRUNT_ATTACK_RANGE,
  losRequired: false,
  telegraphDuration: GRUNT_TELEGRAPH,
  recoveryDuration: GRUNT_RECOVERY,
  cooldown: GRUNT_COOLDOWN,
  damage: GRUNT_DAMAGE,
  attackStyle: 'projectile',
  projectileSpeed: GRUNT_BULLET_SPEED,
  projectileAccel: GRUNT_BULLET_ACCEL,
  projectileDrag: GRUNT_BULLET_DRAG,
  projectileCount: 1,
  spreadAngle: 0,
  bulletSpriteId: BulletSpriteId.SLUG_ANIM,
  preferredRange: 0,
  separationRadius: GRUNT_SEPARATION_RADIUS,
  initialDelayMin: 0.2,
  initialDelayMax: 0.5,
  color: 0xff6633,
  spriteId: 'grunt',
  spriteScale: 2,
})

registerEnemy({
  type: EnemyType.SHOOTER,
  name: 'Shooter',
  tier: SHOOTER_TIER,
  speed: SHOOTER_SPEED,
  radius: SHOOTER_RADIUS,
  hp: SHOOTER_HP,
  budgetCost: SHOOTER_BUDGET_COST,
  dropChance: 0.05,
  aggroRange: SHOOTER_AGGRO_RANGE,
  attackRange: SHOOTER_ATTACK_RANGE,
  losRequired: false,
  telegraphDuration: SHOOTER_TELEGRAPH,
  recoveryDuration: SHOOTER_RECOVERY,
  cooldown: SHOOTER_COOLDOWN,
  damage: SHOOTER_DAMAGE,
  attackStyle: 'projectile',
  projectileSpeed: SHOOTER_BULLET_SPEED,
  projectileAccel: SHOOTER_BULLET_ACCEL,
  projectileDrag: SHOOTER_BULLET_DRAG,
  projectileCount: SHOOTER_BULLET_COUNT,
  spreadAngle: SHOOTER_SPREAD_ANGLE,
  bulletSpriteId: BulletSpriteId.SPIRIT_ANIM,
  preferredRange: SHOOTER_PREFERRED_RANGE,
  separationRadius: SHOOTER_SEPARATION_RADIUS,
  initialDelayMin: 0.5,
  initialDelayMax: 1.0,
  color: 0xaa44dd,
  spriteId: 'shooter',
  spriteScale: 2,
})

registerEnemy({
  type: EnemyType.CHARGER,
  name: 'Charger',
  tier: CHARGER_TIER,
  speed: CHARGER_SPEED,
  radius: CHARGER_RADIUS,
  hp: CHARGER_HP,
  budgetCost: CHARGER_BUDGET_COST,
  dropChance: 0.08,
  aggroRange: CHARGER_AGGRO_RANGE,
  attackRange: CHARGER_ATTACK_RANGE,
  losRequired: false,
  telegraphDuration: CHARGER_TELEGRAPH,
  recoveryDuration: CHARGER_RECOVERY,
  cooldown: CHARGER_COOLDOWN,
  damage: CHARGER_DAMAGE,
  attackStyle: 'rush',
  rushSpeed: CHARGER_CHARGE_SPEED,
  rushDuration: CHARGER_CHARGE_DURATION,
  preferredRange: 0,
  separationRadius: CHARGER_SEPARATION_RADIUS,
  initialDelayMin: 0.5,
  initialDelayMax: 1.0,
  color: 0xaa1111,
  spriteId: 'charger',
  spriteScale: 2.5,
})

registerEnemy({
  type: EnemyType.GOBLIN_BARBARIAN,
  name: 'Goblin Barbarian',
  tier: GOBLIN_BARBARIAN_TIER,
  speed: GOBLIN_BARBARIAN_SPEED,
  radius: GOBLIN_BARBARIAN_RADIUS,
  hp: GOBLIN_BARBARIAN_HP,
  budgetCost: GOBLIN_BARBARIAN_BUDGET_COST,
  dropChance: 0.03,
  aggroRange: GOBLIN_BARBARIAN_AGGRO_RANGE,
  attackRange: GOBLIN_BARBARIAN_ATTACK_RANGE,
  losRequired: false,
  telegraphDuration: GOBLIN_BARBARIAN_TELEGRAPH,
  recoveryDuration: GOBLIN_BARBARIAN_RECOVERY,
  cooldown: GOBLIN_BARBARIAN_COOLDOWN,
  damage: GOBLIN_BARBARIAN_DAMAGE,
  attackStyle: 'melee',
  meleeReach: GOBLIN_BARBARIAN_MELEE_REACH,
  attackDuration: GOBLIN_BARBARIAN_ATTACK_DURATION,
  knockbackSpeed: GOBLIN_MELEE_KB_SPEED,
  knockbackDuration: GOBLIN_MELEE_KB_DURATION,
  preferredRange: 0,
  separationRadius: GOBLIN_BARBARIAN_SEPARATION_RADIUS,
  initialDelayMin: 0.2,
  initialDelayMax: 0.5,
  color: 0x44aa44,
  spriteId: 'goblin_barbarian',
  spriteScale: 2,
})

registerEnemy({
  type: EnemyType.GOBLIN_ROGUE,
  name: 'Goblin Rogue',
  tier: GOBLIN_ROGUE_TIER,
  speed: GOBLIN_ROGUE_SPEED,
  radius: GOBLIN_ROGUE_RADIUS,
  hp: GOBLIN_ROGUE_HP,
  budgetCost: GOBLIN_ROGUE_BUDGET_COST,
  dropChance: 0.02,
  aggroRange: GOBLIN_ROGUE_AGGRO_RANGE,
  attackRange: GOBLIN_ROGUE_ATTACK_RANGE,
  losRequired: false,
  telegraphDuration: GOBLIN_ROGUE_TELEGRAPH,
  recoveryDuration: GOBLIN_ROGUE_RECOVERY,
  cooldown: GOBLIN_ROGUE_COOLDOWN,
  damage: GOBLIN_ROGUE_DAMAGE,
  attackStyle: 'melee',
  meleeReach: GOBLIN_ROGUE_MELEE_REACH,
  attackDuration: GOBLIN_ROGUE_ATTACK_DURATION,
  knockbackSpeed: GOBLIN_MELEE_KB_SPEED,
  knockbackDuration: GOBLIN_MELEE_KB_DURATION,
  preferredRange: 0,
  separationRadius: GOBLIN_ROGUE_SEPARATION_RADIUS,
  initialDelayMin: 0.2,
  initialDelayMax: 0.5,
  color: 0x66cc66,
  spriteId: 'goblin_rogue',
  spriteScale: 2,
})

registerEnemy({
  type: EnemyType.RUNNER,
  name: 'Runner',
  tier: RUNNER_TIER,
  speed: RUNNER_SPEED,
  radius: RUNNER_RADIUS,
  hp: RUNNER_HP,
  budgetCost: 0,
  dropChance: 0,
  aggroRange: 0,
  attackRange: 0,
  losRequired: false,
  telegraphDuration: 0,
  recoveryDuration: 0,
  cooldown: 0,
  damage: 0,
  attackStyle: 'custom',
  preferredRange: 0,
  separationRadius: 0,
  initialDelayMin: 0,
  initialDelayMax: 0,
  color: 0x44ddff,
  spriteId: 'runner',
  spriteScale: 1.5,
})

registerEnemy({
  type: EnemyType.DUELIST,
  name: 'Duelist',
  tier: DUELIST_TIER,
  speed: DUELIST_SPEED,
  radius: DUELIST_RADIUS,
  hp: DUELIST_HP,
  budgetCost: 0,
  dropChance: 0.30,
  aggroRange: DUELIST_AGGRO_RANGE,
  attackRange: DUELIST_ATTACK_RANGE,
  losRequired: false,
  telegraphDuration: DUELIST_TELEGRAPH,
  recoveryDuration: DUELIST_RECOVERY,
  cooldown: DUELIST_COOLDOWN,
  damage: DUELIST_DAMAGE,
  attackStyle: 'melee',
  meleeReach: DUELIST_MELEE_REACH,
  attackDuration: DUELIST_ATTACK_DURATION,
  knockbackSpeed: DUELIST_MELEE_KB_SPEED,
  knockbackDuration: DUELIST_MELEE_KB_DURATION,
  preferredRange: 0,
  separationRadius: DUELIST_SEPARATION_RADIUS,
  initialDelayMin: 0.1,
  initialDelayMax: 0.1,
  color: 0xddaa33,
  spriteId: 'duelist',
  spriteScale: 2.5,
})

// ============================================================================
// Lasso Bandit — ranged root CC threat
// ============================================================================

export const LASSO_ROOT_DURATION = 1.5

registerEnemy({
  type: EnemyType.LASSO_BANDIT,
  name: 'Lasso Bandit',
  tier: EnemyTier.THREAT,
  speed: 60,
  radius: 10,
  hp: 25,
  budgetCost: 3,
  dropChance: 0.06,
  aggroRange: 350,
  attackRange: 200,
  losRequired: false,
  telegraphDuration: 0.4,
  recoveryDuration: 2.5,
  cooldown: 3.0,
  damage: 4,
  attackStyle: 'custom',
  projectileSpeed: 150,
  projectileCount: 1,
  preferredRange: 150,
  separationRadius: 24,
  initialDelayMin: 0.3,
  initialDelayMax: 0.7,
  color: 0xcc8844,
  spriteId: 'lasso_bandit',
  spriteScale: 2,
})

// ============================================================================
// Dynamite Tosser — area denial fodder with friendly fire
// ============================================================================

export const DYNAMITE_TOSSER_FUSE_TIME = 1.5
export const DYNAMITE_TOSSER_BLAST_RADIUS = 60

registerEnemy({
  type: EnemyType.DYNAMITE_TOSSER,
  name: 'Dynamite Tosser',
  tier: EnemyTier.FODDER,
  speed: 50,
  radius: 8,
  hp: 8,
  budgetCost: 2,
  dropChance: 0.02,
  aggroRange: 300,
  attackRange: 180,
  losRequired: false,
  telegraphDuration: 0.3,
  recoveryDuration: 3.0,
  cooldown: 4.0,
  damage: 10,
  attackStyle: 'custom',
  preferredRange: 140,
  separationRadius: 20,
  initialDelayMin: 0.3,
  initialDelayMax: 0.6,
  color: 0xff6600,
  spriteId: 'dynamite_tosser',
  spriteScale: 2,
})

// ============================================================================
// Armored Bandit — melee tank with directional front armor
// ============================================================================

/** Frontal damage multiplier (0.4 = 60% reduction) */
export const ARMORED_BANDIT_FRONT_REDUCTION = 0.4
/** Half-angle of armored arc in radians (PI/2 = 90° each side = 180° total) */
export const ARMORED_BANDIT_ARC_HALF_ANGLE = Math.PI / 2

registerEnemy({
  type: EnemyType.ARMORED_BANDIT,
  name: 'Armored Bandit',
  tier: EnemyTier.THREAT,
  speed: 70,
  radius: 12,
  hp: 40,
  budgetCost: 4,
  dropChance: 0.08,
  aggroRange: 300,
  attackRange: 35,
  losRequired: false,
  telegraphDuration: 0.4,
  recoveryDuration: 0.6,
  cooldown: 2.0,
  damage: 12,
  attackStyle: 'melee',
  meleeReach: 14,
  attackDuration: 0.3,
  knockbackSpeed: 220,
  knockbackDuration: 0.15,
  preferredRange: 0,
  separationRadius: 28,
  initialDelayMin: 0.3,
  initialDelayMax: 0.7,
  color: 0x888888,
  spriteId: 'armored_bandit',
  spriteScale: 2.5,
})

registerEnemy({
  type: EnemyType.COYOTE,
  name: 'Coyote',
  tier: COYOTE_TIER,
  speed: COYOTE_SPEED,
  radius: COYOTE_RADIUS,
  hp: COYOTE_HP,
  budgetCost: COYOTE_BUDGET_COST,
  dropChance: 0,
  aggroRange: COYOTE_AGGRO_RANGE,
  attackRange: COYOTE_ATTACK_RANGE,
  losRequired: false,
  telegraphDuration: COYOTE_TELEGRAPH,
  recoveryDuration: COYOTE_RECOVERY,
  cooldown: COYOTE_COOLDOWN,
  damage: COYOTE_DAMAGE,
  attackStyle: 'rush',
  rushSpeed: COYOTE_DART_SPEED,
  rushDuration: COYOTE_DART_DURATION,
  preferredRange: COYOTE_PREFERRED_RANGE,
  separationRadius: COYOTE_SEPARATION_RADIUS,
  initialDelayMin: 0.2,
  initialDelayMax: 0.5,
  color: 0xc4a35a,
  spriteId: 'coyote',
  spriteScale: 1.5,
})
