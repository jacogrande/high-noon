/**
 * Last Rites Renderer
 *
 * Draws visual feedback for the Last Rites ability:
 * - Translucent circle zone on the ground
 * - Pulsing border alpha
 */

import { Graphics, Container } from 'pixi.js'
import type { GameWorld } from '@high-noon/shared'

const ZONE_COLOR = 0x4a1a6b
const ZONE_BORDER_COLOR = 0x8833cc

export class LastRitesRenderer {
  private readonly zoneGraphics: Graphics
  private pulseTimer = 0

  constructor(entityLayer: Container) {
    this.zoneGraphics = new Graphics()
    this.zoneGraphics.visible = false
    entityLayer.addChild(this.zoneGraphics)
  }

  render(world: GameWorld, _alpha: number, realDt: number): void {
    // Draw all active zones from the per-player map (works for both SP and MP)
    const zones = world.lastRitesZones
    let anyActive = false

    this.zoneGraphics.clear()

    this.pulseTimer = (this.pulseTimer + realDt) % (Math.PI * 2)
    const pulse = Math.sin(this.pulseTimer * 3) * 0.5 + 0.5
    const fillAlpha = 0.12 + pulse * 0.08
    const borderAlpha = 0.4 + pulse * 0.3

    for (const zone of zones.values()) {
      if (!zone.active) continue
      anyActive = true

      this.zoneGraphics
        .circle(zone.x, zone.y, zone.radius)
        .fill({ color: ZONE_COLOR, alpha: fillAlpha })

      this.zoneGraphics
        .circle(zone.x, zone.y, zone.radius)
        .stroke({ color: ZONE_BORDER_COLOR, width: 2, alpha: borderAlpha })
    }

    this.zoneGraphics.visible = anyActive
  }

  destroy(): void {
    this.zoneGraphics.destroy()
  }
}
