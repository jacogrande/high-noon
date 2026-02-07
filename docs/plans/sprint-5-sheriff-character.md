# Sprint 5: Sheriff Character System

## Context

Sprints 1-4 built a working roguelite loop: movement, shooting, rolling, enemies with AI, wave spawning, XP/upgrades, audio, particles, and HUD. But the player is a generic entity with an infinite-ammo pistol and 15 random stat-mod upgrade cards. There's no character identity, no weapon personality, and no ability.

This sprint introduces the **character system** via The Sheriff — the first playable character. It replaces infinite ammo with a 6-shot revolver cylinder, adds the Showdown duel ability, and replaces random upgrade cards with a 3-branch skill tree. The architecture is designed to support future characters (Hangman, Whippersnapper, Cultist) without rework.

## Goal

The Sheriff has a revolver that fires as fast as you click (6 shots, then reload), a Showdown ability that marks one enemy for bonus damage + pierce, and a skill tree where each level-up lets you invest in Marksman, Gunslinger, or Lawman branches.

## Success Criteria

- [x] 6-round cylinder with reload (R key, auto-reload on empty, roll cancels reload)
- [x] Click-to-fire uncapped (75ms soft floor), hold-to-fire at 5/sec
- [x] Last round deals 1.5x damage
- [x] Cylinder state visible in HUD
- [x] Showdown ability: mark enemy, +100% damage, pierce to target, kill refund
- [ ] Showdown visual indicators (mark on enemy, cooldown in HUD)
- [ ] Skill tree UI replaces random upgrade cards on level-up
- [ ] 9 of 15 nodes are functional (full Marksman, Lawman T1-T4)
- [ ] 6 nodes defined but greyed out as "coming soon" (full Gunslinger, Lawman T5)
- [ ] Character architecture supports adding new characters as data + modules
- [ ] All game logic in `packages/shared`
- [ ] All existing combat, enemies, waves, audio, particles still work
- [ ] `bun run typecheck && bun run build && bun test` pass

---

## Architecture: Character System

### Design Approach: Hybrid (Data + Code)

Character stats, weapon parameters, and skill tree shape are **data-driven** (`CharacterDef`). Abilities and special node effects are **code-driven** (system functions + effect handlers). This lets us add simple characters with just data files, while complex abilities get dedicated system code.

### File Structure

```
packages/shared/src/sim/content/characters/
  types.ts              — CharacterDef, SkillBranch, SkillNodeDef, NodeEffectHandler interfaces
  index.ts              — barrel exports, getCharacterDef() helper
  sheriff/
    index.ts            — exports SHERIFF_DEF, SHERIFF_EFFECTS
    definition.ts       — CharacterDef with weapon stats, ability config, 15 skill nodes
    effects.ts          — NodeEffectRegistry: handlers for implemented node effects
    constants.ts        — numeric constants (CYLINDER_SIZE, SHOWDOWN_DURATION, etc.)
```

### Core Interfaces

```typescript
type CharacterId = 'sheriff'  // future: | 'hangman' | 'whippersnapper' | 'cultist'

interface CharacterDef {
  id: CharacterId
  name: string
  description: string
  weapon: {
    cylinderSize: number       // 6
    bulletDamage: number       // 10
    bulletSpeed: number        // 600
    range: number              // 400
    reloadTime: number         // 1.2s
    holdFireRate: number       // 5 shots/sec (hold-to-fire)
    minFireInterval: number    // 0.075s (click-to-fire floor)
    lastRoundMultiplier: number // 1.5x
  }
  stats: { speed, maxHP, iframeDuration, rollDuration, rollIframeRatio, rollSpeedMultiplier }
  ability: { cooldown: number, duration: number, killRefund: number }
  branches: SkillBranch[]
}

interface SkillBranch {
  id: string               // 'marksman' | 'gunslinger' | 'lawman'
  name: string
  description: string
  nodes: SkillNodeDef[]    // ordered by tier
}

interface SkillNodeDef {
  id: string               // unique, e.g. 'steady_hand'
  name: string
  description: string
  tier: number             // 1–5
  branch: string
  implemented: boolean     // false → greyed out in UI, effect is no-op
  statMods: StatMod[]      // direct stat mods (reuses existing StatMod type)
  effectId?: string        // key into NodeEffectRegistry for code-driven effects
}

interface NodeEffectHandler {
  onApply?(world: GameWorld, playerEid: number): void
  onRecompute?(state: SkillTreeState): void
}
```

### SkillTreeState (replaces UpgradeState)

