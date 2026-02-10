/**
 * Jump mechanic constants.
 *
 * Tune values here to adjust jump arc, landing lockout, and stomp payoff.
 */

/** Maximum jump height in world pixels. */
export const JUMP_HEIGHT = 20

/** Time to reach jump apex in seconds (10 ticks at 60 Hz). */
export const JUMP_TIME_TO_APEX = 10 / 60

/** Upward gravity in px/s^2 for the configured arc. */
export const JUMP_GRAVITY_UP = (2 * JUMP_HEIGHT) / (JUMP_TIME_TO_APEX * JUMP_TIME_TO_APEX)

/** Initial upward velocity in px/s for the configured arc. */
export const JUMP_VELOCITY = JUMP_GRAVITY_UP * JUMP_TIME_TO_APEX

/** Descending gravity multiplier for snappier landing. */
export const JUMP_GRAVITY_DOWN_MULT = 1.5

/** Landing lockout duration in seconds (6 ticks at 60 Hz). */
export const JUMP_LANDING_DURATION = 6 / 60

/** Buffered jump input duration in ticks. */
export const JUMP_BUFFER_FRAMES = 6

/** Radius of stomp AoE in world pixels. */
export const JUMP_STOMP_RADIUS = 48

/** Flat stomp damage applied on landing. */
export const JUMP_STOMP_DAMAGE = 5

/** Z threshold above which entities are treated as airborne. */
export const JUMP_AIRBORNE_THRESHOLD = 2
