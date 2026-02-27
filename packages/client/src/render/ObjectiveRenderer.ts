/**
 * Objective Renderer
 *
 * Renders objective target entities (protect buildings, intercept destinations)
 * and their associated health bars / status indicators.
 * Also renders the duel ring visual when a duel objective is active.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '@high-noon/shared'
import { ObjectiveTarget, ObjTargetType, Position, Health } from '@high-noon/shared'
import { SpriteRegistry } from './SpriteRegistry'
import { Graphics } from 'pixi.js'
import type { Container } from 'pixi.js'

const objectiveTargetQuery = defineQuery([ObjectiveTarget, Position])

/** Aux tags for objective health-bar graphics in SpriteRegistry */
const OBJ_BAR_BG_TAG = 'objBarBg'
const OBJ_BAR_FILL_TAG = 'objBarFill'

const BAR_WIDTH = 40
const BAR_HEIGHT = 5
const BAR_Y_OFFSET = 24

/** Colors */
const PROTECT_COLOR = 0x4488ff    // blue
const INTERCEPT_COLOR = 0xff8844  // orange-red
const DUEL_RING_COLOR = 0xffcc44  // golden amber
const DUEL_RING_FORFEIT_COLOR = 0xff4444  // red
const PROTECT_RADIUS = 12
const INTERCEPT_MARKER_RADIUS = 8

export class ObjectiveRenderer {
  private readonly registry: SpriteRegistry
  private readonly trackedEntities = new Set<number>()
  private ringGraphics: Graphics | null = null
  private readonly parentContainer: Container

  constructor(registry: SpriteRegistry, entityLayer: Container) {
    this.registry = registry
    this.parentContainer = entityLayer
  }

  sync(world: GameWorld): void {
    const entities = objectiveTargetQuery(world)
    const current = new Set<number>()

    for (const eid of entities) {
      current.add(eid)
      const type = ObjectiveTarget.type[eid]!

      if (!this.trackedEntities.has(eid)) {
        // Create visual for new objective entity
        if (type === ObjTargetType.PROTECT_ENTITY) {
          this.registry.createCircle(eid, PROTECT_RADIUS, PROTECT_COLOR)
          // Health bar
          const bg = new Graphics().rect(-BAR_WIDTH / 2, -BAR_HEIGHT / 2, BAR_WIDTH, BAR_HEIGHT).fill({ color: 0x111111 })
          const fill = new Graphics().rect(-BAR_WIDTH / 2, -BAR_HEIGHT / 2, BAR_WIDTH, BAR_HEIGHT).fill({ color: PROTECT_COLOR })
          this.registry.setAux(eid, OBJ_BAR_BG_TAG, bg)
          this.registry.setAux(eid, OBJ_BAR_FILL_TAG, fill)
        } else if (type === ObjTargetType.INTERCEPT_DEST) {
          // Pulsing marker
          this.registry.createCircle(eid, INTERCEPT_MARKER_RADIUS, INTERCEPT_COLOR)
        }
        this.trackedEntities.add(eid)
      }
    }

    // Remove old
    for (const eid of this.trackedEntities) {
      if (!current.has(eid)) {
        this.registry.remove(eid)  // also removes aux
        this.trackedEntities.delete(eid)
      }
    }

    // Manage duel ring graphic
    const obj = world.objective
    if (obj && obj.type === 'duel' && obj.status === 'active') {
      if (!this.ringGraphics) {
        this.ringGraphics = new Graphics()
        this.parentContainer.addChildAt(this.ringGraphics, 0)
      }
    } else if (this.ringGraphics) {
      this.ringGraphics.destroy()
      this.ringGraphics = null
    }
  }

  render(world: GameWorld, alpha: number): void {
    for (const eid of this.trackedEntities) {
      if (!hasComponent(world, ObjectiveTarget, eid)) continue

      const prevX = Position.prevX[eid]!
      const prevY = Position.prevY[eid]!
      const currX = Position.x[eid]!
      const currY = Position.y[eid]!
      const renderX = prevX + (currX - prevX) * alpha
      const renderY = prevY + (currY - prevY) * alpha

      this.registry.setPosition(eid, renderX, renderY)

      const type = ObjectiveTarget.type[eid]!

      if (type === ObjTargetType.PROTECT_ENTITY && hasComponent(world, Health, eid)) {
        const bg = this.registry.getAux(eid, OBJ_BAR_BG_TAG)
        const fill = this.registry.getAux(eid, OBJ_BAR_FILL_TAG) as Graphics | undefined
        if (bg && fill) {
          const hp = Health.current[eid]!
          const maxHP = Math.max(1, Health.max[eid]!)
          const ratio = Math.max(0, Math.min(1, hp / maxHP))
          const barY = renderY - BAR_Y_OFFSET

          bg.position.set(renderX, barY)
          bg.alpha = 0.9

          const leftEdgeX = renderX - BAR_WIDTH / 2
          const fillCenterX = leftEdgeX + (BAR_WIDTH * ratio) / 2
          fill.scale.set(ratio, 1)
          fill.position.set(fillCenterX, barY)
          fill.alpha = 1

          // Color shift as HP decreases
          const color = ratio < 0.3 ? 0xff4444 : ratio < 0.6 ? 0xffaa44 : PROTECT_COLOR
          fill.clear()
          fill.rect(-BAR_WIDTH / 2, -BAR_HEIGHT / 2, BAR_WIDTH, BAR_HEIGHT)
          fill.fill({ color })
        }
      }

      if (type === ObjTargetType.INTERCEPT_DEST) {
        // Pulse alpha
        const pulse = 0.5 + 0.5 * Math.sin(world.tick * 0.1)
        this.registry.setAlpha(eid, pulse)
      }
    }

    // Render duel ring
    const obj = world.objective
    if (this.ringGraphics && obj && obj.type === 'duel' && obj.status === 'active') {
      this.ringGraphics.clear()
      const forfeiting = obj.forfeitTimer > 0
      const ringColor = forfeiting ? DUEL_RING_FORFEIT_COLOR : DUEL_RING_COLOR
      const pulse = 0.4 + 0.15 * Math.sin(world.tick * 0.08)
      const ringAlpha = forfeiting ? 0.6 + 0.3 * Math.sin(world.tick * 0.3) : pulse
      this.ringGraphics.circle(obj.ringCenterX, obj.ringCenterY, obj.ringRadius)
      this.ringGraphics.stroke({ width: 2, color: ringColor, alpha: ringAlpha })
    }
  }

  destroy(): void {
    for (const eid of this.trackedEntities) {
      this.registry.remove(eid)  // also removes aux
    }
    this.trackedEntities.clear()
    if (this.ringGraphics) {
      this.ringGraphics.destroy()
      this.ringGraphics = null
    }
  }
}
