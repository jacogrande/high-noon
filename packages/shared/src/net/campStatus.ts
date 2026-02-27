/**
 * Camp status message — broadcast during camp phase so all clients
 * can see who is ready and how much time remains before auto-advance.
 */

export interface CampStatusMessage {
  /** Number of players who have clicked "Ride Out" */
  readyCount: number
  /** Total connected players */
  totalPlayers: number
  /** Seconds remaining before auto-advance (0 when auto-advanced) */
  remainingSeconds: number
}

/** Camp auto-advance timer in seconds */
export const CAMP_AUTO_ADVANCE_SECONDS = 90
