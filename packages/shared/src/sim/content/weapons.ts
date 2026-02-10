/**
 * Weapon Content Definitions
 *
 * Contains weapon balance values, bullet parameters, and visual data.
 */

import type { CharacterId } from './characters'

// ============================================================================
// Weapon Sprite Data — visual definitions read by the client renderer
// ============================================================================

/** Per-weapon visual tuning data. Lives in shared so weapon defs pair gameplay + visuals. */
export interface WeaponSpriteData {
  /** Texture key in AssetLoader (e.g. 'revolver') */
  sprite: string
  /** Weapon pivot offset from body center (world-space pixels) */
  gripOffset: { x: number; y: number }
  /** Barrel tip offset from grip in weapon-pivot-local space (world-space pixels) */
  barrelTip: { x: number; y: number }
  /** Recoil kick distance in pixels */
  kickDistance: number
  /** Sprite scale multiplier (applied on top of BODY_SCALE) */
  scale: number
}

/** Revolver visual data */
export const REVOLVER_SPRITE: WeaponSpriteData = {
  sprite: 'revolver',
  gripOffset: { x: 0, y: -10 },
  barrelTip: { x: 30, y: 0 },
  kickDistance: 3,
  scale: 1,
}

// ============================================================================
// Pistol - Default Starting Weapon
// ============================================================================

/** Shots per second (0.2s cooldown) */
export const PISTOL_FIRE_RATE = 5

/** Bullet speed in pixels per second */
export const PISTOL_BULLET_SPEED = 600

/** Damage per bullet */
export const PISTOL_BULLET_DAMAGE = 10

/** Bullet range in pixels (covers ~half arena) */
export const PISTOL_RANGE = 400

// ============================================================================
// Cylinder (revolver ammo)
// ============================================================================

/** Number of rounds in a full cylinder */
export const PISTOL_CYLINDER_SIZE = 6

/** Time in seconds to reload a full cylinder */
export const PISTOL_RELOAD_TIME = 1.2

/** Minimum time between shots in seconds (click-to-fire soft floor) */
export const PISTOL_MIN_FIRE_INTERVAL = 0.075

/** Shots per second when holding fire button */
export const PISTOL_HOLD_FIRE_RATE = 3

/** Damage multiplier applied to the last round in the cylinder */
export const PISTOL_LAST_ROUND_MULTIPLIER = 1.5

/** Single slug (no spread) */
export const PISTOL_PELLET_COUNT = 1

/** No spread for revolver */
export const PISTOL_SPREAD_ANGLE = 0

// ============================================================================
// Sawed-Off Shotgun (Undertaker weapon)
// ============================================================================

/** Sawed-off cylinder size (double-barrel) */
export const SAWED_OFF_CYLINDER_SIZE = 2

/** Sawed-off reload time in seconds (break-action, fast) */
export const SAWED_OFF_RELOAD_TIME = 0.7

/** Sawed-off fire rate (same as pistol) */
export const SAWED_OFF_FIRE_RATE = 5

/** Sawed-off bullet speed in pixels per second (slower, heavier slugs) */
export const SAWED_OFF_BULLET_SPEED = 450

/** Sawed-off damage per slug */
export const SAWED_OFF_BULLET_DAMAGE = 10

/** Sawed-off range in pixels (short range, close-quarters) */
export const SAWED_OFF_RANGE = 180

/** Sawed-off minimum shot interval (heavier action) */
export const SAWED_OFF_MIN_FIRE_INTERVAL = 0.12

/** Sawed-off hold-to-fire rate */
export const SAWED_OFF_HOLD_FIRE_RATE = 3

/** Sawed-off last round damage multiplier (second barrel kicks harder) */
export const SAWED_OFF_LAST_ROUND_MULTIPLIER = 1.75

/** Number of pellets per sawed-off shot */
export const SAWED_OFF_PELLET_COUNT = 5

/** Spread angle in radians (~29° fan) */
export const SAWED_OFF_SPREAD_ANGLE = 0.5

/** Sawed-off visual data */
export const SAWED_OFF_SPRITE: WeaponSpriteData = {
  sprite: 'sawed_off',
  gripOffset: { x: 0, y: -10 },
  barrelTip: { x: 26, y: 0 },
  kickDistance: 5,
  scale: 1,
}

// ============================================================================
// Last Rites Ability (Undertaker)
// ============================================================================

/** Zone radius in pixels */
export const LAST_RITES_ZONE_RADIUS = 150

/** Zone placement range from player (pixels) */
export const LAST_RITES_PLACEMENT_RANGE = 350

/** Zone duration in seconds */
export const LAST_RITES_DURATION = 5.0

/** Death pulse base damage */
export const LAST_RITES_PULSE_DAMAGE = 8

/** Death pulse AoE radius (pixels) */
export const LAST_RITES_PULSE_RADIUS = 100

