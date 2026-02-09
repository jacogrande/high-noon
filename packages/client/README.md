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
- `/play` - Single-player game page with PixiJS canvas
- `/play-multi` - Multiplayer game page (connects to Colyseus server)

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
- `colyseus.js` - Multiplayer client SDK
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

const playerRenderer = new PlayerRenderer(entityLayer)
playerRenderer.sync(world)                 // Create/remove sprites
playerRenderer.render(world, alpha, realDt) // Update positions, animation, effects
playerRenderer.localPlayerEid = eid        // Set for multiplayer (remote players get blue tint)
playerRenderer.getPlayerEntity()           // Returns localPlayerEid ?? first player
```

Visual feedback:
- Normal: Full opacity
- Rolling (i-frames): Semi-transparent (50%)
- Damage flash: Red tint flicker when i-frames active
- Remote player (multiplayer): Blue tint (0x88BBFF)
- Death: Per-entity one-shot death animation

**BulletRenderer** - Bullet entity rendering with interpolation:
```typescript
import { BulletRenderer } from './render'

const bulletRenderer = new BulletRenderer(spriteRegistry)
bulletRenderer.sync(world)           // Create/remove sprites, populates removedPositions
bulletRenderer.render(world, alpha)  // Interpolate positions
bulletRenderer.count                 // Current bullet count
bulletRenderer.removedPositions      // Positions of player bullets removed this tick
```

Visual feedback:
- Player bullets: Default white
- Enemy bullets: Orange-red tint (0xff6633)

**EnemyRenderer** - Enemy entity rendering with AI state visuals:
```typescript
import { EnemyRenderer } from './render'

const enemyRenderer = new EnemyRenderer(spriteRegistry, debugRenderer)
const result = enemyRenderer.sync(world)  // Returns EnemySyncResult (consume immediately)
// result.deathTrauma — accumulated trauma for camera shake
// result.deaths — per-death {x, y, color, isThreat} for particles
// result.hits — per-hit {x, y, color} for impact particles
enemyRenderer.render(world, alpha)        // Interpolate positions + AI state visuals
enemyRenderer.count                       // Current enemy count
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

### `fx/` - Particle Effects

**ParticlePool** - Pre-allocated sprite pool with SoA data layout:
```typescript
import { ParticlePool } from './fx'

const particles = new ParticlePool(fxLayer)  // 512 pre-allocated Texture.WHITE sprites
particles.emit({ x, y, vx, vy, life, startScale, endScale, startAlpha, endAlpha, tint })
particles.update(dt)    // Advance active particles, recycle expired (call in render loop)
particles.destroy()
```

Pool exhaustion silently drops new emissions (no crash). Swap-remove for O(1) recycle.

**Emitter presets** - Game-specific emission functions:
```typescript
import { emitMuzzleFlash, emitDeathBurst, emitWallImpact, emitEntityImpact, emitLevelUpSparkle } from './fx'

emitMuzzleFlash(pool, x, y, aimAngle)           // 3-5 yellow particles, ±35° spread
emitDeathBurst(pool, x, y, color, isThreat)     // 8-12 (fodder) or 15-20 (threat) colored burst
emitWallImpact(pool, x, y)                      // 4-6 grey particles, full circle
emitEntityImpact(pool, x, y, color)             // 3-5 enemy-colored particles on hit
emitLevelUpSparkle(pool, x, y)                  // 12-16 gold particles, upward bias
```

Uses `Math.random()` for visual randomness (client-only, not deterministic sim).

### `net/` - Networking

**NetworkClient** - Colyseus connection wrapper:
```typescript
import { NetworkClient } from './net'

const net = new NetworkClient()
net.on('game-config', (config) => { /* server assigned player EID */ })
net.on('snapshot', (snapshot) => { /* decoded WorldSnapshot */ })
net.on('disconnect', () => { /* handle disconnect */ })
net.on('pong', (clientTime, serverTime) => { /* clock sync */ })
await net.join()
net.sendInput(networkInput)  // NetworkInput (InputState + seq)
net.sendPing(clientTime)     // Clock sync ping
net.disconnect()             // clears room and listeners
```