```typescript
interface SkillTreeState {
  // XP/Level (same as before)
  xp: number
  level: number
  characterId: CharacterId

  // Skill tree (replaces pendingChoices + acquired)
  nodesTaken: Set<string>
  pendingPoints: number        // unspent skill points

  // Computed stats (same as before, plus new ones)
  fireRate: number             // hold-fire rate
  bulletDamage: number
  bulletSpeed: number
  range: number
  speed: number
  maxHP: number
  iframeDuration: number
  rollDuration: number
  rollIframeRatio: number
  rollSpeedMultiplier: number
  // NEW
  cylinderSize: number
  reloadTime: number
  minFireInterval: number
  lastRoundMultiplier: number
  abilityCooldown: number
  abilityDuration: number
  abilityKillRefund: number
  showdownDamageMultiplier: number  // base 2.0

  // Node-driven flags (set by effect handlers)
  steadyHandActive: boolean
  steadyHandMultiplier: number
  piercingCount: number            // 0 = no pierce
  quickReloadRollCancel: boolean
  secondWindAvailable: boolean
  deadToRightsActive: boolean
  judgeActive: boolean
  judgeDamageBuffTimer: number
}
```

### New ECS Components

```typescript
// Cylinder (revolver ammo state)
Cylinder: {
  rounds: Uint8Array         // current loaded rounds
  maxRounds: Uint8Array      // capacity
  reloading: Uint8Array      // 0/1 flag
  reloadTimer: Float32Array  // elapsed reload time
  reloadTime: Float32Array   // total reload time
  firstShotAfterReload: Uint8Array  // for Steady Hand
  fireCooldown: Float32Array // min interval enforcement
}

// Showdown (ability state, on player entity)
Showdown: {
  targetEid: Uint16Array     // NO_TARGET when inactive
  duration: Float32Array     // remaining duration
  cooldown: Float32Array     // remaining cooldown
  active: Uint8Array         // 0/1 flag
}
```

### Node Availability Rule

A node can be taken when:
1. `pendingPoints > 0`
2. `node.implemented === true`
3. All lower-tier nodes in the same branch are already taken
4. Node not already taken

Unimplemented nodes **block progression past them** in their branch. This means the entire Gunslinger branch is locked (T1 Dead Aim is unimplemented). Lawman T5 (Intimidation Aura) is locked but T1-T4 are accessible. All 5 Marksman nodes are accessible.

**Accessible nodes: 9 of 15** (Marksman T1-T5, Lawman T1-T4). With max level 10, the player can fill 9 nodes with 1 point left over.

---

## Sheriff Skill Tree Definition

### Marksman — *Precision. Showdown enhancement.*

| Tier | Node | Effect | Impl? |
|------|------|--------|-------|
| 1 | **Steady Hand** | First shot after reload deals +50% damage | Yes |
| 2 | **Piercing Rounds** | Bullets pass through 1 enemy | Yes |
| 3 | **Called Shot** | Showdown duration +2s, damage bonus becomes +150% | Yes |
| 4 | **Dead to Rights** | Last round deals 2.5x (not 1.5x) on Showdown targets | Yes |
| 5 | **Judge, Jury, Executioner** | Kill Showdown target → instant reload + 3s +50% damage buff | Yes |

### Gunslinger — *Momentum. Rewarding accuracy.*

| Tier | Node | Effect | Impl? | Blocked by |
|------|------|--------|-------|------------|
| 1 | **Dead Aim** | +10% damage per consecutive hit (max 5 stacks, 0.5s window) | No | Needs hit chain tracking |
| 2 | **Hot Rounds** | Burn DoT: 4 damage over 2s | No | Needs status effects |
| 3 | **Fan the Hammer** | Hold fire to dump remaining rounds in rapid spread burst | No | Needs special fire mode |
| 4 | **Hair Trigger** | 15% crit chance, 2x crit damage | No | Needs crit system |
| 5 | **Speed Loader** | Each kill during cylinder reduces next reload by 0.2s | No | Needs per-cylinder kill tracking |

### Lawman — *Survival. Utility.* (T4/T5 swapped from design doc for accessibility)

| Tier | Node | Effect | Impl? |
|------|------|--------|-------|
| 1 | **Tin Star** | +2 max HP (heal the delta) | Yes |
| 2 | **Quick Reload** | -40% reload time; roll during reload → instant complete | Yes |
| 3 | **Iron Will** | +0.3s i-frame duration, +25% roll speed | Yes |
| 4 | **Second Wind** | Survive one killing blow per encounter (1 HP + i-frames) | Yes |
| 5 | **Intimidation Aura** | Enemies within 120px move 25% slower | No | Needs proximity debuff |

