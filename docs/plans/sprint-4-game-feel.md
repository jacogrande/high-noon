# Sprint 4: Game Feel & Polish

## Context

Sprints 1-3 built a working gameplay loop: movement, shooting, rolling, enemies with AI, wave spawning, and an upgrade system. But the game is silent, enemies are colored circles, essential stats are buried in a debug overlay, and there are no particle effects. This sprint makes the existing gameplay _feel good_ through audio, particles, HUD, damage numbers, screen effects, and placeholder enemy sprites. Work is primarily client-only, with a bug fix in `packages/shared` (charger movement during ATTACK state).

## Goal

Add audio feedback, particle effects, floating damage numbers, a minimal HUD, screen effects, and placeholder enemy sprites so the game feels polished and responsive.

## Success Criteria

- [x] Gunfire, hits, deaths, level-up, and upgrade selection all have sound effects
- [ ] Muzzle flash particles on weapon fire
- [ ] Enemy death burst particles (colored by enemy type)
- [ ] Bullet impact particles (wall hits)
- [ ] Level-up sparkle particles
- [ ] Floating damage numbers on enemy hits
- [ ] HP bar, XP bar, and wave indicator HUD (not debug overlay)
- [ ] Low-HP damage vignette (dark red screen edges)
- [ ] Level-up white flash overlay
- [ ] Enemies rendered as geometric sprites instead of circles
- [ ] All existing camera juice (shake, kick, hit-stop) still works
- [ ] Performance holds at 50+ enemies with active particles
- [ ] Zero changes to `packages/shared`

---

## Architecture

All new systems are client-only presentation. They hook into existing detection points in `GameScene.update()` (fire, damage, death, level-up).

```
packages/client/src/
  audio/
    SoundManager.ts    ← NEW: Howler.js wrapper
    sounds.ts          ← NEW: sound path/volume definitions
    index.ts           ← NEW: barrel
  fx/
    Particle.ts        ← NEW: particle data struct
    ParticlePool.ts    ← NEW: sprite-pool particle system
    FloatingTextPool.ts← NEW: pooled damage number text
    ScreenEffects.ts   ← NEW: vignette + flash overlays
    emitters.ts        ← NEW: emitter preset functions
    index.ts           ← NEW: barrel
  render/
    EnemyTextureGenerator.ts ← NEW: canvas-generated enemy shapes
    EnemyRenderer.ts   ← MODIFY: circles → sprites, expose death/damage events
    BulletRenderer.ts  ← MODIFY: track removed bullet positions
  ui/
    GameHUD.tsx        ← NEW: React HP/XP/wave overlay
  scenes/
    GameScene.ts       ← MODIFY: wire all new systems
  pages/
    Game.tsx           ← MODIFY: poll + render HUD

packages/client/public/assets/sfx/
  fire.ogg, hit.ogg, enemy_die.ogg, player_hit.ogg,
  level_up.ogg, upgrade_select.ogg, wave_start.ogg  ← NEW: placeholder SFX
```

### Key Design Decisions

1. **Audio**: Howler.js wrapper. Handles AudioContext unlock, codec fallback, and instance pooling out of the box. Thin SoundManager facade for game-specific concerns (pitch randomization, named sound lookup). Positions us for future spatial audio, music, and audio sprites.
2. **Particles**: Simple sprite pool using `Texture.WHITE` + per-sprite tint. Renders in the currently-empty `fx` layer. Pool size 512, no runtime allocation.
3. **Damage numbers**: Pre-allocated Text object pool (32 instances). Reused on demand, no runtime Text creation.
4. **HUD**: React overlay (same pattern as UpgradePanel). Polls `GameScene.getHUDState()` throttled to ~10 Hz.
5. **Enemy sprites**: Canvas-generated geometric shapes (triangle, hexagon, diamond, arrow). White/grey base so `.tint` works for state visuals. No art assets needed.

---

