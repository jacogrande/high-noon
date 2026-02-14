# Sprint: Discovery NPCs — In-Stage Flavor Characters

**Goal**: Add non-combat NPCs that spawn in stages, have defined movement patterns, and display animated chat bubbles when the player approaches. These NPCs are purely atmospheric/narrative — they don't sell items, give quests, or affect gameplay. They make the world feel alive.

**Depends on**: Current main (ECS, tilemap, renderers, FloatingTextPool pattern)

---

## Current State

The game has enemies, players, and bullets as entity types. There are no non-combat entities in the world. The `FloatingTextPool` exists for damage numbers (simple text that floats up and fades), but nothing that displays multi-character dialogue with a typewriter effect.

**What exists:**
- ECS components in `packages/shared/src/sim/components.ts` — Position, Velocity, Speed, Collider, etc.
- Enemy prefab pattern in `packages/shared/src/sim/prefabs.ts` — `addEntity` → `addComponent` → set defaults
- `EnemyRenderer` in `packages/client/src/render/EnemyRenderer.ts` — sync/render pattern with SpriteRegistry
- `FloatingTextPool` in `packages/client/src/fx/FloatingTextPool.ts` — pooled PIXI.Text with fade animation
- Tilemap with 32px tiles, walkable floor detection, collision layers
- `SpriteRegistry` for flat entity rendering (circles, sprites, rects)
- System registration in `packages/shared/src/sim/systems/index.ts`

**What doesn't exist:**
- NPC entity type or component
- NPC movement patterns (pacing, wandering, stationary)
- Proximity detection between player and non-combat entities
- Chat bubble rendering (world-space speech bubble with typewriter text)
- NPC content definitions (who they are, what they say)
- NPC spawning integrated with stage/wave system

---

## Design Constraints

1. **All NPC simulation logic in `packages/shared`** — movement patterns, proximity detection, dialogue state transitions. Client only renders.
2. **NPCs are not collidable with bullets** — they have no Health, no collision layer interaction with projectiles. They use a separate collision layer or no combat collision at all.
3. **NPCs don't block player movement** — they are visual-only in terms of physics. The player walks through them.
4. **Chat bubble is world-anchored** — it stays at the NPC's position in world space. If the player walks away, the bubble stays behind (and eventually fades). The camera moving away naturally hides it.
5. **Typewriter effect is client-only** — the shared sim only tracks "dialogue active" state (which line, time since trigger). The client renders the typewriter animation.
6. **NPCs survive across waves** — they spawn at stage start and persist until stage end. They are not part of the encounter/wave system.
7. **NPCs despawn between stages** — cleaned up during stage transition alongside enemies.

---

## Epic Overview

| # | Epic | Package(s) | Priority |
|---|------|-----------|----------|
| 1 | NPC ECS components | shared | P0 |
| 2 | NPC content definitions | shared | P0 |
| 3 | NPC movement system | shared | P0 |
| 4 | NPC proximity/dialogue system | shared | P0 |
| 5 | NPC spawning | shared | P0 |
| 6 | NPC renderer | client | P0 |
| 7 | Chat bubble renderer | client | P0 |
| 8 | Integration & cleanup | shared, client | P1 |

---

## Epic 1: NPC ECS Components

Add the component data needed to represent a discovery NPC in the simulation.

### Ticket 1.1 — Define `Npc` tag component and `NpcMovement` component

Add to `packages/shared/src/sim/components.ts`:

```typescript
/** Movement pattern types for discovery NPCs */
export const NpcMovementType = {
  NONE: 0,       // Stationary — stands in place
  PACE: 1,       // Paces back and forth along a short segment
  WANDER: 2,     // Wanders randomly within a radius of spawn point
} as const

/** Marks entity as a discovery NPC */
export const Npc = {
  /** NPC type ID (indexes into content definitions) */
  type: new Uint8Array(MAX_ENTITIES),
}

/** NPC movement behavior */
export const NpcMovement = {
  /** Movement pattern (NpcMovementType enum) */
  pattern: new Uint8Array(MAX_ENTITIES),
  /** Spawn/home X position (center of movement area) */
  homeX: new Float32Array(MAX_ENTITIES),
  /** Spawn/home Y position (center of movement area) */
  homeY: new Float32Array(MAX_ENTITIES),
  /** Movement range in pixels (pace distance or wander radius) */
  range: new Float32Array(MAX_ENTITIES),
  /** Internal timer for movement state (pattern-specific) */
  timer: new Float32Array(MAX_ENTITIES),
  /** Pace direction: 0 = forward, 1 = backward (PACE only) */
  paceDir: new Uint8Array(MAX_ENTITIES),
  /** Wander target X (WANDER only) */
  targetX: new Float32Array(MAX_ENTITIES),
  /** Wander target Y (WANDER only) */
  targetY: new Float32Array(MAX_ENTITIES),
  /** Pause timer — NPC stands still for this many seconds before next move */
  pauseTimer: new Float32Array(MAX_ENTITIES),
}

/** NPC dialogue trigger state */
export const NpcDialogue = {
  /** Whether dialogue is currently showing (0/1) */
  active: new Uint8Array(MAX_ENTITIES),
  /** Index of the current dialogue line (into content def's lines array) */
  lineIndex: new Uint8Array(MAX_ENTITIES),
  /** Time since dialogue was triggered (seconds) */
  timer: new Float32Array(MAX_ENTITIES),
  /** Total display duration for current line (seconds) */
  duration: new Float32Array(MAX_ENTITIES),
  /** Cooldown before this NPC can be triggered again (seconds) */
  cooldown: new Float32Array(MAX_ENTITIES),
  /** Whether this NPC has already been triggered this stage (0/1) */
  triggered: new Uint8Array(MAX_ENTITIES),
}
```

### Ticket 1.2 — Register new components

Add `Npc`, `NpcMovement`, and `NpcDialogue` to the `AllComponents` array in `components.ts`.

---

## Epic 2: NPC Content Definitions

Define the NPC types, their visual data, movement patterns, and dialogue lines as data.

### Ticket 2.1 — Create `packages/shared/src/sim/content/npcs.ts`

