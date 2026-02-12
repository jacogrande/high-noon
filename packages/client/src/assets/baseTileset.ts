import { BASE_TILE_VARIANTS_PER_STYLE, type BaseTileStyle } from '@high-noon/shared'

export const BASE_TILESET_PATH = '/assets/sprites/base_tileset.png'
export const BASE_TILE_SIZE = 32
export const BASE_TILE_VARIANTS = BASE_TILE_VARIANTS_PER_STYLE

/** Row index in base_tileset.png for each stage base style. */
export const BASE_TILE_STYLE_ROW: Record<BaseTileStyle, number> = {
  red_dirt: 0,
  grass: 1,
  stone: 2,
}
