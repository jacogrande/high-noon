# Sprint: Positional Audio (Stereo Panning)

**Goal**: Add a lightweight spatial audio facade so that gunfire, impacts, explosions, and other world-space sounds are stereo-panned and volume-attenuated relative to the local player's position. In multiplayer, each client uses its own player as the listener.

**Depends on**: Current main (SoundManager, GameplayEventProcessor, Camera, PlayerRenderer, GameplayEvents)

---

## Current State

**What exists:**
- `SoundManager` wraps Howler.js. `play(name, opts?)` fires a sound with optional per-play `volume` and `pitchVariance` overrides. Howler's per-sound `stereo()` method is available but unused.
- `GameplayEventProcessor` is the single dispatch point for all presentation-layer side effects. Every `sound.play()` call happens here — 25+ call sites across ~30 event types.
- Most gameplay events already carry world-space `x, y` coordinates (e.g., `player-fire` has `muzzleX/muzzleY`, `enemy-sync` deaths have `x/y`, `dynamite-detonation` has `x/y`, `boss-death` has `x/y`). A few events are non-positional by design (`reload-start`, `dry-fire`, `showdown-activate`, UI sounds).
- `Camera.getPosition()` returns the current camera center in world space — closely tracks the local player with aim-offset.
- `PlayerRenderer.getPlayerEntity()` returns the local player's EID. `Position.x[eid]` / `Position.y[eid]` give raw world coordinates.
- Viewport is 720×404 world units (360×202 internal pixels at WORLD_SCALE 0.5). This defines the audible "full stereo" range.
- In multiplayer, `PlayerRenderer.localPlayerEid` is set to the local client's entity. Remote players are distinct entities.
- Howler.js `stereo(pan, id)` accepts -1.0 (full left) to 1.0 (full right). `volume(v, id)` accepts 0.0–1.0 per play instance.

**What doesn't exist:**
- Any spatial audio logic — all sounds play at center pan, base volume
- A listener position concept
- Distance-based attenuation
- Pan calculation from relative position

---

## Design Constraints

1. **No Web Audio API spatialization** — Howler's built-in `stereo(pan)` is sufficient for a 2D top-down game. Full 3D positional audio (HRTF, distance models) is overkill and adds complexity. Simple left/right pan + volume falloff is the right fit.
2. **Listener = local player, not camera** — The camera has aim-offset and shake, which would cause the audio field to wobble. The player's world position is stable and intuitive.
3. **Non-positional sounds stay untouched** — UI sounds (`ui_click`, `ui_hover`, `upgrade_select`), state-change sounds (`reload-start`, `dry-fire`, `showdown-activate/kill/expire`, `roll`), and global announcements (`wave_start`, `wave_clear`, `stage_complete`, `level_up`, `boss_intro`, `player_death`) play at center pan, full volume. Only sounds tied to a specific world-space location get spatialized.
4. **Graceful fallback** — If no listener position is set (e.g., during menus, death screen, or before the player entity exists), all sounds play centered at base volume. The system should never throw.
5. **Multiplayer-correct** — Each client independently computes pan/volume from its own local player position. No shared-package changes needed. No server involvement.
6. **Determinism unaffected** — Audio is purely presentational. Nothing in `packages/shared` changes. No new RNG calls, no simulation state reads beyond Position components.
7. **Simple attenuation curve** — Linear falloff from full volume at distance 0 to silence at a configurable max distance. No logarithmic curves or environmental occlusion. Keep it dead simple and tune by ear later.

---

## Epic Overview

| # | Epic | Package(s) | Priority | Estimate |
|---|------|-----------|----------|----------|
| 1 | SpatialAudio facade | client/audio | P0 | Small | **DONE** |
| 2 | Wire SoundManager to accept spatial params | client/audio | P0 | Small | **DONE** |
| 3 | Tag events as positional and thread through | client/scenes | P0 | Medium | **DONE** |
| 4 | Set listener position each frame | client/scenes | P0 | Small | **DONE** |
| 5 | Tuning constants and edge cases | client | P1 | Small | **DONE** |

---

## Epic 1: SpatialAudio Facade

A single stateless utility module that computes pan and volume from two world-space points.

### Ticket 1.1 — Create `SpatialAudio.ts`