## Phase 1: Audio Foundation

**Goal**: SoundManager + 7 placeholder SFX wired to game events.

### Files

| File                                                  | Action                                       |
| ----------------------------------------------------- | -------------------------------------------- |
| `packages/client/src/audio/SoundManager.ts`           | **NEW** — Howler.js wrapper                  |
| `packages/client/src/audio/sounds.ts`                 | **NEW** — sound definitions (paths, volumes) |
| `packages/client/src/audio/index.ts`                  | **NEW** — barrel export                      |
| `packages/client/public/assets/sfx/*.ogg` (7 files) | **NEW** — placeholder SFX                    |
| `packages/client/src/scenes/GameScene.ts`             | Add SoundManager, wire events                |

### SoundManager API

```typescript
class SoundManager {
  loadAll(defs: Record<string, SoundDef>): void
  play(name: string, opts?: { pitchVariance?: number; volume?: number }): void
  setMasterVolume(v: number): void
  get/set muted: boolean
  destroy(): void
}
```

- Each `SoundDef` creates a `Howl` instance with `pool` size (default 8) for concurrent playback
- `pitchVariance`: applies random `rate()` offset (e.g., 0.1 = ±0.05 semitone-ish range)
- Howler handles AudioContext unlock, HTML5/WebAudio fallback, and codec negotiation automatically
- `bun add howler` + `bun add -d @types/howler` in `packages/client`

### Sound triggers in GameScene.update()

| Event          | Detection                                         | Sound                            |
| -------------- | ------------------------------------------------- | -------------------------------- |
| Fire           | `Weapon.cooldown` increased (fired + reset)       | `fire` (pitchVariance: 0.1)      |
| Player hit     | `prevIframes === 0 && newIframes > 0`             | `player_hit`                     |
| Enemy death    | `enemyRenderer.sync()` deathTrauma > 0            | `enemy_die` (pitchVariance: 0.15)|
| Level-up       | `upgradeState.level > lastProcessedLevel`         | `level_up`                       |
| Upgrade select | `selectUpgrade()` method                          | `upgrade_select`                 |

### Placeholder audio files

Generate with jfxr/sfxr — short procedural SFX:

- `fire.ogg` — short noise burst (50ms)
- `hit.ogg` — mid thud (80ms)
- `enemy_die.ogg` — descending pop (100ms)
- `player_hit.ogg` — low crunch (120ms)
- `level_up.ogg` — ascending arpeggio (300ms)
- `upgrade_select.ogg` — click/chime (100ms)
- `wave_start.ogg` — alert tone (200ms)

### How to Test

- Fire weapon → hear fire sound with pitch variation per shot
- Get hit → hear player_hit
- Kill enemy → hear enemy_die
- Level up → hear level_up
- Select upgrade → hear upgrade_select

---

## Phase 2: Particle System

**Goal**: Sprite-pool particle system with 5 emitter presets.

### Files

| File                                           | Action                                                     |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `packages/client/src/fx/Particle.ts`           | **NEW** — particle data struct                             |
| `packages/client/src/fx/ParticlePool.ts`       | **NEW** — sprite pool (512 max)                            |
| `packages/client/src/fx/emitters.ts`           | **NEW** — 5 emitter presets                                |
| `packages/client/src/fx/index.ts`              | **NEW** — barrel export                                    |
| `packages/client/src/render/EnemyRenderer.ts`  | Modify `sync()` return to include death positions + colors |
| `packages/client/src/render/BulletRenderer.ts` | Track removed bullet positions                             |
| `packages/client/src/scenes/GameScene.ts`      | Add ParticlePool, wire emitters                            |

### ParticlePool design

- Pre-allocates N Sprites with `Texture.WHITE` in the `fx` layer
- Each particle: position, velocity, lifetime, scale curve, alpha curve, color, rotation
- `emit(config)` grabs from free list, configures, makes visible
- `update(dt)` advances all active particles, recycles expired ones
- No runtime allocation after init

