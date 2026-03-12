/**
 * Pattern Definitions
 *
 * Named bullet pattern definitions for all enemy attack types.
 * Each enemy with attackStyle 'projectile' references a pattern by ID
 * via the patternId field on its EnemyDefinition.
 *
 * Pattern parameters are tuned to match existing enemy attack constants
 * exactly — migrating to the pattern system must produce zero gameplay change.
 */

import { registerPattern } from './patterns'
import { aimed, ring, scatter, spiral, wall, layered, burst } from './patterns'
import { BulletSpriteId } from './weapons'

// ============================================================================
// Existing Enemy Patterns (match current hardcoded values exactly)
// ============================================================================

registerPattern({
  id: 'swarmer_shot',
  name: 'Swarmer Shot',
  axes: ['reading'],
  generator: aimed({ count: 1, spread: 0, speed: 240, accel: 120, drag: 0.30, damage: 2 }),
  bulletSpriteId: BulletSpriteId.FIRE_ANIM,
  bulletSize: 1.2,
})

registerPattern({
  id: 'grunt_shot',
  name: 'Grunt Shot',
  axes: ['reading'],
  generator: aimed({ count: 1, spread: 0, speed: 320, accel: 220, drag: 0.14, damage: 4 }),
  bulletSpriteId: BulletSpriteId.SLUG_ANIM,
  bulletSize: 1.2,
})

registerPattern({
  id: 'drifter_shot',
  name: 'Drifter Shot',
  axes: ['reading'],
  generator: aimed({ count: 1, spread: 0, speed: 190, damage: 3 }),
  bulletSpriteId: BulletSpriteId.SLUG,
  bulletSize: 1.2,
})

registerPattern({
  id: 'deadeye_snipe',
  name: 'Deadeye Snipe',
  axes: ['precision', 'planning'],
  generator: aimed({ count: 1, spread: 0, speed: 650, damage: 9 }),
  bulletSpriteId: BulletSpriteId.SLUG,
  bulletSize: 1.5,
})

registerPattern({
  id: 'ghost_rider_shot',
  name: 'Ghost Rider Shot',
  axes: ['reading'],
  generator: aimed({ count: 1, spread: 0, speed: 500, damage: 8 }),
  bulletSpriteId: BulletSpriteId.FIRE_ANIM,
  bulletSize: 1.5,
})

registerPattern({
  id: 'shooter_fan',
  name: 'Shooter Fan',
  axes: ['precision', 'reading'],
  generator: aimed({ count: 3, spread: 0.35, speed: 460, drag: 0.06, damage: 5 }),
  bulletSpriteId: BulletSpriteId.SPIRIT_ANIM,
  bulletSize: 1.5,
})

registerPattern({
  id: 'spitter_spray',
  name: 'Spitter Spray',
  axes: ['reading', 'multitasking'],
  generator: aimed({ count: 6, spread: 1.8, speed: 130, drag: 0.3, damage: 3 }),
  bulletSpriteId: BulletSpriteId.SLUG_ANIM,
  bulletSize: 1.2,
})

// ============================================================================
// Boss Patterns — Boomstick (Stage 1)
// ============================================================================

registerPattern({
  id: 'boomstick_fan_p1',
  name: 'Boomstick Fan P1',
  axes: ['precision', 'reading'],
  generator: aimed({ count: 5, spread: 1.0, speed: 520, accel: 140, drag: 0.10, damage: 8, jitter: 0.14 }),
  bulletSpriteId: BulletSpriteId.FIRE_ANIM,
  bulletSize: 1.5,
})

registerPattern({
  id: 'boomstick_ring_p1',
  name: 'Boomstick Ring P1',
  axes: ['reading', 'planning'],
  generator: ring({ count: 8, speed: 400, accel: 140, drag: 0.10, damage: 8, randomSeed: true }),
  bulletSpriteId: BulletSpriteId.FIRE_ANIM,
  bulletSize: 1.5,
})

registerPattern({
  id: 'boomstick_fan_p2',
  name: 'Boomstick Fan+Aimed P2',
  axes: ['precision', 'reading', 'multitasking'],
  generator: layered(
    aimed({ count: 6, spread: 1.0, speed: 520, accel: 140, drag: 0.10, damage: 8, jitter: 0.14 }),
    aimed({ count: 1, spread: 0, speed: 600, accel: 140, drag: 0.10, damage: 8 }),
  ),
  bulletSpriteId: BulletSpriteId.FIRE_ANIM,
  bulletSize: 1.5,
})