**File**: `packages/client/src/audio/SpatialAudio.ts`

Create a module with:

```typescript
export interface SpatialResult {
  pan: number    // -1.0 (left) to 1.0 (right)
  volume: number // 0.0 (silent) to 1.0 (full)
}

export interface SpatialAudioConfig {
  /** World units from listener at which sound is fully silent. */
  maxDistance: number
  /** World units of horizontal offset for full pan (-1 or +1). */
  panSpread: number
}

const DEFAULT_CONFIG: SpatialAudioConfig = {
  maxDistance: 800,  // ~1.1x viewport diagonal (720×404 → diagonal ~826)
  panSpread: 360,    // half-viewport width = full pan
}
```

**`computeSpatial(listenerX, listenerY, sourceX, sourceY, config?)`** → `SpatialResult`

Logic:
```
dx = sourceX - listenerX
dy = sourceY - listenerY
distance = sqrt(dx² + dy²)

// Volume: linear falloff, clamped
volume = clamp(1 - distance / maxDistance, 0, 1)

// Pan: horizontal offset normalized to [-1, 1]
pan = clamp(dx / panSpread, -1, 1)
```

This is the entire spatial model. No vertical component (top-down game), no occlusion, no rolloff curves.

Export a pre-allocated result object to avoid GC pressure (called dozens of times per frame).

### Ticket 1.2 — Export from audio index

**File**: `packages/client/src/audio/index.ts`

Add `export { computeSpatial, type SpatialResult, type SpatialAudioConfig } from './SpatialAudio'`

---

## Epic 2: Wire SoundManager to Accept Spatial Params

Extend `SoundManager.play()` to accept optional pan and volume-scale parameters, using Howler's per-instance `stereo()` and `volume()`.

### Ticket 2.1 — Extend play() opts

**File**: `packages/client/src/audio/SoundManager.ts`

Add optional fields to the `play()` opts parameter:

```typescript
play(name: string, opts?: {
  pitchVariance?: number
  volume?: number
  pan?: number           // NEW: -1 to 1, applied via howl.stereo(pan, id)
  volumeScale?: number   // NEW: 0 to 1, multiplied with base volume
}): void
```

Implementation in `play()`:
```typescript
const id = entry.howl.play()

// Existing pitch variance logic (unchanged)...

// Spatial: apply pan
if (opts?.pan !== undefined) {
  entry.howl.stereo(opts.pan, id)
}

// Volume: base × optional per-call scale × optional per-call override
if (opts?.volumeScale !== undefined) {
  const base = opts?.volume ?? entry.howl.volume()
  entry.howl.volume(base * opts.volumeScale, id)
} else if (opts?.volume !== undefined) {
  entry.howl.volume(opts.volume, id)
}
```

This is fully backwards-compatible. Existing `play('fire')` calls work identically.

---

## Epic 3: Tag Events as Positional and Thread Through

Update `GameplayEventProcessor` to compute spatial audio for events that have world-space coordinates.

### Ticket 3.1 — Add listener state to GameplayEventProcessor

**File**: `packages/client/src/scenes/core/GameplayEventProcessor.ts`

Add to the class:

```typescript
private listenerX = 0
private listenerY = 0

setListenerPosition(x: number, y: number): void {
  this.listenerX = x
  this.listenerY = y
}
```

Import `computeSpatial` from `../../audio/SpatialAudio`.

### Ticket 3.2 — Add a private helper for spatial play

**File**: `packages/client/src/scenes/core/GameplayEventProcessor.ts`

```typescript
private playSpatial(name: string, worldX: number, worldY: number, opts?: { pitchVariance?: number; volume?: number }): void {
  const spatial = computeSpatial(this.listenerX, this.listenerY, worldX, worldY)
  this.sound.play(name, {
    ...opts,
    pan: spatial.pan,
    volumeScale: spatial.volume,
  })
}
```

### Ticket 3.3 — Convert positional sound.play() calls to playSpatial()

**File**: `packages/client/src/scenes/core/GameplayEventProcessor.ts`

Convert these calls (they already have x/y available in the event):

