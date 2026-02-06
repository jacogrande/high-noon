# Sprint 3: Upgrades & Loot System

## Goal

Add the core roguelite progression loop: enemies drop XP, players level up, choose from randomized upgrade cards, and stats are recomputed. This is the foundation that makes each run feel different. Upgrades modify core abilities (speed, damage, fire rate) — no new buttons. Allow multiplicative stacking that feels overpowered.

## Success Criteria

- [ ] Enemies award XP on death (amount varies by enemy type)
- [ ] XP accumulates toward level-up thresholds
- [ ] Reaching a threshold pauses the game and shows 3 upgrade cards
- [ ] Cards are drawn from a weighted pool (75% Common, 25% Rare)
- [ ] Selecting a card applies stat modifiers immediately
- [ ] Upgrades stack up to maxStacks (multiplicative stacking creates broken combos)
- [ ] Maxed upgrades are excluded from future choices
- [ ] Stats are recomputed correctly: all additive mods first, then all multiplicative
- [ ] Player movement, fire rate, damage, HP, roll params all respond to upgrades
- [ ] Multiple rapid level-ups each trigger a separate choice screen
- [ ] All upgrade logic in `packages/shared` (deterministic)
- [ ] UI overlay in `packages/client` (React)
- [ ] All existing combat behavior unchanged when no upgrades acquired
- [ ] 15 upgrades total: 10 Common, 5 Rare

## Singleplayer vs Multiplayer Notes

All upgrade logic runs in `packages/shared` as pure functions on `UpgradeState`. This is critical:

**Singleplayer (now):** The shared sim runs directly on the client. Enemy death → `awardXP()` → level check → `generateUpgradeChoices()` via `world.rng`. GameScene pauses simulation, shows UI, applies selection.

**Multiplayer (future):** The server runs the same shared sim. On enemy death, the server awards XP and generates choices using the authoritative `world.rng`. Choices are sent to the client as a network event. The client displays them, sends back a selection index. The server calls `applyUpgrade()` and `writeStatsToECS()`.

**What this means for Sprint 3:**

- `UpgradeState` lives on `GameWorld` — server-authoritative in multiplayer
- `generateUpgradeChoices()` uses `world.rng` — deterministic, replayable
- `applyUpgrade()` + `recomputePlayerStats()` are pure functions — no client dependency
- `writeStatsToECS()` writes to ECS components the server already syncs
- The client UI (`UpgradePanel`) is purely presentational — it reads choices and emits a selection

**No multiplayer code is written in this sprint.** The architecture just ensures nothing prevents it later.

---

## Architecture

```
packages/shared/src/sim/
  content/
    xp.ts              ← NEW: XP values per enemy type, level thresholds
    upgrades.ts        ← NEW: 15 UpgradeDefs, enums, rarity weights
    index.ts           ← barrel exports
  upgrade.ts           ← NEW: UpgradeState, awardXP, recompute, apply, generate, writeToECS
  world.ts             ← add upgradeState to GameWorld
  systems/
    health.ts          ← award XP on enemy death

packages/client/src/
  ui/
    UpgradePanel.tsx   ← NEW: React upgrade card overlay
  scenes/
    GameScene.ts       ← pause/resume on level-up, choice generation, selectUpgrade API
  pages/
    Game.tsx           ← poll choices, render UpgradePanel overlay
```

### System Flow

```
Enemy dies (healthSystem)
  → awardXP(world.upgradeState, xpValue)
  → returns true if leveled up

GameScene.update() after stepWorld()
  → checks if level increased since last processed level
  → if yes: generateUpgradeChoices(state, world.rng)
  → stores choices on upgradeState.pendingChoices
  → sets paused = true (skips stepWorld on next frames)

Game.tsx render loop
  → polls scene.getPendingChoices()
  → if choices pending: renders <UpgradePanel>

Player clicks a card
  → scene.selectUpgrade(upgradeId)
  → applyUpgrade(state, id) — increments stack, recomputes stats
  → writeStatsToECS(world, playerEid) — pushes to ECS components
  → clears pendingChoices, resumes simulation
```

---

## Upgrade Catalog

### Common (10)

