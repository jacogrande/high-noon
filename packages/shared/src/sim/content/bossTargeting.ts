/**
 * Boss Threat Distribution
 *
 * Distributes boss aimed attacks across players in multiplayer
 * via round-robin targeting.
 */

import { hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { Dead } from '../components'

/**
 * Get the target player EID for a boss aimed attack in multiplayer.
 * Distributes attacks round-robin across alive players.
 */
export function getBossAimedTarget(
  world: GameWorld,
  attackIndex: number,
): number {
  const alivePlayers: number[] = []
  for (const [eid] of world.playerInputs) {
    if (!hasComponent(world, Dead, eid)) {
      alivePlayers.push(eid)
    }
  }
  if (alivePlayers.length === 0) return -1
  if (alivePlayers.length === 1) return alivePlayers[0]!
  return alivePlayers[attackIndex % alivePlayers.length]!
}
