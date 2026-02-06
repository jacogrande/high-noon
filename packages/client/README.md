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

**DebugRenderer** - Debug shapes and overlay with player/camera/enemy AI telemetry:
```typescript
import { DebugRenderer } from './render'

const debug = new DebugRenderer(uiLayer)
debug.circle(x, y, radius, 0x00ffff)
debug.rect(x, y, w, h, 0xff0000)
debug.updateStats({
  fps: 60, tick: 100, entityCount: 5,
  playerState: 'moving', playerHP: 5, playerMaxHP: 5,
  playerX: 400, playerY: 300, playerVx: 200, playerVy: 0,
  enemyCount: 7, enemyStates: 'CHS:5 TEL:1 REC:1',
  activeProjectiles: 12,
  waveNumber: 1, waveStatus: 'active',
  fodderAlive: 8, threatAlive: 1, fodderBudgetLeft: 6,
  cameraX: 412, cameraY: 310, cameraTrauma: 0,
})
```

**SpriteRegistry** - Entity to display object mapping:
```typescript
import { SpriteRegistry } from './render'

const registry = new SpriteRegistry(entityLayer)
registry.createCircle(entityId, 16, 0x00ffff)
registry.setPosition(entityId, x, y)
registry.remove(entityId)
```

**PlayerRenderer** - Player entity rendering with interpolation and state feedback:
```typescript
import { PlayerRenderer } from './render'

const playerRenderer = new PlayerRenderer(spriteRegistry)
playerRenderer.sync(world)        // Create/remove sprites
playerRenderer.render(world, alpha) // Update positions, colors, alpha
```

Visual feedback:
- Normal: Cyan, opaque
- Rolling (i-frames): White, semi-transparent (50%)
- Rolling (recovery): White, opaque
- Damage flash: Red tint when i-frames active

**BulletRenderer** - Bullet entity rendering with interpolation:
```typescript
import { BulletRenderer } from './render'

const bulletRenderer = new BulletRenderer(spriteRegistry)
bulletRenderer.sync(world)         // Create/remove sprites
bulletRenderer.render(world, alpha) // Interpolate positions
bulletRenderer.count               // Current bullet count
```

Visual feedback:
- Player bullets: Default white
- Enemy bullets: Orange-red tint (0xff6633)

**EnemyRenderer** - Enemy entity rendering with AI state visuals:
```typescript
import { EnemyRenderer } from './render'

const enemyRenderer = new EnemyRenderer(spriteRegistry, debugRenderer)
const deathTrauma = enemyRenderer.sync(world)  // Create/remove sprites, returns death trauma
enemyRenderer.render(world, alpha)              // Interpolate positions + AI state visuals
enemyRenderer.count                             // Current enemy count
```

Enemy type colors:
- Swarmer: Pale pink (0xffaaaa)
- Grunt: Red-orange (0xff6633)
- Shooter: Purple (0xaa44dd)
- Charger: Dark red (0xaa1111)

AI state visuals:
- Telegraph: White flash (alternates every 3 ticks)
- Recovery: Dimmed (60% alpha)
- Spawn ghost: Fade-in during initialDelay (50% → 100% alpha, composes with state alpha). Enemies stay idle at spawn position during this period before chasing.
- Threat tier (Shooter, Charger): Yellow outline ring via DebugRenderer
- Damage flash: Brief red tint (0.1s) when enemy takes damage
- Charger telegraph: Position vibration (jitter) during wind-up
- Charger attack: Squash/stretch in charge direction (1.4x × 0.7x)
- Shooter telegraph: Red aim line toward player target (via DebugRenderer)
- Death effect: Ephemeral scale-down + fade over 0.15s on enemy death

**TilemapRenderer** - Tilemap rendering (debug rectangles):
```typescript
import { TilemapRenderer } from './render'

const tilemapRenderer = new TilemapRenderer(backgroundLayer)
tilemapRenderer.render(tilemap)  // Render once (cached)
```

**CollisionDebugRenderer** - Collision visualization:
```typescript
import { CollisionDebugRenderer } from './render'

const collisionDebug = new CollisionDebugRenderer(uiLayer)
collisionDebug.toggle()  // Toggle visibility
collisionDebug.drawCollider(x, y, radius, color)
collisionDebug.drawTileHighlight(tileX, tileY, tileSize, color)
```

### `scenes/` - Game Scenes

**GameScene** - Owns all game state, systems, and renderers:
```typescript
import { GameScene } from './scenes'

const scene = await GameScene.create({ gameApp })
// In game loop:
scene.update(dt)              // Fixed 60Hz sim tick
scene.render(alpha, fps)      // Variable-rate rendering
// On cleanup:
scene.destroy()
```

GameScene encapsulates Input, Camera, HitStop, ECS world, systems, and all renderers.
`Game.tsx` creates GameApp and GameLoop, then delegates all game logic to GameScene.
Starts a `STAGE_1_ENCOUNTER` on creation (4-wave escalating enemy encounter via Director-Wave spawner).

Camera juice:
- Player damage: 0.15 trauma + 0.05s hit stop + directional kick (magnitude 4, toward damage source)
- Fodder death: 0.02 trauma
- Threat death: 0.08 trauma
- Player fire: 0.08 trauma + directional kick (magnitude 3)

## Directory Structure

```
src/
  main.tsx           # React entry point
  App.tsx            # Root component with router
  index.css          # Global styles
  pages/
    Home.tsx         # Landing page
    Game.tsx         # Game page — creates GameApp, GameScene, GameLoop
  engine/
    GameApp.ts       # PixiJS application wrapper
    GameLoop.ts      # Fixed timestep game loop
    Input.ts         # Keyboard/mouse input
    Camera.ts        # Aim-offset follow camera with smoothing and bounds
    ScreenShake.ts   # Trauma-based screen shake with Perlin noise
    CameraKick.ts    # Directional recoil offset
    HitStop.ts       # Frame freeze effect
    noise.ts         # 1D Perlin noise for shake
    index.ts
  render/
    DebugRenderer.ts    # Debug shapes and stats overlay (player/camera/enemy AI telemetry)
    SpriteRegistry.ts   # Entity sprite management
    PlayerRenderer.ts   # Player entity rendering with damage flash
    BulletRenderer.ts   # Bullet entity rendering
    EnemyRenderer.ts    # Enemy entity rendering (colored circles, AI state visuals, threat outlines)
    TilemapRenderer.ts  # Tilemap and collision debug rendering
    index.ts
  scenes/
    GameScene.ts     # Game scene — owns all game state, systems, renderers
    index.ts
  assets/            # Asset loading and spritesheets
  net/               # (future) Networking, prediction
  ui/                # (future) In-game HUD components
```

## Controls

- **WASD / Arrow Keys** - Move
- **Mouse** - Aim
- **Left Click** - Shoot
- **Space / Left Shift** - Roll
- **Backtick (`)** - Toggle debug overlay

## Entry Point

`src/main.tsx` renders the React app. The `App.tsx` component sets up routing between pages. The `Game.tsx` page handles asset loading, creates `GameApp` and `GameLoop`, and delegates all game logic to `GameScene`.
