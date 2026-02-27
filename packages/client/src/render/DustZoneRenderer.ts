/**
 * Dust Zone Renderer
 *
 * Draws Dustdevil lingering damage zones as swirling dust circles.
 * Zones fade out as their remaining duration decreases.
 *
 * Redraws every frame since zone durations change continuously.
 */

import { Graphics, Container } from 'pixi.js'
import type { GameWorld } from '@high-noon/shared'

const DUST_FILL = 0xaa8844
const DUST_STROKE = 0x886633
const DUST_INNER = 0xccaa66

export class DustZoneRenderer {
  private readonly graphics: Graphics

  constructor(entityLayer: Container) {
    this.graphics = new Graphics()
    this.graphics.visible = false
    entityLayer.addChild(this.graphics)
  }

  render(world: GameWorld): void {
    const zones = world.dustZones
    if (zones.length === 0) {
      if (this.graphics.visible) {
        this.graphics.clear()
        this.graphics.visible = false
      }
      return
    }

    this.graphics.clear()

    for (const zone of zones) {
      // Fade out in the last 0.8s
      const fadeAlpha = Math.min(zone.remaining / 0.8, 1)

      // Outer zone fill
      this.graphics
        .circle(zone.x, zone.y, zone.radius)
        .fill({ color: DUST_FILL, alpha: 0.2 * fadeAlpha })

      // Border ring
      this.graphics
        .circle(zone.x, zone.y, zone.radius)
        .stroke({ color: DUST_STROKE, width: 1.5, alpha: 0.5 * fadeAlpha })

      // Inner swirl hints (smaller offset circles)
      this.graphics
        .circle(zone.x - zone.radius * 0.2, zone.y - zone.radius * 0.1, zone.radius * 0.4)
        .fill({ color: DUST_INNER, alpha: 0.12 * fadeAlpha })
      this.graphics
        .circle(zone.x + zone.radius * 0.15, zone.y + zone.radius * 0.2, zone.radius * 0.3)
        .fill({ color: DUST_INNER, alpha: 0.1 * fadeAlpha })
    }

    this.graphics.visible = true
  }

  destroy(): void {
    this.graphics.destroy()
  }
}
