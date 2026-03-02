/**
 * Dust Zone Renderer
 *
 * Draws Dustdevil lingering damage zones as swirling dust circles.
 * Zones fade out as their remaining duration decreases.
 *
 * Uses a cache key (positions + quantized remaining) to skip redundant
 * GPU batch rebuilds when nothing has visibly changed.
 */

import { Graphics, Container } from 'pixi.js'
import type { GameWorld } from '@high-noon/shared'

const DUST_FILL = 0xaa8844
const DUST_STROKE = 0x886633
const DUST_INNER = 0xccaa66

export class DustZoneRenderer {
  private readonly graphics: Graphics
  private cachedKey = ''

  constructor(entityLayer: Container) {
    this.graphics = new Graphics()
    this.graphics.visible = false
    entityLayer.addChild(this.graphics)
  }

  render(world: GameWorld): void {
    const zones = world.dustZones
    if (zones.length === 0) {
      if (this.cachedKey !== '') {
        this.graphics.clear()
        this.graphics.visible = false
        this.cachedKey = ''
      }
      return
    }

    // Build cache key — quantize remaining to 50ms precision
    let key = `${zones.length}`
    for (const z of zones) key += `|${z.x | 0},${z.y | 0},${(z.remaining * 20) | 0}`
    if (key === this.cachedKey) return
    this.cachedKey = key

    this.graphics.clear()

    for (const zone of zones) {
      // Fade out in the last 0.8s
      const fadeAlpha = Math.min(zone.remaining / 0.8, 1)
      const r = zone.radius

      // Outer zone fill
      this.graphics
        .circle(zone.x, zone.y, r)
        .fill({ color: DUST_FILL, alpha: 0.2 * fadeAlpha })

      // Border ring
      this.graphics
        .circle(zone.x, zone.y, r)
        .stroke({ color: DUST_STROKE, width: 1.5, alpha: 0.5 * fadeAlpha })

      // Inner swirl hints (smaller offset circles)
      this.graphics
        .circle(zone.x - r * 0.2, zone.y - r * 0.1, r * 0.4)
        .fill({ color: DUST_INNER, alpha: 0.12 * fadeAlpha })
      this.graphics
        .circle(zone.x + r * 0.15, zone.y + r * 0.2, r * 0.3)
        .fill({ color: DUST_INNER, alpha: 0.1 * fadeAlpha })
    }

    this.graphics.visible = true
  }

  destroy(): void {
    this.graphics.destroy()
  }
}
