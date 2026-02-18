/**
 * Building profiles for premade western structures.
 *
 * Each profile defines a collision footprint (tiles stamped as WALL) and
 * a bounding box used for AABB overlap checks during placement.
 * The client maps profileId → sprite region in the spritesheet.
 */

export interface BuildingProfile {
  id: string;
  /** Tile offsets to stamp as WALL (relative to placement origin) */
  walls: Array<{ dx: number; dy: number }>;
  /** Optional tile offsets to stamp as HALF_WALL */
  halfWalls?: Array<{ dx: number; dy: number }>;
  /** Bounding box width in tiles (for AABB overlap checks) */
  widthTiles: number;
  /** Bounding box height in tiles (for AABB overlap checks) */
  heightTiles: number;
}

/** Generate a filled rectangle of wall offsets */
function filledRect(w: number, h: number): Array<{ dx: number; dy: number }> {
  const walls: Array<{ dx: number; dy: number }> = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      walls.push({ dx, dy });
    }
  }
  return walls;
}

const GENERAL_STORE: BuildingProfile = {
  id: "general_store",
  walls: filledRect(7, 8),
  widthTiles: 7,
  heightTiles: 8,
};

const SHERIFF: BuildingProfile = {
  id: "sheriff",
  walls: filledRect(5, 4),
  widthTiles: 5,
  heightTiles: 4,
};

const SALOON: BuildingProfile = {
  id: "saloon",
  walls: filledRect(5, 5),
  widthTiles: 5,
  heightTiles: 5,
};

const BARBER: BuildingProfile = {
  id: "barber",
  walls: filledRect(3, 3),
  widthTiles: 3,
  heightTiles: 3,
};

const SMALL_HOUSE_1: BuildingProfile = {
  id: "small_house_1",
  walls: filledRect(3, 3),
  widthTiles: 3,
  heightTiles: 3,
};

const SMALL_HOUSE_2: BuildingProfile = {
  id: "small_house_2",
  walls: filledRect(3, 3),
  widthTiles: 3,
  heightTiles: 3,
};

const WATER_TOWER: BuildingProfile = {
  id: "water_tower",
  walls: filledRect(2, 2),
  widthTiles: 2,
  heightTiles: 2,
};

const BANK: BuildingProfile = {
  id: "bank",
  walls: filledRect(4, 4),
  widthTiles: 4,
  heightTiles: 4,
};

/** Building profiles for Stage 1 (Town) */
export const TOWN_BUILDINGS: BuildingProfile[] = [
  GENERAL_STORE,
  SHERIFF,
  SALOON,
  BARBER,
  SMALL_HOUSE_1,
  SMALL_HOUSE_2,
  WATER_TOWER,
  BANK,
];
