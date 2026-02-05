# content/

Data-driven game content definitions.

## Responsibilities

- Weapon stats and behaviors
- Enemy archetypes and patterns
- Item/upgrade definitions
- Character base stats
- Level/room templates

## Design Philosophy

Content is defined as plain data objects, not code. This enables:
- Easy balancing without code changes
- Potential runtime loading from external sources
- Clear separation between "what" and "how"

## Example Structure

```typescript
// weapons.ts
export const WEAPONS = {
  pistol: {
    damage: 10,
    fireRate: 0.2,
    bulletSpeed: 800,
    spread: 0.05,
    bulletCount: 1,
  },
  shotgun: {
    damage: 5,
    fireRate: 0.8,
    bulletSpeed: 600,
    spread: 0.3,
    bulletCount: 6,
  },
} as const

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