```typescript
export interface NpcDialogueLine {
  /** The text to display */
  text: string
  /** Display duration in seconds (auto-calculated from text length if omitted) */
  duration?: number
}

export interface NpcDef {
  /** Unique type ID (matches Npc.type) */
  id: number
  /** Display name (for debug/future UI) */
  name: string
  /** Sprite identifier (for AssetLoader) */
  spriteId: string
  /** Movement pattern */
  movement: number // NpcMovementType
  /** Movement speed in pixels/second (0 for NONE) */
  speed: number
  /** Movement range in pixels (pace distance or wander radius) */
  moveRange: number
  /** Collider radius for proximity detection (not physics) */
  proximityRadius: number
  /** Distance at which player triggers dialogue (pixels) */
  triggerDistance: number
  /** Dialogue lines — one is chosen randomly per trigger */
  lines: NpcDialogueLine[]
  /** Whether NPC can be re-triggered after cooldown (vs one-shot) */
  repeatable: boolean
  /** Cooldown between triggers in seconds (if repeatable) */
  cooldownTime: number
}

/** NPC type IDs */
export const NPC_TYPE = {
  TOWNSFOLK: 0,
  PROSPECTOR: 1,
  COWBOY: 2,
  PREACHER: 3,
} as const

/** Auto-calculate duration: ~40ms per character + 2s base read time */
function autoDuration(text: string): number {
  return 2.0 + text.length * 0.04
}

function defLine(text: string, duration?: number): NpcDialogueLine {
  return { text, duration: duration ?? autoDuration(text) }
}

export const NPC_DEFS: Record<number, NpcDef> = {
  [NPC_TYPE.TOWNSFOLK]: {
    id: NPC_TYPE.TOWNSFOLK,
    name: 'Townsfolk',
    spriteId: 'npc_townsfolk',
    movement: 1, // PACE
    speed: 20,
    moveRange: 48, // 1.5 tiles
    proximityRadius: 8,
    triggerDistance: 80, // ~2.5 tiles
    lines: [
      defLine("Ain't safe 'round here no more."),
      defLine("You best watch yourself, stranger."),
      defLine("They came from the canyon at dawn."),
      defLine("I seen what those things do to a man."),
    ],
    repeatable: false,
    cooldownTime: 0,
  },

  [NPC_TYPE.PROSPECTOR]: {
    id: NPC_TYPE.PROSPECTOR,
    name: 'Prospector',
    spriteId: 'npc_prospector',
    movement: 2, // WANDER
    speed: 30,
    moveRange: 64, // 2 tiles
    proximityRadius: 8,
    triggerDistance: 80,
    lines: [
      defLine("Gold in them hills! ...Or was it lead?"),
      defLine("Don't touch my claim, ya hear?"),
      defLine("Somethin' wrong with the water down there."),
    ],
    repeatable: false,
    cooldownTime: 0,
  },

  [NPC_TYPE.COWBOY]: {
    id: NPC_TYPE.COWBOY,
    name: 'Cowboy',
    spriteId: 'npc_cowboy',
    movement: 0, // NONE (leans against wall)
    speed: 0,
    moveRange: 0,
    proximityRadius: 8,
    triggerDistance: 80,
    lines: [
      defLine("I'd ride out if I were you."),
      defLine("Last posse that came through... didn't leave."),
      defLine("You got the look of trouble about ya."),
    ],
    repeatable: false,
    cooldownTime: 0,
  },

  [NPC_TYPE.PREACHER]: {
    id: NPC_TYPE.PREACHER,
    name: 'Preacher',
    spriteId: 'npc_preacher',
    movement: 1, // PACE
    speed: 15,
    moveRange: 32, // 1 tile
    proximityRadius: 8,
    triggerDistance: 80,
    lines: [
      defLine("The Lord works in mysterious ways, son."),
      defLine("Redemption comes to those who seek it."),
      defLine("I've been prayin', but the sky don't answer."),
      defLine("Even the Devil fears what's in that canyon."),
    ],
    repeatable: false,
    cooldownTime: 0,
  },
}

/** Get NPC definition by type ID */
export function getNpcDef(type: number): NpcDef | undefined {
  return NPC_DEFS[type]
}

/** All NPC type IDs */
export const ALL_NPC_TYPES = Object.values(NPC_TYPE)
```

### Ticket 2.2 — Define per-stage NPC spawn lists

Add to `npcs.ts` (or a new `npcSpawns.ts`):

```typescript
export interface NpcSpawn {
  /** NPC type from NPC_TYPE */
  type: number
  /** Spawn tile X (converted to world coords at spawn time) */
  tileX: number
  /** Spawn tile Y */
  tileY: number
}

/**
 * NPC spawns per stage index.
 * Positions are tile coordinates — the spawn system converts to world pixels.
 * These are hand-placed relative to known map layouts.
 */
export const STAGE_NPC_SPAWNS: NpcSpawn[][] = [
  // Stage 1: 2 NPCs
  [
    { type: NPC_TYPE.TOWNSFOLK, tileX: 10, tileY: 12 },
    { type: NPC_TYPE.COWBOY, tileX: 38, tileY: 25 },
  ],
  // Stage 2: 2 NPCs
  [
    { type: NPC_TYPE.PROSPECTOR, tileX: 14, tileY: 8 },
    { type: NPC_TYPE.PREACHER, tileX: 40, tileY: 30 },
  ],
  // Stage 3: 1 NPC
  [
    { type: NPC_TYPE.TOWNSFOLK, tileX: 22, tileY: 18 },
  ],
]
```

---

## Epic 3: NPC Movement System

A shared system that updates NPC positions each tick based on their movement pattern.

### Ticket 3.1 — Create `packages/shared/src/sim/systems/npcMovement.ts`