> **Note**: Lawman T4 and T5 are swapped from the design doc so that Second Wind (implementable) is accessible at T4, and Intimidation Aura (deferred) only blocks T5.

---

## Phase 1: Cylinder & Reload Foundation

**Goal**: Replace infinite ammo with a 6-round cylinder. Click-to-fire uncapped, hold-to-fire at 5/sec. Manual reload (R key) + auto-reload. Roll cancels reload. Last round bonus.

### Files

| File | Action |
|------|--------|
| `shared/src/sim/components.ts` | Add `Cylinder` component, add `shootWasDown` to `Player` |
| `shared/src/sim/content/weapons.ts` | Add cylinder constants |
| `shared/src/net/input.ts` | Add `RELOAD` button flag |
| `shared/src/sim/systems/cylinder.ts` | **NEW** — reload state machine |
| `shared/src/sim/systems/weapon.ts` | Rework for cylinder-based firing |
| `shared/src/sim/prefabs.ts` | Add `Cylinder` to `spawnPlayer` |
| `shared/src/sim/systems/index.ts` | Export `cylinderSystem` |
| `shared/src/sim/upgrade.ts` | Add cylinder stats to `UpgradeState`, update `writeStatsToECS` |
| `client/src/engine/Input.ts` | Map R key → RELOAD |
| `client/src/scenes/GameScene.ts` | Register `cylinderSystem` before `weaponSystem`, update fire detection |

### Implementation Details

**New constants** in `weapons.ts`:
- `PISTOL_CYLINDER_SIZE = 6`
- `PISTOL_RELOAD_TIME = 1.2`
- `PISTOL_MIN_FIRE_INTERVAL = 0.075` (75ms soft floor)
- `PISTOL_HOLD_FIRE_RATE = 5`
- `PISTOL_LAST_ROUND_MULTIPLIER = 1.5`

**Click vs hold detection** — add `Player.shootWasDown` (Uint8Array) to track previous-tick SHOOT state:
- **Rising edge** (SHOOT pressed, wasDown=0): Fire immediately if `fireCooldown <= 0` and rounds > 0. Set `fireCooldown = minFireInterval` (75ms).
- **Held** (SHOOT pressed, wasDown=1): Fire if `fireCooldown <= 0` and rounds > 0. Set `fireCooldown = 1/holdFireRate` (200ms).
- This means clicking fires faster than holding. The cylinder (6 rounds + reload) is the natural DPS limiter.

**cylinderSystem** (runs before weaponSystem):
1. Decrement `fireCooldown` by dt
2. If player is rolling and reloading → cancel reload (set reloading=0, reloadTimer=0)
3. If reloading → advance reloadTimer. On complete: set rounds=maxRounds, firstShotAfterReload=1, reloading=0
4. If RELOAD pressed and rounds < maxRounds and not reloading → start reload
5. If rounds=0 and not reloading → auto-start reload

**weaponSystem changes**:
- Check `Cylinder.rounds[eid] > 0` before firing (instead of infinite ammo)
- Decrement `Cylinder.rounds` on fire
- If firing the last round (rounds was 1): multiply damage by `lastRoundMultiplier`
- Use `Cylinder.fireCooldown` instead of `Weapon.cooldown` for player entities
- Set `firstShotAfterReload = 0` after any fire
- Keep `Weapon.cooldown` logic for enemies (enemyAttackSystem uses it independently)

**System order**: `playerInputSystem → rollSystem → cylinderSystem → weaponSystem → ...`

**GameScene fire detection**: Currently checks if `Weapon.cooldown` increased. Change to check if `Cylinder.rounds` decreased (snapshot before/after `stepWorld`).

### Manual Test
1. Fire 6 shots → gun stops. 7th click does nothing.
2. Press R → after ~1.2s, can fire again (6 rounds restored).
3. Empty cylinder → auto-reload starts without pressing R.
4. Start reload, roll mid-reload → reload canceled, rounds unchanged.
5. Hold mouse button → steady ~5 shots/sec.
6. Click rapidly → fires faster than 5/sec.
7. Last (6th) shot → deals 15 damage instead of 10 (visible in floating damage numbers).

---

## Phase 2: Cylinder HUD

**Goal**: Cylinder state visible in HUD. Reload audio feedback.

### Files

