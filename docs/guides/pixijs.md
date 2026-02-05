# PixiJS v8 Guide

## Overview

PixiJS is a fast 2D rendering engine using WebGL (with WebGPU support in v8). It's the recommended renderer for High Noon's client.

## Installation

```bash
bun add pixi.js
```

Or scaffold a new project:

```bash
npm create pixi.js@latest
```

The Vite + PixiJS template is recommended for our setup.

## Core Concepts

### Application

The main entry point that manages the renderer, stage, and ticker:

```typescript
import { Application } from 'pixi.js'

const app = new Application()
await app.init({
  width: 1280,
  height: 720,
  backgroundColor: 0x1a1a2e,
})
document.body.appendChild(app.canvas)
```

### Scene Graph

PixiJS uses a hierarchical scene graph. The `app.stage` is the root container.

- **Container** - Groups display objects, provides transforms
- **Sprite** - Renders textures (images)
- **Graphics** - Draws primitives (circles, rectangles, lines)
- **Text** - Renders text with styling

```typescript
import { Container, Sprite, Texture } from 'pixi.js'

const gameWorld = new Container()
app.stage.addChild(gameWorld)

const playerSprite = new Sprite(Texture.from('player.png'))
playerSprite.anchor.set(0.5) // Center the anchor
playerSprite.position.set(400, 300)
gameWorld.addChild(playerSprite)
```

### Textures and Spritesheets

For High Noon's bullet-hell style, use texture atlases to batch draw calls:

```typescript
import { Assets, Spritesheet } from 'pixi.js'

// Load a spritesheet
const sheet = await Assets.load('sprites.json')
const bulletTexture = sheet.textures['bullet_01']
```

Use [TexturePacker](https://www.codeandweb.com/texturepacker) to create atlases.

### The Ticker (Game Loop)

The ticker calls your update function each frame:

```typescript
app.ticker.add((ticker) => {
  // ticker.deltaTime is frame-scaled (1.0 at 60fps)
  // ticker.deltaMS is milliseconds since last frame
  player.x += velocity.x * ticker.deltaTime
})
```

**Important for High Noon:** The ticker runs at variable FPS (requestAnimationFrame). Our simulation uses a fixed 60Hz timestep separately. The ticker should:
1. Accumulate delta time
2. Step the fixed simulation as needed
3. Render interpolated state

```typescript
const TICK_RATE = 1000 / 60 // 16.67ms
let accumulator = 0

app.ticker.add((ticker) => {
  accumulator += ticker.deltaMS

  while (accumulator >= TICK_RATE) {
    stepSimulation() // Fixed 60Hz step
    accumulator -= TICK_RATE
  }

  const alpha = accumulator / TICK_RATE
  renderInterpolated(alpha) // Smooth rendering between ticks
})
```

## High Noon Integration

### Recommended Structure

```
packages/client/
  src/
    engine/
      GameApp.ts      # PixiJS Application wrapper
      SceneManager.ts # Scene transitions
      FixedStep.ts    # Timestep accumulator
    render/
      SpriteRegistry.ts  # Entity ID -> Sprite mapping
      RenderSystem.ts    # Sync ECS state to sprites
      FxSystem.ts        # Particles, screenshake
```

### Separating Simulation from Rendering

The renderer is a "view" of the ECS world:

```typescript
// RenderSystem.ts
import { query } from 'bitecs'
import { Position, Renderable } from '@high-noon/shared'

export function renderSystem(world: World, sprites: Map<number, Sprite>) {
  for (const eid of query(world, [Position, Renderable])) {
    let sprite = sprites.get(eid)
    if (!sprite) {
      sprite = createSpriteForEntity(eid)
      sprites.set(eid, sprite)
    }
    sprite.x = Position.x[eid]
    sprite.y = Position.y[eid]
  }
}
```

### Performance Tips

1. **Batch draw calls** - Use spritesheets, not individual images
2. **Object pooling** - Reuse sprites for bullets/particles instead of creating/destroying
3. **Render groups** - Use `renderGroup: true` on containers for complex static scenes
4. **Cull off-screen** - Set `sprite.visible = false` for entities outside viewport
5. **Avoid filters on many objects** - Filters break batching

### Useful Properties

```typescript
sprite.anchor.set(0.5)       // Pivot point (0-1)
sprite.rotation = angle      // Radians
sprite.scale.set(2)          // Uniform scale
sprite.tint = 0xff0000       // Color multiply
sprite.alpha = 0.5           // Transparency
sprite.visible = false       // Skip rendering
sprite.zIndex = 10           // Sorting (with sortableChildren)
container.sortableChildren = true
```

## Resources

- [Official PixiJS v8 Docs](https://pixijs.com/8.x/guides/getting-started/intro)
- [PixiJS Tutorials](https://pixijs.com/8.x/tutorials)
- [PixiJS Open Games](https://github.com/pixijs/open-games) - MIT-licensed example games
- [PixiJS DevTools](https://chrome.google.com/webstore/detail/pixijs-devtools) - Chrome extension for debugging
