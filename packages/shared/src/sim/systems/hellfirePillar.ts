/**
 * Hellfire Pillar System
 *
 * Handles per-tick behavior for Old Scratch's Phase 3 Hellfire Pillars:
 * - Heals the boss each tick
 * - Applies contact damage to nearby players
 * - Pushes circle telegraphs for client rendering
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { HellfirePillar, Position, Health, Player, Dead, Downed } from '../components'
import { applyDamage } from './applyDamage'

const pillarQuery = defineQuery([HellfirePillar, Position, Health])
const playerQuery = defineQuery([Player, Position, Health])

export function hellfirePillarSystem(world: GameWorld, dt: number): void {
  const pillars = pillarQuery(world)
  if (pillars.length === 0) return

  const players = playerQuery(world)

  for (const eid of pillars) {
    // Skip dead pillars
    if (Health.current[eid]! <= 0 || hasComponent(world, Dead, eid)) continue

    const px = Position.x[eid]!
    const py = Position.y[eid]!
    const bossEid = HellfirePillar.bossEid[eid]!
    const healPerSecond = HellfirePillar.healPerSecond[eid]!
    const contactDps = HellfirePillar.contactDps[eid]!
    const damageRadius = HellfirePillar.damageRadius[eid]!

    // Heal boss
    if (Health.current[bossEid]! > 0 && !hasComponent(world, Dead, bossEid)) {
      Health.current[bossEid] = Math.min(
        Health.max[bossEid]!,
        Health.current[bossEid]! + healPerSecond * dt,
      )
    }

    // Contact damage to players
    const r2 = damageRadius * damageRadius
    for (const pid of players) {
      if (Health.current[pid]! <= 0 || hasComponent(world, Dead, pid) || hasComponent(world, Downed, pid)) continue
      const dx = Position.x[pid]! - px
      const dy = Position.y[pid]! - py
      if (dx * dx + dy * dy <= r2) {
        applyDamage(world, pid, {
          amount: contactDps * dt,
          attackerEid: eid,
        })
      }
    }

    // Push circle telegraph
    world.bossTelegraphs.push({
      kind: 'circle',
      x: px, y: py,
      radius: damageRadius,
      color: 0xff4400,
      alpha: 0.15,
      progress: 1,
    })
  }
}
