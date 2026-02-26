# Sprint 19: Stage 4 — The Crossroads (Final Boss)

Build the final stage of High Noon: a supernatural crossroads arena with a 4-phase boss fight against **Old Scratch**, the Devil of Western folklore. This is the climax of a run — a multi-phase showdown that tests every skill the player has built across Stages 1-3.

See also: [Stage 4 Final Boss Research](../research/stage4-final-boss.md) for full design rationale, game research, and thematic analysis.

---

## Goals

1. **Crossroads Arena** — A custom hand-crafted + shaped map with dynamic arena shrinking across boss phases
2. **Old Scratch Boss Module** — 4-phase boss with 400 HP, character-adaptive attacks, mid-fight heal, and environmental mechanics
3. **Ghost Rider Add Enemy** — Spectral mounted cowboy summoned in Phase 2, rides along roads
4. **Hellfire Pillar System** — Destructible hazard-entities that heal the boss and enable chain lightning in Phase 3
5. **Quick Draw Mechanic** — Phase 4 reaction-time duel system, callbacks to Stage 1's duel objective
6. **Dynamic Arena Hazards** — Brimstone cracks, dust storm visibility reduction, arena boundary collapse
7. **Stage 4 Encounter** — Wire everything into the run progression as the final stage after Devil's Canyon

---

## Non-Goals

- Client rendering polish (VFX, screen shake tuning, sprite animation — separate sprint)
- Music / audio integration (separate sprint)
- Boss dialogue system or narrative triggers (separate sprint)
- Multiplayer testing for Stage 4 (netcode sprint)
- Difficulty modifiers / Extreme mode variant
- New item drops specific to Stage 4

---

## Current State

