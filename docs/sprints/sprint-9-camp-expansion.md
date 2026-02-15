# Sprint 9: Camp Expansion — Visitors, Shop, and Item Pool

**Goal**: Transform the between-stage camp from a skill-tree pit stop into a meaningful decision point with random visitors who sell items, offer services, and provide narrative flavor. Expand the passive item pool from 12 to ~24 items to support build diversity.

**Depends on**: Current main (camp phase, item system, economy, gold, HookRegistry)

---

## Current State

The camp phase exists and functions end-to-end in both singleplayer and multiplayer:

**What exists:**
- `stageProgressionSystem` drives `'camp'` transition state — heals players, pre-generates next map, waits for `campComplete` signal
- `CampPanel.tsx` — React overlay showing "STAGE CLEAR", "HP RESTORED", skill tree button, and "RIDE OUT" button
- `SkillTreePanel.tsx` — opens from camp for spending skill points
- Gold economy — `world.goldCollected` shared pool, earned from kills and stash digs
- 12 passive items (6 brass, 4 silver, 2 gold) with stat mods and hook-based effects
- Item pickup system with auto-collect on proximity
- `rollStashReward()` in `economy.ts` — rolls gold + item from stash digs
- Multiplayer camp ready-up via `set-camp-ready` message in `GameRoom.ts`
- Salesman NPC (buy shovels) already exists in-stage via interaction system
- `HookRegistry` supports item effect registration per-player

