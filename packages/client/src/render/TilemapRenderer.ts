/**
 * Tilemap Renderer
 *
 * Renders the tilemap using sprites from the loaded tileset.
 */

import { Container, Sprite, Graphics, Texture, Rectangle } from 'pixi.js'
import type { Tilemap, BaseTileMetadata, MapObstacle } from '@high-noon/shared'
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
    tileType === TileType.BRAMBLE ||
    tileType === TileType.ROAD ||
    tileType === TileType.BRIMSTONE ||
    tileType === TileType.DARKNESS
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

/** Per-building tracking data for roof dither */
interface BuildingRoofData {
  roofSprite: Sprite
  baseSprite: Sprite | null
  /** Roof overhang zone in world coordinates — dither triggers when the
   *  player is inside this rectangle (walking behind the roof). */
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * Tilemap renderer - draws tiles as sprites
 */
export class TilemapRenderer {
  private readonly container: Container
  private readonly roofContainer: Container
  private readonly sprites: Sprite[] = []
  private readonly roofSprites: Sprite[] = []
  private readonly buildingData: BuildingRoofData[] = []
  private currentMap: Tilemap | null = null
  private currentTileVersion = -1
  private roofDitherFilter: RoofDitherFilter | null = null

  constructor(parentContainer: Container, gameZoom: number = 2) {
    this.container = new Container()
    parentContainer.addChild(this.container)
    // Building overlay container — caller places it above the entity layer.
    // No container-level filter; the dither filter is applied per-sprite
    // only to buildings the player is visually behind.
    this.roofContainer = new Container()
    this.roofDitherFilter = new RoofDitherFilter(gameZoom)
  }

  /**
   * Render a tilemap
   *
   * Only re-renders if the map changes.
   */
  render(map: Tilemap): void {
    // Skip if same map already rendered and no dynamic tile changes
    if (this.currentMap === map && this.currentTileVersion === map.tileVersion) {
      return
    }

    this.currentMap = map
    this.currentTileVersion = map.tileVersion

    // Clear existing sprites
    for (const sprite of this.sprites) {
      sprite.destroy()
    }
    this.sprites.length = 0
    for (const sprite of this.roofSprites) {
      sprite.destroy()
    }
    this.roofSprites.length = 0
    this.buildingData.length = 0

    const { width, height, tileSize, layers } = map

    // Build set of tile indices covered by buildings or map obstacles (suppress individual wall sprites)
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
    // Suppress solid tiles under map obstacles (MapObstacleRenderer draws them)
    if (map.mapObstacles) {
      for (const obs of map.mapObstacles) {
        for (const tile of obs.tiles) {
          if (tile.tileX >= 0 && tile.tileX < width && tile.tileY >= 0 && tile.tileY < height) {
            coveredTiles.add(tile.tileY * width + tile.tileX)
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
          } else if (tile === TileType.ROAD) {
            sprite.tint = 0xC8A878
          } else if (tile === TileType.BRIMSTONE) {
            sprite.tint = 0xFF4400
          } else if (tile === TileType.DARKNESS) {
            sprite.tint = 0x110022
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

    // Render building sprites split into two layers:
    //  - Roof (above entities) — gets dither filter when the player walks behind it
    //  - Base (below entities) — player renders on top of the building body
    if (map.placedBuildings) {
      for (const building of map.placedBuildings) {
        const texture = AssetLoader.getBuildingTexture(building.profileId)
        if (!texture) continue

        const region = BUILDING_SPRITE_REGIONS[building.profileId]
        if (!region) continue

        const profile = BUILDING_PROFILE_MAP.get(building.profileId)
        const worldX = building.tileX * tileSize
        const worldY = building.tileY * tileSize
        const frame = texture.frame

        if (region.roofHeight > 0) {
          // Roof sub-texture (top portion) — above entities
          const roofTexture = new Texture({
            source: texture.source,
            frame: new Rectangle(frame.x, frame.y, frame.width, region.roofHeight),
          })
          const roofSprite = new Sprite(roofTexture)
          roofSprite.scale.set(BUILDING_RENDER_SCALE)
          roofSprite.position.set(worldX, worldY - region.roofHeight * BUILDING_RENDER_SCALE)
          this.roofContainer.addChild(roofSprite)
          this.roofSprites.push(roofSprite)

          // Base sub-texture (lower portion) — below entities.
          // Sized to cover the full collision footprint so changing roofHeight
          // doesn't shift the visual bottom or expose floor tiles.
          const footprintH = (profile?.heightTiles ?? 0) * tileSize
          const footprintW = (profile?.widthTiles ?? 0) * tileSize
          const baseTexture = new Texture({
            source: texture.source,
            frame: new Rectangle(
              frame.x,
              frame.y + region.roofHeight,
              frame.width,
              frame.height - region.roofHeight,
            ),
          })
          const baseSprite = new Sprite(baseTexture)
          baseSprite.width = footprintW
          baseSprite.height = footprintH
          baseSprite.position.set(worldX, worldY)
          this.container.addChild(baseSprite)
          this.sprites.push(baseSprite)

          // Dither overlap zone: roof overhang area using collision X bounds.
          // Both roof and base sprites get the filter so the floor tiles
          // underneath are revealed through the dithered holes.
          if (!profile?.noDither) {
            this.buildingData.push({
              roofSprite,
              baseSprite,
              minX: worldX,
              minY: worldY - region.roofHeight * BUILDING_RENDER_SCALE,
              maxX: worldX + (profile?.widthTiles ?? 0) * tileSize,
              maxY: worldY,
            })
          }
        } else {
          // No roof overhang — entire building below entities,
          // sized to match collision footprint
          const sprite = new Sprite(texture)
          sprite.width = (profile?.widthTiles ?? 0) * tileSize
          sprite.height = (profile?.heightTiles ?? 0) * tileSize
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
   * Update per-building visibility each frame.
   * Buildings that visually overlap the player get a dithered reveal;
   * buildings the player is NOT behind stay fully opaque.
   *
   * @param playerWorldX Player X in world coordinates
   * @param playerWorldY Player Y in world coordinates
   * @param screenX Player screen X in CSS pixels (for the dither filter)
   * @param screenY Player screen Y in CSS pixels (for the dither filter)
   */
  updateBuildingVisibility(playerWorldX: number, playerWorldY: number, screenX: number, screenY: number): void {
    if (!this.roofDitherFilter) return
    this.roofDitherFilter.update(screenX, screenY)

    const filterArr = [this.roofDitherFilter.filter]

    for (const bd of this.buildingData) {
      // Point-in-rect: is the player inside the roof overhang zone?
      const behind =
        playerWorldX > bd.minX &&
        playerWorldX < bd.maxX &&
        playerWorldY > bd.minY &&
        playerWorldY < bd.maxY

      if (behind) {
        if (!bd.roofSprite.filters) bd.roofSprite.filters = filterArr
        if (bd.baseSprite && !bd.baseSprite.filters) bd.baseSprite.filters = filterArr
      } else {
        if (bd.roofSprite.filters) bd.roofSprite.filters = null
        if (bd.baseSprite?.filters) bd.baseSprite.filters = null
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
