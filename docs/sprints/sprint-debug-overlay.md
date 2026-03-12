# Sprint: Visual Debug Overlay System

**Goal**: Build a layered visual debug overlay that draws entity collision radii, AI detection ranges, AI state labels, spawn zone boundaries, and playable bounds directly in world space. Each overlay layer toggles independently via hotkeys, runs at render rate with interpolation, and is stripped from production builds via a Vite `__DEV__` flag.

**Depends on**: Current main (DebugRenderer, CollisionDebugRenderer, SceneDebugHotkeys, RendererBundle, Camera, ECS components)

---

## Current State

**What exists:**
- `DebugRenderer` (`packages/client/src/render/DebugRenderer.ts`) — stats text overlay on the UI layer + a `Graphics` container added to the entity layer for world-space shapes. Has `circle()`, `circleOutline()`, `rectOutline()`, `line()` helpers. Cleared and redrawn each frame. Toggled via backtick hotkey.
- `CollisionDebugRenderer` (`packages/client/src/render/TilemapRenderer.ts`, line ~376) — has `drawCollider(x, y, radius, color)` and `drawTileHighlight()` methods, but nothing calls `drawCollider()` with ECS entity data. Lives on the UI layer (screen space), not world space. Toggled together with `DebugRenderer` via backtick.
- `SceneDebugHotkeys` (`packages/client/src/scenes/core/SceneDebugHotkeys.ts`) — `SceneDebugHotkeyActions` interface with `toggleDebugOverlay`, `toggleCollisionDebugOverlay`, `toggleSpawnPause`, `cycleNetOverlay`, `recordLagReport`, `exportReplay`. The handler fires both toggles together on backtick.
- `EnemyRenderer` already draws threat-tier outline rings, shooter telegraph aim lines, and armored bandit arc indicators through the `DebugRenderer` — these are debug-only visuals gated on `this.debug` being present.
- `RendererBundle` constructs both `DebugRenderer` (on `layers.ui`) and `CollisionDebugRenderer` (on `layers.ui`).
- `GameApp` layer system: `background`, `tiles`, `entities`, `fx`, `ui`. The `worldContainer` holds background through fx; `ui` is screen-space.
- `SingleplayerModeController` adds `debugRenderer.getContainer()` to `layers.entities` (world space) and wires backtick hotkey to toggle both debug renderers simultaneously.
- ECS components in shared: `Position` (x, y, prevX, prevY), `Collider` (radius), `Enemy`, `EnemyAI` (state, stateTimer, targetEid, initialDelay), `Detection` (aggroRange, attackRange, losRequired), `Health`, `Player`.
- `getPlayableBoundsFromTilemap(map)` returns `{minX, minY, maxX, maxY}` — one tile inset from edges.
- `getSpawnBounds()` in `waveSpawner.ts` calls `getPlayableBoundsFromTilemap` internally (module-scoped cache).

**What doesn't exist:**
- Per-entity collision radius visualization from ECS data
- AI detection range visualization (aggro range, attack range circles)
- AI state text labels in world space
- Spawn zone / playable bounds rectangle visualization
- Independent per-layer toggle (all debug visuals toggle as one unit)
- A `__DEV__` build flag to strip debug overlay code from production
- A dedicated `DebugOverlayRenderer` that queries ECS and draws all debug layers

---

## Design Constraints

1. **Debug rendering is client-only** — no changes to `packages/shared`. Debug overlays are a render-layer concern, not an ECS system. They need PixiJS access and run at render rate (variable Hz), not sim rate (60Hz).

2. **World-space rendering** — debug shapes must be children of the `worldContainer` (or added to `layers.entities`) so they transform with the camera automatically. No manual screen-to-world conversion needed.

3. **Interpolated positions** — use `Position.prevX/prevY` + alpha interpolation for smooth debug shapes that match entity rendering: `renderX = prevX + (x - prevX) * alpha`.

4. **`__DEV__` flag for tree-shaking** — add `define: { __DEV__: ... }` to Vite config only. Do NOT use in `packages/shared` (built with tsc, not Vite). Wrap debug overlay construction and hotkey wiring in `if (__DEV__) { ... }` blocks so the minifier eliminates dead code in production.

5. **Independent layer toggles** — each debug layer (colliders, AI ranges, spawn zones, stats overlay) should toggle independently. Number keys 1-4 when debug mode is active. Backtick still toggles the master switch.

