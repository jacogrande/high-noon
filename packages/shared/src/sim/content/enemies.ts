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
export const SWARMER_HP = 1
export const SWARMER_AGGRO_RANGE = 400
export const SWARMER_ATTACK_RANGE = 150
export const SWARMER_TELEGRAPH = 0.2
export const SWARMER_RECOVERY = 0.3
export const SWARMER_COOLDOWN = 1.5
export const SWARMER_DAMAGE = 1
export const SWARMER_BULLET_SPEED = 100
export const SWARMER_SEPARATION_RADIUS = 16
export const SWARMER_BUDGET_COST = 1
export const SWARMER_TIER = EnemyTier.FODDER

// ============================================================================
// Grunt — sturdy melee fodder
// ============================================================================

export const GRUNT_SPEED = 80
export const GRUNT_RADIUS = 10
export const GRUNT_HP = 3
export const GRUNT_AGGRO_RANGE = 300
export const GRUNT_ATTACK_RANGE = 200
export const GRUNT_TELEGRAPH = 0.4
export const GRUNT_RECOVERY = 0.5
export const GRUNT_COOLDOWN = 2.0
export const GRUNT_DAMAGE = 1
export const GRUNT_BULLET_SPEED = 150
export const GRUNT_SEPARATION_RADIUS = 24
export const GRUNT_BUDGET_COST = 2
export const GRUNT_TIER = EnemyTier.FODDER

// ============================================================================
// Shooter — ranged threat that keeps distance
// ============================================================================

export const SHOOTER_SPEED = 60
export const SHOOTER_RADIUS = 10
export const SHOOTER_HP = 3
export const SHOOTER_AGGRO_RANGE = 350
export const SHOOTER_ATTACK_RANGE = 250
export const SHOOTER_TELEGRAPH = 0.35
export const SHOOTER_RECOVERY = 0.6
export const SHOOTER_COOLDOWN = 2.5
export const SHOOTER_DAMAGE = 1
export const SHOOTER_BULLET_SPEED = 180
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
export const CHARGER_HP = 5
export const CHARGER_AGGRO_RANGE = 250
export const CHARGER_ATTACK_RANGE = 150
export const CHARGER_TELEGRAPH = 0.5
export const CHARGER_RECOVERY = 0.8
export const CHARGER_COOLDOWN = 3.0
export const CHARGER_DAMAGE = 2
export const CHARGER_CHARGE_SPEED = 300
/** Duration of charger's ATTACK rush in seconds */
export const CHARGER_CHARGE_DURATION = 0.4
export const CHARGER_SEPARATION_RADIUS = 28
export const CHARGER_BUDGET_COST = 3
export const CHARGER_TIER = EnemyTier.THREAT