### Emitter presets

| Emitter          | Count                      | Spread        | Lifetime   | Color           | Trigger                  |
| ---------------- | -------------------------- | ------------- | ---------- | --------------- | ------------------------ |
| Muzzle flash     | 3-5                        | ±15° from aim | 0.08-0.12s | Yellow 0xFFCC44 | Fire detection           |
| Wall impact      | 4-6                        | Hemisphere    | 0.15-0.25s | Grey 0x888888   | Bullet removal positions |
| Entity impact    | 3-4                        | Burst         | 0.1-0.2s   | Enemy color     | Bullet-enemy hit         |
| Enemy death      | 8-12 fodder / 15-20 threat | Full circle   | 0.3-0.5s   | Enemy color     | Death events             |
| Level-up sparkle | 12-16                      | Upward bias   | 0.5-0.8s   | Gold 0xFFD700   | Level-up detection       |

### EnemyRenderer.sync() change

Return type changes from `number` (deathTrauma) to:

```typescript
interface EnemySyncResult {
  deathTrauma: number;
  deaths: Array<{ x: number; y: number; color: number }>;
}
```

### BulletRenderer change

Add `removedPositions: Array<{x: number, y: number}>` populated during `sync()` when a tracked bullet disappears.

### How to Test

- Fire → bright yellow flash at muzzle
- Bullet hits wall → grey particles scatter
- Kill enemy → colored burst from death position
- Level up → golden sparkles rise from player

---

## Phase 3: Damage Numbers

**Goal**: Floating damage numbers on enemy hits.

### Files

| File                                          | Action                                 |
| --------------------------------------------- | -------------------------------------- |
| `packages/client/src/fx/FloatingTextPool.ts`  | **NEW** — pre-allocated Text pool (32) |
| `packages/client/src/render/EnemyRenderer.ts` | Expose `damageEvents` array            |
| `packages/client/src/scenes/GameScene.ts`     | Add FloatingTextPool, wire spawning    |

### FloatingTextPool design

- Pre-creates 32 Text objects (monospace bold, black stroke), hidden
- `spawn(x, y, value, color)` — sets text, position, tint, starts animation
- `update(dt)` — float upward 30px over 0.6s, alpha 1→0
- On expire: hide, return to free list

### EnemyRenderer damageEvents

Already tracks `lastHP` per enemy for damage flash. Add:

```typescript
readonly damageEvents: Array<{ x: number; y: number; amount: number }> = []
```

Populated in `render()` when `currentHP < prevHP`. GameScene reads after `enemyRenderer.render()`, spawns texts, clears array.

### How to Test

- Shoot enemy → damage number floats up from hit position
- Multiple hits → multiple concurrent numbers
- Numbers fade smoothly over ~0.6s

---

## Phase 4: HUD Overlay

**Goal**: React HUD with HP bar, XP bar, wave indicator.

### Files

| File                                      | Action                             |
| ----------------------------------------- | ---------------------------------- |
| `packages/client/src/ui/GameHUD.tsx`      | **NEW** — React HUD component      |
| `packages/client/src/scenes/GameScene.ts` | Add `getHUDState()` method         |
| `packages/client/src/pages/Game.tsx`      | Poll HUD state, render `<GameHUD>` |

### HUDState interface

```typescript
interface HUDState {
  hp: number;
  maxHP: number;
  xp: number;
  xpForCurrentLevel: number;
  xpForNextLevel: number;
  level: number;
  waveNumber: number;
  totalWaves: number;
  waveStatus: "active" | "delay" | "completed" | "none";
}
```

### Layout

- **HP bar** (top-left, ~200px): Red fill proportional to hp/maxHP. Pulse animation when HP ≤ 2.
- **Wave indicator** (top-center): "WAVE 1 / 4" or "COMPLETE". Small, unobtrusive.
- **XP bar** (bottom-center, ~300px): Cyan fill for progress to next level. "LVL 3" badge.

