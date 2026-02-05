# render/

Sprite management and visual effects.

## Responsibilities

- Map ECS entities to PixiJS sprites
- Sync sprite positions/rotations with simulation state
- Visual effects (particles, screenshake, trails)
- Z-ordering and render layers

## Key Files

- `SpriteRegistry.ts` - Entity ID → Sprite mapping, lifecycle
- `RenderSystem.ts` - Read sim state, update sprite transforms
- `FxSystem.ts` - Particles, screenshake, hit effects

## Entity-Sprite Lifecycle

```
Entity created → Create sprite, add to registry
Entity updated → Update sprite transform
Entity removed → Remove sprite, return to pool
```

## Render Layers

From back to front:
1. Background/floor
2. Shadows
3. Ground effects (blood, scorch marks)
4. Entities (sorted by Y for depth)
5. Projectiles
6. Particles/effects
7. UI overlay

## Interpolation

Sprites render at interpolated positions:

```typescript
sprite.x = lerp(prevPos.x, currPos.x, alpha)
sprite.y = lerp(prevPos.y, currPos.y, alpha)
```

## Object Pooling

Sprites for frequent entities (bullets, particles) use pools to avoid GC:

```typescript
const sprite = bulletPool.acquire()
// ... use sprite ...
bulletPool.release(sprite)
```

## Dependencies

- `pixi.js` - Sprite, Container, ParticleContainer
- `@high-noon/shared` - Component definitions for reading state
- `../assets` - Texture loading