6. **Performance: clear+redraw** — start with `graphics.clear()` + full redraw each frame. For 50-100 entities this is negligible. Pool Graphics objects or share GraphicsContext only if profiling shows problems.

7. **bitECS queries at module level** — `defineQuery([Position, Collider])` must be defined at module scope per bitECS conventions. The query function is called each frame with the world.

8. **Existing EnemyRenderer debug visuals stay** — the threat outlines, telegraph lines, and armor arcs already drawn through `DebugRenderer` remain as-is. The new overlay system adds entity-agnostic layers on top.

---

## Epic Overview

| # | Epic | Package(s) | Priority | Estimate |
|---|------|-----------|----------|----------|
| 1 | Vite `__DEV__` build flag setup | client | P0 | Small |
| 2 | Entity collision radii overlay | client | P0 | Medium |
| 3 | AI state + detection range overlay | client | P0 | Medium |
| 4 | Spawn zone / playable bounds visualization | client | P1 | Small |
| 5 | Independent toggle system | client | P0 | Small |

---

## Epic 1: Vite `__DEV__` Build Flag Setup

Add a compile-time `__DEV__` boolean that is `true` in development and `false` in production. Vite's `define` option injects it as a global constant; the minifier eliminates dead `if (__DEV__)` branches.

### Ticket 1.1 — Add `__DEV__` define to vite.config.ts

**File**: `packages/client/vite.config.ts`

Add to the config object:

```typescript
export default defineConfig({
  // ... existing config ...
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
  },
})
```

In dev mode (`bun run dev`), `__DEV__` is `true`. In production builds (`bun run build`), Vite sets `NODE_ENV=production`, so `__DEV__` is `false` and all guarded code is eliminated by the minifier.

### Ticket 1.2 — Add TypeScript declaration for `__DEV__`

**File**: `packages/client/src/env.d.ts` (new or append to existing)

```typescript
declare const __DEV__: boolean
```

This prevents TypeScript errors when referencing `__DEV__` in client code.

### Ticket 1.3 — Verify tree-shaking

After both changes, run `bun run build` and inspect the output bundle. Search for a unique string (e.g., `"DEBUG_OVERLAY_MARKER"`) placed inside an `if (__DEV__)` block — it should not appear in the production bundle.

---

## Epic 2: Entity Collision Radii Overlay

Query all entities with `[Position, Collider]` and draw their collision circles in world space. Color-code by entity type: green for player, red for enemies, yellow for bullets.

### Ticket 2.1 — Create `DebugOverlayRenderer`

**File**: `packages/client/src/render/DebugOverlayRenderer.ts` (new)

Create a new class that owns a dedicated `Graphics` object on the entity layer:

```typescript
import { defineQuery, hasComponent } from 'bitecs'
import { Graphics, Text, TextStyle, type Container } from 'pixi.js'
import type { GameWorld } from '@high-noon/shared'
import {
  Position, Collider, Enemy, EnemyAI, AIState, Detection, Player, Bullet, Health,
} from '@high-noon/shared'

const colliderQuery = defineQuery([Position, Collider])
const aiQuery = defineQuery([Enemy, EnemyAI, Detection, Position])

/** Which debug overlay layers are currently active */
export interface DebugOverlayState {
  colliders: boolean
  aiRanges: boolean
  spawnZones: boolean
}

export class DebugOverlayRenderer {
  private readonly graphics: Graphics
  private readonly textContainer: Container
  private readonly state: DebugOverlayState = {
    colliders: false,
    aiRanges: false,
    spawnZones: false,
  }
  private playableBounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null
  // Pool of text labels for AI state display
  private readonly aiLabels: Text[] = []
  private aiLabelIndex = 0

  constructor(worldLayer: Container) {
    this.graphics = new Graphics()
    this.graphics.visible = false
    worldLayer.addChild(this.graphics)

    this.textContainer = new Container()
    this.textContainer.visible = false
    worldLayer.addChild(this.textContainer)
  }
  // ... methods defined in subsequent tickets
}
```

**Rationale**: A dedicated class keeps debug overlay logic out of the existing `DebugRenderer` (which owns the stats text overlay) and out of `CollisionDebugRenderer` (which is screen-space, not world-space). The new renderer lives in world space alongside entities and transforms with the camera.

### Ticket 2.2 — Implement `renderColliders()`

**File**: `packages/client/src/render/DebugOverlayRenderer.ts`

