# Sprint 1: Singleplayer Demo

## Goal

Create a playable singleplayer demo where a player can:
- Move in 8 directions (WASD)
- Roll with i-frames
- Collide with obstacles
- Shoot bullets toward the mouse cursor

## Success Criteria

- [ ] Player moves smoothly at 60Hz fixed timestep
- [ ] Player collides with walls/obstacles and cannot pass through
- [ ] Roll provides brief invincibility and speed boost
- [ ] Bullets spawn at player position and travel toward cursor
- [ ] Tilemap renders and provides collision data
- [ ] Render loop is decoupled from simulation (interpolation works)

---

## Phase 1: Project Setup

**Goal:** Initialize the monorepo with all dependencies and build tooling.

### Tasks

#### 1.1 Initialize Bun Workspace
- Create root `package.json` with workspaces config
- Create `bunfig.toml` if needed
- Create base `tsconfig.json` with strict settings

#### 1.2 Setup Shared Package
- Create `packages/shared/package.json`
- Create `packages/shared/tsconfig.json`
- Install `bitecs` dependency
- Create barrel export `packages/shared/src/index.ts`

#### 1.3 Setup Client Package
- Create `packages/client/package.json`
- Create `packages/client/tsconfig.json`
- Install dependencies: `pixi.js`, `vite`
- Create Vite config with dev server
- Create `index.html` entry point
- Create `packages/client/src/main.ts` entry

#### 1.4 Verify Build Pipeline
- `bun install` works from root
- `bun run dev` starts Vite dev server
- Client can import from shared package
- Hot reload works

### Deliverables
- Working monorepo with shared + client packages
- Dev server running at localhost
- "Hello World" rendering in browser

### How to Test
- Run `bun run dev` and see placeholder text in browser
- Verify hot reload by changing text

---

## Phase 2: Core Infrastructure + Minimal Rendering

**Goal:** Build foundational systems AND basic visual rendering so all future phases are immediately testable.

### Tasks

#### 2.1 Math Utilities (`shared/src/math/`)
```typescript
// vec2.ts
- Vec2 type definition
- create, add, sub, scale, normalize, length, dot
- lerp, angle, fromAngle
- distance, distanceSq
```

#### 2.2 ECS Setup (`shared/src/sim/`)
```typescript
// world.ts
- createGameWorld() function
- World type export

// components.ts
- Position { x: Float32Array, y: Float32Array }
- Velocity { x: Float32Array, y: Float32Array }
- Player { id: Uint8Array }
- Collider { radius: Float32Array, layer: Uint8Array }
- Bullet { ownerId: Uint16Array, damage: Uint8Array, lifetime: Float32Array }
```

#### 2.3 Fixed Timestep (`shared/src/sim/`)
```typescript
// step.ts
- TICK_RATE constant (60)
- TICK_MS constant (1000/60)
- stepWorld(world, dt) function
- System execution order
```

#### 2.4 Input Types (`shared/src/net/`)
```typescript
// input.ts
- InputState type { buttons: number, aimAngle: number, moveX: number, moveY: number }
- Button flags (MOVE_UP, MOVE_DOWN, MOVE_LEFT, MOVE_RIGHT, SHOOT, ROLL)
- hasButton(input, flag) helper
```

#### 2.5 Game App Setup (`client/src/engine/`)
```typescript
// GameApp.ts
- Initialize PIXI.Application
- Setup render layers (background, entities, ui)
- Expose app.stage, app.ticker
```

#### 2.6 Game Loop with Fixed Timestep (`client/src/engine/`)
```typescript
// GameLoop.ts
- Accumulator pattern for fixed timestep
- Step simulation at 60Hz
- Calculate interpolation alpha
- Call render callback with alpha
```

#### 2.7 Debug Renderer (`client/src/render/`)
```typescript
// DebugRenderer.ts
- renderCircle(x, y, radius, color) using PIXI.Graphics
- renderRect(x, y, w, h, color)
- renderText(x, y, text)
- Debug overlay: FPS, tick count, entity count
```

