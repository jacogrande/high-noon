/**
 * Vote-kick protocol types.
 *
 * Flow:
 * 1. Client → server: 'votekick-start' { targetSessionId }
 * 2. Server → all clients: 'votekick-vote' { voteId, targetSessionId, targetName, initiatorName, expiresInS }
 * 3. Clients → server: 'votekick-cast' { voteId, approve }
 * 4. Server → all clients: 'votekick-result' { voteId, targetSessionId, passed }
 */

/** Voting window in seconds */
export const VOTEKICK_DURATION_S = 30

/** Cooldown per initiator in seconds */
export const VOTEKICK_COOLDOWN_S = 300

/** Sent from initiator to server */
export interface VotekickStartMessage {
  targetSessionId: string
}

/** Broadcast from server to all clients when a vote begins */
export interface VotekickVoteMessage {
  voteId: string
  targetSessionId: string
  targetName: string
  initiatorName: string
  expiresInS: number
}

/** Sent from voter to server */
export interface VotekickCastMessage {
  voteId: string
  approve: boolean
}

/** Broadcast when vote concludes */
export interface VotekickResultMessage {
  voteId: string
  targetSessionId: string
  passed: boolean
}
