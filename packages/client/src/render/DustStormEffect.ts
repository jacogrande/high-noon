/**
 * Dust Storm Effect
 *
 * Fog-of-war overlay when world.oldScratchStorm is active.
 * Draws a dark overlay over the entire map with a circular cutout
 * around the player for limited visibility.
 */

import { Graphics, type Container } from 'pixi.js'
import type { GameWorld } from '@high-noon/shared'

const STORM_OVERLAY_ALPHA = 0.7

export class DustStormEffect {
  private readonly overlay: Graphics
  private active = false

  constructor(worldContainer: Container) {
    this.overlay = new Graphics()
    this.overlay.visible = false
    worldContainer.addChild(this.overlay)
  }

  update(world: GameWorld, playerX: number, playerY: number): void {
    const storm = world.oldScratchStorm
    if (!storm?.active) {
      if (this.active) {
        this.overlay.visible = false
        this.active = false
      }
      return
    }

    this.overlay.clear()
    this.active = true
    this.overlay.visible = true

    const tilemap = world.tilemap
    if (!tilemap) {
      this.overlay.visible = false
      return
    }

    const radius = storm.visibilityRadius
    const mapW = tilemap.width * tilemap.tileSize
    const mapH = tilemap.height * tilemap.tileSize

    // Full dark overlay
    this.overlay
      .rect(0, 0, mapW, mapH)
      .fill({ color: 0x000000, alpha: STORM_OVERLAY_ALPHA })

    // Cut out visibility circle around player
    this.overlay
      .circle(playerX, playerY, radius)
      .cut()
  }

  get isActive(): boolean {
    return this.active
  }

  destroy(): void {
    this.overlay.destroy()
  }
}
