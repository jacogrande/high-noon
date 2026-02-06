# render/

Sprite management and visual effects.

## Responsibilities

- Map ECS entities to PixiJS display objects
- Sync sprite positions with simulation state
- Interpolate between ticks for smooth rendering
- Debug visualization overlay

## Current Files

- `SpriteRegistry.ts` - Entity ID → DisplayObject mapping with shape metadata
- `PlayerRenderer.ts` - Player entity rendering with interpolation, roll alpha, and damage flash (red tint)
- `BulletRenderer.ts` - Bullet rendering with interpolation (yellow circles)
- `TilemapRenderer.ts` - Tilemap rendering (walls as colored rectangles)
- `DebugRenderer.ts` - Debug shapes and stats overlay

## Planned Files

- `EnemyRenderer.ts` - Enemy entity rendering
- `FxSystem.ts` - Particles, screenshake, hit effects

## Entity-Sprite Lifecycle

```
Entity created → sync() creates sprite, adds to registry
Entity updated → render() updates sprite transform with interpolation
Entity removed → sync() removes sprite from registry
```

## Interpolation

Sprites render at interpolated positions for smooth movement:

```typescript
render(world: GameWorld, alpha: number): void {
  const prevX = Position.prevX[eid]!
  const currX = Position.x[eid]!
  const renderX = prevX + (currX - prevX) * alpha
  this.registry.setPosition(eid, renderX, renderY)
}
```

## Render Layers (via GameApp)

From back to front:
1. `background` - Floor tiles, static scenery
2. `tiles` - Tile-based level geometry
3. `entities` - Players, enemies, items
4. `fx` - Particles, effects
5. `ui` - Debug overlay, HUD

## Dependencies

- `pixi.js` - Graphics, Container
- `@high-noon/shared` - Component definitions for reading state
- `bitecs` - defineQuery for entity queries