#### 2.8 Entity Sprite Registry (`client/src/render/`)
```typescript
// SpriteRegistry.ts
- Map<entityId, PIXI.Graphics | PIXI.Sprite>
- createDebugCircle(eid, radius, color)
- removeSprite(eid)
- getSprite(eid)
```

### Deliverables
- Vec2 math utilities with tests
- ECS world creation
- Core components defined
- Input type definitions
- Game loop running at 60Hz fixed timestep
- Debug renderer can draw shapes
- FPS/tick counter visible

### How to Test
- Run `bun run dev`
- See debug overlay with FPS and tick count
- Verify tick count increments at 60/sec
- Draw a test circle to verify renderer works

---

## Phase 3: Player Movement

**Goal:** Player entity moves based on input, rendered as a colored circle.

### Tasks

#### 3.1 Player Components
```typescript
// Add to components.ts
- Speed { current: Float32Array, max: Float32Array }
- PlayerState { state: Uint8Array } // IDLE, MOVING, ROLLING, etc.
```

#### 3.2 Movement System (`shared/src/sim/systems/`)
```typescript
// movement.ts
- movementSystem(world, dt)
- Query entities with Position + Velocity
- Apply velocity * dt to position
```

#### 3.3 Player Input System
```typescript
// playerInput.ts
- playerInputSystem(world, input: InputState)
- Convert WASD to normalized velocity
- Apply to player's Velocity component
- Handle diagonal normalization
```

#### 3.4 Player Prefab
```typescript
// prefabs.ts
- spawnPlayer(world, x, y) -> entityId
- Adds all required components
- Sets initial values
```

#### 3.5 Client Input Collection (`client/src/engine/`)
```typescript
// Input.ts
- Track keyboard state (keydown/keyup)
- Track mouse position
- getInput(): InputState
- Calculate aim angle from player pos to mouse
```

#### 3.6 Player Renderer
```typescript
// render/PlayerRenderer.ts
- Render player as colored circle (e.g., cyan #00ffff)
- Circle radius matches collider
- Update position each frame with interpolation
```

### Deliverables
- Player moves with WASD
- Diagonal movement is normalized
- Movement feels responsive
- Player visible as colored circle

### How to Test
- Run `bun run dev`
- See cyan circle in center of screen
- Press WASD - circle moves in corresponding direction
- Press W+D - circle moves diagonally at same speed as cardinal

---

## Phase 4: Collision System

**Goal:** Player cannot move through walls, with visible tilemap.

### Tasks

#### 4.1 Tilemap Data Structure (`shared/src/sim/`)
```typescript
// tilemap.ts
- Tilemap type { width, height, tileSize, layers: TileLayer[] }
- TileLayer type { data: Uint8Array, solid: boolean }
- getTile(map, x, y, layer): number
- isSolid(map, worldX, worldY): boolean
```

#### 4.2 Collision Components
```typescript
// Add to components.ts
- TilemapCollider { mapId: Uint8Array } // references tilemap
- CircleCollider { radius: Float32Array }
- StaticBody {} // tag component - doesn't move
```

#### 4.3 Collision Detection (`shared/src/sim/systems/`)
```typescript
// collision.ts
- collisionSystem(world, tilemap)
- Circle vs Tilemap collision
- Circle vs Circle collision (for future enemies)
- Push-out resolution (not bounce)
```

#### 4.4 Test Tilemap
```typescript
// content/maps/testArena.ts
- Simple arena with walls around edges
- A few obstacle blocks in middle
- Export as Tilemap data
```

#### 4.5 Tilemap Debug Renderer (`client/src/render/`)
```typescript
// TilemapRenderer.ts
- Render solid tiles as gray rectangles
- Render empty tiles as darker background (or skip)
- Grid lines optional for debugging
```

#### 4.6 Collision Debug Visualization
```typescript
// Optional toggle in DebugRenderer
- Show collision boxes/circles
- Highlight tiles player is touching
```

### Deliverables
- Player stops at tilemap walls
- Player cannot pass through solid tiles
- Collision resolution feels smooth (no jitter)
- Tilemap visible as colored rectangles

### How to Test
- Run `bun run dev`
- See gray rectangles forming arena walls
- Move player into wall - player stops
- Move along wall - slides smoothly, no sticking

