/**
 * Asset Loader
 *
 * Centralized asset loading using PixiJS Assets API.
 * Loads individual sprite sheet PNGs and slices them into sub-textures.
 */

import { Assets, Texture, Rectangle } from "pixi.js";
import { TileType, BulletSpriteId, allEnemyDefs, type BaseTileStyle } from "@high-noon/shared";
import type { Spritesheet } from "pixi.js";
import {
  ANIMATION_STATES,
  PLAYER_SPRITE_INFO,
  SPRITE_CELL_SIZE,
  SPRITE_ROW,
  ENEMY_SPRITE_CELL_SIZE,
  ENEMY_SPRITE_ROW,
  ENEMY_SPRITE_INFO,
  type Direction,
  type AnimationState,
  type EnemyAnimationState,
} from "./animations";
import {
  BASE_TILESET_PATH,
  BASE_TILE_SIZE,
  BASE_TILE_VARIANTS,
  BASE_TILE_STYLE_ROW,
  BASE_TILE_STYLE_VARIANTS,
} from "./baseTileset";
import {
  BUILDING_SPRITESHEET_PATH,
  BUILDING_SPRITE_REGIONS,
} from "./buildingSpritesheet";
import { BULLET_ANIM_CONFIG } from "./bulletAnimations";

/** Base path for character sprite sheets */
const CHAR_SPRITE_BASE = "/assets/sprites/base character/Basic";

/** Floors spritesheet (16px art tiles for building interiors) */
const FLOORS_SPRITESHEET_PATH = "/assets/sprites/tilesets/floors.png";

/** Wood floor tile region in floors.png (16x16 native pixels) */
const WOOD_FLOOR_REGION = { x: 108, y: 124, size: 16 };

/** Asset manifest for non-character assets */
const MANIFEST = {
  tileset: "/assets/sprites/tileset.json",
  baseTileset: BASE_TILESET_PATH,
  buildingSpritesheet: BUILDING_SPRITESHEET_PATH,
  floorsSpritesheet: FLOORS_SPRITESHEET_PATH,
  bullet: "/assets/sprites/bullet.png",
  bullet_pellet: "/assets/sprites/bullet_pellet.png",
} as const;

/** Weapon sprite manifest: weaponId → path */
const WEAPON_SPRITES: Record<string, string> = {
  revolver: "/assets/sprites/weapons/revolver.png",
  sawed_off: "/assets/sprites/weapons/SawedOffShotgun.png",
  pickaxe: "/assets/sprites/weapons/pickaxe.png",
};

/** Enemy sprite manifest: enemyId → path — built from registry + boss overrides */
const ENEMY_SPRITES: Record<string, string> = {};

// Populate from enemy registry (all registered enemies with spriteId)
for (const def of allEnemyDefs()) {
  if (def.spriteId) {
    ENEMY_SPRITES[def.spriteId] = `/assets/sprites/enemies/${def.spriteId}.png`;
  }
}

// Boss sprites not in enemy registry — add manually
ENEMY_SPRITES['mad_dog'] = '/assets/sprites/enemies/mad_dog.png';
ENEMY_SPRITES['boomstick'] = '/assets/sprites/enemies/boomstick.png';
ENEMY_SPRITES['dalton_emmett'] = '/assets/sprites/enemies/dalton_emmett.png';
ENEMY_SPRITES['dalton_bob'] = '/assets/sprites/enemies/dalton_bob.png';
ENEMY_SPRITES['coyote_jane'] = '/assets/sprites/enemies/coyote_jane.png';
ENEMY_SPRITES['old_scratch'] = '/assets/sprites/enemies/old_scratch.png';
ENEMY_SPRITES['ghost_rider'] = '/assets/sprites/enemies/ghost_rider.png';
// Hellfire Pillar uses circle rendering, no sprite sheet needed