| ID | Name | Effect | Max |
|----|------|--------|-----|
| QUICK_DRAW | Quick Draw | +20% fire rate | 3 |
| HEAVY_ROUNDS | Heavy Rounds | +30% bullet damage | 3 |
| LONG_BARREL | Long Barrel | +25% range | 3 |
| FAST_FEET | Fast Feet | +15% move speed | 3 |
| THICK_SKIN | Thick Skin | +1 max HP | 3 |
| QUICK_RELOAD | Quick Reload | +15% fire rate | 3 |
| HOLLOW_POINT | Hollow Point | +20% bullet damage | 3 |
| FLEET_FOOTED | Fleet-Footed | +10% move speed, +15% roll speed | 2 |
| IRON_WILL | Iron Will | +0.2s i-frame duration | 2 |
| STEADY_AIM | Steady Aim | +20% bullet speed | 3 |

### Rare (5)

| ID | Name | Effect | Max |
|----|------|--------|-----|
| BULLET_STORM | Bullet Storm | +40% fire rate, -15% damage | 2 |
| JUGGERNAUT | Juggernaut | +2 max HP, -10% move speed | 2 |
| GUNSLINGER | Gunslinger | +25% fire rate, +25% bullet speed | 1 |
| GHOST_ROLL | Ghost Roll | +50% roll speed, +30% i-frame ratio | 1 |
| VAMPIRIC_ROUNDS | Vampiric Rounds | Heal 1 HP every 15 kills | 1 |

---

## Phase 1: Upgrade Data Model & Content Definitions

**Goal:** Define all upgrade content data and XP tables as pure data. No systems, no side effects — just types and constants.

### Tasks

#### 1.1 XP Content (`shared/src/sim/content/xp.ts`)

```typescript
export const XP_VALUES: Record<EnemyType, number> = {
  [EnemyType.SWARMER]: 1,
  [EnemyType.GRUNT]: 2,
  [EnemyType.SHOOTER]: 5,
  [EnemyType.CHARGER]: 5,
}

// Cumulative XP to reach each level (index = level)
export const LEVEL_THRESHOLDS = [0, 10, 25, 50, 85, 130, 190, 265, 360, 480, 630]
export const MAX_LEVEL = LEVEL_THRESHOLDS.length - 1

export function getLevelForXP(totalXP: number): number
  // Binary search or linear scan through LEVEL_THRESHOLDS
```

#### 1.2 Upgrade Definitions (`shared/src/sim/content/upgrades.ts`)

```typescript
export enum UpgradeId {
  QUICK_DRAW, HEAVY_ROUNDS, LONG_BARREL, FAST_FEET, THICK_SKIN,
  QUICK_RELOAD, HOLLOW_POINT, FLEET_FOOTED, IRON_WILL, STEADY_AIM,
  BULLET_STORM, JUGGERNAUT, GUNSLINGER, GHOST_ROLL, VAMPIRIC_ROUNDS,
}

export enum UpgradeRarity { COMMON, RARE }
export enum UpgradeTag { OFFENSIVE, DEFENSIVE, MOBILITY, UTILITY }

export interface StatMod {
  stat: string       // 'fireRate', 'damage', 'speed', 'maxHP', etc.
  op: 'add' | 'mul'
  value: number
}

export interface UpgradeDef {
  id: UpgradeId
  name: string
  description: string
  rarity: UpgradeRarity
  tags: UpgradeTag[]
  mods: StatMod[]
  maxStacks: number
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = { /* 15 entries */ }
export const RARITY_WEIGHTS = { [UpgradeRarity.COMMON]: 0.75, [UpgradeRarity.RARE]: 0.25 }
export const CHOICES_PER_LEVEL = 3
```

#### 1.3 Barrel Exports

- `shared/src/sim/content/index.ts` — export `xp.ts` and `upgrades.ts`
- `shared/src/index.ts` — export new content

### Deliverables

- All 15 upgrade definitions with stat mods
- XP values per enemy type
- Level threshold table (10 levels)
- `getLevelForXP()` utility function
- All types exported from shared barrel

### How to Test

- Unit test: `getLevelForXP()` returns correct levels for boundary values
- Typecheck passes

---

## Phase 2: XP, Level-Up Detection & UpgradeState

**Goal:** Track XP accumulation, detect level-ups, and maintain the player's upgrade inventory. Wire XP awards into the existing health system's enemy death path.

### Tasks

#### 2.1 UpgradeState (`shared/src/sim/upgrade.ts`)

