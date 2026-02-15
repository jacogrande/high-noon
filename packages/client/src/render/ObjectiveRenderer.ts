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

/** Synthetic sprite IDs for objective health bar graphics */
const OBJ_BAR_BG_OFFSET = 40000
const OBJ_BAR_FILL_OFFSET = 41000

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
          this.registry.createRect(OBJ_BAR_BG_OFFSET + eid, BAR_WIDTH, BAR_HEIGHT, 0x111111)
          this.registry.createRect(OBJ_BAR_FILL_OFFSET + eid, BAR_WIDTH, BAR_HEIGHT, PROTECT_COLOR)
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
        this.registry.remove(eid)
        this.registry.remove(OBJ_BAR_BG_OFFSET + eid)
        this.registry.remove(OBJ_BAR_FILL_OFFSET + eid)
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
        // Update health bar
        const hp = Health.current[eid]!
        const maxHP = Math.max(1, Health.max[eid]!)
        const ratio = Math.max(0, Math.min(1, hp / maxHP))
        const barY = renderY - BAR_Y_OFFSET

        const bgId = OBJ_BAR_BG_OFFSET + eid
        const fillId = OBJ_BAR_FILL_OFFSET + eid

        this.registry.setPosition(bgId, renderX, barY)
        this.registry.setAlpha(bgId, 0.9)

        const scaledWidth = BAR_WIDTH * ratio
        const leftEdgeX = renderX - BAR_WIDTH / 2
        const fillCenterX = leftEdgeX + scaledWidth / 2
        this.registry.setScale(fillId, ratio, 1)
        this.registry.setPosition(fillId, fillCenterX, barY)
        this.registry.setAlpha(fillId, 1)

        // Color shift as HP decreases
        if (ratio < 0.3) {
          this.registry.setColor(fillId, 0xff4444)
        } else if (ratio < 0.6) {
          this.registry.setColor(fillId, 0xffaa44)
        } else {
          this.registry.setColor(fillId, PROTECT_COLOR)
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
      this.registry.remove(eid)
      this.registry.remove(OBJ_BAR_BG_OFFSET + eid)
      this.registry.remove(OBJ_BAR_FILL_OFFSET + eid)
    }
    this.trackedEntities.clear()
    if (this.ringGraphics) {
      this.ringGraphics.destroy()
      this.ringGraphics = null
    }
  }
}