| File | Action |
|------|--------|
| `client/src/scenes/GameScene.ts` | Expand `HUDState` with cylinder fields |
| `client/src/ui/GameHUD.tsx` | Add cylinder display (6 chamber indicators + reload bar) |
| `client/src/scenes/GameScene.ts` | Add reload audio triggers |

### Implementation Details

**HUDState additions**:
```typescript
cylinderRounds: number    // current rounds loaded
cylinderMax: number       // max capacity
isReloading: boolean
reloadProgress: number    // 0–1
```

**Cylinder HUD element**: 6 small circles in a row near the HP bar (bottom-right). Filled circle = loaded round, empty = spent. During reload, a thin progress bar fills beneath them.

**Audio triggers** in GameScene:
- Reload start (`Cylinder.reloading` went 0→1): play `reload_start` (can reuse existing sounds or add placeholder)
- Reload complete (rounds went to max): play `reload_complete`
- Dry fire (SHOOT pressed, rounds=0, not reloading): play `dry_fire`

### Manual Test
1. See 6 filled chamber indicators in HUD.
2. Fire shots → chambers empty one by one.
3. Press R → reload progress bar fills over ~1.2s, then chambers refill.
4. Hear reload sounds at appropriate times.

---

## Phase 3: Showdown Ability

**Goal**: Implement the Showdown ability in the shared simulation. Mark nearest enemy, bonus damage, pierce to target, kill refund, cooldown.

### Files

| File | Action |
|------|--------|
| `shared/src/sim/components.ts` | Add `Showdown` component |
| `shared/src/net/input.ts` | Add `ABILITY` button flag, add `cursorWorldX`/`cursorWorldY` to InputState |
| `shared/src/sim/systems/showdown.ts` | **NEW** — ability state machine |
| `shared/src/sim/systems/bulletCollision.ts` | Add Showdown damage bonus + pierce-to-target |
| `shared/src/sim/world.ts` | Add `bulletPierceHits: Map<number, Set<number>>` |
| `shared/src/sim/prefabs.ts` | Add `Showdown` to `spawnPlayer` |
| `shared/src/sim/systems/index.ts` | Export `showdownSystem` |
| `client/src/engine/Input.ts` | Map right-click and Q key → ABILITY, add cursorWorldX/Y |
| `client/src/scenes/GameScene.ts` | Register `showdownSystem` |

### Implementation Details

**InputState additions**: `cursorWorldX: number`, `cursorWorldY: number`. Client `Input.ts` already has `screenToWorldX/Y()` — populate these in `getInputState()`.

**showdownSystem** (runs after cylinderSystem, before weaponSystem):
1. Each tick: decrement `Showdown.cooldown` by dt. Reset `Speed.current = Speed.max` (clean slate each tick for modifiers).
2. If ABILITY pressed and cooldown <= 0 and not active:
   - Find closest alive enemy to `(cursorWorldX, cursorWorldY)` within 500px
   - If found: set `targetEid`, `duration` from ability config, `active = 1`
3. While active:
   - Decrement duration
   - Apply speed bonus: `Speed.current[eid] = Speed.max[eid] * 1.1`
   - If target dead (Health.current <= 0 or entity removed): grant kill refund (cooldown -= killRefund, min 0), deactivate
   - If duration <= 0: deactivate
4. On deactivate: set `active = 0`, `targetEid = NO_TARGET`

**playerInputSystem change**: Read `Speed.current` instead of `Speed.max` for velocity calculation. This enables Showdown (and future effects) to modify effective speed per-tick.

**bulletCollisionSystem changes** — inside the `forEachInRadius` callback, after the layer check:
- Check if bullet owner has active Showdown (`Showdown.active[ownerId] === 1`)
- If **Showdown active** and hit entity is **NOT** the Showdown target:
  - Apply damage normally
  - Track hit in `world.bulletPierceHits` to prevent double-hit
  - Do NOT add to `bulletsToRemove` — bullet pierces through
  - Set `hitEntity = false` so iteration continues (change the early-return pattern to allow multiple hits)
- If **Showdown active** and hit entity **IS** the Showdown target:
  - Apply damage x `showdownDamageMultiplier`
  - Add to `bulletsToRemove` — bullet stops at the target
- If **Showdown not active**: existing behavior (stop on first hit)

**Bullet pierce tracking**: `world.bulletPierceHits: Map<number, Set<number>>` maps bullet EID → set of already-hit entity EIDs. Check before applying damage to avoid double-hits in the same tick. Clean up when bullet is removed.

