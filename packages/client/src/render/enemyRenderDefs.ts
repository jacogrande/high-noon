/**
 * Enemy Render Definitions (client-only)
 *
 * All rendering metadata for enemies and bosses: colors, sprite IDs, scales.
 * This data was extracted from the shared EnemyDefinition/BossModule types
 * since it is only consumed by the client renderer and asset loader.
 */

import { EnemyType, Collider } from '@high-noon/shared'

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

/** Fallback circle color / sprite tint per enemy type */
export const ENEMY_COLORS: Record<number, number> = {
  // Special non-registry entries
  [EnemyType.AFTERIMAGE]: 0x8888aa,

  // Fodder
  [EnemyType.SWARMER]: 0xffaaaa,
  [EnemyType.GRUNT]: 0xff6633,
  [EnemyType.GOBLIN_BARBARIAN]: 0x44aa44,
  [EnemyType.GOBLIN_ROGUE]: 0x66cc66,
  [EnemyType.RUNNER]: 0x44ddff,
  [EnemyType.DYNAMITE_TOSSER]: 0xff6600,
  [EnemyType.RATTLESNAKE]: 0x889944,

  // Stage 1 introductory enemies
  [EnemyType.DRIFTER]: 0xc4956a,
  [EnemyType.KNIFE_DRIFTER]: 0xb07850,
  [EnemyType.DEADEYE]: 0x774444,
  [EnemyType.SPITTER]: 0x66aa55,
  [EnemyType.DUSTDEVIL]: 0xaa8844,

  // Threats
  [EnemyType.SHOOTER]: 0xaa44dd,
  [EnemyType.CHARGER]: 0xaa1111,
  [EnemyType.DUELIST]: 0xddaa33,
  [EnemyType.LASSO_BANDIT]: 0xcc8844,
  [EnemyType.ARMORED_BANDIT]: 0x888888,
  [EnemyType.HEALER_SHAMAN]: 0x44ddaa,
  [EnemyType.VULTURE]: 0x554433,
  [EnemyType.GHOST_RIDER]: 0x6688cc,
  [EnemyType.COYOTE]: 0xc4a35a,

  // Bosses
  [EnemyType.MAD_DOG]: 0x993311,
  [EnemyType.BOOMSTICK]: 0xffcc33,
  [EnemyType.DALTON]: 0xcc7733,
  [EnemyType.COYOTE_JANE]: 0x8b6914,
  [EnemyType.HOLLOW_MAN]: 0x665544,
  [EnemyType.OLD_SCRATCH]: 0x991111,
}

// ---------------------------------------------------------------------------
// Sprite IDs
// ---------------------------------------------------------------------------

/** Sprite sheet ID per enemy type (undefined = circle fallback) */
export const ENEMY_SPRITE_ID: Partial<Record<number, string>> = {
  // Regular enemies
  [EnemyType.SWARMER]: 'swarmer',
  [EnemyType.GRUNT]: 'grunt',
  [EnemyType.SHOOTER]: 'shooter',
  [EnemyType.CHARGER]: 'charger',
  [EnemyType.GOBLIN_BARBARIAN]: 'goblin_barbarian',
  [EnemyType.GOBLIN_ROGUE]: 'goblin_rogue',
  [EnemyType.RUNNER]: 'runner',
  [EnemyType.DUELIST]: 'duelist',
  [EnemyType.LASSO_BANDIT]: 'lasso_bandit',
  [EnemyType.DYNAMITE_TOSSER]: 'dynamite_tosser',
  [EnemyType.ARMORED_BANDIT]: 'armored_bandit',
  [EnemyType.HEALER_SHAMAN]: 'healer_shaman',
  [EnemyType.RATTLESNAKE]: 'rattlesnake',
  [EnemyType.VULTURE]: 'vulture',
  [EnemyType.COYOTE]: 'coyote',
  // Ghost Rider has no spriteId in enemy registry — added via boss override
  [EnemyType.GHOST_RIDER]: 'ghost_rider',

  // Bosses
  [EnemyType.MAD_DOG]: 'mad_dog',
  [EnemyType.BOOMSTICK]: 'boomstick',
  [EnemyType.COYOTE_JANE]: 'coyote_jane',
  [EnemyType.OLD_SCRATCH]: 'old_scratch',
  // Dalton uses resolveSpriteId() for per-entity differentiation
  // Hellfire Pillar uses custom Graphics, no sprite sheet
}