```typescript
renderColliders(world: GameWorld, alpha: number): void {
  if (!this.state.colliders) return

  const entities = colliderQuery(world)
  for (const eid of entities) {
    const prevX = Position.prevX[eid]!
    const prevY = Position.prevY[eid]!
    const currX = Position.x[eid]!
    const currY = Position.y[eid]!
    const x = prevX + (currX - prevX) * alpha
    const y = prevY + (currY - prevY) * alpha
    const radius = Collider.radius[eid]!

    // Color by entity type
    let color = 0x00ff00 // default green
    if (hasComponent(world, Enemy, eid)) {
      color = 0xff4444 // red for enemies
    } else if (hasComponent(world, Bullet, eid)) {
      color = 0xffff00 // yellow for bullets
    } else if (hasComponent(world, Player, eid)) {
      color = 0x00ff00 // green for player
    }

    this.graphics
      .circle(x, y, radius)
      .stroke({ color, width: 1, alpha: 0.6 })
  }
}
```

**Rationale**: Using alpha interpolation matches the entity rendering path exactly, so collider circles align perfectly with sprites at any frame rate.

### Ticket 2.3 — Wire into render loop

**File**: `packages/client/src/render/DebugOverlayRenderer.ts`

Add a top-level `render()` method that clears graphics and calls each sub-renderer:

```typescript
render(world: GameWorld, alpha: number): void {
  const anyActive = this.state.colliders || this.state.aiRanges || this.state.spawnZones
  this.graphics.visible = anyActive
  this.textContainer.visible = this.state.aiRanges

  if (!anyActive) return

  this.graphics.clear()
  this.aiLabelIndex = 0

  this.renderColliders(world, alpha)
  this.renderAIRanges(world, alpha)
  this.renderSpawnZones()

  // Hide unused pooled text labels
  for (let i = this.aiLabelIndex; i < this.aiLabels.length; i++) {
    this.aiLabels[i]!.visible = false
  }
}
```

---

## Epic 3: AI State + Detection Range Overlay

Draw aggro range and attack range circles around enemies, color-coded. Show AI state labels as text above each enemy.

### Ticket 3.1 — Implement `renderAIRanges()`

**File**: `packages/client/src/render/DebugOverlayRenderer.ts`

```typescript
private static readonly AI_STATE_LABELS: Record<number, string> = {
  [AIState.IDLE]: 'IDLE',
  [AIState.CHASE]: 'CHASE',
  [AIState.TELEGRAPH]: 'TELG',
  [AIState.ATTACK]: 'ATK',
  [AIState.RECOVERY]: 'REC',
  [AIState.STUNNED]: 'STUN',
  [AIState.FLEE]: 'FLEE',
}

private static readonly AI_STATE_COLORS: Record<number, number> = {
  [AIState.IDLE]: 0x888888,
  [AIState.CHASE]: 0xff8800,
  [AIState.TELEGRAPH]: 0xff0000,
  [AIState.ATTACK]: 0xff0000,
  [AIState.RECOVERY]: 0x4488ff,
  [AIState.STUNNED]: 0xffff00,
  [AIState.FLEE]: 0x00ffff,
}

renderAIRanges(world: GameWorld, alpha: number): void {
  if (!this.state.aiRanges) return

  const enemies = aiQuery(world)
  for (const eid of enemies) {
    const prevX = Position.prevX[eid]!
    const prevY = Position.prevY[eid]!
    const currX = Position.x[eid]!
    const currY = Position.y[eid]!
    const x = prevX + (currX - prevX) * alpha
    const y = prevY + (currY - prevY) * alpha

    const aggroRange = Detection.aggroRange[eid]!
    const attackRange = Detection.attackRange[eid]!
    const aiState = EnemyAI.state[eid]!

    // Aggro range — dashed blue circle
    this.graphics
      .circle(x, y, aggroRange)
      .stroke({ color: 0x4488ff, width: 1, alpha: 0.3 })

    // Attack range — orange circle
    this.graphics
      .circle(x, y, attackRange)
      .stroke({ color: 0xff8800, width: 1, alpha: 0.4 })

    // AI state label
    const stateColor = DebugOverlayRenderer.AI_STATE_COLORS[aiState] ?? 0xffffff
    const label = this.getOrCreateLabel()
    label.text = DebugOverlayRenderer.AI_STATE_LABELS[aiState] ?? '???'
    label.style.fill = stateColor
    label.x = x
    label.y = y - Collider.radius[eid]! - 12
    label.anchor.set(0.5, 1)
    label.visible = true
  }
}
```

### Ticket 3.2 — Text label pool