### Manual Test
1. Press right-click near an enemy → nothing visible yet (visuals in Phase 4), but check debug overlay or floating text.
2. Shoot marked enemy → damage numbers show ~20 instead of ~10 (2x damage).
3. Line up two enemies, shoot through the front one toward the marked target → both take damage, bullet reaches target.
4. Kill marked target → Showdown deactivates. Observe cooldown is 8s not 12s (4s refund).
5. During Showdown → player moves slightly faster.
6. Wait 4s without killing → Showdown expires naturally.
7. Try activating during cooldown → nothing happens.

---

## Phase 4: Showdown Visuals

**Goal**: Visual indicators for Showdown. Mark on enemy, connection line, HUD cooldown indicator, audio.

### Files

| File | Action |
|------|--------|
| `client/src/render/ShowdownRenderer.ts` | **NEW** — renders mark indicator + connection line |
| `client/src/scenes/GameScene.ts` | Expand HUDState, create ShowdownRenderer, add audio triggers |
| `client/src/ui/GameHUD.tsx` | Add Showdown cooldown/duration indicator |
| `client/src/render/EnemyRenderer.ts` | Tint/outline Showdown target differently |

### Implementation Details

**ShowdownRenderer**: Reads `Showdown` component from player entity. When active:
- Draw a crosshair/star graphic above the target enemy (add to `entities` layer)
- Draw a dashed/pulsing line from player to target (Graphics object)
- Tint the target enemy red or add a glow ring

**HUDState additions**: `showdownActive`, `showdownCooldown`, `showdownCooldownMax`, `showdownTimeLeft`

**HUD element**: Small ability icon near the cylinder display. Shows cooldown sweep when on cooldown, "READY" glow when available, duration countdown when active.

**Audio**: Play `showdown_activate` on mark, `showdown_expire` on timeout, `showdown_kill` on target killed.

### Manual Test
1. Activate Showdown → see mark appear on enemy, line connecting player to target.
2. Target enemy has a red glow/outline.
3. HUD shows ability duration counting down.
4. Showdown expires → mark disappears, HUD shows cooldown timer.
5. Cooldown completes → HUD shows "READY" indicator.

---

## Phase 5: Character Architecture & Skill Tree Data Model

**Goal**: Define the character system architecture. Create all interfaces and data definitions. Rework UpgradeState → SkillTreeState. Wire up stat recomputation from skill tree nodes.

### Files

| File | Action |
|------|--------|
| `shared/src/sim/content/characters/types.ts` | **NEW** — CharacterDef, SkillBranch, SkillNodeDef, NodeEffectHandler |
| `shared/src/sim/content/characters/index.ts` | **NEW** — barrel, getCharacterDef() |
| `shared/src/sim/content/characters/sheriff/index.ts` | **NEW** — exports |
| `shared/src/sim/content/characters/sheriff/definition.ts` | **NEW** — full CharacterDef with 15 nodes |
| `shared/src/sim/content/characters/sheriff/effects.ts` | **NEW** — NodeEffectRegistry (stubs for now) |
| `shared/src/sim/content/characters/sheriff/constants.ts` | **NEW** — numeric constants |
| `shared/src/sim/content/index.ts` | Add characters export |
| `shared/src/sim/upgrade.ts` | Rework: UpgradeState → SkillTreeState, recomputePlayerStats reads tree nodes |
| `shared/src/sim/world.ts` | Update type from UpgradeState to SkillTreeState |
| `shared/src/sim/systems/health.ts` | Update awardXP import if signature changed |
| `shared/src/sim/systems/playerInput.ts` | Read roll params from SkillTreeState (already does this) |

### Implementation Details

**SkillTreeState** replaces UpgradeState. Key changes:
- `pendingChoices: UpgradeDef[]` → `pendingPoints: number`
- `acquired: Map<UpgradeId, number>` → `nodesTaken: Set<string>`
- Add `characterId`, cylinder stats, ability stats, and node-driven flags
- `generateUpgradeChoices()` → removed (no longer needed)
- `applyUpgrade(state, id)` → `takeNode(state, nodeId, charDef): boolean`
- `recomputePlayerStats()` → iterates `nodesTaken`, accumulates `statMods` from node definitions (same add-then-multiply pattern)
- `awardXP()` → same, but sets `pendingPoints++` on level-up instead of flagging for choice generation
- `initUpgradeState()` → `initSkillTreeState(charDef: CharacterDef)`: reads base stats from CharacterDef
- `writeStatsToECS()` → expanded to write cylinder and showdown stats

**Node availability** function `canTakeNode(state, node, charDef)`:
- Returns false if pendingPoints <= 0, already taken, not implemented
- Checks all lower-tier nodes in same branch are taken (prerequisite chain)