| Event type | Sound | Position source |
|-----------|-------|----------------|
| `enemy-sync` (deaths) | `enemy_die` | Use average of `event.deaths[].x/y` or first death position |
| `player-fire` | `fire` | `event.muzzleX, event.muzzleY` |
| `shot-confirmed` | `hit` | `event.x, event.y` |
| `player-hit` | `player_hit` | Keep non-spatial (it's YOU being hit — should be centered and full volume) |
| `player-melee-swing` | `roll` (placeholder) | `event.x, event.y` |
| `dynamite-detonation` | `explosion` | `event.x, event.y` |
| `last-rites-pulse` | `enemy_die` | `event.x, event.y` |
| `boss-intro` | `boss_intro` | `event.x, event.y` |
| `boss-phase-transition` | `showdown_activate` | `event.x, event.y` |
| `boss-death` | `boss_death` | `event.x, event.y` |
| `trap-detonation` | `explosion` | `event.x, event.y` |
| `level-up` | `level_up` | `event.x, event.y` |
| `bullet-removed` (wall impacts) | (no sound currently) | N/A — skip for now |

**Keep these NON-spatial** (center pan, full volume, unchanged):
- `player-hit` — first-person feedback, always centered
- `reload-start`, `reload-complete`, `dry-fire` — local player actions, no position
- `showdown-activate`, `showdown-kill`, `showdown-expire` — local player ability, no position
- `last-rites-activate`, `last-rites-expire` — local player ability
- `roll` — local player action
- `wave-start`, `wave-clear`, `stage-complete` — global announcements
- `gold-pickup`, `player-death` — local player events
- `draw-flash`, `draw-result` — UI/global

### Ticket 3.4 — Handle multi-position events (enemy-sync)

`enemy-sync` batches multiple deaths and hits into one event. For the death sound:
- If 1 death: use that position directly
- If 2+ deaths: use the centroid (average x/y) of all deaths

For hit impact sounds (if added later): each hit should be its own spatial call since they can be spread across the arena. But currently `enemy_die` is the only sound here, fired once per batch, so centroid is fine.

---

## Epic 4: Set Listener Position Each Frame

### Ticket 4.1 — Update listener position in SingleplayerModeController

**File**: `packages/client/src/scenes/core/SingleplayerModeController.ts`

In the render loop (or update loop), before `eventProcessor.processAll()` is called:

```typescript
const playerEid = this.playerRenderer.getPlayerEntity()
if (playerEid >= 0) {
  this.eventProcessor.setListenerPosition(
    Position.x[playerEid],
    Position.y[playerEid]
  )
}
```

This ensures the listener is set before any events are processed that frame.

### Ticket 4.2 — Update listener position in MultiplayerModeController

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

Same pattern but using `this.myClientEid` (the local player's entity in the client ECS world):

```typescript
if (this.myClientEid >= 0) {
  this.eventProcessor.setListenerPosition(
    Position.x[this.myClientEid],
    Position.y[this.myClientEid]
  )
}
```

### Ticket 4.3 — Footstep spatialization

**File**: `packages/client/src/scenes/core/SingleplayerModeController.ts` (and multiplayer equivalent)

Footstep sounds are played directly in the mode controller (not through the event processor). These are the local player's own footsteps, so they should remain non-spatial (centered, full volume).

If remote player footsteps are added later, those would need spatialization. For now, no change needed — just document the decision.

---

## Epic 5: Tuning Constants and Edge Cases

### Ticket 5.1 — Tune maxDistance and panSpread

Start with:
- `maxDistance = 800` — sounds beyond ~1 screen diagonal are silent. This means off-screen sounds are audible but quiet, giving spatial awareness.
- `panSpread = 360` — half the viewport width (720/2). A sound at the edge of the screen is at ~±1.0 pan. Sounds near the player are centered.

These will need playtesting. Consider exposing them as constants at the top of `SpatialAudio.ts` for easy iteration.

### Ticket 5.2 — Boss sounds minimum volume floor

Boss sounds (`boss_intro`, `boss_death`, `boss-phase-transition`) are critical gameplay feedback. Add a minimum volume floor so they're never fully silent even if the boss is far away:

```typescript
private playSpatialBoss(name: string, worldX: number, worldY: number): void {
  const spatial = computeSpatial(this.listenerX, this.listenerY, worldX, worldY)
  this.sound.play(name, {
    pan: spatial.pan,
    volumeScale: Math.max(spatial.volume, 0.3), // never below 30%
  })
}
```

### Ticket 5.3 — Edge case: dead player / no entity

When the player dies, `Position.x[eid]` still holds the last position. The listener stays at the death location, which is correct — the "camera" of a dead player doesn't move, so audio shouldn't shift either.

If the player entity is removed entirely (EID recycled), the listener position freezes at its last value. This is fine since no new gameplay events fire after death.

No code change needed — just verify during testing.

### Ticket 5.4 — Edge case: explosion/boss at listener position

When `distance = 0`, `volume = 1.0` and `pan = 0.0` (centered). This is correct — a point-blank explosion should be loud and centered. No special handling.

---

## Implementation Order

```
1.1  SpatialAudio.ts (pure function, testable in isolation)
1.2  Export from index
2.1  SoundManager.play() extension (backwards-compatible)
3.1  Listener state on GameplayEventProcessor
3.2  playSpatial() helper
3.3  Convert positional calls (the bulk of the work)
3.4  Multi-position centroid for enemy-sync
4.1  Set listener in SingleplayerModeController
4.2  Set listener in MultiplayerModeController
5.1  Tune constants by ear
5.2  Boss volume floor
```

Tickets 1.1 through 2.1 can be built and tested without touching any existing behavior. Ticket 3.3 is the integration point where existing sounds start panning. Tickets 4.1–4.2 activate the system.

---

## Files Changed

| File | Change |
|------|--------|
| `packages/client/src/audio/SpatialAudio.ts` | **New** — computeSpatial() facade |
| `packages/client/src/audio/index.ts` | Add export |
| `packages/client/src/audio/SoundManager.ts` | Extend `play()` with `pan` and `volumeScale` opts |
| `packages/client/src/scenes/core/GameplayEventProcessor.ts` | Add listener state, `playSpatial()` helper, convert ~12 call sites |
| `packages/client/src/scenes/core/SingleplayerModeController.ts` | Set listener position before event processing |
| `packages/client/src/scenes/core/MultiplayerModeController.ts` | Set listener position before event processing |

**No changes to `packages/shared`** — this is entirely client-side presentation.

---

## Testing

### Unit test: SpatialAudio.ts

- Source directly on listener → `{ pan: 0, volume: 1 }`
- Source to the right at panSpread distance → `{ pan: 1.0, volume: ~0.55 }`
- Source to the left at panSpread distance → `{ pan: -1.0, volume: ~0.55 }`
- Source at maxDistance → `{ volume: 0 }`
- Source beyond maxDistance → `{ volume: 0 }` (clamped, not negative)
- Source directly above (dy only) → `{ pan: 0, volume: < 1 }`

### Integration test: SoundManager.play() with pan

- Verify `howl.stereo()` is called with the correct value when `pan` is provided
- Verify `howl.volume()` receives `base * volumeScale` when `volumeScale` is provided
- Verify omitting `pan` does not call `stereo()` (backwards compat)

### Manual playtest checklist

- [ ] Fire weapon while facing right — gunshot pans center (local player fire is at muzzle, close to player)
- [ ] Enemy dies far to the left — death sound pans left and is quieter
- [ ] Explosion at edge of screen — audible but attenuated, panned to correct side
- [ ] Boss intro — audible even if boss spawns far from player (volume floor)
- [ ] Multiplayer: both clients hear spatial audio relative to their own position
- [ ] Open pause menu / death screen — no errors, sounds still work
- [ ] UI sounds (click, hover) — no panning, full volume, unchanged

---

## Future Work (Not In This Sprint)

- **Remote player gunfire**: Currently only the local player's fire events are emitted. When remote player fire events are added to the snapshot protocol, they should use `playSpatial()`.
- **Attenuation curves**: If linear falloff feels wrong, swap to inverse-distance or exponential in `computeSpatial()` without changing any call sites.
- **Per-sound maxDistance**: Some sounds (explosions) should carry further than others (footsteps). Could extend `SoundDef` with an optional `maxDistance` override.
- **Environmental occlusion**: Walls between listener and source could muffle sound. Would require tilemap raycasting — significant complexity, defer.
- **Music ducking**: Lower music volume during loud spatial events. Separate system, not related to panning.
