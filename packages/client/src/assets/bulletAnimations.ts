/**
 * Bullet Animation Config
 *
 * Maps animated BulletSpriteId values to their spritestrip metadata.
 * Static bullet IDs (SLUG, PELLET) are absent — only animated variants appear here.
 */

import { BulletSpriteId, type BulletSpriteIdValue } from '@high-noon/shared'

export interface BulletAnimConfig {
  /** AssetLoader alias — used as the lookup key after loading */
  asset: string
  /** Public file path — used only during loadAll() to register with PixiJS Assets */
  path: string
  /** Frame width and height in pixels (square cells) */
  cellSize: number
  /** Playback speed in frames per second */
  fps: number
}

/** Only animated sprite IDs appear here; static ones are absent */
export const BULLET_ANIM_CONFIG: Partial<Record<BulletSpriteIdValue, BulletAnimConfig>> = {
  [BulletSpriteId.SLUG_ANIM]: {
    asset: 'bullet_slug_anim',
    path: '/assets/sprites/bullet_slug_anim.png',
    cellSize: 16,
    fps: 10,
  },
  [BulletSpriteId.FIRE_ANIM]: {
    asset: 'bullet_fire_anim',
    path: '/assets/sprites/bullet_fire_anim.png',
    cellSize: 16,
    fps: 12,
  },
  [BulletSpriteId.SPIRIT_ANIM]: {
    asset: 'bullet_spirit_anim',
    path: '/assets/sprites/bullet_spirit_anim.png',
    cellSize: 16,
    fps: 8,
  },
}
