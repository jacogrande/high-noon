# Items

Passive upgrades that stack on the player throughout a run. Items are the primary source of emergent power — they modify existing mechanics in ways the skill tree doesn't, and they combine to create builds that feel different every run.

Items are **not** the skill tree. The skill tree is the player's deliberate plan. Items are what the desert gives you. A good run is adapting your plan to what you find.

## Design Principles

1. **One sentence per item.** Each item does one thing. Complexity comes from combinations, not from reading a paragraph to understand a single pickup.
2. **Items modify actions, not add buttons.** No active-use items. Everything is passive — triggers on existing verbs (shoot, kill, roll, reload, take damage, dig).
3. **Broken combinations are features.** Single-player game, no opponent to feel cheated. When a player stacks Powder Keg + Undertaker's Overkill and the screen explodes, that's the point.
4. **Pre-action luck.** Players see items before picking them up. Chests show contents. Shops display wares. No mystery boxes.
5. **Offensive items scale linearly. Defensive items scale hyperbolically.** Attack power can grow without bound (difficulty timer catches up). Damage reduction can never reach 100%.
6. **Every item has a home.** No trap items. Every item is good for at least one character or build. Some items are universally good; some are build-specific gems.
7. **Western flavor.** Items are objects that exist in the world — a rattlesnake fang, a flask of moonshine, a dented pocket watch. Not "+15% attack speed."

---

## Relationship to Other Systems

| System              | Role                                    | Item Interaction                                                                                                                                     |
| ------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Skill tree**      | Deliberate, permanent per-run upgrades  | Items complement skill nodes. A Marksman who finds Lucky Horseshoe (crit chance) amplifies their build.                                              |
| **Gold / economy**  | Currency for camp purchases and shovels | Gold buys items from the Trade Caravan. Shovels dig up buried items from stashes.                                                                    |
| **Camp visitors**   | Between-stage shopping                  | Trade Caravan sells items. Tinkerer offers weapon-specific upgrades (separate system). Shaman boons are temporary — items are permanent for the run. |
| **Stash system**    | In-stage resource nodes                 | Stashes can contain items instead of (or alongside) gold. Rarer stashes yield rarer items.                                                           |
| **Enemy drops**     | In-stage RNG rewards                    | Enemies have a low chance to drop items on death. Elites/bosses have guaranteed drops of higher rarity.                                              |
| **Hooks / effects** | Implementation layer                    | Items register hook callbacks (onBulletHit, onKill, onRollEnd, etc.) identical to existing skill node effects.                                       |

---

## Item Rarities

Three tiers. Simple. Players learn the color coding in one run.

### Common (Brass)

The bread and butter. Individually modest, collectively transformative. A single Brass item won't define your run. Five of them will.

- **Drop color:** Warm brass / copper glow
- **Sources:** Regular stashes, enemy drops, stage chests, Trade Caravan (cheap)
- **Frequency:** ~60% of all item drops
- **Design target:** Stats and simple triggers. "+X% fire rate" territory. Always useful, never exciting alone.

### Uncommon (Silver)

Build-defining. A Silver item suggests a direction. Finding Rattlesnake Fang (bleed on hit) early means you start caring about attack speed. Finding Moonshine Flask (heal on kill) means you play aggressively.

- **Drop color:** Cool silver shimmer
- **Sources:** Rare stashes, elite enemy drops, boss chests, Trade Caravan (expensive)
- **Frequency:** ~30% of all item drops
- **Design target:** Triggers and scaling effects. "On kill," "on crit," "when below half health." Items you build around.

### Rare (Gold)

Run-warping. A single Gold item reshapes strategy. These are the items you tell stories about: "I found Dead Man's Deed on stage 1 and went full glass cannon."

- **Drop color:** Rich gold flash with particle burst
- **Sources:** Boss kills (guaranteed), rare stash jackpots, end-of-stage quest rewards
- **Frequency:** ~10% of all item drops. One per stage on average, sometimes zero.
- **Design target:** Multiplicative effects, build-around anchors, rule-breaking passives. Items that make you reconsider your skill point allocation.

### Cursed (Black)

Optional high-risk items with a powerful upside and an explicit downside. Always clearly marked. Never forced on the player. The Shaman's domain — but they can also be dug up from ominous-looking stashes.

