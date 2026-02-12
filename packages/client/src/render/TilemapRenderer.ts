/**
 * Tilemap Renderer
 *
 * Renders the tilemap using sprites from the loaded tileset.
 */

import { Container, Sprite, Graphics, Texture } from 'pixi.js'
import type { Tilemap, BaseTileMetadata } from '@high-noon/shared'
import { TileType } from '@high-noon/shared'
import { AssetLoader } from '../assets'

function isStageBaseTile(tileType: number): boolean {
  return (
    tileType === TileType.FLOOR ||
    tileType === TileType.LAVA ||
    tileType === TileType.MUD ||
    tileType === TileType.BRAMBLE
  )
}

function hashBaseTileVariant(seed: number, tileX: number, tileY: number): number {
  let h = seed >>> 0
  h ^= Math.imul(tileX + 0x9e3779b9, 0x85ebca6b)
  h ^= Math.imul(tileY + 0xc2b2ae35, 0x27d4eb2d)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

function pickBaseTileVariant(baseTiles: BaseTileMetadata, tileX: number, tileY: number): number {
  const count = Math.max(1, Math.floor(baseTiles.variantCount))
  return hashBaseTileVariant(baseTiles.seed, tileX, tileY) % count
}

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
    const drawLayer = (layerIndex: number): void => {
      const layer = layers[layerIndex]
      if (!layer) return

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const tile = layer.data[y * width + x] ?? TileType.EMPTY
          if (tile === TileType.EMPTY) continue

          const sprite = new Sprite(this.getTileTextureForRender(map, x, y, tile))
          sprite.position.set(x * tileSize, y * tileSize)

          if (tile === TileType.LAVA) {
            sprite.tint = 0xF06A2A
          } else if (tile === TileType.HALF_WALL) {
            sprite.tint = 0xC59A57
          } else if (tile === TileType.MUD) {
            sprite.tint = 0x8B6914
          } else if (tile === TileType.BRAMBLE) {
            sprite.tint = 0x3A7A3A
          }

          this.container.addChild(sprite)
          this.sprites.push(sprite)
        }
      }
    }

    // Draw non-solid layers first, then solid layers on top.
    for (let i = 0; i < layers.length; i++) {
      if (!layers[i]?.solid) drawLayer(i)
    }
    for (let i = 0; i < layers.length; i++) {
      if (layers[i]?.solid) drawLayer(i)
    }
  }

  private getTileTextureForRender(map: Tilemap, tileX: number, tileY: number, tileType: number): Texture {
    if (!isStageBaseTile(tileType)) {
      return AssetLoader.getTileTexture(tileType)
    }

    const baseTiles = map.baseTiles
    if (!baseTiles) {
      return AssetLoader.getTileTexture(TileType.FLOOR)
    }

    const variant = pickBaseTileVariant(baseTiles, tileX, tileY)
    return AssetLoader.getBaseTileTexture(baseTiles.style, variant)
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
