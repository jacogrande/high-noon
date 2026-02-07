/**
 * Weapon Content Definitions
 *
 * Contains weapon balance values and bullet parameters.
 */

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

// ============================================================================
// Bullet Parameters
// ============================================================================

/** Collision radius for bullets in pixels */
export const BULLET_RADIUS = 4

/** Failsafe despawn time in seconds */
export const BULLET_LIFETIME = 5.0

/** Range for enemy-fired bullets in pixels */
export const ENEMY_BULLET_RANGE = 500