- **Drop color:** Black with violet sparks
- **Sources:** Shaman visitor, rare cursed stashes (visually distinct), hidden stage locations
- **Frequency:** 0-1 per run. Special, not routine.
- **Design target:** "Double your X, halve your Y." Full transparency — tooltip shows both effects before pickup. Experienced players love these.

---

## Item Stacking

Items can stack. Finding a second Gunpowder Pouch gives you another +8% bullet damage. But stacking formulas differ by category.

### Offensive Items: Linear

Each additional copy adds the same flat bonus. No diminishing returns. The game wants you to stack 5 Syringe... er, 5 Gun Oil Tins and become a machine gun.

```
effectiveBonus = baseValue * stackCount
```

**Example — Gun Oil Tin (+12% fire rate):**

| Stacks | Bonus |
| ------ | ----- |
| 1      | +12%  |
| 3      | +36%  |
| 5      | +60%  |

### Defensive Items: Hyperbolic

Asymptotically approaches but never reaches 100%. Each additional stack gives less marginal benefit. A player can never become truly invincible.

```
effectiveChance = 1 - 1 / (1 + coefficient * stackCount)
```

**Example — Tin Star Badge (block chance, coefficient 0.12):**

| Stacks | Block Chance |
| ------ | ------------ |
| 1      | 10.7%        |
| 3      | 26.5%        |
| 5      | 37.5%        |
| 10     | 54.5%        |

Going from 10 to 11 stacks adds ~2%. The first copy is worth 10x the tenth copy. This naturally pushes players toward diversifying their defensive items instead of hoarding one type.

### On-Effect Items: Probability Stacking

Items with proc chances stack additively up to 100%, then stop. Simple and intuitive.

```
effectiveChance = min(baseChance * stackCount, 1.0)
```

**Example — Rattlesnake Fang (8% bleed on hit):**

| Stacks | Bleed Chance |
| ------ | ------------ |
| 1      | 8%           |
| 5      | 40%          |
| 10     | 80%          |
| 13     | 100%         |

---

## Item Catalog

### Common (Brass)

#### Offensive

| Item                 | Effect              | Stacking                                                     |
| -------------------- | ------------------- | ------------------------------------------------------------ |
| **Gun Oil Tin**      | +12% fire rate      | Linear                                                       |
| **Gunpowder Pouch**  | +8% bullet damage   | Linear                                                       |
| **Trail Dust Boots** | +10% movement speed | Linear                                                       |
| **Rifle Sling**      | +15% bullet speed   | Linear                                                       |
| **Spent Casing**     | +0.3s roll duration | Linear                                                       |
| **Brass Knuckles**   | +10% melee damage   | Linear                                                       |
| **Spyglass**         | +12% weapon range   | Linear                                                       |
| **Oiled Holster**    | -8% reload time     | Linear (diminishing naturally since reload time has a floor) |

#### Defensive

| Item                 | Effect                                             | Stacking                                                                               |
| -------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Tin Star Badge**   | Chance to block incoming damage (coefficient 0.12) | Hyperbolic                                                                             |
| **Leather Duster**   | +1 max HP                                          | Linear (but HP has natural value decay — going from 5 to 6 HP is better than 15 to 16) |
| **Campfire Ember**   | Regenerate 1 HP every 8 seconds out of combat      | Timer scales: 8s / 6s / 5s / 4.5s... (hyperbolic)                                      |
| **Tumbleweed Charm** | +0.1s i-frame duration on rolls                    | Linear                                                                                 |

#### Utility

| Item                       | Effect                                                              | Stacking      |
| -------------------------- | ------------------------------------------------------------------- | ------------- |
| **Prospector's Map**       | Stash locations revealed on minimap within 200px (+100px per stack) | Linear radius |
| **Worn Saddlebag**         | +1 shovel carry capacity                                            | Linear        |
| **Fool's Gold Nugget**     | +15% gold from all sources                                          | Linear        |
| **Tattered Wanted Poster** | +10% XP from kills                                                  | Linear        |

### Uncommon (Silver)

#### On-Hit Triggers

