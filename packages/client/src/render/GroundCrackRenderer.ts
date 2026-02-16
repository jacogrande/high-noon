/**
 * Ground Crack Renderer
 *
 * Draws visual feedback for ground crack zones (left by Mad Dog's Ground Pound):
 * - Translucent brown/dark-gray circles on the ground
 * - Radial crack lines for texture
 *
 * Cracks are permanent within an encounter so we cache the Graphics and only
 * redraw when the crack count changes.
 */

import { Graphics, Container } from 'pixi.js'
import type { GameWorld } from '@high-noon/shared'

const CRACK_FILL_COLOR = 0x3a2a1a
const CRACK_LINE_COLOR = 0x5a3a1a
const FILL_ALPHA = 0.25
const LINE_ALPHA = 0.4
const LINE_COUNT = 6

export class GroundCrackRenderer {
  private readonly graphics: Graphics
  /** Cached crack count to detect when redraw is needed */
  private cachedCount = 0

  constructor(entityLayer: Container) {
    this.graphics = new Graphics()
    this.graphics.visible = false
    entityLayer.addChild(this.graphics)
  }

  render(world: GameWorld): void {
    const cracks = world.groundCracks
    if (cracks.length === 0) {
      if (this.cachedCount !== 0) {
        this.graphics.clear()
        this.graphics.visible = false
        this.cachedCount = 0
      }
      return
    }

    // Only redraw when crack count changes (cracks never move or shrink)
    if (cracks.length === this.cachedCount) return

    this.cachedCount = cracks.length
    this.graphics.clear()

    for (const crack of cracks) {
      // Filled circle
      this.graphics
        .circle(crack.x, crack.y, crack.radius)
        .fill({ color: CRACK_FILL_COLOR, alpha: FILL_ALPHA })

      // Border
      this.graphics
        .circle(crack.x, crack.y, crack.radius)
        .stroke({ color: CRACK_LINE_COLOR, width: 1.5, alpha: LINE_ALPHA })

      // Radial crack lines for texture
      for (let i = 0; i < LINE_COUNT; i++) {
        const angle = (i / LINE_COUNT) * Math.PI * 2
        const innerR = crack.radius * 0.2
        const outerR = crack.radius * 0.9
        this.graphics
          .moveTo(crack.x + Math.cos(angle) * innerR, crack.y + Math.sin(angle) * innerR)
          .lineTo(crack.x + Math.cos(angle) * outerR, crack.y + Math.sin(angle) * outerR)
          .stroke({ color: CRACK_LINE_COLOR, width: 1, alpha: LINE_ALPHA * 0.7 })
      }
    }

    this.graphics.visible = true
  }

  destroy(): void {
    this.graphics.destroy()
  }
}
