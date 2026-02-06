/**
 * Player Content Definitions
 *
 * Default values and constants for player entities.
 * Tuning values based on mechanics doc recommendations.
 */

/** Player movement speed in pixels per second (recommended: 200-300) */
export const PLAYER_SPEED = 250

/** Player collision radius in pixels */
export const PLAYER_RADIUS = 16

/** Player health points */
export const PLAYER_HP = 5

/** Player invulnerability duration after taking damage (seconds) */
export const PLAYER_IFRAME_DURATION = 0.5

/** Player default starting position */
export const PLAYER_START_X = 400
export const PLAYER_START_Y = 300

// ============================================================================
// Roll Parameters
// Based on Enter the Gungeon style: i-frames + vulnerable recovery
// ============================================================================

/** Roll duration in seconds (snappy for bullet-hell, Gungeon uses 0.7s) */
export const ROLL_DURATION = 0.3

/** Portion of roll with i-frames (0.5 = first 50% is invincible) */
export const ROLL_IFRAME_RATIO = 0.5

/** Speed multiplier during roll (2.0 = double speed) */
export const ROLL_SPEED_MULTIPLIER = 2.0

/**
 * Roll cooldown in seconds (0 = recovery-based, no cooldown)
 * Using recovery-based like Gungeon: can roll again immediately after,
 * but the vulnerable window between i-frames creates natural pacing.
 */
export const ROLL_COOLDOWN = 0