---

## Phase 5: Roll Mechanic

**Goal:** Player can roll for speed boost and i-frames, with visual feedback.

### Tasks

#### 5.1 Roll Components
```typescript
// Add to components.ts
- Roll {
    duration: Float32Array,      // total roll time
    elapsed: Float32Array,       // time in current roll
    iframeRatio: Float32Array,   // portion with i-frames (0.5 = first half)
    speedMultiplier: Float32Array,
    directionX: Float32Array,
    directionY: Float32Array
  }
- Invincible {} // tag component
```

#### 5.2 Roll System
```typescript
// roll.ts
- rollSystem(world, dt)
- If Roll.elapsed < Roll.duration:
  - Apply roll velocity (locked direction)
  - If elapsed < duration * iframeRatio: add Invincible tag
  - Else: remove Invincible tag
  - Increment elapsed
- If Roll.elapsed >= Roll.duration:
  - Remove Roll component
  - Restore normal state
```

#### 5.3 Roll Initiation
```typescript
// playerInput.ts (extend)
- On ROLL button + not already rolling:
  - Add Roll component
  - Set direction to current movement (or facing if stationary)
  - Set PlayerState to ROLLING
```

#### 5.4 Roll Parameters
```typescript
// content/player.ts
- ROLL_DURATION: 0.5 // seconds
- ROLL_IFRAME_RATIO: 0.6 // 60% i-frames
- ROLL_SPEED_MULTIPLIER: 2.0
- ROLL_COOLDOWN: 0 // recovery-based, not cooldown
```

#### 5.5 Roll Visual Feedback
```typescript
// Update PlayerRenderer
- Change player color during roll (e.g., white #ffffff)
- Optional: Add transparency during i-frames
- Optional: Stretch/squash effect or motion trail
```

### Deliverables
- Player rolls on spacebar
- Roll has distinct speed burst
- Roll locks movement direction
- Visual feedback shows roll state
- Different visual during i-frames vs recovery

### How to Test
- Run `bun run dev`
- Press Space while moving - player moves faster in locked direction
- Player color changes during roll
- Player color/opacity different during i-frame portion
- Cannot change direction mid-roll
- Roll ends and normal movement resumes

---

## Phase 6: Shooting

**Goal:** Player shoots bullets toward mouse cursor, bullets visible.

### Tasks

#### 6.1 Bullet Components
```typescript
// Extended from Phase 2:
- Bullet { ownerId, damage, lifetime, range, distanceTraveled }
- Position, Velocity, Collider
```

#### 6.2 Weapon Components
```typescript
// Add to components.ts
- Weapon {
    fireRate: Float32Array,      // shots per second
    bulletSpeed: Float32Array,
    bulletDamage: Uint8Array,
    cooldown: Float32Array,      // time until can fire again
    range: Float32Array          // bullet range in pixels
  }
```

#### 6.3 Weapon System
```typescript
// weapon.ts
- weaponSystem(world, dt, input: InputState)
- Query entities with Weapon + Position + Player
- Decrement cooldown by dt
- If SHOOT button and cooldown <= 0:
  - Spawn bullet at player position
  - Set bullet velocity toward aim angle
  - Reset cooldown
```

#### 6.4 Bullet System
```typescript
// bullet.ts
- bulletSystem(world, dt)
- Query bullets
- Track distance traveled each tick
- Decrement lifetime
- Remove bullets when: distanceTraveled >= range OR lifetime <= 0
- (Collision damage handled later with enemies)
```

#### 6.5 Bullet Prefab
```typescript
// prefabs.ts
- spawnBullet(world, { x, y, vx, vy, damage, range, ownerId }) -> entityId
```

#### 6.6 Bullet Renderer
```typescript
// render/BulletRenderer.ts
- Render bullets as small yellow circles
- Sync with bullet entities (create/destroy sprites)
- Update positions with interpolation
```

#### 6.7 Aim Indicator
```typescript
// Optional: render/AimIndicator.ts
- Line or dot showing aim direction
- Helps verify mouse tracking works
```

### Deliverables
- Click to shoot bullets
- Bullets travel toward cursor
- Bullets despawn after lifetime
- Fire rate limits shooting speed
- Bullets visible as small circles