registerPattern({
  id: 'boomstick_ring_p2',
  name: 'Boomstick Ring P2',
  axes: ['reading', 'planning'],
  generator: ring({ count: 8, speed: 380, accel: 140, drag: 0.10, damage: 8, randomSeed: true }),
  bulletSpriteId: BulletSpriteId.FIRE_ANIM,
  bulletSize: 1.5,
})

registerPattern({
  id: 'boomstick_fan_p3',
  name: 'Boomstick Fan+Ring P3',
  axes: ['precision', 'reading', 'multitasking'],
  generator: layered(
    aimed({ count: 7, spread: 1.0, speed: 520, accel: 140, drag: 0.10, damage: 8, jitter: 0.14 }),
    ring({ count: 10, speed: 360, accel: 140, drag: 0.10, damage: 8, offset: Math.PI / 10 }),
  ),
  bulletSpriteId: BulletSpriteId.FIRE_ANIM,
  bulletSize: 1.5,
})

registerPattern({
  id: 'boomstick_ring_p3',
  name: 'Boomstick Ring P3',
  axes: ['reading', 'planning', 'multitasking'],
  generator: ring({ count: 10, speed: 360, accel: 140, drag: 0.10, damage: 8, randomSeed: true }),
  bulletSpriteId: BulletSpriteId.FIRE_ANIM,
  bulletSize: 1.5,
})

// ============================================================================
// Boss Patterns — Mad Dog (Stage 2)
// ============================================================================

registerPattern({
  id: 'maddog_sweep_p1',
  name: 'Mad Dog Sweep P1',
  axes: ['reading', 'planning'],
  generator: wall({ count: 5, spacing: 0.25, speed: 350, damage: 8 }),
  bulletSpriteId: BulletSpriteId.SLUG_ANIM,
  bulletSize: 1.5,
})

registerPattern({
  id: 'maddog_whirlwind_p2',
  name: 'Mad Dog Whirlwind P2',
  axes: ['reading', 'multitasking'],
  generator: spiral({ count: 3, speed: 300, damage: 8, rotationRate: 0.15, arms: 3 }),
  bulletSpriteId: BulletSpriteId.SLUG_ANIM,
  bulletSize: 1.5,
})

registerPattern({
  id: 'maddog_groundpound_p3',
  name: 'Mad Dog Ground Pound Ring P3',
  axes: ['reading', 'planning'],
  generator: ring({ count: 12, speed: 250, damage: 10 }),
  bulletSpriteId: BulletSpriteId.SLUG_ANIM,
  bulletSize: 1.5,
})

registerPattern({
  id: 'maddog_fury_p3',
  name: 'Mad Dog Fury Burst P3',
  axes: ['precision', 'multitasking'],
  generator: burst(aimed({ count: 2, spread: 0.3, speed: 400, damage: 8 }), 3, 0.15),
  bulletSpriteId: BulletSpriteId.SLUG_ANIM,
  bulletSize: 1.5,
})

// ============================================================================
// Generic composable patterns for future use
// ============================================================================

registerPattern({
  id: 'ring_8',
  name: '8-Way Ring',
  axes: ['reading', 'planning'],
  generator: ring({ count: 8, speed: 300, damage: 5, randomSeed: true }),
  bulletSpriteId: BulletSpriteId.SLUG_ANIM,
  bulletSize: 1.2,
})

registerPattern({
  id: 'ring_12',
  name: '12-Way Ring',
  axes: ['reading', 'precision'],
  generator: ring({ count: 12, speed: 280, damage: 5, randomSeed: true }),
  bulletSpriteId: BulletSpriteId.SLUG_ANIM,
  bulletSize: 1.2,
})

registerPattern({
  id: 'scatter_light',
  name: 'Light Scatter',
  axes: ['reading'],
  generator: scatter({ count: 5, coneAngle: 1.2, speedMin: 200, speedMax: 350, damage: 4, minSeparation: 0.15 }),
  bulletSpriteId: BulletSpriteId.SLUG,
  bulletSize: 1.0,
})

registerPattern({
  id: 'spiral_2arm',
  name: '2-Arm Spiral',
  axes: ['reading', 'multitasking'],
  generator: spiral({ count: 4, speed: 250, damage: 5, rotationRate: 0.2, arms: 2 }),
  bulletSpriteId: BulletSpriteId.SPIRIT_ANIM,
  bulletSize: 1.2,
})