**ClockSync** - Client-server time synchronization (Cristian's algorithm):
```typescript
import { ClockSync } from './net'

const clockSync = new ClockSync()
clockSync.start((clientTime) => net.sendPing(clientTime))
clockSync.onPong(clientTime, serverTime)
clockSync.getServerTime()  // performance.now() + offset
clockSync.getRTT()         // Latest RTT estimate
clockSync.stop()
```

**SnapshotBuffer** - Interpolation buffer for smooth rendering between 20Hz snapshots:
```typescript
import { SnapshotBuffer } from './net'

const buffer = new SnapshotBuffer(100)  // 100ms interpolation delay
buffer.push(snapshot)
const interp = buffer.getInterpolationState()  // { from, to, alpha }
```

**InputBuffer** - Pending input buffer for client-side prediction/reconciliation:
```typescript
import { InputBuffer } from './net'

const buffer = new InputBuffer(128)     // 128 entries (~2s at 60Hz)
buffer.push(networkInput)               // Store input for replay
buffer.acknowledgeUpTo(lastProcessedSeq) // Remove acknowledged inputs
buffer.getPending()                     // Unacknowledged inputs for replay
buffer.clear()
```

### `scenes/` - Game Scenes

**GameScene** - Single-player scene, owns all game state, systems, and renderers:
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

**MultiplayerGameScene** - Multiplayer scene with client-side prediction:
```typescript
import { MultiplayerGameScene } from './scenes'

const scene = await MultiplayerGameScene.create(gameApp)
await scene.connect()           // Join server, receive game-config
scene.update(dt)                // Capture input, send to server, step prediction
scene.render(alpha, fps)        // Interpolate remote snapshots + render
scene.getHUDState()             // HUD data for React overlay
scene.destroy()                 // Disconnect + cleanup
```

Uses a shadow ECS world with hybrid prediction/interpolation. The local player is driven by client-side prediction (movement, roll, collision systems) for immediate responsiveness. Remote entities are populated from server snapshots via interpolation. Server EID → client EID mapping handles entity lifecycle.

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
    Home.tsx              # Landing page
    Game.tsx              # Single-player game page
    MultiplayerGame.tsx   # Multiplayer game page (connects to server)
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
  audio/
    SoundManager.ts     # Howler.js wrapper for audio playback
    sounds.ts           # Sound path/volume definitions
    index.ts
  fx/
    ParticlePool.ts     # Pre-allocated sprite pool with SoA data
    emitters.ts         # 5 emitter preset functions
    index.ts
  render/
    DebugRenderer.ts    # Debug shapes and stats overlay (player/camera/enemy AI telemetry)
    SpriteRegistry.ts   # Entity sprite management
    PlayerRenderer.ts   # Player entity rendering with damage flash
    BulletRenderer.ts   # Bullet entity rendering, tracks removed player bullet positions
    EnemyRenderer.ts    # Enemy entity rendering (colored circles, AI state visuals, threat outlines)
    TilemapRenderer.ts  # Tilemap and collision debug rendering
    index.ts
  scenes/
    GameScene.ts              # Single-player game scene
    MultiplayerGameScene.ts   # Multiplayer scene with client-side prediction
    index.ts
  assets/            # Asset loading and spritesheets
  net/
    ClockSync.ts        # Client-server time synchronization
    InputBuffer.ts      # Pending input buffer for reconciliation
    NetworkClient.ts    # Colyseus connection wrapper
    SnapshotBuffer.ts   # Snapshot interpolation buffer
  ui/                # In-game HUD components
```

## Controls

- **WASD / Arrow Keys** - Move
- **Mouse** - Aim
- **Left Click** - Shoot
- **Space / Left Shift** - Roll
- **Backtick (`)** - Toggle debug overlay

## Entry Point

`src/main.tsx` renders the React app. The `App.tsx` component sets up routing between pages. The `Game.tsx` page handles asset loading for single-player, while `MultiplayerGame.tsx` handles asset loading + server connection for multiplayer. Both create `GameApp` and `GameLoop`, delegating to their respective scene classes.