**File**: `packages/client/src/render/DebugOverlayRenderer.ts`

Implement a simple label pool to avoid creating/destroying `Text` objects each frame:

```typescript
private static readonly LABEL_STYLE = new TextStyle({
  fontFamily: 'monospace',
  fontSize: 8,
  fill: '#ffffff',
  stroke: { color: '#000000', width: 1 },
})

private getOrCreateLabel(): Text {
  if (this.aiLabelIndex < this.aiLabels.length) {
    return this.aiLabels[this.aiLabelIndex++]!
  }
  const label = new Text({ text: '', style: DebugOverlayRenderer.LABEL_STYLE.clone() })
  this.textContainer.addChild(label)
  this.aiLabels.push(label)
  this.aiLabelIndex++
  return label
}
```

**Rationale**: Text objects are relatively expensive to create in PixiJS. Pooling ensures the overlay handles fluctuating enemy counts without GC spikes. The pool grows but never shrinks — acceptable since debug mode is transient.

### Ticket 3.3 — Target line

When an enemy has a valid `targetEid`, draw a thin line from the enemy to its target. This helps visualize which player an enemy is tracking:

```typescript
// Inside renderAIRanges loop
const targetEid = EnemyAI.targetEid[eid]!
if (targetEid !== 0xFFFF && hasComponent(world, Position, targetEid)) {
  const tx = Position.x[targetEid]!
  const ty = Position.y[targetEid]!
  this.graphics
    .moveTo(x, y)
    .lineTo(tx, ty)
    .stroke({ color: stateColor, width: 0.5, alpha: 0.3 })
}
```

`0xFFFF` is the `NO_TARGET` sentinel defined in shared. Import it rather than hardcoding.

---

## Epic 4: Spawn Zone / Playable Bounds Visualization

Draw the playable bounds rectangle and label it. This helps verify that spawn positions, camera bounds, and arena edges are configured correctly.

### Ticket 4.1 — Implement `renderSpawnZones()`

**File**: `packages/client/src/render/DebugOverlayRenderer.ts`

```typescript
setPlayableBounds(bounds: { minX: number; minY: number; maxX: number; maxY: number }): void {
  this.playableBounds = bounds
}

renderSpawnZones(): void {
  if (!this.state.spawnZones || !this.playableBounds) return

  const { minX, minY, maxX, maxY } = this.playableBounds
  const w = maxX - minX
  const h = maxY - minY

  // Playable bounds — green dashed rectangle
  this.graphics
    .rect(minX, minY, w, h)
    .stroke({ color: 0x00ff00, width: 1.5, alpha: 0.5 })

  // Spawn margin inset (enemies spawn outside camera but inside bounds)
  // Typical spawn margin is ~80px inside bounds edges
  const SPAWN_MARGIN = 80
  this.graphics
    .rect(minX + SPAWN_MARGIN, minY + SPAWN_MARGIN, w - SPAWN_MARGIN * 2, h - SPAWN_MARGIN * 2)
    .stroke({ color: 0xffff00, width: 1, alpha: 0.3 })

  // Arena center crosshair
  const cx = minX + w / 2
  const cy = minY + h / 2
  const crossSize = 10
  this.graphics
    .moveTo(cx - crossSize, cy).lineTo(cx + crossSize, cy)
    .stroke({ color: 0x00ff00, width: 1, alpha: 0.5 })
  this.graphics
    .moveTo(cx, cy - crossSize).lineTo(cx, cy + crossSize)
    .stroke({ color: 0x00ff00, width: 1, alpha: 0.5 })
}
```

### Ticket 4.2 — Set bounds from mode controller

**File**: `packages/client/src/scenes/core/SingleplayerModeController.ts`

After the tilemap is generated and playable bounds are computed, pass them to the debug overlay renderer:

```typescript
// In constructor or initialize(), after getPlayableBoundsFromTilemap:
if (__DEV__) {
  this.debugOverlayRenderer?.setPlayableBounds(playableBounds)
}
```

The same pattern applies to `MultiplayerModeController`.

---

## Epic 5: Independent Toggle System

Extend the hotkey system so each debug overlay layer toggles independently. Backtick remains the master switch for the stats overlay. When the stats overlay is visible, number keys 1-3 toggle individual overlay layers.

### Ticket 5.1 — Extend `SceneDebugHotkeyActions`

**File**: `packages/client/src/scenes/core/SceneDebugHotkeys.ts`

Add new optional actions:

```typescript
export interface SceneDebugHotkeyActions {
  toggleDebugOverlay: () => void
  toggleCollisionDebugOverlay?: () => void
  toggleSpawnPause?: () => void
  cycleNetOverlay?: () => void
  recordLagReport?: () => void
  exportReplay?: () => void
  // New: individual debug overlay layers
  toggleColliderOverlay?: () => void    // Digit1
  toggleAIRangeOverlay?: () => void     // Digit2
  toggleSpawnZoneOverlay?: () => void   // Digit3
}
```

### Ticket 5.2 — Add number key handlers

**File**: `packages/client/src/scenes/core/SceneDebugHotkeys.ts`

Add to `createSceneDebugHotkeyHandler`:

```typescript
if (policy.enableOverlayToggle && e.code === 'Digit1') {
  actions.toggleColliderOverlay?.()
}
if (policy.enableOverlayToggle && e.code === 'Digit2') {
  actions.toggleAIRangeOverlay?.()
}
if (policy.enableOverlayToggle && e.code === 'Digit3') {
  actions.toggleSpawnZoneOverlay?.()
}
```

### Ticket 5.3 — Add toggle methods to `DebugOverlayRenderer`

**File**: `packages/client/src/render/DebugOverlayRenderer.ts`

```typescript
toggleColliders(): void {
  this.state.colliders = !this.state.colliders
}

toggleAIRanges(): void {
  this.state.aiRanges = !this.state.aiRanges
}

toggleSpawnZones(): void {
  this.state.spawnZones = !this.state.spawnZones
}

getState(): Readonly<DebugOverlayState> {
  return this.state
}
```

### Ticket 5.4 — Wire toggles in mode controllers

**File**: `packages/client/src/scenes/core/SingleplayerModeController.ts`

In the constructor where `createSceneDebugHotkeyHandler` is called, add the new actions:

```typescript
this.handleKeyDown = createSceneDebugHotkeyHandler(
  SINGLEPLAYER_PRESENTATION_POLICY.debugHotkeys,
  {
    toggleDebugOverlay: () => this.renderers.debugRenderer.toggle(),
    toggleCollisionDebugOverlay: () => this.renderers.collisionDebugRenderer.toggle(),
    toggleSpawnPause: () => this.toggleSpawnPause(),
    // New overlay toggles (guarded by __DEV__ at construction time)
    toggleColliderOverlay: () => this.debugOverlayRenderer?.toggleColliders(),
    toggleAIRangeOverlay: () => this.debugOverlayRenderer?.toggleAIRanges(),
    toggleSpawnZoneOverlay: () => this.debugOverlayRenderer?.toggleSpawnZones(),
  },
)
```

The `debugOverlayRenderer` field is created conditionally:

```typescript
// In constructor
private readonly debugOverlayRenderer: DebugOverlayRenderer | null = null

// ... later in constructor body:
if (__DEV__) {
  this.debugOverlayRenderer = new DebugOverlayRenderer(this.gameApp.layers.entities)
}
```

### Ticket 5.5 — Wire toggles in MultiplayerModeController

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

Same pattern as Ticket 5.4 — construct `DebugOverlayRenderer` under `__DEV__` guard, wire toggle actions.

### Ticket 5.6 — Call render in the render loop

**File**: `packages/client/src/scenes/core/SingleplayerModeController.ts`

In the render callback, after other renderers draw but before `debugRenderer.updateStats()`:

```typescript
// In the render loop
if (__DEV__) {
  this.debugOverlayRenderer?.render(this.world, alpha)
}
```

Same for `MultiplayerModeController`.

---

## Implementation Order

```
1.1  __DEV__ define in vite.config.ts
1.2  TypeScript declaration for __DEV__
1.3  Verify tree-shaking (manual check)
2.1  Create DebugOverlayRenderer class with container setup
2.2  Implement renderColliders() with interpolated positions
2.3  Add top-level render() method
5.1  Extend SceneDebugHotkeyActions interface
5.2  Add number key handlers to hotkey handler
5.3  Add toggle methods to DebugOverlayRenderer
5.4  Wire into SingleplayerModeController (construct + hotkeys + render call)
5.5  Wire into MultiplayerModeController
3.1  Implement renderAIRanges() with detection circles
3.2  Text label pool for AI state labels
3.3  Target line from enemy to its target
4.1  Implement renderSpawnZones() with playable bounds
4.2  Set bounds from mode controllers
1.3  Final tree-shaking verification
```