/** Item icon manifest: itemKey → path */
const ITEM_SPRITES: Record<string, string> = {
  gun_oil_tin: "/assets/sprites/items/gun_oil_tin.png",
  gunpowder_pouch: "/assets/sprites/items/gunpowder_pouch.png",
  trail_dust_boots: "/assets/sprites/items/trail_dust_boots.png",
  leather_duster: "/assets/sprites/items/leather_duster.png",
  tin_star_badge: "/assets/sprites/items/tin_star_badge.png",
  fools_gold_nugget: "/assets/sprites/items/fools_gold_nugget.png",
  rattlesnake_fang: "/assets/sprites/items/rattlesnake_fang.png",
  moonshine_flask: "/assets/sprites/items/moonshine_flask.png",
  powder_keg: "/assets/sprites/items/powder_keg.png",
  sidewinder_belt: "/assets/sprites/items/sidewinder_belt.png",
  dead_mans_deed: "/assets/sprites/items/dead_mans_deed.png",
  grim_harvest: "/assets/sprites/items/grim_harvest.png",
};

/** Enemy animation states for slicing */
const ENEMY_ANIM_STATES: EnemyAnimationState[] = [
  "idle",
  "walk",
  "death",
  "attack",
];

/** Enemy sprite directions that exist in the sheet (W mirrors E) */
const ENEMY_SPRITE_DIRS = ["S", "E", "N"] as const;

/** Tile type to frame name mapping */
const TILE_FRAME_MAP: Record<number, string> = {
  [TileType.EMPTY]: "tile_empty",
  [TileType.WALL]: "tile_wall",
  [TileType.FLOOR]: "tile_floor",
  [TileType.LAVA]: "tile_floor",
  [TileType.HALF_WALL]: "tile_wall",
  [TileType.MUD]: "tile_floor",
  [TileType.BRAMBLE]: "tile_floor",
  [TileType.WOOD_FLOOR]: "tile_floor", // fallback; overridden by dedicated texture
  [TileType.ROAD]: "tile_floor",
  [TileType.BRIMSTONE]: "tile_floor",
  [TileType.DARKNESS]: "tile_floor",
};

/** Sprite directions that exist in the sprite sheet (W mirrors E) */
const SPRITE_DIRS = ["N", "E", "S"] as const;

/**
 * Singleton asset loader
 */
export class AssetLoader {
  private static loaded = false;
  private static tilesetSheet: Spritesheet | null = null;
  private static baseTilesetTexture: Texture | null = null;
  private static bulletTexture: Texture | null = null;
  private static bulletPelletTexture: Texture | null = null;

  /** Pre-sliced player textures: key = `${state}_${spriteDir}_${frame}` */
  private static playerTextures = new Map<string, Texture>();

  /** Pre-sliced base tile textures: key = `${style}_${variant}` */
  private static baseTileTextures = new Map<string, Texture>();

  /** Weapon textures: key = weaponId */
  private static weaponTextures = new Map<string, Texture>();

  /** Pre-sliced enemy textures: key = `${enemyId}_${state}_${dir}_${frame}` */
  private static enemyTextures = new Map<string, Texture>();

  /** Item icon textures: key = itemKey */
  private static itemTextures = new Map<string, Texture>();

  /** Building textures sliced from building spritesheet: key = profileId */
  private static buildingTextures = new Map<string, Texture>();

  /** Wood floor texture sliced from floors spritesheet */
  private static woodFloorTexture: Texture | null = null;

  /** Pre-sliced animated bullet frames: spriteId → { frames, fps } */
  private static bulletAnimFrames = new Map<number, { frames: Texture[]; fps: number }>();

  /** Timeout for asset loading (ms) */
  private static readonly LOAD_TIMEOUT = 30000;