```typescript
/**
 * NPC Movement System
 *
 * Updates discovery NPC positions based on their movement pattern.
 * Runs every tick. NPCs move slowly — this is flavor, not gameplay.
 *
 * Patterns:
 * - NONE: No movement. Position stays at home.
 * - PACE: Walk back and forth along X axis within range of home.
 *         Pause briefly at each end.
 * - WANDER: Pick a random point within range of home, walk to it,
 *           pause, pick a new point. Uses world.rng for determinism.
 */

import { defineQuery } from 'bitecs'
import type { GameWorld } from '../world'
import { Position, Velocity, Speed, Npc, NpcMovement, NpcMovementType } from '../components'

const npcMoveQuery = defineQuery([Npc, NpcMovement, Position, Velocity, Speed])

const PACE_PAUSE_TIME = 1.5 // seconds at each end of pace
const WANDER_PAUSE_MIN = 2.0
const WANDER_PAUSE_MAX = 4.0
const WANDER_ARRIVAL_DIST = 4 // pixels — "close enough" to target

export function npcMovementSystem(world: GameWorld, dt: number): void {
  for (const eid of npcMoveQuery(world)) {
    const pattern = NpcMovement.pattern[eid]!

    if (pattern === NpcMovementType.NONE) {
      Velocity.x[eid] = 0
      Velocity.y[eid] = 0
      continue
    }

    // Handle pause
    const pause = NpcMovement.pauseTimer[eid]!
    if (pause > 0) {
      NpcMovement.pauseTimer[eid] = pause - dt
      Velocity.x[eid] = 0
      Velocity.y[eid] = 0
      continue
    }

    const speed = Speed.current[eid]!
    const homeX = NpcMovement.homeX[eid]!
    const homeY = NpcMovement.homeY[eid]!
    const range = NpcMovement.range[eid]!
    const x = Position.x[eid]!
    const y = Position.y[eid]!

    if (pattern === NpcMovementType.PACE) {
      const dir = NpcMovement.paceDir[eid]!
      const targetX = dir === 0 ? homeX + range : homeX - range

      const dx = targetX - x
      if (Math.abs(dx) < WANDER_ARRIVAL_DIST) {
        // Reached end — flip direction and pause
        NpcMovement.paceDir[eid] = dir === 0 ? 1 : 0
        NpcMovement.pauseTimer[eid] = PACE_PAUSE_TIME
        Velocity.x[eid] = 0
        Velocity.y[eid] = 0
      } else {
        Velocity.x[eid] = Math.sign(dx) * speed
        Velocity.y[eid] = 0
      }
    } else if (pattern === NpcMovementType.WANDER) {
      const tx = NpcMovement.targetX[eid]!
      const ty = NpcMovement.targetY[eid]!
      const dx = tx - x
      const dy = ty - y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < WANDER_ARRIVAL_DIST) {
        // Reached target — pick new target and pause
        const angle = world.rng.nextRange(0, Math.PI * 2)
        const r = world.rng.nextRange(range * 0.3, range)
        NpcMovement.targetX[eid] = homeX + Math.cos(angle) * r
        NpcMovement.targetY[eid] = homeY + Math.sin(angle) * r
        NpcMovement.pauseTimer[eid] = world.rng.nextRange(WANDER_PAUSE_MIN, WANDER_PAUSE_MAX)
        Velocity.x[eid] = 0
        Velocity.y[eid] = 0
      } else {
        // Move toward target
        const nx = dx / dist
        const ny = dy / dist
        Velocity.x[eid] = nx * speed
        Velocity.y[eid] = ny * speed
      }
    }
  }
}
```

---

## Epic 4: NPC Proximity & Dialogue System

A shared system that detects when a player is near an NPC and triggers dialogue state.

### Ticket 4.1 — Create `packages/shared/src/sim/systems/npcDialogue.ts`

