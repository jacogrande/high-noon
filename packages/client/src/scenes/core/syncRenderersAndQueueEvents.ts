import type { GameWorld } from '@high-noon/shared'
import type { BulletRenderer } from '../../render/BulletRenderer'
import type { EnemyRenderer } from '../../render/EnemyRenderer'
import type { PlayerRenderer } from '../../render/PlayerRenderer'
import type { NpcRenderer } from '../../render/NpcRenderer'
import type { ObjectiveRenderer } from '../../render/ObjectiveRenderer'
import type { ChatBubblePool } from '../../fx/ChatBubblePool'
import { GameplayEventBuffer } from './GameplayEvents'

export interface RendererSyncContext {
  world: GameWorld
  playerRenderer: PlayerRenderer
  enemyRenderer: EnemyRenderer
  bulletRenderer: BulletRenderer
  events: GameplayEventBuffer
  npcRenderer?: NpcRenderer
  objectiveRenderer?: ObjectiveRenderer
  chatBubblePool?: ChatBubblePool
}

/**
 * Keep renderer lifecycle + associated feedback event generation in one place.
 * This avoids singleplayer/multiplayer drift for enemy hit/death and bullet
 * wall-impact effects.
 */
export function syncRenderersAndQueueEvents(ctx: RendererSyncContext): void {
  const { world, playerRenderer, enemyRenderer, bulletRenderer, events } = ctx

  playerRenderer.sync(world)

  const enemySync = enemyRenderer.sync(world)
  if (enemySync.deathTrauma > 0 || enemySync.deaths.length > 0 || enemySync.hits.length > 0) {
    events.push({
      type: 'enemy-sync',
      deathTrauma: enemySync.deathTrauma,
      deaths: enemySync.deaths.map(d => ({ x: d.x, y: d.y, color: d.color, isThreat: d.isThreat })),
      hits: enemySync.hits.map(h => ({ x: h.x, y: h.y, color: h.color, amount: h.amount, dirX: h.dirX, dirY: h.dirY })),
    })
  }

  // Queue heal / bite / vulture-trail events from enemy sync
  if (world.healEvents.length > 0) {
    events.push({ type: 'enemy-healed', heals: world.healEvents.map(h => ({ x: h.x, y: h.y, amount: h.amount })) })
  }
  if (world.rattlesnakeBites.length > 0) {
    events.push({ type: 'rattlesnake-bite', bites: world.rattlesnakeBites.map(b => ({ x: b.x, y: b.y })) })
  }
  if (enemySync.vultureDiveTrails.length > 0) {
    events.push({ type: 'vulture-dive-trail', trails: enemySync.vultureDiveTrails.map(t => ({ x: t.x, y: t.y })) })
  }

  bulletRenderer.sync(world)
  if (bulletRenderer.removedPositions.length > 0) {
    events.push({
      type: 'bullet-removed',
      positions: bulletRenderer.removedPositions.map(p => ({ x: p.x, y: p.y })),
    })
  }

  if (ctx.objectiveRenderer) {
    ctx.objectiveRenderer.sync(world)
  }

  if (ctx.npcRenderer) {
    const npcSync = ctx.npcRenderer.sync(world)
    if (ctx.chatBubblePool) {
      for (const d of npcSync.dialogues) {
        ctx.chatBubblePool.show(d.eid, d.x, d.y, d.text, d.duration)
      }
    }
  }
}
