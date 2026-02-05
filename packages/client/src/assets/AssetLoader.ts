/**
 * Asset Loader
 *
 * Centralized asset loading using PixiJS Assets API.
 * Handles loading spritesheets and textures for the game.
 */

import { Assets, Spritesheet, Texture } from 'pixi.js'
import { TileType } from '@high-noon/shared'
import { DIRECTIONS, ANIMATION_STATES, type Direction, type AnimationState } from './animations'

/** Asset manifest - paths to all game assets */
const MANIFEST = {
  tileset: '/assets/sprites/tileset.json',
  player: '/assets/sprites/player.json',
  bullet: '/assets/sprites/bullet.png',
} as const

/** Tile type to frame name mapping */
const TILE_FRAME_MAP: Record<number, string> = {
  [TileType.EMPTY]: 'tile_empty',
  [TileType.WALL]: 'tile_wall',
  [TileType.FLOOR]: 'tile_floor',
}

/**
 * Singleton asset loader
 */
export class AssetLoader {
  private static loaded = false
  private static tilesetSheet: Spritesheet | null = null
  private static playerSheet: Spritesheet | null = null
  private static bulletTexture: Texture | null = null

  /** Timeout for asset loading (ms) */
  private static readonly LOAD_TIMEOUT = 30000

  /**
   * Load all game assets
   *
   * @param onProgress - Optional progress callback (0-1)
   */
  static async loadAll(onProgress?: (progress: number) => void): Promise<void> {
    if (this.loaded) {
      console.log('[AssetLoader] Already loaded, skipping')
      return
    }

    console.log('[AssetLoader] Starting asset load...')
    const assetKeys = Object.keys(MANIFEST) as (keyof typeof MANIFEST)[]

    // Add all assets to loader
    for (const key of assetKeys) {
      console.log(`[AssetLoader] Adding asset: ${key} -> ${MANIFEST[key]}`)
      Assets.add({ alias: key, src: MANIFEST[key] })
    }

    // Load with timeout
    const loadPromise = Assets.load(assetKeys, (progress) => {
      console.log(`[AssetLoader] Progress: ${(progress * 100).toFixed(1)}%`)
      onProgress?.(progress)
    })

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Asset loading timed out after ${this.LOAD_TIMEOUT / 1000}s`))
      }, this.LOAD_TIMEOUT)
    })

    let loaded: Record<string, unknown>
    try {
      loaded = await Promise.race([loadPromise, timeoutPromise])
    } catch (err) {
      console.error('[AssetLoader] Load failed:', err)
      throw err
    }

    console.log('[AssetLoader] Assets loaded, storing references...')
    console.log('[AssetLoader] Loaded keys:', Object.keys(loaded))

    // Store references
    this.tilesetSheet = loaded.tileset as Spritesheet
    this.playerSheet = loaded.player as Spritesheet
    this.bulletTexture = loaded.bullet as Texture

    // Validate that we got what we expected
    if (!this.tilesetSheet?.textures) {
      throw new Error('Tileset spritesheet failed to load or has no textures')
    }
    if (!this.playerSheet?.textures) {
      throw new Error('Player spritesheet failed to load or has no textures')
    }
    if (!this.bulletTexture) {
      throw new Error('Bullet texture failed to load')
    }

    console.log('[AssetLoader] Tileset textures:', Object.keys(this.tilesetSheet.textures))
    console.log('[AssetLoader] Player textures:', Object.keys(this.playerSheet.textures).length, 'frames')
    console.log('[AssetLoader] All assets loaded successfully')

    this.loaded = true
  }

  /**
   * Check if assets are loaded
   */
  static isLoaded(): boolean {
    return this.loaded
  }

  /**
   * Get texture for a tile type
   */
  static getTileTexture(tileType: number): Texture {
    if (!this.tilesetSheet) {
      throw new Error('Assets not loaded. Call AssetLoader.loadAll() first.')
    }

    const frameName = TILE_FRAME_MAP[tileType]
    if (!frameName) {
      throw new Error(`Unknown tile type: ${tileType}`)
    }

    const texture = this.tilesetSheet.textures[frameName]
    if (!texture) {
      throw new Error(`Texture not found: ${frameName}`)
    }

    return texture
  }

  /**
   * Get player texture for a specific animation state and direction
   */
  static getPlayerTexture(state: AnimationState, direction: Direction, frame: number): Texture {
    if (!this.playerSheet) {
      throw new Error('Assets not loaded. Call AssetLoader.loadAll() first.')
    }

    const frameName = `player_${state}_${direction}_${frame}`
    const texture = this.playerSheet.textures[frameName]
    if (!texture) {
      // Fall back to idle frame 0 if specific frame not found
      const fallback = this.playerSheet.textures[`player_idle_${direction}_0`]
      if (!fallback) {
        throw new Error(`Player texture not found: ${frameName}`)
      }
      return fallback
    }

    return texture
  }

  /**
   * Get all textures for a player animation
   */
  static getPlayerAnimationTextures(state: AnimationState, direction: Direction): Texture[] {
    if (!this.playerSheet) {
      throw new Error('Assets not loaded. Call AssetLoader.loadAll() first.')
    }

    const textures: Texture[] = []
    let frame = 0

    // Collect all frames for this animation
    while (true) {
      const frameName = `player_${state}_${direction}_${frame}`
      const texture = this.playerSheet.textures[frameName]
      if (!texture) break
      textures.push(texture)
      frame++
    }

    // Ensure at least one texture
    if (textures.length === 0) {
      const fallback = this.playerSheet.textures[`player_idle_${direction}_0`]
      if (fallback) {
        textures.push(fallback)
      }
    }

    return textures
  }

  /**
   * Get bullet texture
   */
  static getBulletTexture(): Texture {
    if (!this.bulletTexture) {
      throw new Error('Assets not loaded. Call AssetLoader.loadAll() first.')
    }
    return this.bulletTexture
  }

  /**
   * Get the player spritesheet (for AnimatedSprite)
   */
  static getPlayerSpritesheet(): Spritesheet | null {
    return this.playerSheet
  }

  /**
   * Reset loader state (for testing)
   */
  static reset(): void {
    this.loaded = false
    this.tilesetSheet = null
    this.playerSheet = null
    this.bulletTexture = null
  }
}