**Backward compatibility**: The field name `world.upgradeState` can stay (or alias) to minimize import churn across the codebase. Internal type changes, external access patterns remain similar. `awardXP` still returns boolean for level-up detection.

### Manual Test
1. `bun run typecheck` passes.
2. `bun test` — existing tests may need updating for SkillTreeState; verify no regressions in XP/level behavior.
3. Kill enemies → XP still accumulates, level still increments.
4. On level-up, `pendingPoints` increments (visible in debug overlay).

---

## Phase 6: Skill Tree UI

**Goal**: Replace UpgradePanel with SkillTreePanel. Show 3 branches, node states, click to invest.

### Files

| File | Action |
|------|--------|
| `client/src/ui/SkillTreePanel.tsx` | **NEW** — React skill tree overlay |
| `client/src/scenes/GameScene.ts` | Replace upgrade API: `hasPendingPoints()`, `getSkillTreeData()`, `selectNode()` |
| `client/src/pages/Game.tsx` | Poll skill tree state instead of upgrade choices |
| `client/src/ui/UpgradePanel.tsx` | Delete (replaced by SkillTreePanel) |

### Implementation Details

**SkillTreePanel** layout:
- Full-screen semi-transparent overlay (same pattern as UpgradePanel)
- Title: "LEVEL UP" with pending points count
- 3 columns (Marksman / Gunslinger / Lawman), each with branch name/description header
- 5 node slots per column (tier 1 at top → tier 5 at bottom)
- Node states: `taken` (gold), `available` (white/cyan, clickable), `locked` (grey, prerequisite not met), `unimplemented` (dark, lock icon, "Coming soon" tooltip)
- Click available node → calls `onSelectNode(nodeId)`

**GameScene API changes**:
- `getPendingChoices()` → `hasPendingPoints(): boolean`
- `getSkillTreeData(): SkillTreeUIData` — computes node states using `canTakeNode` for each node
- `selectUpgrade(id)` → `selectNode(nodeId: string)` — calls `takeNode`, `writeStatsToECS`, checks for remaining points

**Game.tsx changes**:
- Replace `pendingChoices` state with `showSkillTree: boolean`
- Poll `hasPendingPoints()` instead of checking choices length
- Render `<SkillTreePanel>` instead of `<UpgradePanel>`
- On select: call `selectNode`, re-check for remaining points

**SkillTreeUIData** interface passed to React:
```typescript
interface SkillTreeUIData {
  branches: Array<{
    id: string; name: string; description: string
    nodes: Array<{
      id: string; name: string; description: string; tier: number
      state: 'taken' | 'available' | 'locked' | 'unimplemented'
    }>
  }>
  pendingPoints: number
  level: number
}
```

### Manual Test
1. Level up → skill tree overlay appears (not random cards).
2. Marksman T1 and Lawman T1 show as "available" (clickable).
3. All Gunslinger nodes show as "unimplemented" (greyed out, lock icon).
4. Click Tin Star (Lawman T1) → node becomes "taken" (gold), tree closes.
5. Next level-up → Lawman T2 (Quick Reload) now "available", Lawman T3+ still "locked".
6. Pending points counter decreases on selection.
7. Multi-level: if player gains 2+ levels at once, tree stays open after first pick.

---

## Phase 7: Node Effects

**Goal**: Wire up effect handlers for all 9 implementable nodes. Each produces an observable gameplay change.

### Files

| File | Action |
|------|--------|
| `shared/src/sim/content/characters/sheriff/effects.ts` | Fill in all effect handlers |
| `shared/src/sim/systems/weapon.ts` | Steady Hand damage bonus, Dead to Rights modifier, Judge damage buff, pierce on spawn |
| `shared/src/sim/systems/bulletCollision.ts` | Piercing Rounds pierce logic |
| `shared/src/sim/systems/cylinder.ts` | Quick Reload roll-cancel instant complete |
| `shared/src/sim/systems/health.ts` | Second Wind death prevention |
| `shared/src/sim/systems/showdown.ts` | Called Shot stat mods, Judge instant reload on kill |
| `shared/src/sim/upgrade.ts` | Add flag fields for node effects to SkillTreeState |
| `shared/src/sim/components.ts` | Add `pierceRemaining` to `Bullet` component |
| `shared/src/sim/prefabs.ts` | `spawnBullet` accepts pierce count |

### Node-by-Node Implementation