```typescript
/**
 * NPC Dialogue System
 *
 * Checks player proximity to NPCs each tick. When a player enters
 * triggerDistance of an NPC that hasn't been triggered (or is off cooldown),
 * sets dialogue to active with a randomly chosen line.
 *
 * The system only manages state transitions. Rendering (typewriter, bubble)
 * is handled by the client.
 */

import { defineQuery } from 'bitecs'
import type { GameWorld } from '../world'
import { Position, Player, Npc, NpcDialogue, Dead } from '../components'
import { getNpcDef } from '../content/npcs'
import { hasComponent } from 'bitecs'

const npcQuery = defineQuery([Npc, NpcDialogue, Position])
const playerQuery = defineQuery([Player, Position])

export function npcDialogueSystem(world: GameWorld, dt: number): void {
  const players = playerQuery(world)

  for (const eid of npcQuery(world)) {
    const dialogue = NpcDialogue.active[eid]!

    // Active dialogue — tick timer and check expiration
    if (dialogue === 1) {
      NpcDialogue.timer[eid] = NpcDialogue.timer[eid]! + dt
      if (NpcDialogue.timer[eid]! >= NpcDialogue.duration[eid]!) {
        NpcDialogue.active[eid] = 0
        NpcDialogue.timer[eid] = 0

        // Set cooldown if repeatable
        const def = getNpcDef(Npc.type[eid]!)
        if (def && def.repeatable) {
          NpcDialogue.cooldown[eid] = def.cooldownTime
        }
      }
      continue
    }

    // Cooldown tick
    const cooldown = NpcDialogue.cooldown[eid]!
    if (cooldown > 0) {
      NpcDialogue.cooldown[eid] = cooldown - dt
      continue
    }

    // Already triggered and not repeatable — skip
    const def = getNpcDef(Npc.type[eid]!)
    if (!def) continue
    if (NpcDialogue.triggered[eid] === 1 && !def.repeatable) continue

    // Check player proximity
    const nx = Position.x[eid]!
    const ny = Position.y[eid]!
    const triggerDist = def.triggerDistance
    const triggerDistSq = triggerDist * triggerDist

    for (const pid of players) {
      if (hasComponent(world, Dead, pid)) continue

      const px = Position.x[pid]!
      const py = Position.y[pid]!
      const dx = px - nx
      const dy = py - ny
      const distSq = dx * dx + dy * dy

      if (distSq <= triggerDistSq) {
        // Trigger dialogue
        const lineIndex = world.rng.nextInt(def.lines.length)
        const line = def.lines[lineIndex]!
        NpcDialogue.active[eid] = 1
        NpcDialogue.lineIndex[eid] = lineIndex
        NpcDialogue.timer[eid] = 0
        NpcDialogue.duration[eid] = line.duration ?? (2.0 + line.text.length * 0.04)
        NpcDialogue.triggered[eid] = 1
        break // One player trigger is enough
      }
    }
  }
}
```

---

## Epic 5: NPC Spawning

Spawn NPCs at stage start using the per-stage spawn lists.

### Ticket 5.1 — Create `spawnNpc` prefab function

Add to `packages/shared/src/sim/prefabs.ts`:

```typescript
import { Npc, NpcMovement, NpcMovementType, NpcDialogue } from './components'
import { getNpcDef } from './content/npcs'

/**
 * Spawn a discovery NPC entity
 */
export function spawnNpc(world: GameWorld, type: number, x: number, y: number): number {
  const def = getNpcDef(type)
  if (!def) return -1

  const eid = addEntity(world)

  addComponent(world, Position, eid)
  addComponent(world, Velocity, eid)
  addComponent(world, Speed, eid)
  addComponent(world, Npc, eid)
  addComponent(world, NpcMovement, eid)
  addComponent(world, NpcDialogue, eid)

  // Position
  Position.x[eid] = x
  Position.y[eid] = y
  Position.prevX[eid] = x
  Position.prevY[eid] = y

  // Velocity (starts stationary)
  Velocity.x[eid] = 0
  Velocity.y[eid] = 0

  // Speed
  Speed.current[eid] = def.speed
  Speed.max[eid] = def.speed

  // NPC identity
  Npc.type[eid] = type

  // Movement
  NpcMovement.pattern[eid] = def.movement
  NpcMovement.homeX[eid] = x
  NpcMovement.homeY[eid] = y
  NpcMovement.range[eid] = def.moveRange
  NpcMovement.timer[eid] = 0
  NpcMovement.paceDir[eid] = 0
  NpcMovement.pauseTimer[eid] = world.rng.nextRange(0, 1.5) // stagger initial pause

  // Wander: set initial target to home
  if (def.movement === NpcMovementType.WANDER) {
    const angle = world.rng.nextRange(0, Math.PI * 2)
    const r = world.rng.nextRange(def.moveRange * 0.3, def.moveRange)
    NpcMovement.targetX[eid] = x + Math.cos(angle) * r
    NpcMovement.targetY[eid] = y + Math.sin(angle) * r
  } else {
    NpcMovement.targetX[eid] = x
    NpcMovement.targetY[eid] = y
  }

  // Dialogue (starts inactive)
  NpcDialogue.active[eid] = 0
  NpcDialogue.lineIndex[eid] = 0
  NpcDialogue.timer[eid] = 0
  NpcDialogue.duration[eid] = 0
  NpcDialogue.cooldown[eid] = 0
  NpcDialogue.triggered[eid] = 0

  return eid
}
```