| Item                 | Effect                                                            | Stacking                                     | Proc Coefficient                           |
| -------------------- | ----------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------ |
| **Rattlesnake Fang** | 8% chance: bullets inflict bleed (3 damage over 2s)               | Chance: additive. Damage: linear per stack.  | 0.0 (bleed cannot proc other on-hit items) |
| **Cactus Spine**     | 10% chance: bullets pierce one additional enemy                   | Chance: additive                             | 0.5 (pierced hit can proc at half rate)    |
| **Lightning Rod**    | 12% chance: hit chains lightning to 1 nearby enemy for 60% damage | Chance: additive. Targets: +1 per stack.     | 0.2 (chain lightning is self-dampening)    |
| **Scorpion Stinger** | 15% chance: hit slows target by 30% for 1.5s                      | Chance: additive. Duration: +0.3s per stack. | N/A (debuff, not damage)                   |

#### On-Kill Triggers

| Item                | Effect                                               | Stacking                                       |
| ------------------- | ---------------------------------------------------- | ---------------------------------------------- |
| **Moonshine Flask** | Heal 1 HP on kill (2s internal cooldown)             | Cooldown: -0.3s per stack (min 0.5s)           |
| **Powder Keg**      | Enemies explode on death for 4 damage in 50px radius | Damage: +2 per stack. Radius: +10px per stack. |
| **Bounty Notice**   | +3 bonus gold per kill                               | Linear                                         |
| **Vulture Feather** | On kill, +20% movement speed for 2s                  | Duration: +0.5s per stack                      |

#### On-Roll Triggers

| Item                | Effect                                                    | Stacking                                        |
| ------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| **Dust Devil**      | Rolling leaves a trail that slows enemies by 25% for 1.5s | Slow: +5% per stack. Duration: +0.3s per stack. |
| **Sidewinder Belt** | Rolling reloads 1 round into the cylinder                 | Rounds: +1 per stack                            |

#### Conditional

| Item             | Effect                                               | Stacking              |
| ---------------- | ---------------------------------------------------- | --------------------- |
| **Pocket Watch** | While at full HP, +20% fire rate                     | Bonus: +5% per stack  |
| **Bandolier**    | After reloading, first shot deals +30% damage        | Bonus: +10% per stack |
| **Desert Rose**  | While below 50% HP, +2 HP regeneration per second    | Regen: +1 per stack   |
| **Coyote Pelt**  | After not firing for 2s, next shot deals +50% damage | Bonus: +15% per stack |

### Rare (Gold)

Rare items are unique — you can only hold one copy. Finding a duplicate converts it to a Silver-tier item reroll.

| Item                  | Effect                                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Dead Man's Deed**   | Bullets that kill pierce all remaining enemies in their path. Pierced hits deal 60% damage.                                         |
| **Peacemaker**        | Every 6th consecutive hit on the same target deals 3x damage. Counter resets on miss or target switch.                              |
| **Witching Hour**     | At the start of each wave, time slows to 50% for 3 seconds. You move at full speed.                                                 |
| **Grim Harvest**      | On-kill effects trigger twice. (Powder Keg explodes twice. Moonshine Flask heals twice. Bounty Notice pays double.)                 |
| **Rattlesnake King**  | All bleed effects deal 2x damage and spread to enemies within 40px of the bleeding target.                                          |
| **Claim Jumper**      | Digging up stashes has a 40% chance to yield an additional item (random Brass or Silver).                                           |
| **Hellfire Cylinder** | Every bullet sets the ground on fire where it lands. Fire patches deal 2 damage/s for 3s. 60px radius.                              |
| **Judge's Gavel**     | Enemies below 15% HP are instantly executed. Execute threshold increases by 1% per enemy killed this stage (resets between stages). |
| **Pale Rider**        | After rolling, become invisible for 1s. Enemies lose aggro. First shot from invisibility deals 2x damage.                           |
| **Gold Rush Fever**   | Every 50 gold earned grants a permanent +5% damage bonus for the run. Tracked across all sources.                                   |

### Cursed (Black)

Always display both effects before pickup. Player must confirm.

| Item                | Upside                                           | Downside                                        |
| ------------------- | ------------------------------------------------ | ----------------------------------------------- |
| **Devil's Bargain** | +100% bullet damage                              | Max HP set to 1. Cannot be healed above 1.      |
| **Hangman's Noose** | On kill, fully heal.                             | Lose 1 HP every 5 seconds (constant drain).     |
| **Fool's Errand**   | All items you find are upgraded one rarity tier. | You can no longer buy items from camp visitors. |
| **Loaded Dice**     | All proc chances doubled.                        | All damage you deal reduced by 30%.             |
| **Unmarked Grave**  | Stashes always contain items (never just gold).  | Shovels cost 3x gold.                           |