**Tin Star** (Lawman T1) — Pure stat mod: `{ stat: 'maxHP', op: 'add', value: 2 }`. Handled entirely by `recomputePlayerStats` + `writeStatsToECS` (heals the delta). No effect handler needed.

**Quick Reload** (Lawman T2) — Stat mod `{ stat: 'reloadTime', op: 'mul', value: 0.6 }` for -40%. Effect handler sets `state.quickReloadRollCancel = true`. In `cylinderSystem`: when roll cancels a reload AND `quickReloadRollCancel` is true, complete the reload instantly (`rounds = maxRounds`) instead of canceling it.

**Iron Will** (Lawman T3) — Pure stat mods: `[{ stat: 'iframeDuration', op: 'add', value: 0.3 }, { stat: 'rollSpeedMultiplier', op: 'mul', value: 1.25 }]`. No effect handler needed.

**Second Wind** (Lawman T4) — Effect handler sets `state.secondWindAvailable = true`. In `healthSystem`: before tagging player as Dead, check flag. If true: set `Health.current = 1`, trigger full i-frames, set flag to false. Add `world.secondWindTriggered` flag for client visual/audio detection.

**Steady Hand** (Marksman T1) — Effect handler sets `state.steadyHandActive = true`, `state.steadyHandMultiplier = 1.5`. In `weaponSystem`: when firing, if `firstShotAfterReload === 1` AND `steadyHandActive`, multiply bullet damage by the multiplier.

**Piercing Rounds** (Marksman T2) — Effect handler sets `state.piercingCount = 1`. Add `Bullet.pierceRemaining` field. In `weaponSystem`: when spawning bullet, set `pierceRemaining = piercingCount`. In `bulletCollisionSystem`: after hitting an entity, if `pierceRemaining > 0`: decrement, track in `bulletPierceHits`, do NOT remove bullet. Separate from Showdown pierce (Showdown pierce is unlimited but only toward target; Piercing Rounds pierce is counted but applies to all bullets).

**Called Shot** (Marksman T3) — Effect handler modifies `state.abilityDuration += 2` and `state.showdownDamageMultiplier = 2.5` (was 2.0). These are computed stats that `showdownSystem` reads each tick. No system changes needed beyond reading the stats.

**Dead to Rights** (Marksman T4) — Effect handler sets `state.deadToRightsActive = true`. In `weaponSystem`: when firing the last round, if `deadToRightsActive` AND Showdown is active, use 2.5x multiplier instead of the normal `lastRoundMultiplier` (1.5x). The Showdown damage bonus stacks on top in `bulletCollisionSystem` (multiplicative).

**Judge, Jury, Executioner** (Marksman T5) — Effect handler sets `state.judgeActive = true`. In `showdownSystem`: when target dies AND `judgeActive`, set `Cylinder.rounds = maxRounds`, `reloading = 0`, `firstShotAfterReload = 1`, and start `judgeDamageBuffTimer = 3.0`. In `weaponSystem`: while `judgeDamageBuffTimer > 0`, multiply bullet damage by 1.5. Decrement timer in `showdownSystem` each tick.

### Manual Test (per node)
- **Tin Star**: Take → HP bar shows 7/7 instead of 5/5.
- **Quick Reload**: Take → reload is noticeably faster (~0.72s). Start reload then roll → cylinder is instantly full.
- **Iron Will**: Take → roll feels snappier (faster), i-frames last longer.
- **Second Wind**: Take → get hit to 0 HP → survive at 1 HP with i-frames. Second lethal hit kills normally.
- **Steady Hand**: Take → reload, first shot deals 15 damage (visible in floating text). Second shot deals 10.
- **Piercing Rounds**: Take → line up two enemies, shoot → bullet hits both.
- **Called Shot**: Take → Showdown lasts 6s, damage bonus is higher (25 per hit instead of 20).
- **Dead to Rights**: Take → last round on Showdown target deals massive damage (25 base x 2.5 last-round = 62.5... check the actual math).
- **Judge**: Take → kill Showdown target → cylinder instantly refills, next few shots deal +50% for 3s.

---

## Phase 8: Tests & Verification

**Goal**: Unit tests for new systems, update existing tests, full verification.

### Files

| File | Action |
|------|--------|
| `shared/src/sim/systems/cylinder.test.ts` | **NEW** — cylinder/reload tests |
| `shared/src/sim/systems/showdown.test.ts` | **NEW** — showdown ability tests |
| `shared/src/sim/skilltree.test.ts` | **NEW** — skill tree state/progression tests |
| `shared/src/sim/upgrade.test.ts` | Update for SkillTreeState API changes |