**What doesn't exist:**
- Camp visitor NPCs (no `visitors.ts` content definitions)
- Visitor selection logic (weighted random per camp)
- Camp shop UI (browsing/buying items from a visitor)
- Visitor dialogue or personality
- Bounty board (next-stage preview)
- Narrative text beats between stages
- Wave 2 items (only 12 of 36+ designed items exist)
- Enemy item drops (enemies don't drop items on death)
- Stage chests (no in-stage chest spawning)

---

## Design Constraints

1. **All visitor logic in `packages/shared`** — visitor selection, offer generation, purchase validation. Client only renders UI.
2. **Visitors are next-stage-only** — visitor purchases grant temporary buffs or permanent items, but the visitor interaction itself is scoped to camp. No visitor state carries across camps (that's sprint 12 / narrative).
3. **Offers are transparent** — full item stats visible before purchase. No mystery boxes.
4. **Gold is the only currency** — reuse the existing `world.goldCollected` pool.
5. **Items use the existing `HookRegistry`** — new items follow the same `itemEffects.ts` pattern.
6. **Deterministic** — visitor selection and offer contents use `world.rng`. Same seed = same visitors = same offers.
7. **Multiplayer-compatible** — visitor offers are per-player (buying doesn't deplete stock for others). Server broadcasts visitor state alongside camp state.

---

## Epic Overview

| # | Epic | Package(s) | Priority | Estimate |
|---|------|-----------|----------|----------|
| 1 | Wave 2 items (12 new items) | shared | P0 | Large |
| 2 | Visitor content definitions | shared | P0 | Medium |
| 3 | Visitor selection & offer system | shared | P0 | Medium |
| 4 | Camp shop UI | client | P0 | Medium |
| 5 | Enemy item drops | shared, client | P1 | Small |
| 6 | Bounty board & narrative beats | shared, client | P1 | Small |
| 7 | Multiplayer visitor sync | shared, server, client | P1 | Medium |
| 8 | Tests | shared | P0 | Medium |

---

## Epic 1: Wave 2 Items (12 New Items)

Expand the item pool to support distinct build identities. These items must exist before the camp shop can sell them.

### Ticket 1.1 — Add on-hit proc items to `items.ts`

Add 3 new silver on-hit items from the `items.md` catalog:

| Item | Effect | Trigger | Stack |
|------|--------|---------|-------|
| **Lightning Rod** | 12% chance: hit chains to 1 nearby enemy for 60% damage. +1 target/stack. | `onBulletHit` | additive_chance |
| **Cactus Spine** | 10% chance: bullets pierce one additional enemy. | `onBulletHit` | additive_chance |
| **Scorpion Stinger** | 15% chance: hit slows target 30% for 1.5s. +0.3s/stack. | `onBulletHit` | additive_chance |

### Ticket 1.2 — Add conditional items to `items.ts`

Add 3 new silver conditional items:

| Item | Effect | Trigger | Stack |
|------|--------|---------|-------|
| **Pocket Watch** | While at full HP, +20% fire rate. +5%/stack. | `passive` | linear |
| **Bandolier** | After reloading, first shot deals +30% damage. +10%/stack. | `onReload` (new trigger) | linear |
| **Desert Rose** | While below 50% HP, +2 HP regen/second. +1/stack. | `passive` | linear |

This requires adding `'onReload'` to the `ItemTrigger` type union and firing it from `cylinderSystem` when reload completes.

### Ticket 1.3 — Add economy/utility items to `items.ts`

Add 3 new brass utility items:

| Item | Effect | Trigger | Stack |
|------|--------|---------|-------|
| **Prospector's Map** | Stash locations revealed on minimap within 200px. +100px/stack. | `passive` | linear |
| **Worn Saddlebag** | +1 shovel carry capacity. | `passive` | linear |
| **Bounty Notice** | +3 bonus gold per kill. | `onKill` | linear |

### Ticket 1.4 — Add 2 gold-tier items and 1 cursed item

| Item | Effect | Trigger | Stack |
|------|--------|---------|-------|
| **Peacemaker** (Gold) | Every 6th consecutive hit on same target deals 3x damage. Resets on miss/switch. | `onBulletHit` | unique |
| **Witching Hour** (Gold) | At wave start, time slows to 50% for 3s. Player moves at full speed. | `onWaveStart` (new trigger) | unique |
| **Devil's Bargain** (Cursed) | +100% bullet damage. Max HP set to 1. | `passive` | unique |

This requires:
- Adding `'cursed'` to the `ItemRarity` type union
- Adding `'onWaveStart'` to the `ItemTrigger` type union
- Adding `downside?: string` to `ItemDef`
- Firing `onWaveStart` from `waveSpawnerSystem` when a new wave begins

### Ticket 1.5 — Register all new item effects in `itemEffects.ts`

Implement `registerLightningRod`, `registerCactusSpine`, `registerScorpionStinger`, `registerBandolier`, `registerBountyNotice`, `registerPeacemaker`, `registerWitchingHour`, `registerDevilsBargain` following the existing pattern.

Items like Pocket Watch, Desert Rose, Prospector's Map, and Worn Saddlebag are passive stat mods — they use the `mods` array on `ItemDef` and don't need hook registrations.

### Ticket 1.6 — Add `onReload` hook to HookRegistry

In `hooks.ts`, add:
```typescript
onReload: HookEntry<(world: GameWorld, playerEid: number) => void>[]
```

Fire it from `cylinderSystem` when a reload completes (rounds go from < max to max, or reload timer finishes). Add `fireReload` method to `HookRegistry`.

### Ticket 1.7 — Add `onWaveStart` hook to HookRegistry

In `hooks.ts`, add:
```typescript
onWaveStart: HookEntry<(world: GameWorld, waveIndex: number) => void>[]
```

Fire it from `waveSpawnerSystem` when a new wave begins. Add `fireWaveStart` method to `HookRegistry`.

**Acceptance:** `getAllItems()` returns 24 items. All hook-based effects are registered and functional. Existing 12 items unchanged.

---

## Epic 2: Visitor Content Definitions

Define camp visitor types as data in the shared package.

### Ticket 2.1 — Create `packages/shared/src/sim/content/visitors.ts`

```typescript
export interface VisitorOffer {
  /** Item definition ID */
  itemId: number
  /** Gold cost to purchase */
  cost: number
}

export interface VisitorDef {
  id: number
  key: string
  name: string
  /** One-line description shown in camp UI */
  tagline: string
  /** Dialogue lines — one chosen at random on camp entry */
  greetings: string[]
  /** Line spoken when player buys something */
  purchaseLines: string[]
  /** Line spoken when player declines / rides out */
  declineLines: string[]
  /** How this visitor generates offers */
  offerType: 'shop' | 'upgrade'
  /** Number of items offered */
  offerCount: number
  /** Rarity pool weights for generated offers: [brass, silver, gold] */
  rarityWeights: [number, number, number]
  /** Price multiplier applied to base rarity prices */
  priceMultiplier: number
  /** Which camps this visitor can appear at (0-indexed) */
  availableAtCamps: number[]
  /** Base selection weight (higher = more likely to appear) */
  weight: number
}
```

### Ticket 2.2 — Define initial visitor roster (4 visitors)

Start with 4 core visitors. The full 10-visitor roster from `npc-design.md` is future work.

| Visitor | Offers | Camp Availability | Notes |
|---------|--------|-------------------|-------|
| **Trade Caravan** | 3 items (2 brass + 1 silver at camp 1; 1 brass + 1 silver + 1 gold at camp 2) | Both camps | Straightforward shop |
| **Tinkerer** | 2 weapon-related items, biased toward silver | Both camps | Offers synergize with player's current character |
| **Sawbones** | 1 Leather Duster + 1 defensive item + 1 healing item | Both camps | Defensive focus |
| **Gambler** | 2 random items at 60% normal price (could be great or useless) | Both camps | Discount but no control over what's offered |

### Ticket 2.3 — Define rarity-based pricing constants

Add to `visitors.ts`:
```typescript
export const VISITOR_BASE_PRICES: Record<ItemRarity, number> = {
  brass: 15,
  silver: 30,
  gold: 60,
  cursed: 40,
}

/** Per-camp price scaling (camp index -> multiplier) */
export const CAMP_PRICE_SCALE = [1.0, 1.3]
```

**Acceptance:** All visitor definitions importable from shared. Pricing formulas are deterministic and documented.

---

## Epic 3: Visitor Selection & Offer System

Shared-package logic for selecting which visitor appears and what they sell.

### Ticket 3.1 — Visitor selection function

Create `packages/shared/src/sim/systems/campVisitor.ts`:

```typescript
/**
 * Select a visitor for the given camp using weighted random.
 * - Filters by camp availability
 * - Applies anti-repeat (no same visitor twice in a run)
 * - Uses world.rng for determinism
 */
export function selectCampVisitor(
  rng: SeededRng,
  campIndex: number,
  previousVisitorIds: number[],
): VisitorDef | null
```

Rules:
- Filter visitors by `availableAtCamps` including `campIndex`
- Exclude visitors whose `id` is in `previousVisitorIds`
- Weighted random selection from remaining pool using `rng`
- Return `null` if pool is empty (shouldn't happen with 4+ visitors and 2 camps)

### Ticket 3.2 — Offer generation function

```typescript
/**
 * Generate concrete item offers for a visitor at a given camp.
 * - Picks items from rarity pools based on visitor's rarityWeights
 * - Excludes items the player already has at max stack
 * - Prices scale by rarity, camp index, and visitor priceMultiplier
 * - Uses world.rng for determinism
 */
export function generateVisitorOffers(
  rng: SeededRng,
  visitor: VisitorDef,
  campIndex: number,
  playerItems: Map<number, number>, // current inventory: itemId -> stacks
): VisitorOffer[]
```

### Ticket 3.3 — Purchase validation function

```typescript
/**
 * Attempt to purchase an item from a visitor offer.
 * Returns true if purchase succeeded (gold deducted, item added).
 */
export function tryVisitorPurchase(
  world: GameWorld,
  playerEid: number,
  offer: VisitorOffer,
): boolean
```

Checks:
- Player has enough gold (`world.goldCollected >= offer.cost`)
- Player has room for the item (< 8 slots, or item stacks onto existing)
- Deducts gold, calls `addItemToPlayer`, calls `reapplyAllItemEffects`

### Ticket 3.4 — Add camp visitor state to `GameWorld`

Add to `world.ts`:

```typescript
// On RunState:
previousVisitorIds: number[]  // visitors seen this run (anti-repeat)

// On GameWorld:
campVisitor: {
  visitor: VisitorDef | null
  offers: VisitorOffer[]
  purchased: Set<number>  // indices of offers already bought by this player
} | null
```

### Ticket 3.5 — Generate visitor on camp entry

In `stageProgressionSystem`, when transitioning to `'camp'`:
1. Call `selectCampVisitor(world.rng, campIndex, run.previousVisitorIds)`
2. Call `generateVisitorOffers(world.rng, visitor, campIndex, playerItems)`
3. Store result on `world.campVisitor`
4. Push visitor ID to `run.previousVisitorIds`

**Acceptance:** Entering camp deterministically selects a visitor and generates 2-3 purchasable item offers. Same seed = same visitor = same offers.

---

## Epic 4: Camp Shop UI

Client-side UI for browsing and buying from the camp visitor.

### Ticket 4.1 — Create `VisitorShopPanel.tsx`

New React component rendered inside the camp overlay:

```
  [Visitor name + tagline]
  [Greeting dialogue line]

  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ Item icon │  │ Item icon │  │ Item icon │
  │ Name      │  │ Name      │  │ Name      │
  │ Effect    │  │ Effect    │  │ Effect    │
  │ ────────  │  │ ────────  │  │ ────────  │
  │ 💰 15g    │  │ 💰 30g    │  │ 💰 60g    │
  │ [BUY]     │  │ [BUY]     │  │ [SOLD]    │
  └──────────┘  └──────────┘  └──────────┘

  [Your gold: 45]
```

Styling:
- Item cards have rarity-colored borders (brass/copper, silver, gold, black+purple for cursed)
- BUY button disabled + dimmed when player can't afford
- SOLD state replaces BUY button after purchase
- Cursed items show upside AND downside with a "CONFIRM" step
- Visitor name in Western-style font, greeting in italic

### Ticket 4.2 — Wire `VisitorShopPanel` into `CampPanel`

Extend `CampPanel.tsx` to conditionally render `VisitorShopPanel` when `campVisitor` is non-null. Layout becomes:

```
  STAGE CLEAR
  Stage X of Y complete
  HP RESTORED

  [VisitorShopPanel]       (if visitor present)

  [SPEND SKILL POINTS]     (if pending points)
  [RIDE OUT]
```

### Ticket 4.3 — Add camp visitor data to HUD state

Extend the `HudData` / `HUDState` type to include:

```typescript
campVisitor: {
  visitorName: string
  visitorTagline: string
  greeting: string
  offers: Array<{
    itemId: number
    itemName: string
    itemDescription: string
    itemRarity: ItemRarity
    cost: number
    purchased: boolean
    canAfford: boolean
  }>
  playerGold: number
} | null
```

In `SingleplayerModeController`, populate this from `world.campVisitor` during camp phase. In `MultiplayerModeController`, receive it from server broadcast.

### Ticket 4.4 — Handle purchase action

When BUY is clicked:
- **Singleplayer:** Call `tryVisitorPurchase(world, playerEid, offer)` directly. Update camp visitor UI state.
- **Multiplayer:** Send `camp-purchase` message to server with offer index. Server validates and applies. Server broadcasts updated offer state (mark as purchased).

### Ticket 4.5 — Add visitor dialogue line

Pick a random greeting from `visitor.greetings` using `world.rng` at camp entry. Display it in the shop panel. After a purchase, briefly show a `purchaseLines` entry. On ride-out without buying, show a `declineLines` entry (brief, 1-2 seconds, cosmetic).

**Acceptance:** Player enters camp, sees a visitor with 2-3 item offers. Can click to see item details, buy items for gold, and see their gold decrease. Purchased items appear in inventory. Visitor dialogue changes on buy/decline.

---

## Epic 5: Enemy Item Drops

Enemies have a chance to drop items on death, creating in-stage item acquisition beyond stashes.

### Ticket 5.1 — Add drop chance constants to `enemies.ts`

Per the `items.md` design:

| Enemy Type | Drop Chance | Drop Rarity |
|-----------|-------------|-------------|
| Swarmer | 1% | brass |
| Grunt | 2% | brass |
| Shooter | 3% | brass |
| Charger | 4% | brass 80% / silver 20% |
| Goblin Rogue | 5% | brass 70% / silver 30% |
| Boss | 100% | gold |

Add a `dropChance` and `dropRarityWeights` field to enemy definitions, or a lookup map.

### Ticket 5.2 — Spawn item pickups on enemy death

In the kill processing path (where `onKill` hooks fire), after confirming a kill:
1. Roll `world.rng.next() < dropChance`
2. If success, roll rarity from weights, then roll a random item of that rarity
3. Push an `ItemPickup` to `world.itemPickups` at the enemy's death position

The existing `itemPickupSystem` already handles proximity collection and lifetime.

### Ticket 5.3 — Item pickup renderer enhancement

The client already renders item pickups via `InteractableRenderer` or a similar system. Ensure pickups from enemy drops:
- Have a rarity-colored glow (brass = copper, silver = white shimmer, gold = gold flash)
- Bob gently (existing `floatTimer` pattern)
- Have a reasonable lifetime (15-20 seconds before despawn)

**Acceptance:** Killing enemies occasionally drops item pickups. Items auto-collect on player proximity. Boss kills always drop a gold item.

---

## Epic 6: Bounty Board & Narrative Beats

Informational elements that make camp feel atmospheric and give players intel.

### Ticket 6.1 — Bounty board display in `CampPanel`

Add a static info section to the camp UI showing next-stage intel:

```
  ┌─────────────────────────┐
  │  NEXT: DEVIL'S CANYON   │
  │  ─────────────────────  │
  │  Waves: 3               │
  │  Expect: Shooters,      │
  │          Chargers        │
  └─────────────────────────┘
```

Data sourced from `run.stages[run.currentStage + 1]`:
- Stage name from a new `name` field on `StageEncounter` (or a `STAGE_NAMES` constant)
- Wave count from encounter definition
- Enemy types from wave spawn definitions (extract unique enemy types across all waves)

### Ticket 6.2 — Narrative text overlay

Add a brief narrative line at the top of the camp panel:

- After Stage 1: *"One down. The trail gets rougher from here."*
- After Stage 2: *"Almost there. Whatever's waiting in that canyon, it ends tonight."*

Stored as a `CAMP_NARRATIVE_LINES: string[]` constant indexed by camp number. Fades in on camp entry, auto-dismisses. Skippable. This is a placeholder for the procedural narrative system (Sprint 12).

**Acceptance:** Camp shows a bounty board with next-stage enemy preview and a brief narrative line.

---

## Epic 7: Multiplayer Visitor Sync

Synchronize camp visitor state across server and clients.

### Ticket 7.1 — Server broadcasts visitor state on camp entry

In `GameRoom.ts`, when the run transitions to `'camp'`:
1. Read `world.campVisitor` (already generated by shared sim)
2. Broadcast a `camp-visitor` message to all clients containing visitor name, tagline, greeting, and offer list

### Ticket 7.2 — Server handles `camp-purchase` messages

Add a `camp-purchase` message handler in `GameRoom.ts`:
1. Validate: run is in camp, offer index is valid, offer not already purchased by this player
2. Call `tryVisitorPurchase(world, playerEid, offer)` on the server's authoritative world
3. Broadcast updated purchase state to all clients (so other players see "SOLD" on offers they bought)

Per `camp.md` design: offers are per-player — one player buying doesn't deplete stock for others. Each player has their own `purchased` set.

### Ticket 7.3 — Client receives and displays visitor state

In `MultiplayerModeController.ts`:
1. Listen for `camp-visitor` messages
2. Store visitor data in HUD state
3. `VisitorShopPanel` renders from this state
4. Purchase button sends `camp-purchase` to server instead of modifying local world

### Ticket 7.4 — Per-player purchase tracking in multiplayer

The server needs to track which offers each player has purchased:
```typescript
// In GameRoom:
private readonly campPurchases = new Map<string, Set<number>>() // sessionId -> purchased offer indices
```

Clear on camp exit. When broadcasting offer state to a specific client, include their purchase status.

**Acceptance:** Both players in a multiplayer game see the same visitor. Each can independently buy items. Purchases are validated server-side. Gold is deducted correctly from the shared pool.

---

## Epic 8: Tests

### Ticket 8.1 — Item definition tests

- All 24 items have unique IDs and keys
- `getItemsByRarity` returns correct counts per rarity
- Stacking formulas produce expected values
- New trigger types (`onReload`, `onWaveStart`) exist in the type union

### Ticket 8.2 — Visitor selection tests

- Deterministic: same seed + same camp index = same visitor
- Anti-repeat: previously seen visitors are excluded
- Camp filtering: visitors only appear at their designated camps
- Empty pool: returns null gracefully (shouldn't happen in practice)

### Ticket 8.3 — Offer generation tests

- Offer count matches visitor's `offerCount`
- Prices scale by camp index and rarity
- Items excluded when player already has max stacks
- Deterministic: same seed = same offers

### Ticket 8.4 — Purchase validation tests

- Successful purchase: gold deducted, item added, returns true
- Insufficient gold: returns false, no side effects
- Inventory full (8 items, new item doesn't stack): returns false
- Item stacks onto existing: returns true, stack count increases

### Ticket 8.5 — Item effect tests for new items

- Lightning Rod: chains damage to nearby enemy on proc
- Cactus Spine: bullet pierces on proc
- Scorpion Stinger: applies slow debuff on proc
- Bandolier: first shot after reload deals bonus damage
- Bounty Notice: kills grant bonus gold
- Peacemaker: 6th consecutive hit deals 3x damage, resets on miss
- Witching Hour: time scale changes at wave start
- Devil's Bargain: damage doubled, max HP set to 1

### Ticket 8.6 — Enemy drop tests

- Drop rolls are deterministic with seeded RNG
- Drop chance respects per-enemy-type rates
- Boss kills always produce a gold drop
- Item pickup auto-collection works for dropped items

**Acceptance:** All new systems have test coverage. Existing tests still pass. `bun test` clean.

---

## File Checklist

| File | Action | Package |
|------|--------|---------|
| `packages/shared/src/sim/content/items.ts` | Add 12 new item definitions, `cursed` rarity, new triggers | shared |
| `packages/shared/src/sim/content/itemEffects.ts` | Add 8 new effect registrations | shared |
| `packages/shared/src/sim/content/visitors.ts` | New — visitor definitions, pricing, roster | shared |
| `packages/shared/src/sim/hooks.ts` | Add `onReload`, `onWaveStart` hooks | shared |
| `packages/shared/src/sim/systems/campVisitor.ts` | New — visitor selection, offer gen, purchase | shared |
| `packages/shared/src/sim/systems/cylinder.ts` | Fire `onReload` hook when reload completes | shared |
| `packages/shared/src/sim/systems/waveSpawner.ts` | Fire `onWaveStart` hook when new wave begins | shared |
| `packages/shared/src/sim/systems/stageProgression.ts` | Generate visitor on camp entry | shared |
| `packages/shared/src/sim/world.ts` | Add `campVisitor` state, `previousVisitorIds` on RunState | shared |
| `packages/shared/src/sim/content/enemies.ts` | Add `dropChance`, `dropRarityWeights` fields | shared |
| `packages/client/src/ui/VisitorShopPanel.tsx` | New — camp shop UI component | client |
| `packages/client/src/ui/CampPanel.tsx` | Integrate visitor shop, bounty board, narrative text | client |
| `packages/client/src/scenes/core/SingleplayerModeController.ts` | Pipe campVisitor state to HUD | client |
| `packages/client/src/scenes/core/MultiplayerModeController.ts` | Receive camp-visitor messages | client |
| `packages/server/src/rooms/GameRoom.ts` | Broadcast visitor state, handle camp-purchase | server |
| `packages/shared/src/sim/content/visitors.test.ts` | New — visitor selection + offer tests | shared |
| `packages/shared/src/sim/systems/campVisitor.test.ts` | New — purchase validation tests | shared |
| `packages/shared/src/sim/content/items.test.ts` | New or extend — item definition + effect tests | shared |

---

## Out of Scope

- **NPC arcs / continuity** — visitors are one-off encounters this sprint. Run-long NPC arcs are Sprint 12 (narrative).
- **Tinkerer weapon modifications** — the Tinkerer sells items from the pool this sprint, not custom weapon mods. Custom mods require a new system.
- **Shaman boons with downsides** — Devil's Bargain (cursed item) is the only downside item. Full Shaman-style "boon + cost" offers are future work.
- **Mercenary companion** — NPC combat allies require AI work (Sprint 10+).
- **Bounty contracts** — interactive bounty board with challenge constraints is future work.
- **Stage chests** — spawning lootable chests in-stage is a natural follow-up but not in this sprint.
- **Visual polish** — campfire animation, lighting, particles, ambient audio are Sprint 12 (polish).
- **Item limit UI** — when inventory is full (8 slots), the discard-to-swap panel is future work. For now, items simply can't be picked up when full.
- **Proc coefficients** — the cascade-dampening system (0.0-1.0 coefficients per damage source) is designed in `items.md` but not needed until items chain in complex ways. Defer until needed.

---

## Implementation Order

Recommended sequencing (epics can partially overlap):

1. **Epic 1** (Wave 2 items) — no dependencies, enables everything else
2. **Epic 2** (Visitor definitions) — no dependencies, pure data
3. **Epic 3** (Selection & offer system) — depends on Epics 1 + 2
4. **Epic 8 tickets 8.1-8.4** (Tests for items + visitors) — alongside Epics 1-3
5. **Epic 4** (Camp shop UI) — depends on Epic 3
6. **Epic 5** (Enemy drops) — independent, can run parallel to Epic 4
7. **Epic 6** (Bounty board) — independent, small, can run parallel
8. **Epic 7** (Multiplayer sync) — depends on Epics 3 + 4
9. **Epic 8 remaining** (Effect + drop tests) — after Epics 5 + item effects

---

## Success Criteria

A complete run should feel meaningfully different at camp:

1. Player clears Stage 1, enters camp, sees a randomly selected visitor offering 2-3 items for gold
2. Player can browse items with full stat descriptions, buy what they can afford
3. Visitor has a name, a greeting, and reacts to purchases
4. Bounty board shows what enemies to expect in Stage 2
5. A brief narrative line sets the mood
6. Player rides out with new items active in their inventory
7. During Stage 2, enemies occasionally drop items on death
8. Camp 2 has a different visitor (anti-repeat) with different offers
9. In multiplayer, both players see the same visitor and can buy independently
10. Same seed produces the same visitors, offers, and drops across singleplayer and multiplayer
