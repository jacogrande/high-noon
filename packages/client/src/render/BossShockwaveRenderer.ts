/**
 * Boss Shockwave Renderer
 *
 * Draws expanding ring shockwaves from boss Ground Pound attacks.
 * Ring fades as it expands outward.
 */

import { Graphics, Container } from 'pixi.js'
import type { GameWorld } from '@high-noon/shared'

const RING_COLOR = 0xff6622
const RING_WIDTH = 2.5

export class BossShockwaveRenderer {
  private readonly graphics: Graphics

  constructor(entityLayer: Container) {
    this.graphics = new Graphics()
    this.graphics.visible = false
    entityLayer.addChild(this.graphics)
  }

  render(world: GameWorld): void {
    const shockwaves = world.bossShockwaves
    if (shockwaves.length === 0) {
      this.graphics.visible = false
      return
    }

    this.graphics.clear()

    for (const sw of shockwaves) {
      const progress = sw.currentRadius / sw.maxRadius
      const alpha = 0.8 * (1 - progress)
      if (alpha <= 0) continue

      this.graphics
        .circle(sw.x, sw.y, sw.currentRadius)
        .stroke({ color: RING_COLOR, width: RING_WIDTH + (1 - progress) * 2, alpha })
    }

    this.graphics.visible = true
  }

  destroy(): void {
    this.graphics.destroy()
  }
}