Styling: monospace, semi-transparent dark backgrounds, `#00ffff` cyan accents. Inline styles (matching UpgradePanel pattern). Hidden when UpgradePanel is showing.

### Polling throttle

Throttle `setHudState()` to ~10 Hz (every ~100ms) to avoid excessive React re-renders. Use `React.memo` on GameHUD.

### How to Test

- Start game → HP bar shows 5/5 full red
- Take damage → HP bar decreases, pulses at HP ≤ 2
- Kill enemies → XP bar fills cyan, level badge shows current level
- Level up → XP bar resets, level badge increments
- Wave changes → indicator updates
- Upgrade panel showing → HUD hidden

---

## Phase 5: Screen Effects & Enemy Sprites

**Goal**: Vignette, level-up flash, and geometric enemy sprites.

### Files

| File                                                  | Action                                       |
| ----------------------------------------------------- | -------------------------------------------- |
| `packages/client/src/fx/ScreenEffects.ts`             | **NEW** — vignette + flash                   |
| `packages/client/src/render/EnemyTextureGenerator.ts` | **NEW** — canvas-generated textures          |
| `packages/client/src/render/EnemyRenderer.ts`         | Switch circles → sprites, setColor → setTint |
| `packages/client/src/scenes/GameScene.ts`             | Add ScreenEffects, generate textures         |

### ScreenEffects

- **Damage vignette**: Canvas-generated radial gradient texture (transparent center → dark red edges). Rendered as Sprite in ui layer. Alpha scales with missing HP (visible at HP ≤ 2).
- **Level-up flash**: White rect covering screen. Alpha 0.4→0, duration 0.15s.

### Enemy textures

Canvas-generated at init (one per type, white/grey base for tint compatibility):

| Type    | Shape          | Rationale          |
| ------- | -------------- | ------------------ |
| Swarmer | Small triangle | Fast, pointy       |
| Grunt   | Hexagon        | Sturdy, solid      |
| Shooter | Diamond        | Ranged, angular    |
| Charger | Arrow/pentagon | Directional, heavy |

Generate at 2x resolution for GAME_ZOOM = 2. `EnemyTextureGenerator.generateAll()` called once in `GameScene.create()`.

### EnemyRenderer refactor

- Replace `createCircle()` with `createSprite()` using generated textures
- Replace `setColor()` with `setTint()` for all state visuals
- All existing visuals preserved (telegraph flash, recovery dim, damage tint, death scale+fade, charger stretch/vibrate, shooter aim line)

### How to Test

- HP ≤ 2 → dark red vignette at screen edges, intensifies at HP 1
- Level up → brief white flash
- Enemies are geometric shapes with correct state visuals
- Charger stretch effect works with sprite

---

## Phase 6: Polish Pass & Tuning

**Goal**: Tune values, verify performance, clean build.

### Tasks

- Tune particle counts, speeds, lifetimes, colors for all 5 emitters
- Tune audio volumes and pitch variance ranges
- Tune screen effect intensities (vignette alpha, flash duration)
- Tune enemy sprite scales to match collider visual size
- Performance test: 50+ enemies + continuous fire → stays above 50 FPS
- Memory test: no Text/Audio leaks after 60s continuous play
- `bun run typecheck` — clean
- `bun run build` — succeeds
- `bun test` — all existing tests pass

---

## Dependencies Between Phases

```
Phase 1 (Audio)
    │
    ▼
Phase 2 (Particles) ──────── Phase 4 (HUD)
    │                              │
    ▼                              │
Phase 3 (Damage Numbers)           │
    │                              │
    ├──────────────────────────────┘
    ▼
Phase 5 (Screen Effects + Enemy Sprites)
    │
    ▼
Phase 6 (Polish & Tuning)
```

