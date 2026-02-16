/**
 * Boss Phase System
 *
 * Generic system that delegates phase transition logic to registered boss modules.
 * Replaces the old hard-coded boomstickBossSystem.
 */

import { defineQuery } from 'bitecs'
import type { GameWorld } from '../world'
import { Enemy, BossPhase, Health, Position } from '../components'
import { getBoss } from '../content/bosses'

const bossQuery = defineQuery([Enemy, BossPhase, Health])

export function bossPhaseSystem(world: GameWorld, dt: number): void {
  world.bossTelegraphs.length = 0
  world.bossPhaseChanges.length = 0
  const entities = bossQuery(world)
  for (const eid of entities) {
    const type = Enemy.type[eid]!
    const mod = getBoss(type)
    if (!mod) continue
    const phaseBefore = BossPhase.phase[eid]!
    mod.tick(world, eid, dt)
    const phaseAfter = BossPhase.phase[eid]!
    if (phaseAfter !== phaseBefore) {
      world.bossPhaseChanges.push({
        eid,
        newPhase: phaseAfter,
        x: Position.x[eid]!,
        y: Position.y[eid]!,
      })
    }
  }
}