```typescript
export interface UpgradeState {
  xp: number
  level: number
  pendingChoices: UpgradeDef[]    // empty = no pending level-up
  acquired: Map<UpgradeId, number> // upgradeId → stack count
  killCounter: number              // for vampiric rounds

  // Computed stats (base + all mods)
  fireRate: number
  bulletDamage: number
  bulletSpeed: number
  range: number
  speed: number
  maxHP: number
  iframeDuration: number
  rollDuration: number
  rollIframeRatio: number
  rollSpeedMultiplier: number
}

export function initUpgradeState(): UpgradeState
  // Initialize all computed stats from base player constants

export function awardXP(state: UpgradeState, amount: number): boolean
  // Add XP, return true if level increased
```

#### 2.2 GameWorld Integration (`shared/src/sim/world.ts`)

- Add `upgradeState: UpgradeState` to `GameWorld`
- Initialize in `createGameWorld()` via `initUpgradeState()`
- Reset in `resetWorld()` if it exists

#### 2.3 XP on Enemy Death (`shared/src/sim/systems/health.ts`)

On enemy death, before `removeEntity`:

```typescript
if (hasComponent(world, Enemy, eid)) {
  const xp = XP_VALUES[Enemy.type[eid] as EnemyType]
  awardXP(world.upgradeState, xp)
}
```

### Deliverables

- `UpgradeState` tracks XP, level, acquired upgrades, computed stats
- `awardXP()` accumulates XP and detects level-ups
- Enemy deaths award XP automatically
- GameWorld owns the upgrade state

### How to Test

- Unit test: `initUpgradeState()` has correct base values
- Unit test: `awardXP()` returns false below threshold, true at boundary
- Unit test: XP accumulates correctly across multiple awards
- Manual: kill enemies, observe XP/level in debug (after Phase 4 wires it up)

---

## Phase 3: Upgrade Application & Stat Recomputation

**Goal:** Apply selected upgrades, recompute all player stats from base + mods, and write computed stats back into ECS components so the simulation uses them.

### Tasks

#### 3.1 Stat Recomputation (`shared/src/sim/upgrade.ts`)

```typescript
export function recomputePlayerStats(state: UpgradeState): void
  // For each stat:
  //   1. Start from base constant
  //   2. Apply all additive mods from acquired upgrades (sum)
  //   3. Apply all multiplicative mods (product)
  // Order: additive first, then multiplicative — this makes multiplicative upgrades
  // scale with additive ones, creating the "broken combos" feel
```

#### 3.2 Apply Upgrade (`shared/src/sim/upgrade.ts`)

```typescript
export function applyUpgrade(state: UpgradeState, id: UpgradeId): void
  // Guard: check maxStacks
  // Increment stack count in state.acquired
  // Call recomputePlayerStats(state)
```

#### 3.3 Write Stats to ECS (`shared/src/sim/upgrade.ts`)

```typescript
export function writeStatsToECS(world: GameWorld, playerEid: number): void
  // Write computed stats to ECS components:
  // - Speed.value[eid] = state.speed
  // - Weapon fields (fireRate, damage, bulletSpeed, range)
  // - Health.max[eid] = state.maxHP (and heal delta if max increased)
  // - iframeDuration on Health component
```

#### 3.4 Player Input — Roll from UpgradeState (`shared/src/sim/systems/playerInput.ts`)

Refactor roll initiation from hardcoded constants to `world.upgradeState`:

```typescript
// BEFORE:
Roll.duration[eid] = ROLL_DURATION
Roll.iframeRatio[eid] = ROLL_IFRAME_RATIO
Roll.speedMultiplier[eid] = ROLL_SPEED_MULTIPLIER

// AFTER:
const us = world.upgradeState
Roll.duration[eid] = us.rollDuration
Roll.iframeRatio[eid] = us.rollIframeRatio
Roll.speedMultiplier[eid] = us.rollSpeedMultiplier
```

### Deliverables

- `recomputePlayerStats()` correctly applies additive then multiplicative mods
- `applyUpgrade()` respects maxStacks
- `writeStatsToECS()` pushes computed stats to all relevant ECS components
- Roll parameters read from upgrade state instead of hardcoded constants
- Fire rate upgrade → visibly faster shooting
- Speed upgrade → visibly faster movement

### How to Test

- Unit test: `recomputePlayerStats()` with known mods produces expected values
- Unit test: additive then multiplicative ordering
- Unit test: `applyUpgrade()` increments stacks, respects maxStacks
- Unit test: `writeStatsToECS()` writes all relevant components

---

## Phase 4: Choice Generation & Selection Flow

**Goal:** Generate weighted random upgrade choices on level-up. Wire the pause/resume flow into GameScene so the game freezes while the player chooses.