  /**
   * Load all game assets
   */
  static async loadAll(onProgress?: (progress: number) => void): Promise<void> {
    if (this.loaded) {
      console.log("[AssetLoader] Already loaded, skipping");
      return;
    }

    console.log("[AssetLoader] Starting asset load...");

    // Load tilesets + bullet + building spritesheet
    Assets.add({ alias: "tileset", src: MANIFEST.tileset });
    Assets.add({ alias: "base_tileset", src: MANIFEST.baseTileset });
    Assets.add({
      alias: "building_spritesheet",
      src: MANIFEST.buildingSpritesheet,
    });
    Assets.add({
      alias: "floors_spritesheet",
      src: MANIFEST.floorsSpritesheet,
    });
    Assets.add({ alias: "bullet", src: MANIFEST.bullet });
    Assets.add({ alias: "bullet_pellet", src: MANIFEST.bullet_pellet });

    // Add character sprite sheets
    for (const state of ANIMATION_STATES) {
      const info = PLAYER_SPRITE_INFO[state];
      const alias = `char_${state}`;
      Assets.add({ alias, src: `${CHAR_SPRITE_BASE}/${info.file}` });
    }

    // Add weapon sprites
    for (const [weaponId, path] of Object.entries(WEAPON_SPRITES)) {
      Assets.add({ alias: `weapon_${weaponId}`, src: path });
    }

    // Add enemy sprites
    for (const [enemyId, path] of Object.entries(ENEMY_SPRITES)) {
      Assets.add({ alias: `enemy_${enemyId}`, src: path });
    }

    // Add animated bullet strip sprites
    for (const config of Object.values(BULLET_ANIM_CONFIG)) {
      if (config) Assets.add({ alias: config.asset, src: config.path });
    }

    // Add item icon sprites
    for (const [itemKey, path] of Object.entries(ITEM_SPRITES)) {
      Assets.add({ alias: `item_${itemKey}`, src: path });
    }

    const allAliases = [
      "tileset",
      "base_tileset",
      "building_spritesheet",
      "floors_spritesheet",
      "bullet",
      "bullet_pellet",
      ...ANIMATION_STATES.map((s) => `char_${s}`),
      ...Object.keys(WEAPON_SPRITES).map((id) => `weapon_${id}`),
      ...Object.keys(ENEMY_SPRITES).map((id) => `enemy_${id}`),
      ...Object.keys(ITEM_SPRITES).map((id) => `item_${id}`),
      ...Object.values(BULLET_ANIM_CONFIG)
        .filter((c): c is NonNullable<typeof c> => c != null)
        .map((c) => c.asset),
    ];

    const loadPromise = Assets.load(allAliases, (progress) => {
      console.log(`[AssetLoader] Progress: ${(progress * 100).toFixed(1)}%`);
      onProgress?.(progress);
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `Asset loading timed out after ${this.LOAD_TIMEOUT / 1000}s`,
          ),
        );
      }, this.LOAD_TIMEOUT);
    });

    let loaded: Record<string, unknown>;
    try {
      loaded = await Promise.race([loadPromise, timeoutPromise]);
    } catch (err) {
      console.error("[AssetLoader] Load failed:", err);
      throw err;
    }

    console.log("[AssetLoader] Assets loaded, storing references...");

    this.tilesetSheet = loaded.tileset as Spritesheet;
    this.baseTilesetTexture = loaded.base_tileset as Texture;
    this.bulletTexture = loaded.bullet as Texture;
    this.bulletPelletTexture = loaded.bullet_pellet as Texture;

    if (!this.tilesetSheet?.textures) {
      throw new Error("Tileset spritesheet failed to load or has no textures");
    }
    if (!this.baseTilesetTexture) {
      throw new Error("Base tileset texture failed to load");
    }
    if (!this.bulletTexture) {
      throw new Error("Bullet texture failed to load");
    }
    if (!this.bulletPelletTexture) {
      throw new Error("Bullet pellet texture failed to load");
    }
    this.bulletTexture.source.scaleMode = "nearest";
    this.bulletPelletTexture.source.scaleMode = "nearest";

    this.baseTilesetTexture.source.scaleMode = "nearest";
    this.sliceBaseTileset(this.baseTilesetTexture);

    // Store weapon textures with nearest-neighbor scaling
    for (const weaponId of Object.keys(WEAPON_SPRITES)) {
      const tex = loaded[`weapon_${weaponId}`] as Texture;
      if (!tex) {
        throw new Error(`Weapon texture failed to load: ${weaponId}`);
      }
      tex.source.scaleMode = "nearest";
      this.weaponTextures.set(weaponId, tex);
    }

    // Slice character sprite sheets into individual frame textures
    for (const state of ANIMATION_STATES) {
      const info = PLAYER_SPRITE_INFO[state];
      const baseTexture = loaded[`char_${state}`] as Texture;

      if (!baseTexture) {
        throw new Error(`Character sprite sheet failed to load: ${info.file}`);
      }

      // Ensure nearest-neighbor scaling for pixel art
      baseTexture.source.scaleMode = "nearest";

      for (const dir of SPRITE_DIRS) {
        const row = SPRITE_ROW[dir];
        for (let frame = 0; frame < info.frames; frame++) {
          const rect = new Rectangle(
            frame * SPRITE_CELL_SIZE,
            row * SPRITE_CELL_SIZE,
            SPRITE_CELL_SIZE,
            SPRITE_CELL_SIZE,
          );
          const subTexture = new Texture({
            source: baseTexture.source,
            frame: rect,
          });
          const key = `${state}_${dir}_${frame}`;
          this.playerTextures.set(key, subTexture);
        }
      }
    }

    console.log(
      "[AssetLoader] Player textures sliced:",
      this.playerTextures.size,
      "frames",
    );

    // Slice enemy sprite sheets into individual frame textures
    for (const enemyId of Object.keys(ENEMY_SPRITES)) {
      const baseTexture = loaded[`enemy_${enemyId}`] as Texture;
      if (!baseTexture) {
        throw new Error(`Enemy sprite sheet failed to load: ${enemyId}`);
      }
      baseTexture.source.scaleMode = "nearest";

      for (const animState of ENEMY_ANIM_STATES) {
        const info = ENEMY_SPRITE_INFO[animState];
        for (const dir of ENEMY_SPRITE_DIRS) {
          const row = info.rowOffset + ENEMY_SPRITE_ROW[dir];
          for (let frame = 0; frame < info.frames; frame++) {
            const rect = new Rectangle(
              frame * ENEMY_SPRITE_CELL_SIZE,
              row * ENEMY_SPRITE_CELL_SIZE,
              ENEMY_SPRITE_CELL_SIZE,
              ENEMY_SPRITE_CELL_SIZE,
            );
            const subTexture = new Texture({
              source: baseTexture.source,
              frame: rect,
            });
            const key = `${enemyId}_${animState}_${dir}_${frame}`;
            this.enemyTextures.set(key, subTexture);
          }
        }
      }
    }

    console.log(
      "[AssetLoader] Enemy textures sliced:",
      this.enemyTextures.size,
      "frames",
    );

    // Store item textures with nearest-neighbor scaling
    for (const itemKey of Object.keys(ITEM_SPRITES)) {
      const tex = loaded[`item_${itemKey}`] as Texture;
      if (tex) {
        tex.source.scaleMode = "nearest";
        this.itemTextures.set(itemKey, tex);
      }
    }
    console.log("[AssetLoader] Item textures loaded:", this.itemTextures.size);

    // Slice building spritesheet into per-building textures
    const buildingSheet = loaded.building_spritesheet as Texture;
    if (buildingSheet) {
      buildingSheet.source.scaleMode = "nearest";
      for (const [profileId, region] of Object.entries(
        BUILDING_SPRITE_REGIONS,
      )) {
        const rect = new Rectangle(
          region.x,
          region.y,
          region.width,
          region.height,
        );
        const subTexture = new Texture({
          source: buildingSheet.source,
          frame: rect,
        });
        this.buildingTextures.set(profileId, subTexture);
      }
      console.log(
        "[AssetLoader] Building textures sliced:",
        this.buildingTextures.size,
      );
    }

    // Slice wood floor tile from floors spritesheet
    const floorsSheet = loaded.floors_spritesheet as Texture;
    if (floorsSheet) {
      floorsSheet.source.scaleMode = "nearest";
      const r = WOOD_FLOOR_REGION;
      this.woodFloorTexture = new Texture({
        source: floorsSheet.source,
        frame: new Rectangle(r.x, r.y, r.size, r.size),
      });
      console.log("[AssetLoader] Wood floor texture loaded");
    }

    // Slice animated bullet strips into frame arrays
    for (const [spriteIdStr, config] of Object.entries(BULLET_ANIM_CONFIG)) {
      if (!config) continue;
      const tex = loaded[config.asset] as Texture;
      if (!tex) {
        console.warn(
          `[AssetLoader] Bullet anim strip failed to load: ${config.asset} (${config.path}). Animated bullets will fall back to static.`,
        );
        continue;
      }
      tex.source.scaleMode = "nearest";
      const frameCount = Math.floor(tex.width / config.cellSize);
      const frames: Texture[] = [];
      for (let i = 0; i < frameCount; i++) {
        frames.push(
          new Texture({
            source: tex.source,
            frame: new Rectangle(
              i * config.cellSize,
              0,
              config.cellSize,
              config.cellSize,
            ),
          }),
        );
      }
      this.bulletAnimFrames.set(Number(spriteIdStr), { frames, fps: config.fps });
    }
    console.log(
      "[AssetLoader] Bullet anim strips sliced:",
      this.bulletAnimFrames.size,
    );

    console.log("[AssetLoader] All assets loaded successfully");

    this.loaded = true;
  }

  private static sliceBaseTileset(baseTileset: Texture): void {
    this.baseTileTextures.clear();

    for (const [style, row] of Object.entries(BASE_TILE_STYLE_ROW)) {
      const variantCount = BASE_TILE_STYLE_VARIANTS[style as BaseTileStyle] ?? BASE_TILE_VARIANTS;
      for (let variant = 0; variant < variantCount; variant++) {
        const rect = new Rectangle(
          variant * BASE_TILE_SIZE,
          row * BASE_TILE_SIZE,
          BASE_TILE_SIZE,
          BASE_TILE_SIZE,
        );
        const subTexture = new Texture({
          source: baseTileset.source,
          frame: rect,
        });
        this.baseTileTextures.set(`${style}_${variant}`, subTexture);
      }
    }
  }

  /**
   * Check if assets are loaded
   */
  static isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Get texture for a tile type
   */
  static getTileTexture(tileType: number): Texture {
    if (!this.tilesetSheet) {
      throw new Error("Assets not loaded. Call AssetLoader.loadAll() first.");
    }

    // Return dedicated texture for wood floor
    if (tileType === TileType.WOOD_FLOOR && this.woodFloorTexture) {
      return this.woodFloorTexture;
    }

    const frameName = TILE_FRAME_MAP[tileType];
    if (!frameName) {
      throw new Error(`Unknown tile type: ${tileType}`);
    }

    const texture = this.tilesetSheet.textures[frameName];
    if (!texture) {
      throw new Error(`Texture not found: ${frameName}`);
    }

    return texture;
  }

  /**
   * Get a stage base tile texture by style + variant index.
   */
  static getBaseTileTexture(
    style: BaseTileStyle,
    variantIndex: number,
  ): Texture {
    const count = BASE_TILE_STYLE_VARIANTS[style] ?? BASE_TILE_VARIANTS;
    const wrappedVariant =
      ((Math.floor(variantIndex) % count) + count) % count;
    const key = `${style}_${wrappedVariant}`;
    const texture = this.baseTileTextures.get(key);
    if (!texture) {
      throw new Error(
        `Base tile texture not found: ${key}. Call AssetLoader.loadAll() first.`,
      );
    }
    return texture;
  }

  /**
   * Get player texture for a specific animation state and direction.
   * W direction automatically uses the E sprite (caller handles the flip).
   */
  static getPlayerTexture(
    state: AnimationState,
    direction: Direction,
    frame: number,
  ): Texture {
    // W mirrors E in the sprite sheet
    const spriteDir = direction === "W" ? "E" : direction;
    const key = `${state}_${spriteDir}_${frame}`;
    const texture = this.playerTextures.get(key);
    if (!texture) {
      // Fall back to idle E frame 0
      const fallback = this.playerTextures.get("idle_E_0");
      if (!fallback) {
        throw new Error(`Player texture not found: ${key}`);
      }
      return fallback;
    }
    return texture;
  }

  /**
   * Get bullet texture
   */
  static getBulletTexture(): Texture {
    if (!this.bulletTexture) {
      throw new Error("Assets not loaded. Call AssetLoader.loadAll() first.");
    }
    return this.bulletTexture;
  }

  /**
   * Get bullet texture by sprite ID (BulletSpriteId from shared).
   * SLUG → bullet.png, PELLET → bullet_pellet.png
   * Animated IDs → frame 0 of their strip
   */
  static getBulletTextureById(spriteId: number): Texture {
    if (spriteId === BulletSpriteId.PELLET) {
      // bulletPelletTexture is guaranteed non-null after loadAll()
      return this.bulletPelletTexture!;
    }
    // For animated IDs, return frame 0
    const anim = this.bulletAnimFrames.get(spriteId);
    if (anim && anim.frames.length > 0) {
      return anim.frames[0]!;
    }
    // SLUG and unknown IDs → default bullet.png
    return this.getBulletTexture();
  }

  /**
   * Get animation data for an animated bullet sprite ID.
   * Returns null for static (non-animated) sprite IDs.
   */
  static getBulletAnimFrames(spriteId: number): { frames: Texture[]; fps: number } | null {
    return this.bulletAnimFrames.get(spriteId) ?? null;
  }

  /**
   * Get weapon texture by weapon ID
   */
  static getWeaponTexture(weaponId: string): Texture {
    const tex = this.weaponTextures.get(weaponId);
    if (!tex) {
      throw new Error(
        `Weapon texture not found: ${weaponId}. Call AssetLoader.loadAll() first.`,
      );
    }
    return tex;
  }

  /**
   * Get enemy texture for a specific animation state and direction.
   * W direction automatically uses the E sprite (caller handles the flip).
   */
  static getEnemyTexture(
    enemyId: string,
    state: EnemyAnimationState,
    direction: Direction,
    frame: number,
  ): Texture {
    const spriteDir = direction === "W" ? "E" : direction;
    const key = `${enemyId}_${state}_${spriteDir}_${frame}`;
    const texture = this.enemyTextures.get(key);
    if (!texture) {
      // Fall back to idle S frame 0
      const fallback = this.enemyTextures.get(`${enemyId}_idle_S_0`);
      if (!fallback) {
        throw new Error(`Enemy texture not found: ${key}`);
      }
      return fallback;
    }
    return texture;
  }

  /**
   * Get item icon texture by item key. Returns null if not loaded.
   */
  static getItemTexture(itemKey: string): Texture | null {
    return this.itemTextures.get(itemKey) ?? null;
  }

  /**
   * Get building texture by profile ID. Returns null if not loaded.
   */
  static getBuildingTexture(profileId: string): Texture | null {
    return this.buildingTextures.get(profileId) ?? null;
  }

  /**
   * Reset loader state (for testing)
   */
  static reset(): void {
    this.loaded = false;
    this.tilesetSheet = null;
    this.baseTilesetTexture = null;
    this.bulletTexture = null;
    this.bulletPelletTexture = null;
    this.baseTileTextures.clear();
    this.playerTextures.clear();
    this.weaponTextures.clear();
    this.enemyTextures.clear();
    this.itemTextures.clear();
    this.buildingTextures.clear();
    this.woodFloorTexture = null;
    this.bulletAnimFrames.clear();
  }
}
