/**
 * Tilemap Renderer
 *
 * Renders the tilemap using sprites from the loaded tileset.
 */

import { Container, Sprite, Graphics } from 'pixi.js'
import type { Tilemap } from '@high-noon/shared'
import { TileType } from '@high-noon/shared'
import { AssetLoader } from '../assets'

/**
 * Tilemap renderer - draws tiles as sprites
 */
export class TilemapRenderer {
  private readonly container: Container
  private readonly sprites: Sprite[] = []
  private currentMap: Tilemap | null = null

  constructor(parentContainer: Container) {
    this.container = new Container()
    parentContainer.addChild(this.container)
  }

  /**
   * Render a tilemap
   *
   * Only re-renders if the map changes.
   */
  render(map: Tilemap): void {
    // Skip if same map already rendered
    if (this.currentMap === map) {
      return
    }

    this.currentMap = map

    // Clear existing sprites
    for (const sprite of this.sprites) {
      sprite.destroy()
    }
    this.sprites.length = 0

    const { width, height, tileSize, layers } = map

    // Draw floor layer first (layer 1, non-solid)
    if (layers[1]) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const tile = layers[1].data[y * width + x]
          if (tile === TileType.FLOOR) {
            const sprite = new Sprite(AssetLoader.getTileTexture(TileType.FLOOR))
            sprite.position.set(x * tileSize, y * tileSize)
            this.container.addChild(sprite)
            this.sprites.push(sprite)
          }
        }
      }
    }

    // Draw wall layer on top (layer 0, solid)
    if (layers[0]) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const tile = layers[0].data[y * width + x]
          if (tile === TileType.WALL) {
            const sprite = new Sprite(AssetLoader.getTileTexture(TileType.WALL))
            sprite.position.set(x * tileSize, y * tileSize)
            this.container.addChild(sprite)
            this.sprites.push(sprite)
          }
        }
      }
    }
  }

  /**
   * Force re-render on next call
   */
  invalidate(): void {
    this.currentMap = null
  }

  /**
   * Get the container for positioning
   */
  getContainer(): Container {
    return this.container
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    for (const sprite of this.sprites) {
      sprite.destroy()
    }
    this.sprites.length = 0
    this.container.destroy()
  }
}

/**
 * Debug collision visualization
 *
 * Shows collision circles and highlights touched tiles.
 */
export class CollisionDebugRenderer {
  private readonly graphics: Graphics
  private visible = false

  constructor(parentContainer: Container) {
    this.graphics = new Graphics()
    this.graphics.visible = false
    parentContainer.addChild(this.graphics)
  }

  /**
   * Toggle visibility
   */
  toggle(): void {
    this.visible = !this.visible
    this.graphics.visible = this.visible
  }

  /**
   * Set visibility
   */
  setVisible(visible: boolean): void {
    this.visible = visible
    this.graphics.visible = visible
  }

  /**
   * Clear all debug graphics
   */
  clear(): void {
    this.graphics.clear()
  }

  /**
   * Draw a collision circle
   */
  drawCollider(x: number, y: number, radius: number, color = 0x00ff00): void {
    if (!this.visible) return

    this.graphics
      .circle(x, y, radius)
      .stroke({ color, width: 1, alpha: 0.5 })
  }

  /**
   * Draw a tile highlight
   */
  drawTileHighlight(
    tileX: number,
    tileY: number,
    tileSize: number,
    color = 0xff0000
  ): void {
    if (!this.visible) return

    this.graphics
      .rect(tileX * tileSize, tileY * tileSize, tileSize, tileSize)
      .stroke({ color, width: 2, alpha: 0.7 })
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.graphics.destroy()
  }
}