### Tasks

#### 4.1 Choice Generation (`shared/src/sim/upgrade.ts`)

```typescript
export function generateUpgradeChoices(
  state: UpgradeState, rng: SeededRng, count?: number
): UpgradeDef[]
  // 1. Filter out upgrades at maxStacks
  // 2. For each slot (default 3):
  //    a. Roll rarity: 75% Common, 25% Rare
  //    b. Pick random upgrade of that rarity (not already in this set)
  //    c. If no upgrades available at rolled rarity, try the other
  // 3. Return array of UpgradeDefs
  // Uses world.rng for determinism
```

#### 4.2 GameScene Pause/Resume (`client/src/scenes/GameScene.ts`)

- Add `paused: boolean` and `lastProcessedLevel: number` state
- After `stepWorld()`: check if `world.upgradeState.level > lastProcessedLevel`
  - If yes: call `generateUpgradeChoices(state, world.rng)`
  - Store choices on `upgradeState.pendingChoices`
  - Set `paused = true`
- When paused: skip `stepWorld()` calls but keep rendering (frozen frame)
- Public API:
  - `getPendingChoices(): UpgradeDef[]` — returns current pending choices
  - `selectUpgrade(id: UpgradeId): void` — applies upgrade, writes to ECS, clears choices, resumes

#### 4.3 Multiple Level-Ups

If the player levels up multiple times from one kill (e.g., a high-XP enemy at the boundary), each level triggers its own choice screen sequentially. After selecting an upgrade, check if another level-up is pending before resuming.

### Deliverables

- `generateUpgradeChoices()` produces correct count, no duplicates, excludes maxed
- Choices are weighted by rarity (75/25 Common/Rare)
- Game pauses on level-up, resumes on selection
- Multiple rapid level-ups each get their own choice screen
- Choice generation is deterministic (uses `world.rng`)

### How to Test

- Unit test: `generateUpgradeChoices()` returns correct count
- Unit test: no duplicate upgrades in a single choice set
- Unit test: maxed upgrades excluded
- Unit test: deterministic with same RNG seed
- Manual: kill enough enemies to level up → game pauses

---

## Phase 5: Upgrade Selection UI

**Goal:** Build the React overlay that displays upgrade cards and lets the player select one.

### Tasks

#### 5.1 UpgradePanel Component (`client/src/ui/UpgradePanel.tsx`)

React component with minimal inline styles:

- Semi-transparent dark overlay covering the game
- "LEVEL UP!" header text
- 3 upgrade cards in a horizontal row, each showing:
  - Upgrade name
  - Description text
  - Rarity border color (Common = grey/white, Rare = gold/amber)
- Click/tap a card to select it
- Simple hover effect (slight scale or brightness)

Props:
```typescript
interface UpgradePanelProps {
  choices: UpgradeDef[]
  onSelect: (id: UpgradeId) => void
}
```

#### 5.2 Game.tsx Integration (`client/src/pages/Game.tsx`)

- Add `pendingChoices` React state (`UpgradeDef[] | null`)
- In the render callback (already called each frame): poll `scene.getPendingChoices()`
  - If choices returned and not already showing: set React state
- Render `<UpgradePanel>` as overlay when `pendingChoices` is set
- On select callback: call `scene.selectUpgrade(id)`, clear React state

### Deliverables

- Level-up shows a clean overlay with 3 upgrade cards
- Cards display name, description, rarity
- Clicking a card applies the upgrade and resumes gameplay
- UI is minimal but functional

### How to Test

- Manual: level up → see overlay with 3 cards
- Manual: click a card → overlay disappears, game resumes
- Manual: stat change is immediate after selection
- Manual: rare cards have distinct visual treatment

---

## Phase 6: Tests & Verification

**Goal:** Comprehensive test coverage for all upgrade logic. Verify the full loop end-to-end.

### Tasks

#### 6.1 Unit Tests (`shared/src/sim/upgrade.test.ts`)

14+ tests covering:

