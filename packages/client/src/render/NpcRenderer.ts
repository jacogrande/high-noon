/**
 * NPC Renderer
 *
 * Renders discovery NPC entities as placeholder circles.
 * Tracks dialogue activation edges for speech bubble triggers.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '@high-noon/shared'
import { Npc, NpcDialogue, Position, getNpcDef } from '@high-noon/shared'
import { SpriteRegistry } from './SpriteRegistry'

const npcRenderQuery = defineQuery([Npc, Position])

export interface NpcDialogueTriggered {
  eid: number
  x: number
  y: number
  text: string
  duration: number
}

export interface NpcSyncResult {
  dialogues: NpcDialogueTriggered[]
}

export class NpcRenderer {
  private readonly registry: SpriteRegistry
  private readonly npcEntities = new Set<number>()
  private readonly currentEntities = new Set<number>()
  private readonly prevDialogueActive = new Map<number, number>()

  constructor(registry: SpriteRegistry) {
    this.registry = registry
  }

  sync(world: GameWorld): NpcSyncResult {
    const dialogues: NpcDialogueTriggered[] = []
    const npcs = npcRenderQuery(world)

    const currentEntities = this.currentEntities
    currentEntities.clear()

    for (const eid of npcs) {
      currentEntities.add(eid)

      if (!this.npcEntities.has(eid)) {
        this.registry.createCircle(eid, 10, 0x44aaff)
        this.npcEntities.add(eid)
      }

      // Dialogue edge detection: 0→1 transition
      const active = NpcDialogue.active[eid]!
      const prev = this.prevDialogueActive.get(eid) ?? 0
      if (active === 1 && prev === 0) {
        const npcDef = getNpcDef(Npc.type[eid]!)
        if (npcDef) {
          const lineIndex = NpcDialogue.lineIndex[eid]!
          const line = npcDef.lines[lineIndex]
          if (line) {
            dialogues.push({
              eid,
              x: Position.x[eid]!,
              y: Position.y[eid]!,
              text: line.text,
              duration: NpcDialogue.duration[eid]!,
            })
          }
        }
      }
      this.prevDialogueActive.set(eid, active)
    }

    // Remove despawned NPCs
    for (const eid of this.npcEntities) {
      if (!currentEntities.has(eid)) {
        this.registry.remove(eid)
        this.npcEntities.delete(eid)
        this.prevDialogueActive.delete(eid)
      }
    }

    return { dialogues }
  }

  render(world: GameWorld, alpha: number): void {
    for (const eid of this.npcEntities) {
      if (!hasComponent(world, Npc, eid)) continue

      const prevX = Position.prevX[eid]!
      const prevY = Position.prevY[eid]!
      const currX = Position.x[eid]!
      const currY = Position.y[eid]!

      const renderX = prevX + (currX - prevX) * alpha
      const renderY = prevY + (currY - prevY) * alpha

      this.registry.setPosition(eid, renderX, renderY)
    }
  }

  get count(): number {
    return this.npcEntities.size
  }

  destroy(): void {
    for (const eid of this.npcEntities) {
      this.registry.remove(eid)
    }
    this.npcEntities.clear()
    this.currentEntities.clear()
    this.prevDialogueActive.clear()
  }
}
