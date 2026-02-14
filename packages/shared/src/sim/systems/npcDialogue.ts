/**
 * NPC Dialogue System
 *
 * Checks player proximity to NPCs each tick. When a player enters
 * triggerDistance of an NPC that hasn't been triggered (or is off cooldown),
 * sets dialogue to active with a randomly chosen line.
 *
 * The system only manages state transitions. Rendering (typewriter, bubble)
 * is handled by the client.
 */

import { defineQuery } from 'bitecs'
import type { GameWorld } from '../world'
import { Position, Npc, NpcDialogue } from '../components'
import { getNpcDef } from '../content/npcs'
import { getAlivePlayers } from '../queries'

const npcQuery = defineQuery([Npc, NpcDialogue, Position])

export function npcDialogueSystem(world: GameWorld, dt: number): void {
  const players = getAlivePlayers(world)

  for (const eid of npcQuery(world)) {
    // Active dialogue — tick timer and check expiration
    if (NpcDialogue.active[eid] === 1) {
      NpcDialogue.timer[eid] = NpcDialogue.timer[eid]! + dt
      if (NpcDialogue.timer[eid]! >= NpcDialogue.duration[eid]!) {
        NpcDialogue.active[eid] = 0
        NpcDialogue.timer[eid] = 0

        // Set cooldown if repeatable
        const def = getNpcDef(Npc.type[eid]!)
        if (def && def.repeatable) {
          NpcDialogue.cooldown[eid] = def.cooldownTime
        }
      }
      continue
    }

    // Cooldown tick
    const cooldown = NpcDialogue.cooldown[eid]!
    if (cooldown > 0) {
      NpcDialogue.cooldown[eid] = cooldown - dt
      continue
    }

    // Already triggered and not repeatable — skip
    const def = getNpcDef(Npc.type[eid]!)
    if (!def) continue
    if (NpcDialogue.triggered[eid] === 1 && !def.repeatable) continue

    // Check player proximity
    const nx = Position.x[eid]!
    const ny = Position.y[eid]!
    const triggerDistSq = def.triggerDistance * def.triggerDistance

    for (const pid of players) {
      const px = Position.x[pid]!
      const py = Position.y[pid]!
      const dx = px - nx
      const dy = py - ny
      const distSq = dx * dx + dy * dy

      if (distSq <= triggerDistSq) {
        // Trigger dialogue
        const lineIndex = world.rng.nextInt(def.lines.length)
        const line = def.lines[lineIndex]!
        NpcDialogue.active[eid] = 1
        NpcDialogue.lineIndex[eid] = lineIndex
        NpcDialogue.timer[eid] = 0
        NpcDialogue.duration[eid] = line.duration!
        NpcDialogue.triggered[eid] = 1
        break
      }
    }
  }
}