### Test Coverage

**cylinder.test.ts**: Firing decrements rounds, cannot fire at 0, auto-reload triggers, manual reload, reload completes after time, roll cancels reload, quick-reload roll-cancel completes instantly, fireCooldown enforces minimum interval, last round multiplier.

**showdown.test.ts**: Activates on ABILITY with target in range, does not activate on cooldown, duration counts down, deactivates on target death, kill refund, damage bonus in bulletCollision, pierce to target.

**skilltree.test.ts**: `initSkillTreeState` has correct base values, `canTakeNode` validates prerequisites, `takeNode` decrements points, recomputePlayerStats with nodes, unimplemented nodes rejected, branch progression gating.

### Verification
```bash
bun run typecheck     # Clean across all packages
bun run build         # Shared + Client build
bun test              # All tests pass
bun run dev           # Manual playthrough
```

**Manual playthrough checklist**:
1. Start game → 6-round cylinder, fire/reload works
2. Level up → skill tree appears with 3 branches
3. Invest in Marksman → Steady Hand, Piercing Rounds observable
4. Activate Showdown → mark enemy, bonus damage, pierce
5. Invest in Lawman → Tin Star HP increase, Quick Reload faster
6. Get hit to near-death with Second Wind → survive killing blow
7. Gunslinger nodes all greyed out as "Coming soon"
8. Full encounter playthrough with new mechanics
9. Performance: 50+ enemies, no FPS drops from new systems

---

## Dependencies Between Phases

```
Phase 1 (Cylinder) ──→ Phase 2 (Cylinder HUD)
     │
     └──→ Phase 3 (Showdown) ──→ Phase 4 (Showdown Visuals)
                │
                └──→ Phase 5 (Skill Tree Data) ──→ Phase 6 (Skill Tree UI)
                                                        │
                                                        └──→ Phase 7 (Node Effects)
                                                                  │
                                                                  └──→ Phase 8 (Tests)
```

Phases 1 and 3 could be parallelized (different systems), but serial is cleaner. Phase 5 depends on Cylinder and Showdown components existing. Phase 7 depends on everything above.

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Cylinder changes break existing fire-detection logic | Client audio/particles miss | Snapshot Cylinder.rounds before/after step for robust detection |
| Showdown pierce creates edge cases with multiple bullets | Double-damage, ghost bullets | bulletPierceHits tracking with cleanup on bullet removal |
| SkillTreeState migration breaks existing save/replay | Lost progress | No save system yet; clean migration in createGameWorld |
| Unimplemented nodes frustrate players | Bad UX | Clear "Coming soon" visual treatment + tooltip. 9 accessible nodes is plenty. |
| Speed.current per-tick reset pattern causes bugs | Flickering speed | Single reset point in showdownSystem, before modifiers apply |
| Click-to-fire feels too fast / macro-abusable | Balance | 75ms floor + 6 round cylinder naturally caps DPS |

---

## Out of Scope

- Aspects (weapon variants) — future sprint
- Meta-progression / meta-currency — all nodes treated as unlocked
- Gunslinger branch implementation (needs status effects, crits, etc.)
- Intimidation Aura (Lawman T5, needs proximity debuff system)
- Other characters (Hangman, Whippersnapper, Cultist)
- Multiplayer implications of input changes
- New audio assets (reuse existing or add placeholders)
- Weapon swap / pickup mechanics
- Cylinder size upgrades (future general-purpose progression)

---

## Key Files Reference

| File | Role |
|------|------|
| `shared/src/sim/components.ts` | ECS component definitions — add Cylinder, Showdown, Bullet.pierceRemaining |
| `shared/src/sim/upgrade.ts` | Progression state — rework to SkillTreeState |
| `shared/src/sim/systems/weapon.ts` | Firing logic — rework for cylinder, click/hold, node effects |
| `shared/src/sim/systems/bulletCollision.ts` | Damage — add Showdown bonus, pierce |
| `shared/src/sim/systems/health.ts` | Death — add Second Wind intercept |
| `shared/src/net/input.ts` | Input protocol — add RELOAD, ABILITY, cursor coords |
| `shared/src/sim/content/characters/sheriff/definition.ts` | Sheriff character data |
| `client/src/scenes/GameScene.ts` | Client orchestration — wire everything |
| `client/src/ui/SkillTreePanel.tsx` | Skill tree UI (replaces UpgradePanel) |
| `client/src/ui/GameHUD.tsx` | HUD — add cylinder + showdown indicators |
