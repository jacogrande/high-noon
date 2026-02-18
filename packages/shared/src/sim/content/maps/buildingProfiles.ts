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
  /** Interior floor tile type stamped under the building (default: WOOD_FLOOR) */
  interiorFloor?: number;
  /** If true, skip the dither reveal effect when the player walks behind this building */
  noDither?: boolean;
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
  walls: filledRect(5, 5),
  widthTiles: 5,
  heightTiles: 5,
};

const SALOON: BuildingProfile = {
  id: "saloon",
  walls: filledRect(5, 8),
  widthTiles: 5,
  heightTiles: 8,
};

const BARBER: BuildingProfile = {
  id: "barber",
  walls: filledRect(6, 6),
  widthTiles: 6,
  heightTiles: 6,
};

// Small houses share collision footprints; the id drives distinct sprite selection on the client.
const SMALL_HOUSE_1: BuildingProfile = {
  id: "small_house_1",
  walls: filledRect(3, 5),
  widthTiles: 3,
  heightTiles: 5,
};

const SMALL_HOUSE_2: BuildingProfile = {
  id: "small_house_2",
  walls: filledRect(3, 5),
  widthTiles: 3,
  heightTiles: 5,
};

const SMALL_HOUSE_3: BuildingProfile = {
  id: "small_house_3",
  walls: filledRect(3, 5),
  widthTiles: 3,
  heightTiles: 5,
};

const SMALL_HOUSE_4: BuildingProfile = {
  id: "small_house_4",
  walls: filledRect(3, 4),
  widthTiles: 3,
  heightTiles: 4,
};

const SMALL_HOUSE_5: BuildingProfile = {
  id: "small_house_5",
  walls: filledRect(3, 3),
  widthTiles: 3,
  heightTiles: 3,
};

const SMALL_HOUSE_6: BuildingProfile = {
  id: "small_house_6",
  walls: filledRect(3, 3),
  widthTiles: 3,
  heightTiles: 3,
};

const OUTHOUSE: BuildingProfile = {
  id: "outhouse",
  walls: filledRect(1, 1),
  widthTiles: 1,
  heightTiles: 1,
};

const GREEN_SHED: BuildingProfile = {
  id: "green_shed",
  walls: filledRect(3, 3),
  widthTiles: 3,
  heightTiles: 3,
};

const WATER_TOWER: BuildingProfile = {
  id: "water_tower",
  walls: filledRect(3, 2),
  widthTiles: 3,
  heightTiles: 2,
  // No interiorFloor — noDither means the interior is never revealed to the player
  noDither: true,
};

const BANK: BuildingProfile = {
  id: "bank",
  walls: filledRect(5, 5),
  widthTiles: 5,
  heightTiles: 5,
};

/** Building profiles for Stage 1 (Town) */
export const TOWN_BUILDINGS: BuildingProfile[] = [
  GENERAL_STORE,
  SHERIFF,
  SALOON,
  BARBER,
  SMALL_HOUSE_1,
  SMALL_HOUSE_2,
  SMALL_HOUSE_3,
  SMALL_HOUSE_4,
  SMALL_HOUSE_5,
  SMALL_HOUSE_6,
  OUTHOUSE,
  GREEN_SHED,
  WATER_TOWER,
  BANK,
];