### How to Test
- Run `bun run dev`
- Click mouse - yellow circle spawns and moves toward cursor
- Hold mouse - bullets spawn at fire rate interval
- Bullets disappear after traveling some distance
- Move mouse - bullets go to new aim position

---

## Phase 7: Visual Polish

**Goal:** Replace debug shapes with proper sprites and animations.

### Tasks

#### 7.1 Asset Loading (`client/src/assets/`)
```typescript
// AssetLoader.ts
- Load tileset spritesheet
- Load player spritesheet
- Load bullet sprite
- Loading screen while loading
- Export asset handles/textures
```

#### 7.2 Tilemap Sprite Renderer
```typescript
// Update TilemapRenderer.ts
- Replace colored rectangles with tileset sprites
- Support multiple tile types (floor, wall variants)
```

#### 7.3 Player Sprite & Animation
```typescript
// Update PlayerRenderer.ts
- Replace circle with player sprite
- Animate based on PlayerState (idle, walk, roll)
- Face toward aim direction (8 directions or smooth rotation)
- Roll animation
```

#### 7.4 Bullet Sprites
```typescript
// Update BulletRenderer.ts
- Replace circle with bullet sprite
- Optional: rotation to face travel direction
- Optional: simple trail effect
```

#### 7.5 Interpolation Polish
```typescript
// Verify smooth movement
- Ensure all renderers use interpolation alpha
- No visual jitter at any framerate
- Test at 30fps, 60fps, 144fps
```

### Deliverables
- Tilemap renders with sprites
- Player has animated sprite
- Bullets have sprites
- Smooth interpolated movement at any framerate

### How to Test
- Run `bun run dev`
- Tilemap shows actual tile graphics instead of colored rectangles
- Player shows sprite that animates when moving
- Player faces mouse direction
- Bullets show as sprites
- Movement is silky smooth

---

## Phase 8: Camera System

**Goal:** Implement a full camera system with aim-offset follow, screen shake, camera kick, and hit stop. See `docs/mechanics/camera-design.md` for design rationale and references.

### Tasks

#### 8.1 Camera Core (`client/src/engine/Camera.ts`)
```typescript
// Camera.ts
- CameraState type { x, y, prevX, prevY }
- Camera class with update(playerPos, aimAngle, dt) and getRenderPosition(alpha)
- Store previous/current state for interpolation
- Frame-rate independent exponential decay smoothing (lambda ~12)
```

#### 8.2 Aim-Offset Follow
```typescript
// Camera.ts (extend)
- Compute target as weighted point between player and cursor
- aimWeight parameter (default 0.20, range 0.10-0.35)
- maxAimOffset clamp (default 120px) to prevent player leaving screen
- Smooth toward target using damp(current, target, lambda, dt)
```

#### 8.3 Room Boundary Clamping
```typescript
// Camera.ts (extend)
- Clamp camera so viewport never shows outside tilemap bounds
- Handle rooms smaller than viewport (center on that axis)
- Apply clamping after aim-offset, before storing state
```

#### 8.4 Screen Shake (`client/src/engine/ScreenShake.ts`)
```typescript
// ScreenShake.ts
- Trauma-based system: trauma float (0-1), squared for intensity
- Perlin noise offset (translation + rotation)
- addTrauma(amount) method
- update(dt) with configurable recoveryRate (~1.5/s)
- getOffset(): { x, y, angle }
- Parameters: maxTranslation (8px), maxRotation (3°), frequency (25)
```

#### 8.5 Camera Kick (`client/src/engine/CameraKick.ts`)
```typescript
// CameraKick.ts
- Directional recoil offset opposite to fire direction
- kick(directionX, directionY, magnitude) method
- Exponential decay per frame (decay ~0.85)
- Clamp max accumulated kick
- getOffset(): { x, y }
```

#### 8.6 Hit Stop (`client/src/engine/HitStop.ts`)
```typescript
// HitStop.ts
- freeze(durationFrames) method
- update(dt): returns timeScale (0 during freeze, 1 otherwise)
- Game loop multiplies simulation dt by timeScale
- Input still collected during freeze
- Camera shake/kick continue during freeze (use real dt)
```

