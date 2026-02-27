/**
 * Laser Sight Renderer
 *
 * Draws Deadeye sniper telegraph lines — a laser sight from the enemy
 * to a point far along the locked aim direction. The line intensifies
 * (faint → bright red) as the telegraph progress approaches 1.0.
 *
 * Redraws every frame since telegraph data is rebuilt each tick.
 */

import { Graphics, Container } from 'pixi.js'
import type { GameWorld } from '@high-noon/shared'

const LASER_COLOR = 0xff2222
const LASER_DOT_COLOR = 0xff4444
const LASER_MAX_LENGTH = 600

export class LaserSightRenderer {
  private readonly graphics: Graphics

  constructor(entityLayer: Container) {
    this.graphics = new Graphics()
    this.graphics.visible = false
    entityLayer.addChild(this.graphics)
  }

  render(world: GameWorld): void {
    const telegraphs = world.laserTelegraphs
    if (telegraphs.length === 0) {
      if (this.graphics.visible) {
        this.graphics.clear()
        this.graphics.visible = false
      }
      return
    }

    this.graphics.clear()

    for (const t of telegraphs) {
      const alpha = 0.15 + t.progress * 0.7
      const width = 1 + t.progress * 1.5

      // Normalize aim direction
      const adx = t.aimX
      const ady = t.aimY
      const len = Math.sqrt(adx * adx + ady * ady)
      if (len < 0.001) continue
      const nx = adx / len
      const ny = ady / len

      const endX = t.x + nx * LASER_MAX_LENGTH
      const endY = t.y + ny * LASER_MAX_LENGTH

      // Main laser line
      this.graphics
        .moveTo(t.x, t.y)
        .lineTo(endX, endY)
        .stroke({ color: LASER_COLOR, width, alpha })

      // Origin dot on the enemy
      this.graphics
        .circle(t.x, t.y, 2 + t.progress)
        .fill({ color: LASER_DOT_COLOR, alpha: alpha * 0.8 })
    }

    this.graphics.visible = true
  }

  destroy(): void {
    this.graphics.destroy()
  }
}
