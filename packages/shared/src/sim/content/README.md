# content/

Data-driven game content definitions.

## Current Content

- `player.ts` - Player constants (speed, radius, start position, roll params)
- `weapons.ts` - Weapon stats (pistol fire rate, bullet speed, damage, range)
- `maps/testArena.ts` - Test arena map with walls and obstacles

## Planned Content

- `enemies.ts` - Enemy archetypes and patterns
- `items.ts` - Item/upgrade definitions
- `maps/*.ts` - Additional level/room templates

## Design Philosophy

Content is defined as plain data objects, not code. This enables:
- Easy balancing without code changes
- Potential runtime loading from external sources
- Clear separation between "what" and "how"

## Current Structure

```typescript
// player.ts - Movement
export const PLAYER_SPEED = 250      // pixels/second (recommended: 200-300)
export const PLAYER_RADIUS = 16      // collision radius in pixels
export const PLAYER_START_X = 400    // default spawn position
export const PLAYER_START_Y = 300

// player.ts - Roll parameters (snappy bullet-hell style)
export const ROLL_DURATION = 0.3           // seconds
export const ROLL_IFRAME_RATIO = 0.5       // first 50% is invincible
export const ROLL_SPEED_MULTIPLIER = 2.0   // double speed during roll
export const ROLL_COOLDOWN = 0             // recovery-based, no cooldown

// weapons.ts - Pistol (default weapon)
export const PISTOL_FIRE_RATE = 5          // shots per second
export const PISTOL_BULLET_SPEED = 600     // pixels/second
export const PISTOL_BULLET_DAMAGE = 10     // damage per hit
export const PISTOL_RANGE = 400            // max travel distance in pixels

// weapons.ts - Bullet parameters
export const BULLET_RADIUS = 4             // collision radius
export const BULLET_LIFETIME = 5.0         // failsafe despawn (seconds)
```

## Future Structure

```typescript
// enemies.ts
export const ENEMIES = {
  grunt: {
    health: 30,
    speed: 100,
    damage: 10,
    behavior: 'chase',
  },
} as const
```

## Dependencies

None - pure data definitions.
