/**
 * Tilemap Renderer
 *
 * Renders the tilemap using sprites from the loaded tileset.
 */

import { Container, Sprite, Graphics, Texture, Rectangle } from 'pixi.js'
import type { Tilemap, BaseTileMetadata } from '@high-noon/shared'
import { TileType, TOWN_BUILDINGS, type BuildingProfile } from '@high-noon/shared'
import { AssetLoader } from '../assets'
import { BUILDING_RENDER_SCALE, BUILDING_SPRITE_REGIONS } from '../assets/buildingSpritesheet'
import { RoofDitherFilter } from './RoofDitherFilter'

/** Lookup building profile by ID */
const BUILDING_PROFILE_MAP = new Map<string, BuildingProfile>(
  TOWN_BUILDINGS.map(p => [p.id, p])
)

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
  private readonly roofContainer: Container
  private readonly sprites: Sprite[] = []
  private readonly roofSprites: Sprite[] = []
  private currentMap: Tilemap | null = null
  private roofDitherFilter: RoofDitherFilter | null = null

  constructor(parentContainer: Container, gameZoom: number = 2) {
    this.container = new Container()
    parentContainer.addChild(this.container)
    // Roof container is NOT added to parent — caller places it above the entity layer
    this.roofContainer = new Container()
    // Apply dither filter to roof container
    this.roofDitherFilter = new RoofDitherFilter(gameZoom)
    this.roofContainer.filters = [this.roofDitherFilter.filter]
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
    for (const sprite of this.roofSprites) {
      sprite.destroy()
    }
    this.roofSprites.length = 0

    const { width, height, tileSize, layers } = map

    // Build set of tile indices covered by buildings (to suppress individual wall sprites)
    const coveredTiles = new Set<number>()
    if (map.placedBuildings) {
      for (const building of map.placedBuildings) {
        const profile = BUILDING_PROFILE_MAP.get(building.profileId)
        if (!profile) continue
        for (let dy = 0; dy < profile.heightTiles; dy++) {
          for (let dx = 0; dx < profile.widthTiles; dx++) {
            const tx = building.tileX + dx
            const ty = building.tileY + dy
            if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
              coveredTiles.add(ty * width + tx)
            }
          }
        }
      }
    }

    const drawLayer = (layerIndex: number, skipCovered: boolean): void => {
      const layer = layers[layerIndex]
      if (!layer) return

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const tile = layer.data[y * width + x] ?? TileType.EMPTY
          if (tile === TileType.EMPTY) continue

          // Skip wall/half-wall tiles under buildings
          if (skipCovered && (tile === TileType.WALL || tile === TileType.HALF_WALL)) {
            if (coveredTiles.has(y * width + x)) continue
          }

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

    // Draw non-solid layers first, then solid layers on top (skipping building-covered tiles).
    for (let i = 0; i < layers.length; i++) {
      if (!layers[i]?.solid) drawLayer(i, false)
    }
    for (let i = 0; i < layers.length; i++) {
      if (layers[i]?.solid) drawLayer(i, true)
    }

    // Render building sprites split into base (tilemap layer) + roof (above entities)
    if (map.placedBuildings) {
      for (const building of map.placedBuildings) {
        const texture = AssetLoader.getBuildingTexture(building.profileId)
        if (!texture) continue

        const region = BUILDING_SPRITE_REGIONS[building.profileId]
        if (!region) continue

        const worldX = building.tileX * tileSize
        const worldY = building.tileY * tileSize

        if (region.roofHeight > 0 && region.roofHeight < region.height) {
          // Roof portion (top roofHeight native pixels) → rendered above entities
          const roofTexture = new Texture({
            source: texture.source,
            frame: new Rectangle(
              texture.frame.x,
              texture.frame.y,
              region.width,
              region.roofHeight,
            ),
          })
          const roofSprite = new Sprite(roofTexture)
          roofSprite.scale.set(BUILDING_RENDER_SCALE)
          roofSprite.position.set(worldX, worldY - region.roofHeight * BUILDING_RENDER_SCALE)
          this.roofContainer.addChild(roofSprite)
          this.roofSprites.push(roofSprite)

          // Base portion (rest of sprite) → tilemap layer, aligned with collision footprint
          const baseTexture = new Texture({
            source: texture.source,
            frame: new Rectangle(
              texture.frame.x,
              texture.frame.y + region.roofHeight,
              region.width,
              region.height - region.roofHeight,
            ),
          })
          const baseSprite = new Sprite(baseTexture)
          baseSprite.scale.set(BUILDING_RENDER_SCALE)
          baseSprite.position.set(worldX, worldY)
          this.container.addChild(baseSprite)
          this.sprites.push(baseSprite)
        } else {
          // No roof — render entire sprite in tilemap layer
          const sprite = new Sprite(texture)
          sprite.scale.set(BUILDING_RENDER_SCALE)
          sprite.position.set(worldX, worldY)
          this.container.addChild(sprite)
          this.sprites.push(sprite)
        }
      }
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
   * Update roof dither reveal position each frame.
   * @param screenX Player screen X in CSS pixels (from worldContainer.toGlobal)
   * @param screenY Player screen Y in CSS pixels (from worldContainer.toGlobal)
   */
  updateRoofReveal(screenX: number, screenY: number): void {
    this.roofDitherFilter?.update(screenX, screenY)
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
   * Get the roof overlay container.
   * Caller should add this to a layer above the entity layer.
   */
  getRoofContainer(): Container {
    return this.roofContainer
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    for (const sprite of this.sprites) {
      sprite.destroy()
    }
    this.sprites.length = 0
    for (const sprite of this.roofSprites) {
      sprite.destroy()
    }
    this.roofSprites.length = 0
    this.container.destroy()
    this.roofContainer.destroy()
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