#### 8.7 Camera Integration in Game Loop
```typescript
// Update Game.tsx
- Create Camera, ScreenShake, CameraKick, HitStop instances
- Simulation tick: update camera target, apply smoothing, clamp bounds
- Render frame: interpolate camera, add shake + kick offsets, round to pixels
- Apply final position to PixiJS world container transform
- Wire shake triggers: weapon fire, bullet-wall hit
- Wire kick triggers: weapon fire direction
```

#### 8.8 Accessibility Options
```typescript
// Expose tuning parameters
- Screen shake intensity multiplier (0-100%)
- Camera kick toggle
- Hit stop toggle
- Aim offset intensity (0-100%)
- Consider a "reduced motion" master toggle
```

### Deliverables
- Camera follows player with aim-offset toward cursor
- Camera smoothly tracks without jitter or lag
- Screen shakes on weapon fire and impacts
- Camera kicks back on shots
- Brief freeze frames on kills (when enemies exist)
- Camera never shows outside tilemap bounds
- Pixel-perfect final positioning (no sprite shimmer)
- Accessibility toggles for motion-sensitive players

### How to Test
- Run `bun run dev`
- Move mouse - camera shifts subtly toward cursor
- Walk to arena edges - camera stops at tilemap boundary
- Fire weapon - camera shakes and kicks away from shot direction
- Shake and kick feel proportional (pistol light, shotgun heavy)
- Movement remains smooth at 30fps, 60fps, 144fps
- Verify no sub-pixel jitter on tilemap sprites

---

## Phase 9: Integration & Polish

**Goal:** Wire everything together into playable demo.

### Tasks

#### 9.1 Scene Structure
```typescript
// scenes/GameScene.ts
- Initialize world, tilemap, player
- Game loop: input -> simulate -> render
- Handle window resize
- Clean separation of concerns
```

#### 9.2 Debug Overlay Formalization
```typescript
// ui/DebugOverlay.ts
- Toggle with backtick key
- Show FPS, tick rate, entity count
- Toggle collision visualization
- Show player state, position, velocity
- Show camera state (target, offset, trauma)
```

#### 9.3 Basic Audio (Optional)
```typescript
// Audio.ts
- Shoot sound effect
- Roll sound effect
- Movement footsteps (optional)
```

#### 9.4 Final Polish
- Verify all success criteria met
- Test edge cases (rapid input, window resize, alt-tab)
- Performance check (steady 60fps)
- Verify camera + sprites + interpolation work together

### Deliverables
- Complete playable demo
- No major bugs
- Smooth 60fps gameplay
- Debug tools for development
- Camera follows player with full juice

### How to Test
- Play the game for several minutes
- Try to break it with rapid inputs
- Resize window - game adapts
- Toggle debug overlay with backtick
- All movement, collision, roll, shooting, camera works together

---

## Task Checklist

### Phase 1: Project Setup
- [x] 1.1 Initialize Bun Workspace
- [x] 1.2 Setup Shared Package
- [x] 1.3 Setup Client Package
- [x] 1.4 Verify Build Pipeline

### Phase 2: Core Infrastructure + Minimal Rendering
- [x] 2.1 Math Utilities
- [x] 2.2 ECS Setup
- [x] 2.3 Fixed Timestep
- [x] 2.4 Input Types
- [x] 2.5 Game App Setup
- [x] 2.6 Game Loop with Fixed Timestep
- [x] 2.7 Debug Renderer
- [x] 2.8 Entity Sprite Registry

### Phase 3: Player Movement
- [x] 3.1 Player Components
- [x] 3.2 Movement System
- [x] 3.3 Player Input System
- [x] 3.4 Player Prefab
- [x] 3.5 Client Input Collection
- [x] 3.6 Player Renderer

### Phase 4: Collision System
- [x] 4.1 Tilemap Data Structure
- [x] 4.2 Collision Components
- [x] 4.3 Collision Detection
- [x] 4.4 Test Tilemap
- [x] 4.5 Tilemap Debug Renderer
- [x] 4.6 Collision Debug Visualization

