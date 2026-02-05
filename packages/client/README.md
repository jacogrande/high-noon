# @high-noon/client

The browser client: React app with PixiJS game rendering.

## Responsibilities

- React-based routing and page structure
- PixiJS game rendering at requestAnimationFrame
- Input collection (keyboard, mouse)
- Client-side prediction for local player
- Snapshot interpolation for remote entities
- Network communication with server
- UI pages (home, game, signup, payment, etc.)

## Architecture

The client uses React for page routing and UI, with PixiJS embedded for game rendering.

**Page Structure:**
- `/` - Home/landing page
- `/play` - Game page with PixiJS canvas

**Game Architecture:**
The game canvas runs two "simulations":
1. **Predicted simulation** - Local player only, runs ahead of server
2. **Interpolated state** - Remote entities, smoothly interpolated between snapshots

On server correction, the predicted simulation reconciles by rewinding and replaying unacknowledged inputs.

## Commands

```bash
bun run dev        # Start Vite dev server at localhost:5173
bun run build      # Production build to dist/
bun run preview    # Preview production build
bun run typecheck  # Type check without emitting
```

## Dependencies

- `@high-noon/shared` - Simulation, protocol, math
- `react` - UI framework
- `react-dom` - React DOM rendering
- `react-router-dom` - Client-side routing
- `pixi.js` - 2D game rendering
- `vite` - Build tooling and dev server

## Modules

### `engine/` - Game Engine Core

**GameApp** - PixiJS application wrapper with render layers:
```typescript
import { GameApp } from './engine'

const app = await GameApp.create(container)
// Layers: background, tiles, entities, fx, ui
app.layers.entities.addChild(sprite)
```

**GameLoop** - Fixed timestep game loop with interpolation:
```typescript
import { GameLoop } from './engine'

const loop = new GameLoop(
  (dt) => { /* update at 60Hz */ },
  (alpha) => { /* render with interpolation */ }
)
loop.start()
```

**Input** - Keyboard and mouse input collection:
```typescript
import { Input } from './engine'

const input = new Input()
const state = input.getInputState()  // Returns InputState for simulation
```

### `render/` - Rendering Systems

**DebugRenderer** - Debug shapes and overlay:
```typescript
import { DebugRenderer } from './render'

const debug = new DebugRenderer(uiLayer)
debug.circle(x, y, radius, 0x00ffff)
debug.rect(x, y, w, h, 0xff0000)
debug.updateStats({ fps: 60, tick: 100, entityCount: 5 })
```

**SpriteRegistry** - Entity to display object mapping:
```typescript
import { SpriteRegistry } from './render'

const registry = new SpriteRegistry(entityLayer)
registry.createCircle(entityId, 16, 0x00ffff)
registry.setPosition(entityId, x, y)
registry.remove(entityId)
```

## Directory Structure

```
src/
  main.tsx           # React entry point
  App.tsx            # Root component with router
  index.css          # Global styles
  pages/
    Home.tsx         # Landing page
    Game.tsx         # Game page with PixiJS canvas
  engine/
    GameApp.ts       # PixiJS application wrapper
    GameLoop.ts      # Fixed timestep game loop
    Input.ts         # Keyboard/mouse input
    index.ts
  render/
    DebugRenderer.ts # Debug shapes and overlay
    SpriteRegistry.ts# Entity sprite management
    index.ts
  net/               # (future) Networking, prediction
  ui/                # (future) In-game HUD components
  assets/            # (future) Asset loading
```

## Controls

- **WASD / Arrow Keys** - Move
- **Mouse** - Aim
- **Left Click** - Shoot
- **Space / Left Shift** - Roll
- **Backtick (`)** - Toggle debug overlay

## Entry Point

`src/main.tsx` renders the React app. The `App.tsx` component sets up routing between pages. The `Game.tsx` page hosts the PixiJS canvas with the full game loop.
