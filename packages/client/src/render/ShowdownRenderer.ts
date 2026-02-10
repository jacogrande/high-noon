/**
 * Showdown Renderer
 *
 * Draws visual feedback for the Showdown ability:
 * - Diamond mark above the targeted enemy (pulsing)
 * - Connection line from player to target (pulsing alpha)
 * - Glow ring around the target
 */

import { Graphics, Container } from 'pixi.js'
import type { GameWorld } from '@high-noon/shared'
import { Showdown, Position, NO_TARGET } from '@high-noon/shared'
import { hasComponent } from 'bitecs'

/** Mark color */
const MARK_COLOR = 0xff2222
/** Line color */
const LINE_COLOR = 0xff4444
/** Glow ring color */
const RING_COLOR = 0xff2222
/** Mark offset above target (pixels) */
const MARK_OFFSET_Y = -14
/** Glow ring radius padding beyond enemy collider */
const RING_RADIUS = 10

export class ShowdownRenderer {
  private readonly markGraphics: Graphics
  private readonly lineGraphics: Graphics
  private pulseTimer = 0

  constructor(entityLayer: Container) {
    this.markGraphics = new Graphics()
    this.lineGraphics = new Graphics()
    this.markGraphics.visible = false
    this.lineGraphics.visible = false
    entityLayer.addChild(this.lineGraphics)
    entityLayer.addChild(this.markGraphics)
  }

  render(world: GameWorld, allPlayerEids: Iterable<number>, alpha: number, realDt: number): void {
    this.markGraphics.clear()
    this.lineGraphics.clear()

    let anyActive = false

    this.pulseTimer = (this.pulseTimer + realDt) % (Math.PI / 2)
    const pulse = Math.sin(this.pulseTimer * 4)
    const markScale = 0.8 + pulse * 0.2
    const lineAlpha = 0.3 + (pulse * 0.5 + 0.5) * 0.3

    for (const playerEid of allPlayerEids) {
      if (!hasComponent(world, Showdown, playerEid) || Showdown.active[playerEid]! !== 1) {
        continue
      }

      const targetEid = Showdown.targetEid[playerEid]!
      if (targetEid === NO_TARGET || !hasComponent(world, Position, targetEid)) {
        continue
      }

      anyActive = true

      // Interpolate positions
      const px = Position.prevX[playerEid]! + (Position.x[playerEid]! - Position.prevX[playerEid]!) * alpha
      const py = Position.prevY[playerEid]! + (Position.y[playerEid]! - Position.prevY[playerEid]!) * alpha
      const tx = Position.prevX[targetEid]! + (Position.x[targetEid]! - Position.prevX[targetEid]!) * alpha
      const ty = Position.prevY[targetEid]! + (Position.y[targetEid]! - Position.prevY[targetEid]!) * alpha

      // Draw mark (diamond) above target
      const mx = tx
      const my = ty + MARK_OFFSET_Y
      const size = 4 * markScale
      this.markGraphics
        .moveTo(mx, my - size)
        .lineTo(mx + size, my)
        .lineTo(mx, my + size)
        .lineTo(mx - size, my)
        .closePath()
        .fill({ color: MARK_COLOR, alpha: 0.9 })
        .stroke({ color: 0xffffff, width: 1, alpha: 0.8 })

      // Draw glow ring around target
      this.markGraphics
        .circle(tx, ty, RING_RADIUS)
        .stroke({ color: RING_COLOR, width: 1.5, alpha: 0.4 + pulse * 0.2 })

      // Draw connection line
      this.lineGraphics
        .moveTo(px, py)
        .lineTo(tx, ty)
        .stroke({ color: LINE_COLOR, width: 1, alpha: lineAlpha })
    }

    this.markGraphics.visible = anyActive
    this.lineGraphics.visible = anyActive
  }

  destroy(): void {
    this.markGraphics.destroy()
    this.lineGraphics.destroy()
  }
}