/** Per-type sprite render scale multiplier */
export const ENEMY_SPRITE_SCALE: Partial<Record<number, number>> = {
  // Regular enemies
  [EnemyType.SWARMER]: 1.5,
  [EnemyType.GRUNT]: 2,
  [EnemyType.SHOOTER]: 2,
  [EnemyType.CHARGER]: 2.5,
  [EnemyType.GOBLIN_BARBARIAN]: 2,
  [EnemyType.GOBLIN_ROGUE]: 2,
  [EnemyType.RUNNER]: 1.5,
  [EnemyType.DUELIST]: 2.5,
  [EnemyType.LASSO_BANDIT]: 2,
  [EnemyType.DYNAMITE_TOSSER]: 2,
  [EnemyType.ARMORED_BANDIT]: 2.5,
  [EnemyType.HEALER_SHAMAN]: 2,
  [EnemyType.RATTLESNAKE]: 1.5,
  [EnemyType.VULTURE]: 2,
  [EnemyType.GHOST_RIDER]: 2.5,
  [EnemyType.COYOTE]: 1.5,

  // Stage 1
  [EnemyType.DRIFTER]: 1.5,
  [EnemyType.KNIFE_DRIFTER]: 1.5,
  [EnemyType.DEADEYE]: 2,
  [EnemyType.SPITTER]: 2,
  [EnemyType.DUSTDEVIL]: 1.5,

  // Bosses
  [EnemyType.MAD_DOG]: 2.5,
  [EnemyType.BOOMSTICK]: 2.5,
  [EnemyType.DALTON]: 2.5,
  [EnemyType.COYOTE_JANE]: 2.5,
  [EnemyType.HOLLOW_MAN]: 2.5,
  [EnemyType.OLD_SCRATCH]: 2.5,
}

// ---------------------------------------------------------------------------
// Asset manifest
// ---------------------------------------------------------------------------

/** Enemy sprite sheet paths keyed by sprite ID */
export const ENEMY_SPRITES: Record<string, string> = {}

// Build from ENEMY_SPRITE_ID
for (const spriteId of Object.values(ENEMY_SPRITE_ID)) {
  if (spriteId) {
    ENEMY_SPRITES[spriteId] = `/assets/sprites/enemies/${spriteId}.png`
  }
}

// Dalton brothers use two separate sprite sheets
ENEMY_SPRITES['dalton_emmett'] = '/assets/sprites/enemies/dalton_emmett.png'
ENEMY_SPRITES['dalton_bob'] = '/assets/sprites/enemies/dalton_bob.png'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GOBLIN_SPRITE_SCALE = 2

export function isSpriteEnemy(type: number): boolean {
  return ENEMY_SPRITE_ID[type] !== undefined || type === EnemyType.DALTON
}

/** Resolve sprite ID per entity. DALTON brothers share one EnemyType but use
 *  different sprite sheets — differentiate by Collider.radius (Emmett=14, Bob=12). */
export function resolveSpriteId(type: number, eid: number): string {
  if (type === EnemyType.DALTON) {
    return Collider.radius[eid]! >= 14 ? 'dalton_emmett' : 'dalton_bob'
  }
  return ENEMY_SPRITE_ID[type]!
}

export function getSpriteScale(type: number): number {
  return ENEMY_SPRITE_SCALE[type] ?? GOBLIN_SPRITE_SCALE
}