/** Default chain limit (removed by Overtime node) */
export const LAST_RITES_CHAIN_LIMIT = 3

/** Cooldown after Last Rites ends (seconds) */
export const LAST_RITES_COOLDOWN = 14.0

/** Cooldown refund per chain kill (seconds) */
export const LAST_RITES_KILL_REFUND = 1.0

// ============================================================================
// Pickaxe (Prospector weapon)
// ============================================================================

/** Pickaxe damage per swing */
export const PICKAXE_SWING_DAMAGE = 8

/** Swings per second */
export const PICKAXE_SWING_RATE = 2.5

/** Melee reach in pixels */
export const PICKAXE_REACH = 60

/** Cleave arc in radians (90°) */
export const PICKAXE_CLEAVE_ARC = Math.PI / 2

/** Knockback distance in pixels */
export const PICKAXE_KNOCKBACK = 40

/** Time to fully charge a swing (seconds) */
export const PICKAXE_CHARGE_TIME = 0.5

/** Damage multiplier for a charged swing */
export const PICKAXE_CHARGE_MULTIPLIER = 2.5

/** Charged swing arc in radians (140°) */
export const PICKAXE_CHARGE_ARC = Math.PI * 0.78

/** Knockback impulse duration for melee hit (seconds) */
export const MELEE_KNOCKBACK_DURATION = 0.15

/** Tremor AoE radius in pixels */
export const TREMOR_RADIUS = 80

/** Pickaxe visual data */
export const PICKAXE_SPRITE: WeaponSpriteData = {
  sprite: 'pickaxe',
  gripOffset: { x: 0, y: -10 },
  barrelTip: { x: 24, y: 0 },
  kickDistance: 2,
  scale: 1.1,
}

/** Character -> primary weapon visual mapping. */
export const CHARACTER_WEAPON_SPRITES: Record<CharacterId, WeaponSpriteData> = {
  sheriff: REVOLVER_SPRITE,
  undertaker: SAWED_OFF_SPRITE,
  prospector: PICKAXE_SPRITE,
}

export function getWeaponSpriteForCharacter(characterId: CharacterId): WeaponSpriteData {
  return CHARACTER_WEAPON_SPRITES[characterId] ?? REVOLVER_SPRITE
}

// ============================================================================
// Dynamite (Prospector ability)
// ============================================================================

/** Dynamite explosion damage */
export const DYNAMITE_DAMAGE = 20

/** Blast radius in pixels */
export const DYNAMITE_RADIUS = 100

/** Fuse time in seconds */
export const DYNAMITE_FUSE = 1.5

/** Cooldown between throws in seconds */
export const DYNAMITE_COOLDOWN = 8

/** Maximum throw range in pixels */
export const DYNAMITE_THROW_RANGE = 300

/** Knockback distance from explosion center */
export const DYNAMITE_KNOCKBACK = 60

/** Knockback impulse duration for explosion (seconds) */
export const DYNAMITE_EXPLOSION_KB_DURATION = 0.2

/** Self-damage when detonating in hand */
export const DYNAMITE_SELF_DAMAGE = 20

/** Nitro secondary explosion radius (pixels) */
export const NITRO_RADIUS = 40

/** Nitro secondary explosion damage */
export const NITRO_DAMAGE = 8

// ============================================================================
// Gold Rush (Prospector passive)
// ============================================================================

/** Pickup radius for gold nuggets (pixels) */
export const GOLD_PICKUP_RADIUS = 30

/** Damage bonus per Gold Fever stack (8%) */
export const GOLD_FEVER_BONUS_PER_STACK = 0.08

/** Maximum Gold Fever stacks */
export const GOLD_FEVER_MAX_STACKS = 5

/** Gold Fever stack duration in seconds */
export const GOLD_FEVER_DURATION = 5

// ============================================================================
// Bullet Parameters
// ============================================================================

/** Collision radius for bullets in pixels */
export const BULLET_RADIUS = 4

/** Failsafe despawn time in seconds */
export const BULLET_LIFETIME = 5.0

/** Range for enemy-fired bullets in pixels */
export const ENEMY_BULLET_RANGE = 500

// ============================================================================
// Showdown Ability
// ============================================================================

/** Duration of Showdown in seconds */
export const SHOWDOWN_DURATION = 4.0

/** Cooldown after Showdown ends in seconds */
export const SHOWDOWN_COOLDOWN = 12.0

/** Seconds refunded from cooldown on marked target kill */
export const SHOWDOWN_KILL_REFUND = 4.0

/** Damage multiplier against marked target */
export const SHOWDOWN_DAMAGE_MULTIPLIER = 2.0

/** Speed multiplier while Showdown is active */
export const SHOWDOWN_SPEED_BONUS = 1.1

/** Maximum range to mark an enemy (pixels) */
export const SHOWDOWN_MARK_RANGE = 500
