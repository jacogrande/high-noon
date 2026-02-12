/**
 * Input state types for player controls
 *
 * InputState is passed from client to server each tick and processed
 * deterministically in the shared simulation.
 */

/** Button bit flags */
export const Button = {
  MOVE_UP: 1 << 0,
  MOVE_DOWN: 1 << 1,
  MOVE_LEFT: 1 << 2,
  MOVE_RIGHT: 1 << 3,
  SHOOT: 1 << 4,
  ROLL: 1 << 5,
  /** Debug: spawn a test enemy bullet aimed at the player */
  DEBUG_SPAWN: 1 << 6,
  /** Reload the cylinder */
  RELOAD: 1 << 7,
  /** Showdown ability */
  ABILITY: 1 << 8,
  /** Jump */
  JUMP: 1 << 9,
} as const

export type ButtonFlag = (typeof Button)[keyof typeof Button]

/**
 * Complete input state for a single tick
 */
export type InputState = {
  /** Bit flags for pressed buttons */
  buttons: number
  /** Aim angle in radians (from player to cursor) */
  aimAngle: number
  /** Normalized movement X (-1 to 1) */
  moveX: number
  /** Normalized movement Y (-1 to 1) */
  moveY: number
  /** Cursor world X position (for Showdown targeting) */
  cursorWorldX: number
  /** Cursor world Y position (for Showdown targeting) */
  cursorWorldY: number
}

/** Create a default (empty) input state */
export function createInputState(): InputState {
  return {
    buttons: 0,
    aimAngle: 0,
    moveX: 0,
    moveY: 0,
    cursorWorldX: 0,
    cursorWorldY: 0,
  }
}

/** Check if a button is pressed */
export function hasButton(input: InputState, flag: ButtonFlag): boolean {
  return (input.buttons & flag) !== 0
}

/** Set a button flag */
export function setButton(buttons: number, flag: ButtonFlag): number {
  return buttons | flag
}

/** Clear a button flag */
export function clearButton(buttons: number, flag: ButtonFlag): number {
  return buttons & ~flag
}

/**
 * Input state with a monotonic sequence number for network transmission.
 * Used for client→server input messages. The seq field enables the server
 * to acknowledge processed inputs and the client to replay unacknowledged
 * ones during reconciliation.
 */
export interface NetworkInput extends InputState {
  /** Monotonically increasing sequence number, starts at 1 */
  seq: number
  /**
   * Client-side prediction tick this input was sampled on.
   * Used by server-side lag compensation to estimate command time.
   */
  clientTick: number
  /** Client-local timestamp (performance.now domain) when sampled */
  clientTimeMs: number
  /**
   * Client-estimated server timestamp (performance.now domain).
   * 0 means unknown/unconverged and server should use fallback mapping.
   */
  estimatedServerTimeMs: number
  /**
   * Interpolation delay used by client render when input was sampled.
   * Server subtracts this from estimatedServerTimeMs to align with what player saw.
   */
  viewInterpDelayMs: number
  /** Monotonic SHOOT press-edge counter for decoupled shot timing diagnostics */
  shootSeq: number
}
