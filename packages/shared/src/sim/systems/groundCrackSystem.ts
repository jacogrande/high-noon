/**
 * Ground Crack System
 *
 * Applies 20% speed slow to players standing inside ground crack zones
 * left by Mad Dog's Ground Pound. Runs after hazardTileSystem so it
 * can compose with tile-based speed multipliers via Math.min.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { Player, Position, Health, BossPhase } from '../components'
import { MAD_DOG_GROUND_CRACK_SPEED_MUL } from '../content/bosses/madDog'

const playerQuery = defineQuery([Player, Position, Health])

export function groundCrackSystem(world: GameWorld, _dt: number): void {
  const cracks = world.groundCracks
  if (cracks.length === 0) return

  const players = playerQuery(world)
  for (const eid of players) {
    // Bosses are immune to their own ground cracks
    if (hasComponent(world, BossPhase, eid)) continue

    const px = Position.x[eid]!
    const py = Position.y[eid]!

    for (const crack of cracks) {
      const dx = px - crack.x
      const dy = py - crack.y
      if (dx * dx + dy * dy <= crack.radius * crack.radius) {
        const existing = world.floorSpeedMul.get(eid) ?? 1
        world.floorSpeedMul.set(eid, Math.min(existing, MAD_DOG_GROUND_CRACK_SPEED_MUL))
        break // one crack is enough to apply the slow
      }
    }
  }
}