---

## Proc Coefficients

When an item's damage effect triggers, that damage can itself trigger other on-hit items — but at a reduced rate. This prevents infinite cascading while still allowing satisfying chain reactions.

Every damage source has a **proc coefficient** between 0.0 and 1.0:

| Source                                               | Proc Coefficient | Rationale                                                     |
| ---------------------------------------------------- | ---------------- | ------------------------------------------------------------- |
| Player bullet (primary)                              | 1.0              | Full proc rate — this is intentional                          |
| Pierced bullet (Cactus Spine)                        | 0.5              | Can chain, but dampened                                       |
| Lightning chain (Lightning Rod)                      | 0.2              | Self-dampening — prevents infinite chains                     |
| Explosion (Powder Keg)                               | 0.0              | Cannot proc on-hit items                                      |
| Bleed tick (Rattlesnake Fang)                        | 0.0              | Cannot proc on-hit items                                      |
| Fire patch tick (Hellfire Cylinder)                  | 0.0              | Cannot proc on-hit items                                      |
| Skill node effects (Dead Man's Hand, Overkill, etc.) | 0.0              | Skill effects don't trigger items to keep systems independent |

**Why 0.0 for DoT and AoE:** Without this, bleed + Lightning Rod + Powder Keg would create infinite damage loops. DoT and AoE are "terminal" — they deal damage but don't start new chains.

**Why skill nodes don't proc items:** The skill tree and item systems should be additive in power, not multiplicative through cross-triggering. A player's skill node effects (piercing rounds, overkill splash, etc.) are already balanced around the skill tree. Letting items chain off them would require rebalancing every skill node whenever a new item is added.

---

## Acquisition Sources

### 1. Stage Chests

Wooden chests placed during map generation. 3-5 per stage. Visually distinct by rarity.

| Chest Type          | Contents      | Appearance                 | Frequency                        |
| ------------------- | ------------- | -------------------------- | -------------------------------- |
| **Weathered Crate** | 1 Brass item  | Cracked wood, rope binding | 3 per stage                      |
| **Iron Strongbox**  | 1 Silver item | Metal bands, padlock       | 1 per stage                      |
| **Gilded Cache**    | 1 Gold item   | Ornate gold trim, glowing  | 0-1 per stage (25% spawn chance) |

Chests are interactable objects (same hold-to-open as stashes). They show the item inside before the player picks it up (pre-action luck). The player can leave items on the ground.

### 2. Stash Digs (Shovels)

The existing stash system is extended. When a player digs a stash, the reward is rolled from a mixed pool:

| Roll                | Chance | Result                                                             |
| ------------------- | ------ | ------------------------------------------------------------------ |
| Gold only           | 55%    | Standard gold reward (existing formula)                            |
| Gold + Brass item   | 25%    | Reduced gold (50%) + 1 Brass item                                  |
| Gold + Silver item  | 8%     | Reduced gold (50%) + 1 Silver item                                 |
| Item only (Silver)  | 2%     | No gold, 1 Silver item (jackpot sound)                             |
| Cursed item         | 1%     | No gold, 1 Cursed item (ominous stash marker — player can decline) |
| Standard rare bonus | 9%     | Existing rare gold bonus (12% of remaining probability)            |

The **Claim Jumper** (Gold item) and **Unmarked Grave** (Cursed item) directly modify these probabilities.

### 3. Enemy Drops

Enemies have a base drop chance on death. Drop chance is not affected by proc coefficients — it's a separate roll.

| Enemy Type  | Drop Chance | Drop Tier               |
| ----------- | ----------- | ----------------------- |
| Swarmer     | 1%          | Brass                   |
| Grunt       | 2%          | Brass                   |
| Shooter     | 3%          | Brass                   |
| Charger     | 4%          | Brass or Silver (80/20) |
| Elite (any) | 15%         | Silver                  |
| Boss        | 100%        | Gold                    |

### 4. Camp Visitors (Trade Caravan)

The Trade Caravan sells 3 items for gold. Items are visible before purchase.

- **Camp 1 stock:** 2 Brass + 1 Silver
- **Camp 2 stock:** 1 Brass + 1 Silver + 1 Gold (if player has enough gold)
- **Pricing:** Brass = 15 + (stage _ 5) gold. Silver = 30 + (stage _ 8) gold. Gold = 60 + (stage \* 12) gold.
- **Stock is seeded per run.** Same seed = same caravan. Rerolling costs 5 gold (once per camp visit).

### 5. Quest Rewards

Stage-specific optional objectives (from `stage-objectives.md`) reward items on completion:

| Quest Difficulty                  | Reward        |
| --------------------------------- | ------------- |
| Easy (kill X enemies)             | 1 Brass item  |
| Medium (protect NPC, time limit)  | 1 Silver item |
| Hard (flawless wave, secret area) | 1 Gold item   |

---

## Item Limit

Players can hold **8 items** total. This forces meaningful choices once the inventory is full.

When the player picks up a 9th item:

1. The new item and all held items are displayed side by side.
2. The player selects one item to **discard** (can discard the new one — effectively declining it).
3. Discarded items drop on the ground. In multiplayer, other players can pick them up.

**Why 8:** Enough for a coherent build identity (3-4 synergistic items + 2-3 generically good items + 1-2 experimental picks) but tight enough that every slot matters. Comparable to Balatro's 5 Joker slots or Slay the Spire's ~15 relics (scaled to run length).

**Item limit modifiers:** The Worn Saddlebag increases shovel capacity, not item slots. Item slots are fixed at 8. This is deliberate — item slot inflation would undermine the "every slot matters" pressure. If future testing shows 8 is wrong, the constant is easy to change.

---

## Synergy Design

Items aren't explicitly paired. Synergies emerge from trigger interactions. The design vocabulary:

### Trigger Categories

Every item hooks into one of these trigger points (matching the existing `HookRegistry` events):

| Trigger           | When It Fires                    | Example Items                                                   |
| ----------------- | -------------------------------- | --------------------------------------------------------------- |
| `onBulletHit`     | Player bullet hits an enemy      | Rattlesnake Fang, Cactus Spine, Lightning Rod, Scorpion Stinger |
| `onKill`          | Player kills an enemy            | Moonshine Flask, Powder Keg, Bounty Notice, Vulture Feather     |
| `onRollEnd`       | Player finishes a dodge roll     | Dust Devil, Sidewinder Belt                                     |
| `onRollDodge`     | Player i-frames dodge a bullet   | (Future items)                                                  |
| `onReload`        | Player reloads their weapon      | Bandolier (conditional, post-reload)                            |
| `onHealthChanged` | Player HP changes                | Desert Rose (conditional), Pocket Watch (conditional)           |
| `onStashDig`      | Player digs a stash              | Claim Jumper, Unmarked Grave                                    |
| `onWaveStart`     | New wave begins                  | Witching Hour                                                   |
| `passive`         | Always active, stat modification | Gun Oil Tin, Gunpowder Pouch, Trail Dust Boots, etc.            |

### Emergent Synergy Examples

These are NOT hard-coded. They emerge from the trigger system:

**"Bleed Cowboy" (Rattlesnake Fang + Gun Oil Tin + Rattlesnake King)**
Fast fire rate means more hits. More hits means more bleed procs. Rattlesnake King makes bleeds spread. A crowd of bleeding enemies melts. Add Grim Harvest and on-kill effects trigger twice — Moonshine Flask heals constantly.

**"Powder Trail" (Powder Keg + Dead Man's Deed + Vulture Feather)**
Kill one enemy, it explodes (Powder Keg). The killing bullet pierces the entire line (Dead Man's Deed). Each subsequent kill triggers another explosion. Player sprints between clusters (Vulture Feather move speed on kill). Chain reaction gameplay.

**"Glass Cannon" (Devil's Bargain + Pale Rider + Coyote Pelt)**
1 HP means every hit is lethal. Pale Rider gives invisibility after rolling — the survival tool. Coyote Pelt rewards careful timing between shots. High-skill, high-reward playstyle. Add Pocket Watch for bonus fire rate while at "full" HP (which is 1).

**"Digger's Fortune" (Claim Jumper + Prospector's Map + Worn Saddlebag + Fool's Gold Nugget)**
Find more stashes, carry more shovels, get items from stashes, earn more gold. An economy build that snowballs into late-run power through sheer item volume.

**"Unkillable" (Moonshine Flask + Desert Rose + Leather Duster + Tin Star Badge)**
Stack max HP, block damage, heal on kill, regen when hurt. Undertaker's Corpse Harvest (skill node) adds another on-kill heal. Slow but durable — outlast everything.

### Character Affinity

Items are universal — any character can use any item. But some items naturally synergize with specific character kits:

| Character      | Natural Synergies                                                | Why                                                                                                                                  |
| -------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Sheriff**    | Crit/precision items (Pocket Watch, Bandolier, Coyote Pelt)      | Single-shot precision weapon. Rewards careful aim. Showdown marks amplify single-target damage.                                      |
| **Undertaker** | On-kill items (Powder Keg, Moonshine Flask, Bounty Notice)       | Sawed-off + Last Rites zone creates kill chains. Multi-pellet hits proc on-hit more often.                                           |
| **Prospector** | Economy items (Fool's Gold Nugget, Worn Saddlebag, Claim Jumper) | Gold Rush passive synergizes with gold income. Melee playstyle benefits from defensive items since you're always in the thick of it. |

---

## Visual Feedback

### Pickup Effects

- **Brass:** Small copper sparkle, brief "+[item name]" text
- **Silver:** Silver flash, ascending particle trail, "+[item name]" text with glow
- **Gold:** Full-screen gold flash (0.1s), radial particle burst, dramatic sound sting, "+[item name]" with ornate border
- **Cursed:** Screen edge darkens briefly, violet particle implosion, low rumble, "+[item name]" with cracked border

### Item Aura (Subtle)

Rare and Cursed items add subtle visual modifiers to the player character:

- **Dead Man's Deed:** Faint ghostly trail behind bullets
- **Hellfire Cylinder:** Ember particles around the weapon
- **Witching Hour:** Clock tick particle at wave start
- **Devil's Bargain:** Character sprite has a faint red tint
- **Rattlesnake King:** Green venom drips from weapon barrel

These are subtle. The game should never become a particle soup. One visual modifier per Gold/Cursed item, maximum 2-3 active visual effects on a player at once.

### HUD

Item inventory displayed as a horizontal strip of small icons along the bottom of the screen. Each icon shows:

- Item rarity border color (brass/silver/gold/black)
- Stack count badge (if >1)
- Tooltip on hover (item name + effect + current stack bonus)

Active proc effects get a brief icon flash when they trigger (Rattlesnake Fang icon glows green when bleed procs).

---

## Balance Levers

### Difficulty Scaling

The difficulty timer (from `gold.ts` time coefficient: `1 + minutes * 0.1012`) naturally offsets linear offensive item scaling. As players get stronger, enemies get harder. Items accelerate this arms race — which is the fun.

### Item Pool Seeding

The run's RNG seed determines:

- Which items appear in chests
- Which items enemies can drop
- Which items the Trade Caravan stocks

This means deterministic replays and multiplayer sync work correctly. Same seed, same items, same choices.

### Emergency Valves

If testing reveals balance problems:

1. **Drop rate tuning:** Adjust per-enemy drop chances without touching item effects
2. **Rarity promotion/demotion:** Move an overperforming Brass item to Silver
3. **Proc coefficient adjustment:** Reduce a chain-enabling item's coefficient
4. **Stack cap:** Add a hard cap to a specific item if hyperbolic/linear scaling breaks at extreme counts
5. **Curse an item:** Move a problematic item to Cursed tier with an appropriate downside

---

## Implementation

### ECS Component

```typescript
// packages/shared/src/sim/components.ts
const ItemInventory = {
  // Bitpacked item IDs — up to 8 slots
  slot0: Uint16Array, // Item definition ID (0 = empty)
  slot1: Uint16Array,
  slot2: Uint16Array,
  slot3: Uint16Array,
  slot4: Uint16Array,
  slot5: Uint16Array,
  slot6: Uint16Array,
  slot7: Uint16Array,
  // Stack counts per slot
  count0: Uint8Array,
  count1: Uint8Array,
  count2: Uint8Array,
  count3: Uint8Array,
  count4: Uint8Array,
  count5: Uint8Array,
  count6: Uint8Array,
  count7: Uint8Array,
};
```

### Item Definition

```typescript
// packages/shared/src/sim/content/items.ts

type ItemTrigger =
  | "passive"
  | "onBulletHit"
  | "onKill"
  | "onRollEnd"
  | "onRollDodge"
  | "onReload"
  | "onHealthChanged"
  | "onStashDig"
  | "onWaveStart";

type ItemRarity = "brass" | "silver" | "gold" | "cursed";

type StackFormula = "linear" | "hyperbolic" | "additive_chance" | "unique";

interface ItemDef {
  id: number;
  name: string;
  description: string; // One sentence. Always.
  rarity: ItemRarity;
  trigger: ItemTrigger;
  stackFormula: StackFormula;
  stackCoefficient: number; // The 'a' in stacking formulas
  procCoefficient: number; // How well this item's damage procs other items
  maxStack?: number; // Optional hard cap (only for 'unique' = 1)
  // Curse properties (only for cursed items)
  downside?: string; // Description of the downside
  // Stat mods for passive items
  mods?: StatMod[];
  // Hook effect ID for trigger items (registered in itemEffects.ts)
  effectId?: string;
}
```

### Item Effect Hooks

```typescript
// packages/shared/src/sim/content/itemEffects.ts
// Follows the same pattern as nodeEffects.ts

const ITEM_EFFECT_REGISTRY: Record<
  string,
  (hooks: HookRegistry, stacks: number) => void
> = {
  rattlesnake_fang: registerRattlesnakeFang,
  powder_keg: registerPowderKeg,
  moonshine_flask: registerMoonshineFlask,
  // ...
};
```

Items use the **same HookRegistry** as skill node effects. A hook registered by an item and a hook registered by a skill node run in the same priority queue. This is what enables cross-system synergy (Undertaker's Overkill + Powder Keg both fire on `onKill`) without explicitly coding the interaction.

### Item Pickup Entity

```typescript
// Spawned in the world as an interactable entity
const ItemPickup = {
  itemId: Uint16Array, // References ItemDef.id
  interactRadius: Float32Array,
  floatTimer: Float32Array, // Gentle bob animation
};
```

### System Integration Order

1. **itemDefinitions.ts** — All item data definitions
2. **itemEffects.ts** — Hook registrations for trigger items
3. **itemInventorySystem.ts** — Manages adding/removing/stacking items, recomputes stat mods
4. **itemPickupSystem.ts** — Handles proximity detection and pickup interaction
5. **itemDropSystem.ts** — Roll logic for enemy drops, stash rewards, chest contents
6. **Client: ItemRenderer** — Renders pickup entities with rarity-colored glow
7. **Client: ItemHUD** — Inventory strip, tooltips, proc flash
8. **Client: ItemPickupUI** — Discard selection panel when inventory is full

---

## Content Roadmap

### Wave 1: Foundation (12 items)

Ship with a minimal viable item pool that demonstrates each rarity and trigger type:

- 6 Brass (Gun Oil Tin, Gunpowder Pouch, Trail Dust Boots, Leather Duster, Tin Star Badge, Fool's Gold Nugget)
- 4 Silver (Rattlesnake Fang, Moonshine Flask, Powder Keg, Sidewinder Belt)
- 2 Gold (Dead Man's Deed, Grim Harvest)

This is enough for basic synergies to emerge and for players to experience the item loop.

### Wave 2: Build Diversity (12 more items, 24 total)

Expand the pool to support distinct build identities:

- Add on-hit proc items (Lightning Rod, Cactus Spine, Scorpion Stinger)
- Add conditional items (Pocket Watch, Bandolier, Desert Rose)
- Add economy items (Prospector's Map, Worn Saddlebag, Bounty Notice)
- Add 2 more Gold items (Peacemaker, Witching Hour)
- Add 1 Cursed item (Devil's Bargain)

### Wave 3: Full Pool (36+ items)

Fill out remaining items from the catalog. Add character-affinity items. Introduce remaining Cursed items. Balance based on Wave 1-2 playtesting data.

### Wave 4+: Expansions

New items added alongside new enemies, stages, and characters. Each content update should include 3-5 items that synergize with the new content.