Phases 2/3 and 4 are independent and can be worked in parallel after Phase 1.

---

## Task Checklist

### Phase 1: Audio Foundation

- [x] 1.1 Install howler.js + types; SoundManager class (Howler wrapper)
- [x] 1.2 Sound definitions and placeholder .ogg files
- [x] 1.3 Wire audio triggers in GameScene (fire, hit, death, level-up, upgrade)

### Phase 2: Particle System

- [ ] 2.1 ParticlePool class with sprite pooling
- [ ] 2.2 Five emitter presets (muzzle flash, wall impact, entity impact, death burst, level-up sparkle)
- [ ] 2.3 EnemyRenderer/BulletRenderer expose death and impact positions
- [ ] 2.4 Wire emitters in GameScene

### Phase 3: Damage Numbers

- [ ] 3.1 FloatingTextPool with pre-allocated Text objects
- [ ] 3.2 EnemyRenderer exposes damageEvents
- [ ] 3.3 Wire damage number spawning in GameScene

### Phase 4: HUD Overlay

- [ ] 4.1 GameHUD React component (HP bar, XP bar, wave indicator)
- [ ] 4.2 GameScene.getHUDState() API
- [ ] 4.3 Game.tsx polling and rendering with throttle

### Phase 5: Screen Effects & Enemy Sprites

- [ ] 5.1 ScreenEffects (damage vignette, level-up flash)
- [ ] 5.2 EnemyTextureGenerator (4 canvas-generated geometric shapes)
- [ ] 5.3 EnemyRenderer refactor (circles → sprites, setColor → setTint)

### Phase 6: Polish Pass & Tuning

- [ ] 6.1 Tune all particle/audio/screen effect values
- [ ] 6.2 Performance and memory verification
- [ ] 6.3 Typecheck, build, and test pass

---

## Risks & Mitigations

| Risk                                  | Impact                     | Mitigation                                                                                    |
| ------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| Browser autoplay policy blocks audio  | No sound until interaction | Howler auto-unlocks AudioContext on first user gesture; first play is on gunfire (post-click) |
| Too many particles drop FPS           | Performance regression     | Pool capped at 512; emitters respect exhaustion; profile in Phase 6                           |
| React HUD re-renders at 60+ FPS       | CPU overhead               | Throttle to 10 Hz; React.memo on component                                                    |
| Enemy sprites look worse than circles | Visual regression          | Clean geometric shapes; keep circle code as fallback                                          |
| Placeholder audio is annoying         | Bad experience             | Use jfxr for decent sounds; keep volumes low; mute toggle                                     |
| Text pool exhaustion under heavy fire | Missing damage numbers     | Pool of 32 covers worst case; oldest expire quickly (0.6s)                                    |

---

## Out of Scope

- Background music / ambient audio
- Real art assets (all sprites are programmatically generated)
- Audio settings UI / volume sliders
- 3D positional audio / stereo panning
- Particle physics interactions
- Bullet trail particles (continuous, not burst)
- Player death screen improvements
- Accessibility options UI (reduced motion, etc.)
- Any changes to `packages/shared`
- Any multiplayer considerations

---

## Verification

```bash
bun run typecheck     # Clean
bun run build         # Succeeds
bun test              # All existing tests pass (no shared changes)
bun run dev           # Manual testing below
```

**Manual test checklist:**

1. Fire weapon → hear sound + see muzzle flash particles
2. Bullet hits wall → see grey impact particles
3. Kill enemy → hear death sound + see colored burst particles
4. Take damage → hear hit sound + screen vignette appears at low HP
5. Level up → hear sound + see golden sparkles + brief white flash
6. Select upgrade → hear click sound
7. HP bar shows correct values and updates on damage
8. XP bar fills and resets on level-up
9. Wave indicator updates as waves progress
10. Enemies are geometric shapes with correct state visuals
11. Play 4 waves continuously — no performance drops or memory leaks
