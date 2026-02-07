/**
 * Player Animation Definitions
 *
 * Defines 8-directional facing and animation states for the player.
 */

/** 8 cardinal and ordinal directions */
export const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
export type Direction = (typeof DIRECTIONS)[number]

/** Player animation states */
export const ANIMATION_STATES = ['idle', 'walk', 'roll', 'run', 'jump', 'interact'] as const
export type AnimationState = (typeof ANIMATION_STATES)[number]

/** Animation speeds (frames per second) */
export const ANIMATION_SPEEDS: Record<AnimationState, number> = {
  idle: 2, // Gentle bob using walk sprites (~30 ticks per frame)
  walk: 8, // 8 FPS walk cycle
  roll: 12, // Fast roll/dodge animation
  run: 8, // Run cycle
  jump: 10, // Jump animation
  interact: 6, // Interact animation
}

/** Number of frames per animation */
export const ANIMATION_FRAME_COUNTS: Record<AnimationState, number> = {
  idle: 2,
  walk: 2,
  roll: 3,
  run: 2,
  jump: 3,
  interact: 3,
}

/**
 * Convert angle in radians to 8-directional direction string
 *
 * 0 radians = East, PI/2 = South, PI = West, -PI/2 = North
 *
 * Direction sectors (22.5° = PI/8 radians each side of center):
 * - E:  -22.5° to 22.5°   (-PI/8 to PI/8)
 * - SE: 22.5° to 67.5°    (PI/8 to 3*PI/8)
 * - S:  67.5° to 112.5°   (3*PI/8 to 5*PI/8)
 * - SW: 112.5° to 157.5°  (5*PI/8 to 7*PI/8)
 * - W:  157.5° to 202.5°  (7*PI/8 to -7*PI/8, wraps)
 * - NW: -157.5° to -112.5° (-7*PI/8 to -5*PI/8)
 * - N:  -112.5° to -67.5° (-5*PI/8 to -3*PI/8)
 * - NE: -67.5° to -22.5°  (-3*PI/8 to -PI/8)
 */
export function angleToDirection8(radians: number): Direction {
  // Normalize to 0-360 degrees, offset by 22.5° for sector boundaries
  const degrees = ((radians * 180) / Math.PI + 360 + 22.5) % 360

  // Map to direction index (0=E, 1=SE, 2=S, etc.)
  const directionOrder: Direction[] = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']
  const index = Math.floor(degrees / 45) % 8

  return directionOrder[index]!
}

/**
 * Get animation frame based on world tick
 *
 * @param state - Animation state
 * @param tick - Current world tick (60Hz)
 * @returns Frame index (0-based)
 */
export function getAnimationFrame(state: AnimationState, tick: number): number {
  const frameCount = ANIMATION_FRAME_COUNTS[state]
  const fps = ANIMATION_SPEEDS[state]

  // Convert 60Hz ticks to animation frames
  // At 60 ticks/sec and 10 FPS walk animation: tick / 6 = frame position
  const ticksPerFrame = 60 / fps
  const frame = Math.floor(tick / ticksPerFrame) % frameCount

  return frame
}
