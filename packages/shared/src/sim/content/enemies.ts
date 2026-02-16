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

/** Probability of dropping an item on death, by EnemyType */
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