### Ticket 5.2 — Spawn NPCs at stage start

In `stageProgressionSystem` (or a new thin system), when a new stage begins, read the spawn list for that stage index and call `spawnNpc` for each entry. Convert tile coords to world coords: `worldX = tileX * tileSize + tileSize / 2`.

Add NPC entity tracking to the world so they can be cleaned up between stages:

```typescript
// Add to GameWorld interface:
npcEntities: Set<number>

// In createGameWorld:
npcEntities: new Set()
```

When spawning: `world.npcEntities.add(eid)`.
When transitioning stages: iterate `world.npcEntities`, call `removeEntity` for each, then clear the set.

### Ticket 5.3 — Register NPC systems

In `packages/shared/src/sim/systems/index.ts`, add `npcMovementSystem` and `npcDialogueSystem` to `registerAllSystems`. They should run after enemy systems but before physics:

```typescript
// -- NPC systems (after enemy AI, before movement) --
systems.register(npcMovementSystem)
systems.register(npcDialogueSystem)
```

The NPC movement system writes to Velocity, which the existing `movementSystem` applies to Position. The dialogue system only reads Position, so it can run at any point after NPC movement.

---

## Epic 6: NPC Renderer

Client-side renderer for NPC sprites, following the EnemyRenderer pattern.

### Ticket 6.1 — Create `packages/client/src/render/NpcRenderer.ts`

```typescript
/**
 * NPC Renderer
 *
 * Renders discovery NPCs as animated sprites. Follows the EnemyRenderer
 * sync/render pattern: sync() creates/removes sprites, render() updates
 * positions with interpolation.
 *
 * NPCs use the same character sprite format as players/enemies:
 * 79px cells, directional rows, mirrored for W direction.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '@high-noon/shared'
import { Npc, NpcMovement, Position, Velocity } from '@high-noon/shared'
import { SpriteRegistry } from './SpriteRegistry'
import { AssetLoader } from '../assets/AssetLoader'

const NPC_SPRITE_SCALE = 2
const npcRenderQuery = defineQuery([Npc, Position])

export class NpcRenderer {
  private readonly registry: SpriteRegistry
  private readonly activeNpcs = new Set<number>()

  constructor(registry: SpriteRegistry) {
    this.registry = registry
  }

  sync(world: GameWorld): void {
    const current = npcRenderQuery(world)
    const currentSet = new Set(current)

    // Create sprites for new NPCs
    for (const eid of current) {
      if (!this.activeNpcs.has(eid)) {
        // Placeholder: colored circle until NPC sprites exist
        this.registry.createCircle(eid, 10, 0x44aaff)
        this.activeNpcs.add(eid)
      }
    }

    // Remove sprites for despawned NPCs
    for (const eid of this.activeNpcs) {
      if (!currentSet.has(eid)) {
        this.registry.remove(eid)
        this.activeNpcs.delete(eid)
      }
    }
  }

  render(world: GameWorld, alpha: number): void {
    for (const eid of this.activeNpcs) {
      if (!hasComponent(world, Npc, eid)) continue

      const prevX = Position.prevX[eid]!
      const prevY = Position.prevY[eid]!
      const currX = Position.x[eid]!
      const currY = Position.y[eid]!
      const renderX = prevX + (currX - prevX) * alpha
      const renderY = prevY + (currY - prevY) * alpha

      this.registry.setPosition(eid, renderX, renderY)
    }
  }

  destroy(): void {
    for (const eid of this.activeNpcs) {
      this.registry.remove(eid)
    }
    this.activeNpcs.clear()
  }
}
```

