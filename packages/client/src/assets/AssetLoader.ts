/**
 * Asset Loader
 *
 * Centralized asset loading using PixiJS Assets API.
 * Loads individual sprite sheet PNGs and slices them into sub-textures.
 */

import { Assets, Texture, Rectangle } from 'pixi.js'
import { TileType } from '@high-noon/shared'
import type { Spritesheet } from 'pixi.js'
import {
  ANIMATION_STATES,
  PLAYER_SPRITE_INFO,
  SPRITE_CELL_SIZE,
  SPRITE_ROW,
  type Direction,
  type AnimationState,
} from './animations'

/** Base path for character sprite sheets */
const CHAR_SPRITE_BASE = '/assets/sprites/base character/Basic'

/** Asset manifest for non-character assets */
const MANIFEST = {
  tileset: '/assets/sprites/tileset.json',
  bullet: '/assets/sprites/bullet.png',
} as const

/** Weapon sprite manifest: weaponId → path */
const WEAPON_SPRITES: Record<string, string> = {
  revolver: '/assets/sprites/weapons/revolver.png',
}

/** Tile type to frame name mapping */
const TILE_FRAME_MAP: Record<number, string> = {
  [TileType.EMPTY]: 'tile_empty',
  [TileType.WALL]: 'tile_wall',
  [TileType.FLOOR]: 'tile_floor',
}

/** Sprite directions that exist in the sprite sheet (W mirrors E) */
const SPRITE_DIRS = ['N', 'E', 'S'] as const

/**
 * Singleton asset loader
 */
export class AssetLoader {
  private static loaded = false
  private static tilesetSheet: Spritesheet | null = null
  private static bulletTexture: Texture | null = null

  /** Pre-sliced player textures: key = `${state}_${spriteDir}_${frame}` */
  private static playerTextures = new Map<string, Texture>()

  /** Weapon textures: key = weaponId */
  private static weaponTextures = new Map<string, Texture>()

  /** Timeout for asset loading (ms) */
  private static readonly LOAD_TIMEOUT = 30000

  /**
   * Load all game assets
   */
  static async loadAll(onProgress?: (progress: number) => void): Promise<void> {
    if (this.loaded) {
      console.log('[AssetLoader] Already loaded, skipping')
      return
    }

    console.log('[AssetLoader] Starting asset load...')

    // Load tileset + bullet
    Assets.add({ alias: 'tileset', src: MANIFEST.tileset })
    Assets.add({ alias: 'bullet', src: MANIFEST.bullet })

    // Add character sprite sheets
    for (const state of ANIMATION_STATES) {
      const info = PLAYER_SPRITE_INFO[state]
      const alias = `char_${state}`
      Assets.add({ alias, src: `${CHAR_SPRITE_BASE}/${info.file}` })
    }

    // Add weapon sprites
    for (const [weaponId, path] of Object.entries(WEAPON_SPRITES)) {
      Assets.add({ alias: `weapon_${weaponId}`, src: path })
    }

    const allAliases = [
      'tileset',
      'bullet',
      ...ANIMATION_STATES.map((s) => `char_${s}`),
      ...Object.keys(WEAPON_SPRITES).map((id) => `weapon_${id}`),
    ]

    const loadPromise = Assets.load(allAliases, (progress) => {
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

    this.tilesetSheet = loaded.tileset as Spritesheet
    this.bulletTexture = loaded.bullet as Texture

    if (!this.tilesetSheet?.textures) {
      throw new Error('Tileset spritesheet failed to load or has no textures')
    }
    if (!this.bulletTexture) {
      throw new Error('Bullet texture failed to load')
    }

    // Store weapon textures with nearest-neighbor scaling
    for (const weaponId of Object.keys(WEAPON_SPRITES)) {
      const tex = loaded[`weapon_${weaponId}`] as Texture
      if (!tex) {
        throw new Error(`Weapon texture failed to load: ${weaponId}`)
      }
      tex.source.scaleMode = 'nearest'
      this.weaponTextures.set(weaponId, tex)
    }

    // Slice character sprite sheets into individual frame textures
    for (const state of ANIMATION_STATES) {
      const info = PLAYER_SPRITE_INFO[state]
      const baseTexture = loaded[`char_${state}`] as Texture

      if (!baseTexture) {
        throw new Error(`Character sprite sheet failed to load: ${info.file}`)
      }

      // Ensure nearest-neighbor scaling for pixel art
      baseTexture.source.scaleMode = 'nearest'

      for (const dir of SPRITE_DIRS) {
        const row = SPRITE_ROW[dir]
        for (let frame = 0; frame < info.frames; frame++) {
          const rect = new Rectangle(
            frame * SPRITE_CELL_SIZE,
            row * SPRITE_CELL_SIZE,
            SPRITE_CELL_SIZE,
            SPRITE_CELL_SIZE
          )
          const subTexture = new Texture({
            source: baseTexture.source,
            frame: rect,
          })
          const key = `${state}_${dir}_${frame}`
          this.playerTextures.set(key, subTexture)
        }
      }
    }

    console.log('[AssetLoader] Player textures sliced:', this.playerTextures.size, 'frames')
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
   * Get player texture for a specific animation state and direction.
   * W direction automatically uses the E sprite (caller handles the flip).
   */
  static getPlayerTexture(state: AnimationState, direction: Direction, frame: number): Texture {
    // W mirrors E in the sprite sheet
    const spriteDir = direction === 'W' ? 'E' : direction
    const key = `${state}_${spriteDir}_${frame}`
    const texture = this.playerTextures.get(key)
    if (!texture) {
      // Fall back to idle E frame 0
      const fallback = this.playerTextures.get('idle_E_0')
      if (!fallback) {
        throw new Error(`Player texture not found: ${key}`)
      }
      return fallback
    }
    return texture
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
   * Get weapon texture by weapon ID
   */
  static getWeaponTexture(weaponId: string): Texture {
    const tex = this.weaponTextures.get(weaponId)
    if (!tex) {
      throw new Error(`Weapon texture not found: ${weaponId}. Call AssetLoader.loadAll() first.`)
    }
    return tex
  }

  /**
   * Reset loader state (for testing)
   */
  static reset(): void {
    this.loaded = false
    this.tilesetSheet = null
    this.bulletTexture = null
    this.playerTextures.clear()
    this.weaponTextures.clear()
  }
}