**Stages:** 3 stages implemented (Town Outskirts, Badlands, Devil's Canyon). `DEFAULT_RUN_STAGES` array in `waves.ts`.

**Boss infrastructure:** 5 bosses implemented via `BossModule` interface in `registry.ts`. Each is self-contained with `spawn()`, `tick()`, `attack()`. Boss state stored in `world.bossState.set(eid, state)`. Phase transitions driven by HP ratio in `tick()`, dispatched via `bossPhaseSystem`.

**Existing patterns to reuse:**

- Coyote Jane spawns coyote adds from her `attack()` function — same pattern for Ghost Riders
- Hollow Man's dust storm + afterimages — same pattern for Phase 3 dust storm
- Hollow Man's teleport system — reference for Old Scratch's Phase 1 Sidewinder dash
- Stage 1 duel objective — conceptual basis for Phase 4 draw mechanic
- `BossTelegraph` system (line/arc/circle) — used for all attack telegraphs

**Enemy types used:** 0-20 (Swarmer through Vulture). Next available: 21.

---

## Phase 1: Crossroads Map Generator

**Goal:** Build a custom map generator for the + shaped crossroads arena, with support for dynamic tile modification mid-encounter.

### 1.1 New Tile Types

Add to `packages/shared/src/sim/tilemap.ts`:

```ts
// Add to TileType:
BRIMSTONE: 9,       // Phase 2-3 hazard — deals 4 DPS on contact
DARKNESS: 10,       // Arena boundary — deals 5 DPS + 80% slow
```

Add to the hazard damage system (in `hazardSystem` or wherever lava/bramble/mud damage is applied): BRIMSTONE deals 4 DPS, DARKNESS deals 5 DPS + applies 80% slow.

### 1.2 Crossroads Map Config

Add to `packages/shared/src/sim/content/maps/mapConfig.ts`:

```ts
export const STAGE_4_MAP_CONFIG: MapConfig = {
  width: 48,
  height: 48,
  tileSize: 32,
  baseTiles: { style: "crossroads_dirt", variantCount: 4 },
  centerClearRadius: 8,
  obstacles: { count: 0, minSpacing: 0, templates: [] },
  hazards: [],
  // No mapObstacles — hand-crafted layout
};
```

### 1.3 Crossroads Map Generator

Create `packages/shared/src/sim/content/maps/crossroadsGenerator.ts`:

A dedicated generator (not the procedural noise-based one) that:

1. Fills entire 48×48 grid with `TileType.WALL`
2. Carves center clearing: 16×16 tiles centered at (24, 24)
3. Carves four roads: 8 tiles wide, extending 16 tiles from center edge to map edge
4. Floors use `crossroads_dirt` base tile style
5. Stores landmark positions as metadata on the tilemap:
   - `signpostPos`: center (768, 768) — decorative, no collision
   - `lanternPositions`: 4 corners of center clearing — become Hellfire Pillars in Phase 3
   - `roadEndpoints`: 4 positions at the end of each road — Ghost Rider spawn points
6. Returns a standard `Tilemap` compatible with existing systems

```
Layout (each char = 1 tile, 48x48):
████████████████████░░░░░░░░████████████████████
████████████████████░░░░░░░░████████████████████
...                 (road N)
████████████████████░░░░░░░░████████████████████
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  ← 8 wide roads
...  (road W)      [  CENTER  ]       (road E)
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
████████████████████░░░░░░░░████████████████████
...                 (road S)
████████████████████░░░░░░░░████████████████████
```

### 1.4 Dynamic Tile Modification API

Create `packages/shared/src/sim/tilemap.ts` additions:

```ts
/** Set a tile type at grid coordinates. Used for mid-encounter arena changes. */
export function setTileAt(
  map: Tilemap,
  tileX: number,
  tileY: number,
  type: number,
): void;

/** Convert a range of floor tiles to a different type (e.g., FLOOR → WALL for arena shrink). */
export function collapseTileRange(
  map: Tilemap,
  minTileX: number,
  minTileY: number,
  maxTileX: number,
  maxTileY: number,
  newType: number,
): void;
```

These are needed for Phase 2/3 arena shrinking (converting outer road tiles to WALL) and brimstone crack placement (converting road edge tiles to BRIMSTONE).

### 1.5 Tests

- Unit test: crossroads generator produces correct dimensions and tile layout
- Unit test: center clearing is traversable, corners are walls, roads connect
- Unit test: `setTileAt` and `collapseTileRange` modify tiles correctly
- Unit test: landmark metadata positions are within expected bounds

**Acceptance:** `bun run typecheck` clean, `bun test` passes. Generated map is traversable from any road to any other road through center.

**Files:**

- `packages/shared/src/sim/tilemap.ts` — new tile types + dynamic modification API
- `packages/shared/src/sim/content/maps/crossroadsGenerator.ts` — new file
- `packages/shared/src/sim/content/maps/mapConfig.ts` — add `STAGE_4_MAP_CONFIG`

> **Status: COMPLETE** (2026-02-25)
> Implemented: BRIMSTONE/DARKNESS tile types with hazard damage, `crossroads_dirt` base tile style, `STAGE_4_MAP_CONFIG` (48x48), crossroads generator with + shaped layout and landmark metadata (signpost, 4 lanterns, 4 road endpoints), `setTileAt()`/`collapseTileRange()` dynamic tile API, client `baseTileset.ts` updated. 42 new tests (34 crossroads generator + 8 hazard tile), all 1105 tests passing, typecheck clean.

---

## Phase 2: Old Scratch — Core Spawn + Phase State Machine

**Goal:** Create the boss module skeleton with spawn, 4-phase transitions, mid-fight heal, and the Infernal Counter passive.

### 2.1 New EnemyType Values

Add to `packages/shared/src/sim/components.ts`:

```ts
// Add to EnemyType:
OLD_SCRATCH: 21,
GHOST_RIDER: 22,
HELLFIRE_PILLAR: 23,
```

### 2.2 Boss Module Skeleton

Create `packages/shared/src/sim/content/bosses/oldScratch.ts`:

```ts
interface OldScratchState {
  phase: number; // 1-4
  phaseTimer: number; // time in current phase
  attackCycleIndex: number; // position in attack sequence
  attackCooldown: number; // time until next attack
  counterCooldown: number; // infernal counter internal CD (1.5s)
  counterWindowActive: boolean; // true during idle stance counter window

  // Phase 2
  ghostRiderCooldown: number; // time until next Ghost Rider summon
  ghostRiderCount: number; // alive Ghost Riders

  // Phase 3
  pillarEids: number[]; // entity IDs of Hellfire Pillars
  pillarRespawnTimers: number[]; // respawn countdown per pillar slot
  dustStormActive: boolean;
  stampedeTimer: number;

  // Phase 4
  drawRound: number; // current draw round (1-based)
  drawPhase: "staredown" | "flash" | "scramble" | "reset";
  staredownTimer: number; // time remaining in staredown
  flashFired: boolean; // has the flash signal occurred this round
  playerShotDuringWindow: boolean; // did player shoot during counter window
}
```

### 2.3 Phase Transitions

In `tick()`:

```ts
const hpRatio = Health.current[eid] / Health.max[eid];

// Phase thresholds: 75%, 45%, 15%
if (state.phase === 1 && hpRatio <= 0.75) {
  enterPhase2(world, eid, state);
} else if (state.phase === 2 && hpRatio <= 0.45) {
  enterPhase3(world, eid, state); // includes mid-fight heal to 250 HP
} else if (state.phase === 3 && hpRatio <= 0.15) {
  enterPhase4(world, eid, state);
}
```

Phase transition functions:

- **`enterPhase2`:** Grant i-frames (0.45s). Trigger arena shrink (Phase 1.4 API). Spawn brimstone cracks along road edges. Increase speed to 180 px/s. Push `bossPhaseChanges` event for client.
- **`enterPhase3`:** Grant i-frames. **Heal to 250 HP** (`Health.current[eid] = 250`). Shrink arena further. Spawn 4 Hellfire Pillars at lantern positions. Set speed to 0 (stationary true form). Set `dustStormActive = false` (activates later at 50% of P3 HP). Push phase change event.
- **`enterPhase4`:** Grant i-frames. Permanently destroy all Hellfire Pillars. Clear dust storm. Clear brimstone cracks (set tiles back to FLOOR). Set speed to 0 (stationary for draw). Initialize draw round 1. Push phase change event.

### 2.4 Infernal Counter

In `tick()`, manage counter windows:

- Between attack sequences (during idle stance), set `counterWindowActive = true` for 0.4s
- A red shimmer telegraph is pushed to `world.bossTelegraphs` during counter windows
- When a player bullet hits Old Scratch during an active counter window AND `counterCooldown <= 0`:
  - Negate the incoming damage
  - Old Scratch sidesteps (instant reposition 60px perpendicular to player direction)
  - Fire a snap-shot: 12 damage, 800 px/s, aimed at player
  - Set `counterCooldown = 1.5`
- Implementation: hook into the boss's damage intake. In `tick()`, check if damage was received during counter window. Alternatively, use the `onBulletHit` hook system to intercept.

### 2.5 Tests

- Unit test: Old Scratch spawns with correct stats (400 HP, radius 18, etc.)
- Unit test: phase transitions trigger at correct HP thresholds
- Unit test: mid-fight heal at Phase 3 entry sets HP to 250
- Unit test: Infernal Counter fires snap-shot when hit during window
- Unit test: counter has 1.5s internal cooldown
- Unit test: counter does NOT trigger during active attacks

**Acceptance:** Boss spawns, transitions through all 4 phases as HP depletes, heals at P3 entry, counter mechanic functions. No attack logic yet (that's Phases 3-6).

**Files:**

- `packages/shared/src/sim/components.ts` — new EnemyType values
- `packages/shared/src/sim/content/bosses/oldScratch.ts` — new file (skeleton + transitions + counter)
- `packages/shared/src/sim/content/bosses/index.ts` — import new module

> **Status: COMPLETE** (2026-02-25)
> Implemented: OldScratchState interface with all 4 phase fields, spawn with 400 HP / radius 18 / THREAT tier, 4-phase state machine (75%/45%/15% thresholds), `phaseTransitionDone` Set for idempotent transitions (handles large HP drops skipping phases), mid-fight heal to 250 HP at P3 entry, Infernal Counter via `onBulletHit` hook (0.4s window, 1.5s internal CD, 60px sidestep, 12-damage snap-shot), arena shrink via `collapseTileRange` (6 tiles P2, 10 tiles P3), brimstone crack placement/clearing, `tileVersion` invalidation on all tile changes. Counter window opens once per idle entry and closes after 0.4s — will naturally cycle once attacks are wired in Phase 3+. Attack stub present (`attack()` is a no-op). 30 tests (7 spawn, 9 phase transition, 5 arena modification, 9 Infernal Counter), all 1278 suite tests passing, typecheck clean.

---

## Phase 3: Old Scratch — Phase 1 Attacks (The Wager)

**Goal:** Implement Phase 1's character-adaptive gentleman duel attacks.

### 3.1 Character Detection

Read the player's character class to select the attack set:

```ts
// In attack(), determine player character type
const playerEid = playerQuery(world)[0];
const characterId = world.characterId; // 'sheriff' | 'undertaker' | 'prospector'
```

### 3.2 Sheriff Mirror Attacks

| Attack                | Implementation                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Dead-Eye Shot**     | Telegraph: push `'line'` telegraph (0.4s) from boss to player position. Attack: `spawnBullet()` — 14 damage, 700 px/s, aimed at player's position at telegraph start (not tracking). |
| **Devil's Fan**       | Telegraph: push `'arc'` telegraph (0.3s). Attack: 4 bullets in 0.5 rad spread, 500 px/s, 8 damage each.                                                                              |
| **Black Iron Reload** | 0.7s vulnerability window. No attack — this IS the damage window. Boss enters RECOVERY state for 0.7s.                                                                               |
| **Sidewinder**        | Lateral dash: 200px displacement perpendicular to player direction, 400 px/s. 2s cooldown. No telegraph — pure repositioning.                                                        |

**Attack cycle:** Dead-Eye → Sidewinder → Devil's Fan → Black Iron Reload → repeat. ~4s per cycle.

### 3.3 Undertaker Mirror Attacks

| Attack              | Implementation                                                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Brimstone Blast** | 5 bullets in 0.4 rad spread, 400 px/s, 10 damage each, 150px range (short). Boss closes distance first (CHASE until within 120px).                    |
| **Coffin Nail**     | Spawn a delayed damage zone at player's position. 100px radius, 0.8s delay, then 6 damage + 4 DPS for 2s. Uses a new entity type or timer-based area. |
| **Shadow Step**     | Short-range teleport 150px toward player. 3s cooldown. Similar to Hollow Man teleport but shorter and faster.                                         |

### 3.4 Prospector Mirror Attacks

| Attack               | Implementation                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Hellpick Swing**   | Melee: 100° arc, 70px reach, 12 damage, 50px knockback. Uses existing melee hit detection pattern from Prospector. |
| **Infernal Charge**  | Charge 200px at 350 px/s. 15 damage on contact. Leaves fire trail (entity-based line, 3s duration, 4 DPS).         |
| **Devil's Dynamite** | Reuse existing dynamite system: 80px blast, 1.2s fuse, 18 damage. Tossed at player's predicted position.           |

### 3.5 Attack Dispatch

In `attack()` for Phase 1:

```ts
if (state.phase === 1) {
  const cycle = P1_ATTACK_CYCLES[characterId]; // per-character attack sequence
  const attackId = cycle[state.attackCycleIndex % cycle.length];
  executeAttack(world, eid, state, attackId, dt);
}
```

Each attack is a function: `deadEyeShot()`, `devilsFan()`, `brimstoneBlast()`, etc. They follow the existing telegraph → attack → recovery pattern using `EnemyAI.state` and `EnemyAI.stateTimer`.

### 3.6 Tests

- Unit test per attack: correct damage, correct bullet count/spread, correct telegraph duration
- Unit test: attack cycle advances correctly
- Unit test: character-specific attack set is selected based on `world.characterId`
- Integration test: full Phase 1 cycle (4+ attack sequences) with no crashes

**Acceptance:** Phase 1 is playable. Old Scratch uses the correct attack set for each character class. All attacks have visible telegraphs and are dodgeable.

**Files:**

- `packages/shared/src/sim/content/bosses/oldScratch.ts` — Phase 1 attack implementations
- `packages/shared/src/sim/content/bosses/oldScratch.test.ts` — 24 new tests
- `packages/shared/src/sim/content/bosses/index.ts` — new constant exports

> **Status: COMPLETE** (2026-02-25)
> Implemented all 10 Phase 1 attacks across 3 character cycles (Sheriff: Dead-Eye, Sidewinder, Devil's Fan, Black Iron Reload; Undertaker: Brimstone Blast, Coffin Nail, Shadow Step; Prospector: Hellpick Swing, Infernal Charge, Devil's Dynamite). Character ID cached on first tick via `getCharacterIdForPlayer`. Coffin Nail zones and fire trails stored in `OldScratchState` with per-tick damage and telegraph rendering. Infernal Charge is multi-tick via `isCharging` flag. Devil's Dynamite reuses existing dynamite system. Sidewinder direction pre-picked at telegraph entry so telegraph matches dash. Brimstone Blast re-aims at execution (shotgun tracks). 54 tests pass (24 new), full suite 1302/1302.

---

## Phase 4: Ghost Rider Enemy + Phase 2 Attacks (The Cheat)

**Goal:** Implement the Ghost Rider add enemy and Phase 2's escalated attacks with summons.

### 4.1 Ghost Rider Enemy

Create as a standard enemy definition (via registry), spawned by Old Scratch's `attack()` function:

| Stat            | Value                                                    |
| --------------- | -------------------------------------------------------- |
| EnemyType       | `GHOST_RIDER` (22)                                       |
| HP              | 20                                                       |
| Speed           | 160 px/s                                                 |
| Tier            | THREAT                                                   |
| Radius          | 14                                                       |
| Aggro Range     | 600                                                      |
| Attack Range    | 300                                                      |
| Attack          | Single shot, 8 damage, 500 px/s, 1.5s cooldown           |
| Preferred Range | 150 (tries to maintain mid-distance)                     |
| Lifespan        | 8s — despawns via a `Lifespan` component that ticks down |
| Drop Chance     | 0%                                                       |
| Color           | 0x6688cc (spectral blue)                                 |

**AI behavior:**

- Spawns at a random road endpoint (N/S/E/W end of a road)
- CHASE: rides toward player along road, turns at intersection
- ATTACK: fires single shot at player every 1.5s while chasing
- No TELEGRAPH or RECOVERY — fires on the move (like Swarmer but faster)
- After 8s lifespan, dissolves (remove entity)

**Spawn function:** `spawnGhostRider(world: GameWorld, x: number, y: number): number`

### 4.2 Lifespan Component

```ts
// Add to components.ts:
export const Lifespan = {
  remaining: new Float32Array(MAX_ENTITIES),
};
```

New system `lifespanSystem`: decrements `Lifespan.remaining` by `dt`. When ≤ 0, add `Dead` component to trigger death/removal.

### 4.3 Phase 2 Attack Changes

Phase 2 retains all Phase 1 attacks with tighter timings:

- Telegraph durations × 0.8 (20% faster)
- Cooldowns × 0.85 (15% shorter)
- Sidewinder/Shadow Step gains a follow-up snap-shot (8 damage) on landing

**New attacks added to cycle:**

| Attack                 | Implementation                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Crossroads Salvo**   | 6 bullets in a ring (60° spacing), 300 px/s, 10 damage each. Ring expands outward from boss position. Gaps between bullets are dodge-rollable. Inserted every 3rd cycle. |
| **Brimstone Lash**     | Line telegraph along one road (N/S/E/W — direction boss is facing). 0.5s telegraph, then fire erupts along entire road length for 0.8s. 12 damage on contact.            |
| **Summon Ghost Rider** | Raises hand (0.4s), spawns Ghost Rider at random road endpoint. Cap: 2 alive. Cooldown: 10s.                                                                             |

### 4.4 Arena Shrink (Phase 2)

On `enterPhase2()`:

- Call `collapseTileRange()` to convert outer 6 tiles of each road to WALL (roads shrink from 16 to 10 tiles)
- Place BRIMSTONE tiles along road edges (2-tile-wide strips), narrowing safe road width

### 4.5 Tests

- Unit test: Ghost Rider spawns with correct stats and Lifespan component
- Unit test: Ghost Rider despawns after 8s
- Unit test: max 2 Ghost Riders alive at once
- Unit test: Crossroads Salvo fires 6 bullets in correct ring pattern
- Unit test: Brimstone Lash damages entities on the targeted road
- Unit test: arena shrink converts correct tiles to WALL
- Integration test: full Phase 2 with Ghost Rider spawns + Phase 1 attack escalation

**Acceptance:** Phase 2 is playable. Ghost Riders spawn and ride roads. Arena visibly shrinks. Brimstone cracks deal damage. Attack patterns are tighter than Phase 1.

**Files:**

- `packages/shared/src/sim/content/enemies/ghostRider.ts` — new enemy definition + registration
- `packages/shared/src/sim/components.ts` — add `Lifespan` component
- `packages/shared/src/sim/systems/lifespanSystem.ts` — new file
- `packages/shared/src/sim/content/bosses/oldScratch.ts` — Phase 2 attacks + Ghost Rider summoning + arena shrink

---

## Phase 5: Hellfire Pillars + Phase 3 Attacks (The Devil Unleashed)

**Goal:** Implement the Hellfire Pillar hazard-entities, Phase 3's bullet-hell attacks, the dust storm, and the stampede.

### 5.1 Hellfire Pillar Entity

Not a standard enemy — a destructible hazard entity. Needs: Position, Health, Collider. Does NOT need: Enemy, EnemyAI, Velocity, Steering.

```ts
// Tag component for pillar identification
export const HellfirePillar = {
  /** Boss entity this pillar heals */
  bossEid: new Uint16Array(MAX_ENTITIES),
  /** HP healed to boss per second */
  healPerSecond: new Float32Array(MAX_ENTITIES),
  /** Damage dealt to player per second in contact zone */
  contactDps: new Float32Array(MAX_ENTITIES),
  /** Contact damage radius */
  damageRadius: new Float32Array(MAX_ENTITIES),
  /** Slot index (0-3) for respawn tracking */
  slotIndex: new Uint8Array(MAX_ENTITIES),
};
```

**Spawn function:** `spawnHellfirePillar(world, x, y, bossEid, slotIndex): number`

- Sets HP to 40, radius 24, `damageRadius` 48, `healPerSecond` 2, `contactDps` 6
- No velocity, no AI — purely stationary

### 5.2 Hellfire Pillar System

Create `packages/shared/src/sim/systems/hellfirePillarSystem.ts`:

Each tick:

1. **Heal boss:** For each living pillar, add `healPerSecond * dt` to boss's `Health.current` (capped at `Health.max`)
2. **Contact damage:** Check player distance to each pillar. If within `damageRadius`, apply `contactDps * dt` damage
3. **Respawn management:** In Old Scratch's `tick()`, track destroyed pillar slots. Increment respawn timers. After 20s, respawn at original position

### 5.3 Chain Lightning Attack

When Old Scratch uses Chain Lightning:

- For each pair of living pillars, spawn a temporary line hazard between them
- 0.3s telegraph (sparks between pillars), then 3 damage ticks over 0.5s
- Player takes damage if they cross or stand on the line between any two living pillars
- Implementation: iterate all living pillar pairs, check if player position is within 16px of the line segment between them

### 5.4 Phase 3 Attack Patterns

All Phase 1/2 weapon attacks are **replaced**. Old Scratch is stationary at center.

| Attack                     | Implementation                                                                                                                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Hellfire Sweep**         | 8 fire bullets in an arc, rotating 180° across arena. `spawnBullet()` × 8, each with angular offset. Bullets travel at 400 px/s. 10 damage. Used every 4s.                                                                                                                           |
| **Soul Geyser**            | 3 sequential ground eruptions at player's snapshot position. Each: 64px radius circle telegraph (0.8s), then burst damage (15). 0.6s between each. Player must keep moving.                                                                                                          |
| **Crossroads Convergence** | Fire 6 bullets down each of the 4 roads simultaneously (24 total). Bullets travel inward toward center at 350 px/s. 8 damage each. Gaps between bullets in each wave. 1.0s telegraph (roads flash).                                                                                  |
| **Chain Lightning**        | Arcs between living Hellfire Pillars. See 5.3. Used every 8s.                                                                                                                                                                                                                        |
| **Stampede**               | Spectral cattle charge down one road through center and out the opposite side. Implementation: spawn a wall of 6 fast-moving large-hitbox bullets (800 px/s, 32px radius each) filling the road width. 20 damage. 1.2s telegraph (rumbling + dust from source road). Used every 15s. |

### 5.5 Dust Storm

At 50% of Phase 3 HP (~125 HP remaining, accounting for healing):

- Set `world.dustStorm = true` (or a similar field on the game world)
- Client reads this to restrict rendering visibility to a 200px radius around the player
- Does NOT affect game logic — purely visual. All entities still simulate normally.
- Persists until Phase 4 entry clears it

Implementation approach: add a `dustStormActive: boolean` field to `GameWorld`. The client's camera/render system applies a fog-of-war mask when active. In shared, this field is set during `tick()`.

### 5.6 Arena Shrink (Phase 3)

On `enterPhase3()`:

- Convert more road tiles to WALL: roads shrink from 10 tiles to 6 tiles from center edge
- Arena is now approximately the center clearing (16×16 = 512×512 px) plus short 6-tile road stubs
- Existing brimstone cracks from Phase 2 remain

### 5.7 Tests

- Unit test: Hellfire Pillar spawns with correct stats
- Unit test: pillar heals boss at 2 HP/s
- Unit test: pillar deals 6 DPS to player on contact
- Unit test: destroying pillar (HP → 0) stops healing
- Unit test: pillar respawns after 20s at original position
- Unit test: Chain Lightning damages player between pillar pairs
- Unit test: Chain Lightning doesn't fire if < 2 pillars alive
- Unit test: Hellfire Sweep fires 8 bullets in correct arc
- Unit test: Soul Geyser places 3 sequential eruptions
- Unit test: Crossroads Convergence fires from all 4 roads
- Unit test: Stampede fills road width with damaging wall
- Unit test: dust storm flag set at correct HP threshold
- Integration test: full Phase 3 with pillars + attacks + arena shrink

**Acceptance:** Phase 3 is playable. Pillars spawn, heal boss, take damage, die, respawn. All 5 attack patterns work. Dust storm activates at correct threshold. Arena is visibly smaller.

**Files:**

- `packages/shared/src/sim/components.ts` — add `HellfirePillar` component
- `packages/shared/src/sim/systems/hellfirePillarSystem.ts` — new file
- `packages/shared/src/sim/content/bosses/oldScratch.ts` — Phase 3 attacks + pillar management + dust storm + arena shrink

---

## Phase 6: The Final Draw (Phase 4)

**Goal:** Implement the quick-draw duel mechanic that serves as the boss fight's climax.

### 6.1 Draw State Machine

Phase 4 cycles through draw rounds. Each round has 4 sub-phases:

```
STAREDOWN (1.5-2.5s) → FLASH (instant) → SCRAMBLE (2-3s) → RESET (0.5s) → STAREDOWN ...
```

State tracked in `OldScratchState`:

```ts
drawRound: number; // 1, 2, 3, ...
drawPhase: "staredown" | "flash" | "scramble" | "reset";
staredownTimer: number; // countdown
staredownDuration: number; // varies per round: 2.5, 2.0, 1.5, 1.5, ...
flashFrame: boolean; // true for exactly 1 tick (the signal)
scrambleTimer: number; // countdown for free-combat window
```

### 6.2 Staredown Phase

- Both combatants face each other. Old Scratch is stationary at north road; player is at south.
- Old Scratch enters a special AI state: no attacks, no movement
- A visual indicator is pushed to `world.bossTelegraphs`: a `'circle'` telegraph centered on Old Scratch that slowly shrinks (progress 0→1 over staredown duration) — representing the "crosshair closing" that signals the draw is coming
- Staredown duration varies: round 1 = 2.5s, round 2 = 2.0s, round 3+ = 1.5s

### 6.3 The Flash

At the end of the staredown, `flashFrame = true` for exactly 1 tick (16.67ms at 60Hz). This is the signal to fire.

Push a special telegraph event: `kind: 'flash'` (may need to extend BossTelegraph or use a dedicated world event array) — client renders a white frame flash on Old Scratch's gun hand.

### 6.4 Player Response Timing

After the flash, track player input:

- **Perfect Draw (≤ 0.3s after flash):** Player's next bullet deals 20 damage. Old Scratch is staggered for 0.5s (cannot fire).
- **Good Draw (0.3-0.6s after flash):** Player's next bullet deals 10 damage. No stagger.
- **Slow Draw (> 0.6s after flash):** Old Scratch fires first — 15 damage, 800 px/s. Player CAN dodge-roll to avoid.
- **Panic Shot (before flash):** If player fires during staredown, Old Scratch sidesteps and fires — guaranteed 15 damage (no dodge). Uses the Infernal Counter pattern.

Implementation: in `tick()` during staredown, check if any player bullet has been spawned this tick. If yes, trigger panic-shot counter. After flash, start a timer. Check player bullet spawn timing relative to flash frame to determine Perfect/Good/Slow.

### 6.5 Scramble Phase

After the draw resolution, both combatants enter 2-3s of free combat:

- Old Scratch uses Phase 1 attacks at 1.5× speed (reduced cooldowns and telegraphs)
- Player can move freely and use all abilities
- This is where the player's build matters — the scramble lets upgrades shine
- After scramble timer expires, both return to staredown positions for next round

### 6.6 Victory Condition

When `Health.current[eid] <= 0`, Old Scratch enters a death sequence:

- Set `Invincible` component (can't be hit during death animation)
- Push a `bossDefeated` event to `world.bossPhaseChanges` (or a new event array)
- After 4s death animation timer, remove entity and trigger stage completion

### 6.7 Tests

- Unit test: staredown duration is correct per round (2.5, 2.0, 1.5, 1.5)
- Unit test: Perfect Draw within 0.3s deals 20 damage + stagger
- Unit test: Good Draw between 0.3-0.6s deals 10 damage, no stagger
- Unit test: Slow Draw after 0.6s triggers Old Scratch return fire (15 damage)
- Unit test: Panic Shot before flash triggers counter (15 damage, no dodge)
- Unit test: scramble phase uses Phase 1 attacks at 1.5× speed
- Unit test: death at 0 HP triggers death sequence
- Integration test: full Phase 4 — 3 perfect draws should kill from 60 HP

**Acceptance:** Phase 4 is playable. Draw rounds cycle correctly. Timing-based damage works. Fight can be won. Victory triggers stage completion.

**Files:**

- `packages/shared/src/sim/content/bosses/oldScratch.ts` — Phase 4 draw mechanic + scramble + death sequence

**Implemented (Sprint 19 Phase 6):**

- Added `'flash'` to `BossTelegraph.kind` union in `world.ts` for client-side draw signal rendering
- Phase 4 constants: staredown durations (2.5/2.0/1.5s), draw windows (perfect ≤0.3s, good ≤0.6s), damage values (20/10/15), scramble (2.5s at 1.5× speed), stagger (0.5s), reset (0.5s)
- New `OldScratchState` fields: `flashTimer`, `drawResolved`, `staggerTimer`, `scrambleTimer`, `resetTimer`
- Draw state machine in `tick()`: staredown (closing circle telegraph) → flash (1-tick white flash telegraph) → scramble (draw resolution + P1 attacks at 1.5× speed) → reset → next round with decreasing staredown
- `handleCounterHook()` extended for Phase 4: panic shot (staredown = guaranteed 15 damage to player, bullet negated), draw timing (perfect 20dmg + stagger, good 10dmg, slow = normal pass-through since boss already fired)
- Slow draw: boss fires a SLOW_DRAW_DAMAGE bullet at player when `flashTimer > GOOD_DRAW_WINDOW` without player having shot
- Scramble reuses P1 attack dispatch via `getCycleForCharacter(charId, 1)` with `SCRAMBLE_TELEGRAPH_MUL` (1/1.5) applied to telegraph and recovery durations; BLACK_IRON_RELOAD skipped during scramble
- Boss death handled by existing `healthSystem` flow — no custom Invincible/death-timer needed (death VFX is a client concern for a later sprint)
- 15 new tests: staredown (3), draw timing (4), scramble (3), state machine (3), integration (2)
- 12 new constant exports re-exported from `bosses/index.ts`
- All 1358 tests pass, typecheck clean

---

## Phase 7: Stage 4 Encounter Wiring

**Goal:** Wire Old Scratch and the crossroads into the run progression as Stage 4.

> Implemented: `generateMap()` dispatcher routes `crossroads_dirt` style to `generateCrossroads`, all other styles to `generateArena`. `STAGE_4_ENCOUNTER` defined with zero-fodder, single Old Scratch threat wave, no objective. `DEFAULT_RUN_STAGES` updated to 4 entries. All production `generateArena` call sites (stageProgression, SingleplayerModeController, MultiplayerModeController, GameRoom) switched to `generateMap`. Boss center spawn: wave spawner checks `crossroadsLandmarks` + boss module to spawn at signpost center instead of edge. 6 new tests (3 mapGenerator dispatcher, 3 encounter definition + wave spawner).

### 7.1 New Objective Type

Add to `packages/shared/src/sim/content/objectives.ts`:

```ts
export const STAGE_4_SHOWDOWN: ObjectiveConfig = {
  type: "showdown",
  description: "Face the Devil",
};
```

Add `'showdown'` to the `ObjectiveConfig.type` union. The showdown objective has no secondary mechanics — the boss IS the entire encounter. The objective system should treat it as "active until boss is dead, then success."

### 7.2 Stage 4 Encounter Definition

Add to `packages/shared/src/sim/content/waves.ts`:

```ts
export const STAGE_4_ENCOUNTER: StageEncounter = {
  mapConfig: STAGE_4_MAP_CONFIG,
  objective: STAGE_4_SHOWDOWN,
  bossPool: [EnemyType.OLD_SCRATCH],
  waves: [
    {
      fodderBudget: 0,
      fodderPool: [],
      maxFodderAlive: 0,
      threats: [{ type: EnemyType.OLD_SCRATCH, count: 1 }],
      spawnDelay: 2, // Brief pause before boss spawns
      threatClearRatio: 1.0,
    },
  ],
};
```

### 7.3 Update Run Stages

```ts
export const DEFAULT_RUN_STAGES: StageEncounter[] = [
  STAGE_1_ENCOUNTER,
  STAGE_2_ENCOUNTER,
  STAGE_3_ENCOUNTER,
  STAGE_4_ENCOUNTER, // ← new
];
```

### 7.4 Wave Spawner Compatibility

The wave spawner needs to handle:

- Zero-fodder waves (fodderBudget 0 should not attempt to spawn fodder)
- Boss-only threat list (should spawn boss at center, not at edge)
- The `'showdown'` objective type in objective system

Verify the wave spawner already handles `fodderBudget: 0` gracefully. If not, add a guard.

Boss spawn position for Stage 4: the center of the crossroads (arena center), NOT edge-spawned. May need a special case in the spawner, or handle in the encounter config.

### 7.5 Map Generator Integration

The encounter system currently uses the procedural map generator for all stages. Stage 4 needs to route to the crossroads generator instead.

Options:

1. Add a `generator: 'procedural' | 'crossroads'` field to `MapConfig`
2. Check for a custom generator function on the map config
3. Detect based on `baseTiles.style === 'crossroads_dirt'`

Simplest approach: add an optional `customGenerator` function to `MapConfig`.

### 7.6 Stage Transition

After Stage 3 completion, the run should transition to Stage 4. Verify the existing stage progression logic in the encounter/session system handles a 4th stage correctly (it currently indexes `DEFAULT_RUN_STAGES` by stage number).

### 7.7 Tests

- Unit test: `STAGE_4_ENCOUNTER` is valid (has waves, has boss, has map config)
- Unit test: `DEFAULT_RUN_STAGES` has 4 entries
- Unit test: wave spawner handles zero-fodder wave without errors
- Unit test: `'showdown'` objective resolves to success when boss dies
- Integration test: full stage progression from Stage 3 → Stage 4

**Acceptance:** Stage 4 appears after Stage 3 in a run. Boss spawns at crossroads center. Objective displays "Face the Devil." Killing Old Scratch completes the stage and the run.

**Files:**

- `packages/shared/src/sim/content/objectives.ts` — add showdown objective
- `packages/shared/src/sim/content/waves.ts` — add `STAGE_4_ENCOUNTER`, update `DEFAULT_RUN_STAGES`
- `packages/shared/src/sim/content/maps/mapConfig.ts` — add `customGenerator` field
- `packages/shared/src/sim/systems/waveSpawner.ts` — handle zero-fodder + boss spawn position
- `packages/shared/src/sim/systems/objectiveSystem.ts` — handle `'showdown'` type

---

## Phase 8: Client Rendering — Crossroads Arena

**Goal:** Render the crossroads map, dynamic tile changes, and Phase 3/4 visual effects.

### 8.1 Crossroads Tile Art

Add `crossroads_dirt` to the base tile style system:

- 4 variants of cracked, sun-bleached dirt with reddish tint
- Visually distinct from `red_dirt` (Stage 1) — more supernatural, faintly glowing cracks in the earth

Add sprite tiles for new tile types:

- `BRIMSTONE` — glowing orange-red cracks in the ground, animated flicker (2-frame)
- `DARKNESS` — swirling black/purple void, animated churn (3-frame)

### 8.2 Dynamic Tile Updates

The tilemap renderer needs to handle mid-game tile changes. Currently, the tilemap is rendered once at stage load. When Old Scratch triggers arena shrinking:

- Listen for tile change events (new event type on `GameWorld` or push through `bossPhaseChanges`)
- Re-render affected tile chunks
- Animate the transition: crumbling/collapsing VFX for tiles becoming WALL, fire eruption for tiles becoming BRIMSTONE

### 8.3 Hellfire Pillar Rendering

- Pillar: tall iron lantern sprite wreathed in flame (animated 4-frame fire loop)
- Damage zone: faint red-orange circle on ground (48px radius), pulsing alpha
- Chain Lightning: bright yellow-white line sprites between living pillars during the attack (0.5s duration)
- Destruction: explosion + ember scatter particles. Respawn: rising flame from ground.

### 8.4 Dust Storm

When `world.dustStormActive`:

- Apply a fog-of-war mask: only render entities/tiles within 200px of the player
- Render swirling dust particle layer over the entire screen
- Gradually darken ambient lighting
- Hellfire Pillars glow through the dust (their fire is visible even in the storm — helps navigation)

### 8.5 Old Scratch Sprites

Old Scratch needs 4 visual states (one per phase):

- **Phase 1:** Gentleman — black duster, wide-brim hat, human silhouette
- **Phase 2:** Mask slipping — eyes glow red, shadow tendrils, hat gone, curved horns
- **Phase 3:** True form — massive, torso of shadow and embers, column of black smoke base
- **Phase 4:** Broken gentleman — scorched duster, staggering, wounded

Phase 3's true form is significantly larger (3-4× sprite scale). Each phase transition should have a brief transformation animation.

### 8.6 Ghost Rider Sprites

- Translucent blue-white cowboy on horseback
- Spectral dust trail particles behind movement
- Dissolution effect on despawn (fade + scatter)

### 8.7 Phase 4 Draw UI

- Staredown: closing circle indicator on Old Scratch (HUD overlay or world-space ring)
- Flash: full-screen white frame flash (1-2 frames, very fast)
- Perfect/Good/Slow text popup after each draw
- Camera: slow zoom during staredown, snap zoom on flash

**Files:**

- `packages/client/src/assets/` — new tile sprites, boss sprites, Ghost Rider sprites
- `packages/client/src/render/TilemapRenderer.ts` — dynamic tile update support
- `packages/client/src/render/EnemyRenderer.ts` — Old Scratch multi-phase rendering, Ghost Rider rendering
- `packages/client/src/render/HellfirePillarRenderer.ts` — new file
- `packages/client/src/render/DustStormEffect.ts` — new file (fog-of-war mask + particle layer)
- `packages/client/src/render/DrawDuelUI.ts` — new file (Phase 4 HUD overlay)

---

## Phase 9: VFX Polish

**Goal:** Make every phase transition, attack, and death feel impactful.

### 9.1 Phase Transition VFX

- **P1→P2:** Boot stamp → ground cracks radiate outward → screen shake (medium trauma). Brimstone cracks ignite with fire particles. Road edges crumble (tile destruction particles).
- **P2→P3:** Old Scratch's form tears apart — shadow tendrils expand outward. HP bar refills with flame effect. Pillars erupt from the ground with fire geyser VFX. Heavy screen shake.
- **P3→P4:** Everything collapses inward — fire dies, dust clears. Brief silence. Camera slowly pans to duel positions. Cinematic letterbox bars (top/bottom black bars).
- **Death:** Old Scratch dissolves into black smoke spiraling upward. Crossroads bathed in warm sunlight. Peaceful particle effect (golden dust motes).

### 9.2 Attack VFX

- **Dead-Eye Shot:** Thin red laser sight during telegraph → muzzle flash + bullet trail
- **Hellfire Sweep:** Fire particle trail behind each bullet. Orange screen-edge glow.
- **Soul Geyser:** Ground circles glow red during telegraph → eruption of fire and debris
- **Crossroads Convergence:** Roads flash white during telegraph → bullet waves leave ground-level dust trails
- **Stampede:** Dust cloud fills source road during telegraph → translucent spectral cattle with red eyes charge through, screen shake while active
- **Chain Lightning:** Bright electric arcs between pillars, screen flicker

### 9.3 Camera Work

- Phase 1: standard follow camera with gentle smoothing
- Phase 2: slightly wider zoom to show more of the shrinking arena
- Phase 3: camera pulls back further for the bullet-hell view. Shake on stampede.
- Phase 4 staredown: slow dramatic zoom. Lock camera between the two combatants. On flash: snap zoom. On draw resolution: brief hit-stop.

### 9.4 Draw Feedback

- Perfect Draw: screen flash gold, "PERFECT" text, time-slow for 0.3s
- Good Draw: screen flash white, "DRAW!" text
- Slow Draw: screen tint red, Old Scratch's shot has a prominent tracer
- Panic Shot: screen shudder, "TOO EARLY" text in red

**Files:**

- `packages/client/src/render/BossVFX.ts` — phase transition effects
- `packages/client/src/render/AttackVFX.ts` — per-attack visual effects
- `packages/client/src/engine/Camera.ts` — Phase 4 cinematic camera modes
- `packages/client/src/render/DrawFeedback.ts` — draw round result visuals

---

## Phase 10: Integration Testing

**Goal:** Full end-to-end testing of Stage 4 as part of a complete run.

### 10.1 Unit Tests (shared)

Per system:

- Crossroads map generation (tile layout, bounds, landmarks)
- Dynamic tile modification (setTileAt, collapseTileRange)
- Old Scratch: spawn, all 4 phase transitions, mid-fight heal
- Old Scratch: each Phase 1 attack (×3 character variants = 9 attack tests)
- Old Scratch: each Phase 2 attack (Crossroads Salvo, Brimstone Lash, summon)
- Old Scratch: each Phase 3 attack (Hellfire Sweep, Soul Geyser, Convergence, Chain Lightning, Stampede)
- Old Scratch: Infernal Counter (trigger, cooldown, damage)
- Ghost Rider: spawn, movement, attack, despawn on lifespan expiry
- Hellfire Pillar: spawn, boss healing, contact damage, destruction, respawn timer
- Draw mechanic: staredown timing, flash detection, Perfect/Good/Slow/Panic classification
- Encounter wiring: stage progression, zero-fodder wave, showdown objective

### 10.2 Integration Tests (shared)

- Full fight simulation: automated player that shoots on cooldown, verify boss dies
- Phase progression: verify correct phase at each HP threshold
- Pillar interaction: destroy all 4, verify healing stops, verify respawn
- Ghost Rider cap: verify max 2 alive
- Arena shrink: verify tile changes at each phase transition
- Stage 4 after Stage 3: verify encounter loads, objective activates

### 10.3 Manual Testing Checklist

- [ ] Stage 4 appears after completing Stage 3
- [ ] Crossroads arena renders correctly
- [ ] Old Scratch spawns at center with correct visual
- [ ] Phase 1 attacks are character-specific and all dodgeable
- [ ] Infernal Counter triggers when shooting during counter window
- [ ] Phase 2 transition: ground cracks, arena shrinks, screen shake
- [ ] Ghost Riders spawn from road endpoints, ride toward player
- [ ] Phase 3 transition: mid-fight heal visible on HP bar
- [ ] Hellfire Pillars spawn at corners, fire visible
- [ ] Destroying pillars stops healing, creates safe zone
- [ ] Chain Lightning arcs between living pillars
- [ ] Stampede fills entire road width
- [ ] Dust storm reduces visibility
- [ ] Phase 4: draw duel feels tense, timing works
- [ ] Perfect/Good/Slow feedback is clear
- [ ] Killing Old Scratch triggers death sequence and run victory
- [ ] `bun run typecheck` clean
- [ ] `bun test` passes all
- [ ] `bun run build` succeeds

---

## Implementation Order

| #   | Phase                                          | Estimate | Depends On | Package         |
| --- | ---------------------------------------------- | -------- | ---------- | --------------- |
| 1   | Crossroads Map Generator                       | Medium   | —          | shared          |
| 2   | Old Scratch Core (spawn + phases + counter)    | Large    | Phase 1    | shared          |
| 3   | Phase 1 Attacks (The Wager)                    | Large    | Phase 2    | shared          |
| 4   | Ghost Rider + Phase 2 Attacks (The Cheat)      | Large    | Phase 3    | shared          |
| 5   | Hellfire Pillars + Phase 3 Attacks (Unleashed) | Large    | Phase 4    | shared          |
| 6   | Phase 4 Draw Mechanic (Final Draw)             | Medium   | Phase 2    | shared          |
| 7   | Stage 4 Encounter Wiring                       | Medium   | Phases 1-6 | shared          |
| 8   | Client Rendering                               | Large    | Phases 1-7 | client          |
| 9   | VFX Polish                                     | Medium   | Phase 8    | client          |
| 10  | Integration Testing                            | Medium   | All        | shared + client |

Phases 3-6 depend on Phase 2 (boss skeleton) but are largely independent of each other — they can be developed in any order, though the listed order (P1→P2→P3→P4) matches the player experience and makes manual testing natural.

---

## New EnemyType Values

```ts
// Add to EnemyType enum in components.ts:
OLD_SCRATCH: 21,
GHOST_RIDER: 22,
HELLFIRE_PILLAR: 23,
```

---

## New ECS Components

```ts
// Lifespan — auto-despawn after time expires
export const Lifespan = {
  remaining: new Float32Array(MAX_ENTITIES),
};

// Hellfire Pillar — stationary healing hazard
export const HellfirePillar = {
  bossEid: new Uint16Array(MAX_ENTITIES),
  healPerSecond: new Float32Array(MAX_ENTITIES),
  contactDps: new Float32Array(MAX_ENTITIES),
  damageRadius: new Float32Array(MAX_ENTITIES),
  slotIndex: new Uint8Array(MAX_ENTITIES),
};
```

---

## New Systems

| System                  | File                                | Purpose                                       |
| ----------------------- | ----------------------------------- | --------------------------------------------- |
| `lifespanSystem`        | `systems/lifespanSystem.ts`         | Tick down Lifespan, kill at 0                 |
| `hellfirePillarSystem`  | `systems/hellfirePillarSystem.ts`   | Boss healing, contact damage, chain lightning |
| `brimstoneHazardSystem` | Extension of existing hazard system | BRIMSTONE + DARKNESS tile damage              |

---

## Risk Assessment

| Risk                                                   | Mitigation                                                                                                                                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mid-fight heal feels unfair                            | Heal amount (to 250, not full 400) is telegraphed with dramatic VFX. Player can see the HP bar refill. Serves same function as Hades' HP refill — it works because Phase 3 is mechanically different, not just "more Phase 2." |
| Infernal Counter too punishing                         | 0.4s window is narrow. 1.5s cooldown prevents chain punishment. Counter is telegraphed (red shimmer). Damage is moderate (12). Players learn quickly: "don't shoot during the shimmer."                                        |
| Phase 4 draw timing feels random                       | Flash is 1 tick but the closing-circle telegraph gives players advance warning of WHEN it will happen. Staredown duration is consistent per round (not random). Panic shot punish is the main teaching tool.                   |
| Arena shrink + hazards = nowhere to dodge              | Arena shrinks gradually (3 steps across 3 phases). Phase 3's center clearing (512×512 px) is still larger than most boss rooms in Gungeon/Isaac. Destroying Hellfire Pillars creates safe zones.                               |
| Ghost Riders + boss attacks = too much to track        | Ghost Riders are capped at 2. They despawn after 8s. They deal moderate damage (8). They're designed as "pressure" that prevents camping, not as serious threats themselves.                                                   |
| Dust storm + bullet hell = unfair                      | Dust storm only activates in the back half of Phase 3. By this point, the player has learned all Phase 3 attacks. Hellfire Pillar glow is visible through dust. Stampede has an audio telegraph.                               |
| Dynamic tile modification causes rendering glitches    | Tile changes push events to client. Test tile re-rendering thoroughly. Keep tile changes to phase transitions (not per-frame).                                                                                                 |
| 400 HP + 250 heal = fight drags                        | Effective total is ~410 damage. At Sheriff's 10 damage × 5 shots/s = 50 DPS theoretical max, fight ceiling is ~8s of pure DPS per phase. Real time is ~3-4 minutes with dodging — comparable to Hades/Gungeon final bosses.    |
| Character-adaptive Phase 1 triples the testing surface | Phase 1 attacks are simple (3-4 attacks per character). The attack implementations reuse existing bullet/melee patterns. Test each character variant explicitly.                                                               |

---

## Summary

Sprint 19 builds the final stage of High Noon in 10 phases:

| Phase | What It Builds               | Key Deliverable                                            |
| ----- | ---------------------------- | ---------------------------------------------------------- |
| 1     | Crossroads map               | Custom + shaped arena with dynamic tile API                |
| 2     | Boss skeleton                | Old Scratch spawn, 4-phase state machine, Infernal Counter |
| 3     | Phase 1: The Wager           | Character-adaptive gentleman duel (3 attack sets)          |
| 4     | Phase 2: The Cheat           | Ghost Rider adds + escalated attacks + arena shrink        |
| 5     | Phase 3: The Devil Unleashed | Hellfire Pillars + bullet hell + stampede + dust storm     |
| 6     | Phase 4: The Final Draw      | Quick-draw reaction-time duel mechanic                     |
| 7     | Encounter wiring             | Stage 4 in run progression, showdown objective             |
| 8     | Client rendering             | Arena tiles, boss sprites, pillar rendering, dust storm    |
| 9     | VFX polish                   | Phase transitions, attack effects, draw feedback, camera   |
| 10    | Testing                      | Unit + integration + manual verification                   |

The fight follows a dramatic arc: **tense duel → rule break → overwhelming chaos → intimate final showdown.** Every phase changes what the player is doing, not just how hard it is. The crossroads arena shrinks and transforms alongside the boss, and the Phase 4 draw brings the run full circle from the Stage 1 duel.
