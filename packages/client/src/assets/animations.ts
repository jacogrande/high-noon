/**
 * Player Animation Definitions
 *
 * Defines 4-directional facing and animation states for the player.
 * Sprite sheets have 3 rows (N, E, S); W mirrors E with a horizontal flip.
 */

/** 4 cardinal directions */
export const DIRECTIONS = ['N', 'E', 'S', 'W'] as const
export type Direction = (typeof DIRECTIONS)[number]

/** Sprite row directions in the sprite sheets */
export const SPRITE_ROW: Record<Exclude<Direction, 'W'>, number> = {
  E: 0,
  S: 1,
  N: 2,
}

/** Player animation states (game-facing) */
export const ANIMATION_STATES = ['idle', 'walk', 'roll', 'hurt', 'death'] as const
export type AnimationState = (typeof ANIMATION_STATES)[number]

/** Cell size in the sprite sheets (px) */
export const SPRITE_CELL_SIZE = 79

/** Per-animation sprite sheet info: source file and frame count per direction */
export const PLAYER_SPRITE_INFO: Record<AnimationState, { file: string; frames: number }> = {
  idle: { file: 'idle.png', frames: 4 },
  walk: { file: 'run.png', frames: 8 },
  roll: { file: 'jump.png', frames: 6 },
  hurt: { file: 'hurt.png', frames: 4 },
  death: { file: 'death.png', frames: 6 },
}

/** Animation speeds (frames per second) */
export const ANIMATION_SPEEDS: Record<AnimationState, number> = {
  idle: 4,
  walk: 10,
  roll: 12,
  hurt: 8,
  death: 8,
}

/** Number of frames per animation (derived from PLAYER_SPRITE_INFO) */
export const ANIMATION_FRAME_COUNTS: Record<AnimationState, number> = {
  idle: PLAYER_SPRITE_INFO.idle.frames,
  walk: PLAYER_SPRITE_INFO.walk.frames,
  roll: PLAYER_SPRITE_INFO.roll.frames,
  hurt: PLAYER_SPRITE_INFO.hurt.frames,
  death: PLAYER_SPRITE_INFO.death.frames,
}

/**
 * Convert angle in radians to 4-directional direction string
 *
 * 0 radians = East, PI/2 = South, PI = West, -PI/2 = North
 *
 * Direction sectors (45° = PI/4 each side of center):
 * - E:  -45° to 45°
 * - S:  45° to 135°
 * - W:  135° to 225° (wraps)
 * - N:  225° to 315° (i.e. -135° to -45°)
 */
export function angleToDirection(radians: number): Direction {
  const degrees = ((radians * 180) / Math.PI + 360 + 45) % 360
  const directionOrder: Direction[] = ['E', 'S', 'W', 'N']
  const index = Math.floor(degrees / 90) % 4
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
  const ticksPerFrame = 60 / fps
  const frame = Math.floor(tick / ticksPerFrame) % frameCount
  return frame
}
