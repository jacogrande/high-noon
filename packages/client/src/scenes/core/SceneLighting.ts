import { getTile, TileType, type Tilemap } from '@high-noon/shared'
import { createLavaLight, type LightingSystem } from '../../lighting'

/** Seed static lights for all hazard tiles on the tilemap. */
export function seedHazardLights(lighting: LightingSystem, tilemap: Tilemap): void {
  const seen = new Set<string>()
  const halfTile = tilemap.tileSize / 2

  for (let layerIndex = 0; layerIndex < tilemap.layers.length; layerIndex++) {
    const layer = tilemap.layers[layerIndex]
    if (!layer || layer.solid) continue

    for (let y = 0; y < tilemap.height; y++) {
      for (let x = 0; x < tilemap.width; x++) {
        const tile = getTile(tilemap, layerIndex, x, y)
        if (tile !== TileType.LAVA) continue
        const key = `${x},${y}`
        if (seen.has(key)) continue
        seen.add(key)
        lighting.addLight(createLavaLight(x * tilemap.tileSize + halfTile, y * tilemap.tileSize + halfTile))
      }
    }
  }
}

/** @deprecated Use seedHazardLights instead */
export const seedLavaLights = seedHazardLights