- `initUpgradeState()` — base values match player constants
- `awardXP()` — returns false below threshold
- `awardXP()` — returns true at level boundary
- `awardXP()` — handles multi-level jumps
- `getLevelForXP()` — level 0 at 0 XP
- `getLevelForXP()` — correct at each threshold boundary
- `getLevelForXP()` — caps at MAX_LEVEL
- `applyUpgrade()` — increments stack count
- `applyUpgrade()` — respects maxStacks (no-op at max)
- `recomputePlayerStats()` — additive mods applied correctly
- `recomputePlayerStats()` — multiplicative mods applied correctly
- `recomputePlayerStats()` — additive before multiplicative ordering
- `generateUpgradeChoices()` — returns correct count
- `generateUpgradeChoices()` — no duplicates in set
- `generateUpgradeChoices()` — excludes maxed upgrades
- `generateUpgradeChoices()` — deterministic with same seed
- `writeStatsToECS()` — writes all relevant ECS components

#### 6.2 Typecheck & Build Verification

```bash
bun test              # All tests pass (existing + new)
bun run typecheck     # Clean across all packages
bun run build         # Builds successfully
```

### Deliverables

- 14+ unit tests all passing
- Full typecheck clean
- Build succeeds
- All existing tests still pass

---

## Implementation Order

| Phase | Files | Risk | Visual Test |
|-------|-------|------|-------------|
| 1 | content/xp.ts, content/upgrades.ts, barrel exports | Low | Typecheck passes |
| 2 | upgrade.ts, world.ts, health.ts | Low | Kill enemies → XP accumulates (debug) |
| 3 | upgrade.ts (recompute/apply/write), playerInput.ts | Medium | Stats change after upgrade applied |
| 4 | upgrade.ts (generateChoices), GameScene.ts | Medium | Game pauses on level-up |
| 5 | UpgradePanel.tsx, Game.tsx | Low | See and click upgrade cards |
| 6 | upgrade.test.ts, verification | Low | All tests pass |

---

## Verification

```bash
bun test              # All tests pass (existing + new upgrade tests)
bun run typecheck     # Clean across all packages
bun run build         # Builds successfully
bun run dev           # Manual testing below
```

**Manual test checklist:**

1. Kill enemies → XP accumulates
2. Reach level threshold → game pauses, 3 upgrade cards appear
3. Click a card → game resumes, stat change is immediate
4. Fire rate upgrade → visibly faster shooting
5. Speed upgrade → visibly faster movement
6. HP upgrade → max health increases
7. Roll upgrades → longer i-frames or faster roll
8. Rare upgrades appear less frequently than Common
9. Maxed upgrade doesn't appear in future choices
10. Multiple level-ups in quick succession each trigger a separate choice screen
11. All existing combat behavior unchanged when no upgrades acquired

---

## Task Checklist

### Phase 1: Upgrade Data Model & Content Definitions

- [x] 1.1 XP content (XP_VALUES, LEVEL_THRESHOLDS, getLevelForXP)
- [x] 1.2 Upgrade definitions (15 UpgradeDefs, enums, rarity weights)
- [x] 1.3 Barrel exports (content/index.ts, shared/index.ts)

### Phase 2: XP, Level-Up Detection & UpgradeState

- [x] 2.1 UpgradeState interface and initUpgradeState()
- [x] 2.2 GameWorld integration (add upgradeState, init, reset)
- [x] 2.3 XP on enemy death (health.ts awards XP)

### Phase 3: Upgrade Application & Stat Recomputation

- [ ] 3.1 recomputePlayerStats() — additive then multiplicative
- [ ] 3.2 applyUpgrade() — stack management + recompute
- [ ] 3.3 writeStatsToECS() — push stats to ECS components
- [ ] 3.4 playerInput.ts — roll params from upgradeState

### Phase 4: Choice Generation & Selection Flow

- [ ] 4.1 generateUpgradeChoices() — weighted random, no dupes, exclude maxed
- [ ] 4.2 GameScene pause/resume on level-up
- [ ] 4.3 Multiple level-up handling (sequential choice screens)

### Phase 5: Upgrade Selection UI

- [ ] 5.1 UpgradePanel.tsx — React card overlay
- [ ] 5.2 Game.tsx integration — poll choices, render overlay, handle selection

### Phase 6: Tests & Verification

- [ ] 6.1 Unit tests (14+ tests in upgrade.test.ts)
- [ ] 6.2 Typecheck & build verification

---

## Dependencies Between Phases

```
Phase 1 (Content Definitions — xp.ts, upgrades.ts)
    │
    ▼
Phase 2 (UpgradeState, awardXP, world.ts, health.ts)
    │
    ▼
Phase 3 (recompute, apply, writeToECS, playerInput.ts)
    │
    ▼
Phase 4 (generateChoices, GameScene pause/resume)
    │
    ▼
Phase 5 (UpgradePanel UI, Game.tsx)
    │
    ▼
Phase 6 (Tests & verification)
```