NPC sprites will initially be placeholder circles. When NPC sprite assets are created, swap `createCircle` for `createSprite` with `AssetLoader.getNpcTexture(spriteId, state, direction, frame)`.

---

## Epic 7: Chat Bubble Renderer

The core visual feature: a world-space speech bubble with typewriter text animation.

### Ticket 7.1 — Create `packages/client/src/fx/ChatBubble.ts`

A single chat bubble instance that manages its own PIXI display objects:

```typescript
/**
 * ChatBubble
 *
 * A world-space speech bubble anchored to an NPC's position.
 * Text animates with a typewriter effect (characters appear one at a time).
 * The bubble fades out when dialogue duration expires.
 *
 * Structure:
 *   Container (world-positioned)
 *     ├── Graphics (rounded rect background + tail)
 *     └── Text (typewriter-animated content)
 */
```

**Key behaviors:**
- `show(x, y, text, duration)` — positions bubble above NPC, starts typewriter
- Typewriter speed: ~30 characters/second (configurable)
- Background: rounded rect with a small triangular tail pointing down
- Colors: cream/off-white background (`0xfff8e7`), dark brown text (`#3b2507`), thin brown border
- Font: the game's existing pixel/monospace font, ~10-11px
- Max width: ~160px, word-wrap enabled
- Fade out: last 0.5s of duration, alpha lerps from 1 to 0
- `update(dt)` — advances typewriter, checks fade, updates position
- `hide()` — immediately hides and resets

### Ticket 7.2 — Create `packages/client/src/fx/ChatBubblePool.ts`

Pool of chat bubbles (small pool, max 4-8 since there are few NPCs per stage):

```typescript
/**
 * ChatBubblePool
 *
 * Pre-allocates ChatBubble instances. The NPC renderer requests a bubble
 * from the pool when NpcDialogue.active transitions to 1, and returns
 * it when dialogue expires.
 *
 * Pool exhaustion: silently drops (same as FloatingTextPool pattern).
 */

export class ChatBubblePool {
  constructor(worldContainer: Container, poolSize = 8)

  /** Activate a bubble at world position with given text and duration */
  show(npcEid: number, x: number, y: number, text: string, duration: number): void

  /** Update all active bubbles (typewriter + fade + position tracking) */
  update(dt: number, world: GameWorld): void

  destroy(): void
}
```

**Position tracking in `update()`:**
Each active bubble is associated with an NPC entity ID. On each frame, the bubble reads `Position.x/y` from the NPC entity and repositions itself above the NPC. This keeps the bubble anchored to the NPC in world space — if the NPC paces, the bubble follows. If the player walks away, the camera naturally moves the bubble off-screen.

### Ticket 7.3 — Typewriter text implementation

Inside `ChatBubble.update(dt)`:

```
visibleChars += dt * CHARS_PER_SECOND
displayText = fullText.substring(0, Math.floor(visibleChars))
textDisplayObject.text = displayText
```