Epic 1 is the foundation. Epic 2 + Epic 5 (construction and wiring) come next so there is a visible, toggleable overlay to iterate on. Epic 3 builds on the same renderer. Epic 4 is independent and low-risk.

---

## Files Changed

| File | Change |
|------|--------|
| `packages/client/vite.config.ts` | Add `define: { __DEV__: ... }` |
| `packages/client/src/env.d.ts` | **New** or append — `declare const __DEV__: boolean` |
| `packages/client/src/render/DebugOverlayRenderer.ts` | **New** — world-space debug overlay renderer with collider, AI range, and spawn zone layers |
| `packages/client/src/scenes/core/SceneDebugHotkeys.ts` | Add `toggleColliderOverlay`, `toggleAIRangeOverlay`, `toggleSpawnZoneOverlay` to actions interface; add Digit1-3 handlers |
| `packages/client/src/scenes/core/SingleplayerModeController.ts` | Construct `DebugOverlayRenderer` under `__DEV__`, wire hotkey actions, call `render()` in render loop, pass playable bounds |
| `packages/client/src/scenes/core/MultiplayerModeController.ts` | Same as SingleplayerModeController |
| `packages/client/src/render/RendererBundle.ts` | Optionally add `DebugOverlayRenderer` construction here instead of in mode controllers (design choice — keeping it in mode controllers is simpler since they own the `world` reference and `__DEV__` guard) |

**No changes to `packages/shared`** — this is entirely client-side rendering.

---

## Testing

### Manual verification: `__DEV__` flag

- [ ] `bun run dev` — `__DEV__` is `true`, debug overlay classes are included
- [ ] `bun run build` — inspect `dist/` output, search for `DebugOverlayRenderer` or a marker string — should not be present
- [ ] TypeScript compiles without errors on `__DEV__` references

### Manual playtest: Collision radii overlay

- [ ] Press backtick to show stats overlay, then press `1` — green circles appear around the player, red circles around enemies, yellow around bullets
- [ ] Circles track entity movement smoothly (no jitter at low frame rates)
- [ ] Circles match visual sprite boundaries reasonably well
- [ ] Toggle `1` again — circles disappear, other overlays unaffected
- [ ] With 50+ enemies on screen, no noticeable frame drop (check FPS counter)

### Manual playtest: AI ranges overlay

- [ ] Press `2` — blue aggro range circles and orange attack range circles appear around enemies
- [ ] AI state labels (IDLE, CHASE, TELG, ATK, REC, STUN) appear above enemies and update in real time
- [ ] Thin target lines connect enemies to the player they are tracking
- [ ] Labels are readable against the game background (black stroke outline)
- [ ] Toggle `2` off — circles and labels disappear cleanly

### Manual playtest: Spawn zones overlay

- [ ] Press `3` — green rectangle shows playable bounds, yellow inner rectangle shows spawn margin
- [ ] Center crosshair marks the arena center
- [ ] Bounds match the actual playable area (enemies spawn outside the yellow rectangle, inside the green)
- [ ] Resize window — bounds remain correct (they are world-space, not screen-space)

### Manual playtest: Independent toggles

- [ ] Each key (1, 2, 3) toggles its layer independently
- [ ] Multiple layers can be active simultaneously
- [ ] Backtick toggles the stats text overlay without affecting 1/2/3 overlays
- [ ] All overlays work in both singleplayer and multiplayer modes

### Manual playtest: Multiplayer

- [ ] Debug overlays render correctly for the local player's view
- [ ] Remote player entities show collision radii and AI ranges
- [ ] No errors when toggling overlays during active multiplayer session

---

## Future Work (Not In This Sprint)

- **Spatial hash grid visualization** — draw the collision grid cells, highlight occupied cells. Useful for debugging broad-phase performance. Would be toggle key `4`.
- **Pathfinding / LOS visualization** — draw raycast lines for LOS checks, show blocked/clear status. Requires reading LOS check results from shared, which currently don't expose intermediate state.
- **Tilemap collision layer overlay** — highlight solid tiles vs walkable tiles. The existing `CollisionDebugRenderer.drawTileHighlight()` method can be extended for this.
- **Network interpolation buffer visualization** — show the interpolation timeline for remote entities in multiplayer. Relates to the netcode observability sprint.
- **Performance overlay** — track per-system timing in the ECS tick, display as a bar chart. Requires instrumentation in shared (timing hooks).
- **Console commands** — expose debug state via a browser console API (`window.__debug.toggleColliders()`) for quick iteration without hotkeys.