### Phase 5: Roll Mechanic
- [x] 5.1 Roll Components
- [x] 5.2 Roll System
- [x] 5.3 Roll Initiation
- [x] 5.4 Roll Parameters
- [x] 5.5 Roll Visual Feedback

### Phase 6: Shooting
- [x] 6.1 Bullet Components
- [x] 6.2 Weapon Components
- [x] 6.3 Weapon System
- [x] 6.4 Bullet System
- [x] 6.5 Bullet Prefab
- [x] 6.6 Bullet Renderer
- [ ] 6.7 Aim Indicator (optional)

### Phase 7: Visual Polish
- [x] 7.1 Asset Loading
- [x] 7.2 Tilemap Sprite Renderer
- [x] 7.3 Player Sprite & Animation
- [x] 7.4 Bullet Sprites
- [ ] 7.5 Interpolation Polish

### Phase 8: Camera System
- [x] 8.1 Camera Core
- [x] 8.2 Aim-Offset Follow
- [x] 8.3 Room Boundary Clamping
- [x] 8.4 Screen Shake
- [x] 8.5 Camera Kick
- [x] 8.6 Hit Stop
- [x] 8.7 Camera Integration in Game Loop
- [ ] 8.8 Accessibility Options (fields exist but no settings UI yet)

### Phase 9: Integration & Polish
- [ ] 9.1 Scene Structure
- [ ] 9.2 Debug Overlay Formalization
- [ ] 9.3 Basic Audio (Optional)
- [ ] 9.4 Final Polish

---

## File Structure After Sprint

```
packages/
  shared/
    src/
      index.ts
      math/
        vec2.ts
        index.ts
      sim/
        world.ts
        components.ts
        step.ts
        prefabs.ts
        tilemap.ts
        systems/
          movement.ts
          collision.ts
          roll.ts
          weapon.ts
          bullet.ts
          playerInput.ts
          index.ts
        content/
          player.ts
          maps/
            testArena.ts
      net/
        input.ts
        index.ts

  client/
    src/
      main.tsx
      App.tsx
      pages/
        Home.tsx
        Game.tsx
      engine/
        GameApp.ts
        GameLoop.ts
        Input.ts
        Camera.ts
        ScreenShake.ts
        CameraKick.ts
        HitStop.ts
      render/
        SpriteRegistry.ts
        DebugRenderer.ts
        TilemapRenderer.ts
        PlayerRenderer.ts
        BulletRenderer.ts
        AimIndicator.ts
      scenes/
        GameScene.ts
      ui/
        DebugOverlay.ts
      assets/
        AssetLoader.ts
```

---

## Dependencies Between Phases

```
Phase 1 (Setup)
    │
    ▼
Phase 2 (Core + Minimal Rendering)
    │
    ▼
Phase 3 (Movement + Player Circle)
    │
    ▼
Phase 4 (Collision + Tilemap Rectangles)
    │
    ▼
Phase 5 (Roll + Color Feedback)
    │
    ▼
Phase 6 (Shooting + Bullet Circles)
    │
    ▼
Phase 7 (Visual Polish - Sprites)
    │
    ▼
Phase 8 (Camera System)
    │
    ▼
Phase 9 (Integration & Polish)
```

Each phase builds on the previous and is independently testable. No phase requires "faith" - you can always see what's happening.

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Tilemap collision edge cases | Medium | Start simple (AABB), add corner handling |
| Spritesheet animation complexity | Low | Debug shapes work first, sprites are polish |
| Fixed timestep jitter | High | Follow Gaffer on Games pattern exactly |
| bitECS learning curve | Medium | Refer to docs/guides/bitecs.md |
| Camera smoothing frame-rate dependence | High | Use exponential decay with dt, not per-frame lerp |
| Screen shake feels nauseating | Medium | Perlin noise (not random), accessibility toggles |
| Camera + interpolation interaction | Medium | Update camera in sim tick, interpolate at render |

---

## Out of Scope (Future Sprints)

- Enemies and AI
- Damage system
- Health and death
- Upgrades/items
- Jump mechanic (z-axis)
- Multiplayer/networking
- Sound design
- Particle effects
- UI beyond debug
