/**
 * Building sprite regions within the "Premade structures.png" spritesheet.
 *
 * All coordinates are in native spritesheet pixels (16px art).
 * The renderer scales by BUILDING_RENDER_SCALE to match game tile size.
 *
 * The collision footprint (from BuildingProfile) matches the base of the
 * sprite. The roofHeight defines how many native pixels at the top of the
 * sprite are non-collidable roof — rendered above the entity layer.
 */

export const BUILDING_SPRITESHEET_PATH =
  "/assets/sprites/tilesets/Premade structures.png";

/** Native art is 16px per tile, game tiles are 32px — render at 2x */
export const BUILDING_RENDER_SCALE = 2;

export interface BuildingSpriteRegion {
  /** X position in spritesheet (native pixels) */
  x: number;
  /** Y position in spritesheet (native pixels) */
  y: number;
  /** Width in spritesheet (native pixels) */
  width: number;
  /** Height in spritesheet (native pixels) */
  height: number;
  /** Native pixels at the top of the sprite that are non-collidable roof (rendered above entities) */
  roofHeight: number;
}

export const BUILDING_SPRITE_REGIONS: Record<string, BuildingSpriteRegion> = {
  general_store: {
    x: 96,
    y: 16,
    width: 124,
    height: 158,
    roofHeight: 32,
  },
  sheriff: {
    x: 206,
    y: 32,
    width: 82,
    height: 98,
    roofHeight: 16,
  },
  saloon: {
    x: 336,
    y: 80,
    width: 112,
    height: 96,
    roofHeight: 16,
  },
  barber: {
    x: 384,
    y: 0,
    width: 80,
    height: 64,
    roofHeight: 16,
  },
  small_house_1: {
    x: 288,
    y: 144,
    width: 48,
    height: 48,
    roofHeight: 0,
  },
  small_house_2: {
    x: 352,
    y: 144,
    width: 48,
    height: 48,
    roofHeight: 0,
  },
  water_tower: {
    x: 208,
    y: 688,
    width: 48,
    height: 64,
    roofHeight: 32,
  },
  bank: {
    x: 128,
    y: 960,
    width: 80,
    height: 80,
    roofHeight: 16,
  },
};
