/**
 * RendererBundle — shared renderer lifecycle for mode controllers.
 *
 * Centralises construction, dependency wiring, and destruction of the 20
 * renderers used by both Singleplayer and Multiplayer mode controllers.
 */

import type { Container } from 'pixi.js'
import type { LayerName } from '../engine/GameApp'
import { DebugRenderer } from './DebugRenderer'
import { SpriteRegistry } from './SpriteRegistry'
import { PlayerRenderer } from './PlayerRenderer'
import { BulletRenderer } from './BulletRenderer'
import { EnemyRenderer } from './EnemyRenderer'
import { ShowdownRenderer } from './ShowdownRenderer'
import { LastRitesRenderer } from './LastRitesRenderer'
import { DynamiteRenderer } from './DynamiteRenderer'
import { GroundCrackRenderer } from './GroundCrackRenderer'
import { BossShockwaveRenderer } from './BossShockwaveRenderer'
import { BossAttackRenderer } from './BossAttackRenderer'
import { TrapZoneRenderer } from './TrapZoneRenderer'
import { MapObstacleRenderer } from './MapObstacleRenderer'
import { InteractableRenderer } from './InteractableRenderer'
import { TilemapRenderer, CollisionDebugRenderer } from './TilemapRenderer'
import { DustStormEffect } from './DustStormEffect'
import { TumbleweedRenderer } from './TumbleweedRenderer'
import { NpcRenderer } from './NpcRenderer'
import { ObjectiveRenderer } from './ObjectiveRenderer'

export class RendererBundle {
  readonly debugRenderer: DebugRenderer
  readonly spriteRegistry: SpriteRegistry
  readonly playerRenderer: PlayerRenderer
  readonly bulletRenderer: BulletRenderer
  readonly enemyRenderer: EnemyRenderer
  readonly npcRenderer: NpcRenderer
  readonly objectiveRenderer: ObjectiveRenderer
  readonly showdownRenderer: ShowdownRenderer
  readonly lastRitesRenderer: LastRitesRenderer
  readonly dynamiteRenderer: DynamiteRenderer
  readonly groundCrackRenderer: GroundCrackRenderer
  readonly bossShockwaveRenderer: BossShockwaveRenderer
  readonly bossAttackRenderer: BossAttackRenderer
  readonly trapZoneRenderer: TrapZoneRenderer
  readonly mapObstacleRenderer: MapObstacleRenderer
  readonly interactableRenderer: InteractableRenderer
  readonly tilemapRenderer: TilemapRenderer
  readonly collisionDebugRenderer: CollisionDebugRenderer
  readonly dustStormEffect: DustStormEffect
  readonly tumbleweedRenderer: TumbleweedRenderer

  constructor(layers: Record<LayerName, Container>) {
    this.debugRenderer = new DebugRenderer(layers.ui)
    this.spriteRegistry = new SpriteRegistry(layers.entities)
    this.playerRenderer = new PlayerRenderer(layers.entities)
    this.bulletRenderer = new BulletRenderer(this.spriteRegistry)
    this.enemyRenderer = new EnemyRenderer(this.spriteRegistry, this.debugRenderer, layers.entities)
    this.npcRenderer = new NpcRenderer(this.spriteRegistry)
    this.objectiveRenderer = new ObjectiveRenderer(this.spriteRegistry, layers.entities)
    this.showdownRenderer = new ShowdownRenderer(layers.entities)
    this.lastRitesRenderer = new LastRitesRenderer(layers.entities)
    this.dynamiteRenderer = new DynamiteRenderer(layers.entities)
    this.groundCrackRenderer = new GroundCrackRenderer(layers.entities)
    this.bossShockwaveRenderer = new BossShockwaveRenderer(layers.entities)
    this.bossAttackRenderer = new BossAttackRenderer(layers.entities)
    this.trapZoneRenderer = new TrapZoneRenderer(layers.entities)
    this.mapObstacleRenderer = new MapObstacleRenderer(layers.entities)
    this.interactableRenderer = new InteractableRenderer(layers.entities)
    this.tilemapRenderer = new TilemapRenderer(layers.background)
    this.collisionDebugRenderer = new CollisionDebugRenderer(layers.ui)
    this.dustStormEffect = new DustStormEffect(layers.entities)
    this.tumbleweedRenderer = new TumbleweedRenderer(layers.entities)
  }

  destroy(): void {
    this.debugRenderer.destroy()
    this.collisionDebugRenderer.destroy()
    this.tilemapRenderer.destroy()
    this.interactableRenderer.destroy()
    this.playerRenderer.destroy()
    this.npcRenderer.destroy()
    this.objectiveRenderer.destroy()
    this.enemyRenderer.destroy()
    this.lastRitesRenderer.destroy()
    this.dynamiteRenderer.destroy()
    this.groundCrackRenderer.destroy()
    this.bossShockwaveRenderer.destroy()
    this.bossAttackRenderer.destroy()
    this.trapZoneRenderer.destroy()
    this.mapObstacleRenderer.destroy()
    this.showdownRenderer.destroy()
    this.tumbleweedRenderer.destroy()
    this.dustStormEffect.destroy()
    this.bulletRenderer.destroy()
    this.spriteRegistry.destroy() // last — others may reference sprites
  }
}
