/**
 * Laser Sight Renderer
 *
 * Draws Deadeye sniper telegraph lines — a laser sight from the enemy
 * to a point far along the locked aim direction. The line intensifies
 * (faint → bright red) as the telegraph progress approaches 1.0.
 *
 * Uses a cache key (positions + quantized progress) to skip redundant
 * GPU batch rebuilds when nothing has visibly changed.
 */

import { Graphics, Container } from 'pixi.js'
import type { GameWorld } from '@high-noon/shared'

const LASER_COLOR = 0xff2222
const LASER_DOT_COLOR = 0xff4444
const LASER_MAX_LENGTH = 600

export class LaserSightRenderer {
  private readonly graphics: Graphics
  private cachedKey = ''

  constructor(entityLayer: Container) {
    this.graphics = new Graphics()
    this.graphics.visible = false
    entityLayer.addChild(this.graphics)
  }

  render(world: GameWorld): void {
    const telegraphs = world.laserTelegraphs
    if (telegraphs.length === 0) {
      if (this.cachedKey !== '') {
        this.graphics.clear()
        this.graphics.visible = false
        this.cachedKey = ''
      }
      return
    }

    // Build cache key — quantize progress to 2 decimal places
    let key = `${telegraphs.length}`
    for (const t of telegraphs) {
      key += `|${t.x | 0},${t.y | 0},${(t.progress * 100) | 0}`
    }
    if (key === this.cachedKey) return
    this.cachedKey = key

    this.graphics.clear()

    for (const t of telegraphs) {
      const alpha = 0.15 + t.progress * 0.7
      const width = 1 + t.progress * 1.5

      // aimX/aimY is already a unit vector (normalized at TELEGRAPH entry)
      const endX = t.x + t.aimX * LASER_MAX_LENGTH
      const endY = t.y + t.aimY * LASER_MAX_LENGTH

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