Each phase builds on the previous and is testable at completion.

---

## Design Principles (from `docs/research/roguelike-upgrades.md`)

- **Pre-action luck**: Choices happen before combat resumes, not during
- **Modifier stacking**: Upgrades modify core abilities — no new buttons
- **Broken combos as features**: Allow multiplicative stacking that feels overpowered
- **Simple first**: 15 upgrades (10 Common, 5 Rare), no Legendary tier yet
- **Additive then multiplicative**: Stat recomputation applies all additive mods first, then all multiplicative mods — this makes multiplicative upgrades scale with additive ones

---

## Out of Scope (Future Sprints)

- Legendary tier upgrades
- Synergy bonuses (specific combo rewards)
- Upgrade reroll / skip mechanics
- XP orb drops (enemies currently award XP directly on death)
- XP bar HUD element (debug overlay only for now)
- Weapon-specific upgrades (all upgrades are stat mods)
- Active abilities (all upgrades are passive)
- Upgrade removal / respec
- Meta-progression (permanent unlocks between runs)
- Sound effects for level-up / upgrade selection
- Particle effects for level-up
- Multiplayer upgrade sync

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Stat recomputation ordering bugs | High | Unit tests for additive-then-multiplicative; test with known values |
| Upgrade choices feel samey | Medium | 15 upgrades across 4 tags; rare tier adds variety. Easy to add more later |
| Vampiric Rounds kill counter out of sync | Low | Kill counter incremented in same code path as XP award |
| Pause/resume timing edge cases | Medium | Check level delta after each stepWorld; sequential choice screens |
| React state sync with game loop | Medium | Poll in render callback (already frame-synced); clear on select |
| Multiplicative stacking too strong | Low | maxStacks caps (1-3); tunable. "Broken combos as features" is intentional |
| ECS component writes missed | Medium | writeStatsToECS unit tested; covers all stat-bearing components |
| RNG determinism broken | High | generateUpgradeChoices uses world.rng only; unit test with fixed seed |

---

## Files Changed Summary

| Phase | File | Change |
|-------|------|--------|
| 1 | `shared/src/sim/content/xp.ts` | **NEW** — XP values, level thresholds |
| 1 | `shared/src/sim/content/upgrades.ts` | **NEW** — 15 UpgradeDefs, enums, rarity |
| 1 | `shared/src/sim/content/index.ts` | Export new content |
| 1 | `shared/src/index.ts` | Export new content |
| 2 | `shared/src/sim/upgrade.ts` | **NEW** — UpgradeState, awardXP |
| 2 | `shared/src/sim/world.ts` | Add upgradeState to GameWorld |
| 2 | `shared/src/sim/systems/health.ts` | Award XP on enemy death |
| 3 | `shared/src/sim/upgrade.ts` | Add recomputePlayerStats, applyUpgrade, writeStatsToECS |
| 3 | `shared/src/sim/systems/playerInput.ts` | Read roll params from upgradeState |
| 4 | `shared/src/sim/upgrade.ts` | Add generateUpgradeChoices |
| 4 | `client/src/scenes/GameScene.ts` | Pause/resume, choice generation, selectUpgrade API |
| 5 | `client/src/ui/UpgradePanel.tsx` | **NEW** — React upgrade card UI |
| 5 | `client/src/pages/Game.tsx` | Poll choices, render overlay |
| 6 | `shared/src/sim/upgrade.test.ts` | **NEW** — 14+ unit tests |

---

## File Structure After Sprint

```
packages/shared/src/sim/
  content/
    player.ts
    weapons.ts
    enemies.ts
    waves.ts
    xp.ts              # NEW — XP values, level thresholds
    upgrades.ts        # NEW — 15 upgrade definitions
    index.ts           # updated barrel exports
  upgrade.ts           # NEW — UpgradeState, all upgrade logic
  upgrade.test.ts      # NEW — 14+ unit tests
  world.ts             # +upgradeState on GameWorld
  systems/
    health.ts          # +XP award on enemy death
    playerInput.ts     # roll params from upgradeState

packages/client/src/
  ui/
    UpgradePanel.tsx   # NEW — upgrade card overlay
  scenes/
    GameScene.ts       # +pause/resume, choice generation, selectUpgrade
  pages/
    Game.tsx           # +poll choices, render UpgradePanel
```
