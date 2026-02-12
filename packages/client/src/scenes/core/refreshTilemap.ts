/**
 * Shared tilemap refresh logic for mode controllers.
 *
 * When the world tilemap changes (e.g., stage transition), both singleplayer
 * and multiplayer controllers need to re-render the tilemap, update camera
 * bounds, snap the camera, and re-seed hazard lights. This helper centralises
 * that work so neither controller duplicates it.
 */

import { getPlayableBoundsFromTilemap, getArenaCenterFromTilemap, type Tilemap } from '@high-noon/shared'
import type { TilemapRenderer } from '../../render/TilemapRenderer'
import type { Camera } from '../../engine/Camera'
import type { LightingSystem } from '../../lighting'
import { seedHazardLights } from './SceneLighting'

export function refreshTilemap(
  tilemap: Tilemap,
  tilemapRenderer: TilemapRenderer,
  camera: Camera,
  lightingSystem: LightingSystem,
): void {
  tilemapRenderer.render(tilemap)
  const bounds = getPlayableBoundsFromTilemap(tilemap)
  camera.setBounds(bounds)
  const center = getArenaCenterFromTilemap(tilemap)
  camera.snapTo(center.x, center.y)
  lightingSystem.clearStaticLights()
  seedHazardLights(lightingSystem, tilemap)
}