The PIXI `Text` object is updated each frame with the growing substring. The background `Graphics` is drawn once at `show()` time using the full text dimensions (so the bubble doesn't resize as text appears).

**Refinements:**
- A subtle blinking cursor character (`_`) at the end of the visible text while typing, removed when complete
- Slight scale-in on appear (0.8 → 1.0 over 0.15s, ease-out)

---

## Epic 8: Integration & Cleanup

Wire everything together in the game scene and handle edge cases.

### Ticket 8.1 — Integrate NpcRenderer and ChatBubblePool into SingleplayerModeController

In `SingleplayerModeController`:
1. Create `NpcRenderer` with a dedicated `SpriteRegistry` (or the shared one, since NPC entity IDs won't conflict)
2. Create `ChatBubblePool` on the world container (same layer as floating text)
3. In `update()`: call `npcRenderer.sync(world)` alongside enemy/bullet sync
4. In `render()`: call `npcRenderer.render(world, alpha)` and `chatBubblePool.update(realDt, world)`

### Ticket 8.2 — Connect dialogue state to chat bubbles

In the render loop, detect when `NpcDialogue.active` transitions from 0→1 for any NPC entity and call `chatBubblePool.show(eid, x, y, text, duration)`. Use a `Map<number, boolean>` to track previous-frame active state and detect edges.

Read the dialogue text from the content definition:
```typescript
const def = getNpcDef(Npc.type[eid])
const line = def.lines[NpcDialogue.lineIndex[eid]]
chatBubblePool.show(eid, Position.x[eid], Position.y[eid], line.text, NpcDialogue.duration[eid])
```

### Ticket 8.3 — NPC cleanup on stage transition

In the stage transition code (within `stageProgressionSystem` or the controller), when entering clearing/camp state:
1. Iterate `world.npcEntities`, call `removeEntity(world, eid)` for each
2. Clear `world.npcEntities`
3. The NpcRenderer's next `sync()` call will detect the missing entities and remove sprites
4. The ChatBubblePool should hide any active bubbles for removed NPCs

### Ticket 8.4 — Multiplayer considerations

- NPC systems run in the shared sim, so they're already deterministic
- NPCs use `world.rng` for all randomness, maintaining determinism
- The `npcDialogueSystem` triggers based on any alive player's proximity
- No special multiplayer handling needed for MVP — all clients see the same NPC state

### Ticket 8.5 — Export and register

- Export `spawnNpc` from `packages/shared/src/index.ts`
- Export `npcMovementSystem`, `npcDialogueSystem` from systems index
- Export `NpcRenderer` from client render index
- Export `ChatBubblePool` from client fx index
- Add `NPC_DEFS`, `getNpcDef`, `STAGE_NPC_SPAWNS` to shared exports

---

## File Checklist

| File | Action | Package |
|------|--------|---------|
| `packages/shared/src/sim/components.ts` | Add `Npc`, `NpcMovement`, `NpcDialogue` components | shared |
| `packages/shared/src/sim/content/npcs.ts` | New — NPC definitions, dialogue lines, spawn lists | shared |
| `packages/shared/src/sim/systems/npcMovement.ts` | New — movement pattern system | shared |
| `packages/shared/src/sim/systems/npcDialogue.ts` | New — proximity detection + dialogue trigger | shared |
| `packages/shared/src/sim/systems/index.ts` | Register NPC systems in `registerAllSystems` | shared |
| `packages/shared/src/sim/prefabs.ts` | Add `spawnNpc` function | shared |
| `packages/shared/src/sim/world.ts` | Add `npcEntities: Set<number>` to `GameWorld` | shared |
| `packages/shared/src/index.ts` | Export NPC components, systems, content | shared |
| `packages/client/src/render/NpcRenderer.ts` | New — NPC sprite rendering | client |
| `packages/client/src/fx/ChatBubble.ts` | New — single bubble display object | client |
| `packages/client/src/fx/ChatBubblePool.ts` | New — pooled bubble manager | client |
| `packages/client/src/scenes/core/SingleplayerModeController.ts` | Integrate NpcRenderer + ChatBubblePool | client |

---

## Out of Scope

- NPC sprite art (use placeholder circles for now)
- NPC interaction (click to talk, buy items) — these are **discovery** NPCs only
- NPC combat AI or health
- Camp visitor NPCs (separate system, see `npc-design.md`)
- Multiplayer-specific NPC UI
- NPC audio (voice lines, approach SFX)
- Collision between NPCs and walls (NPCs placed on walkable tiles, movement range keeps them in bounds)
