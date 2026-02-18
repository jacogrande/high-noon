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
    y: 12,
    width: 112,
    height: 162,
    roofHeight: 32,
  },
  sheriff: {
    x: 224,
    y: 28,
    width: 80,
    height: 112,
    roofHeight: 48,
  },
  saloon: {
    x: 336,
    y: 108,
    width: 80,
    height: 148,
    roofHeight: 80,
  },
  barber: {
    x: 345,
    y: 0,
    width: 92,
    height: 112,
    roofHeight: 16,
  },
  small_house_1: {
    x: 288,
    y: 256,
    width: 48,
    height: 96,
    roofHeight: 16,
  },
  small_house_2: {
    x: 352,
    y: 256,
    width: 48,
    height: 96,
    roofHeight: 16,
  },
  small_house_3: {
    x: 416,
    y: 256,
    width: 48,
    height: 96,
    roofHeight: 16,
  },
  small_house_4: {
    x: 288,
    y: 352,
    width: 48,
    height: 80,
    roofHeight: 16,
  },
  small_house_5: {
    x: 352,
    y: 352,
    width: 48,
    height: 64,
    roofHeight: 16,
  },
  small_house_6: {
    x: 416,
    y: 352,
    width: 48,
    height: 64,
    roofHeight: 16,
  },
  water_tower: {
    x: 240,
    y: 432,
    width: 48,
    height: 144,
    roofHeight: 112,
  },
  outhouse: {
    x: 256,
    y: 368,
    width: 16,
    height: 32,
    roofHeight: 16,
  },
  green_shed: {
    x: 32,
    y: 240,
    width: 48,
    height: 80,
    roofHeight: 32,
  },
  bank: {
    x: 144,
    y: 330,
    width: 80,
    height: 140,
    roofHeight: 64,
  },
};
