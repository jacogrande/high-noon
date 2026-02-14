# NPC Design for High Noon

How NPCs integrate with the procedural narrative system, camp system, stage objectives, and player upgrades. This document bridges the [NPC Systems Research](../research/npc-systems.md) with High Noon's existing design.

See also: [Procedural Narrative](./procedural-narrative.md), [Camp System](./camp.md), [Stage Objectives](./stage-objectives.md), [Roguelike Upgrades](../research/roguelike-upgrades.md), [Sheriff Character Design](../design/characters/sheriff.md)

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [NPCs in the Narrative System](#2-npcs-in-the-narrative-system)
3. [NPCs in the Upgrade Economy](#3-npcs-in-the-upgrade-economy)
4. [Camp Visitors: Full Design](#4-camp-visitors-full-design)
5. [In-Stage NPCs](#5-in-stage-npcs)
6. [NPC Continuity Within a Run](#6-npc-continuity-within-a-run)
7. [Multiplayer NPC Design](#7-multiplayer-npc-design)
8. [Implementation Considerations](#8-implementation-considerations)

---

## 1. Design Principles

### What We Are

NPCs in High Noon are **within-run characters**. They exist for 30-60 minutes — the duration of a single run. They have names, personalities, and opinions. They react to what's happened and hint at what's coming. They feel like people you met on a journey, not interfaces with faces.

### What We Are Not

We are not building Hades' 21,000-line cross-run relationship system. We are not building Weird West's persistent NPC consequence model. We don't need NPCs to remember you across runs because each run is a complete story.

Our closest reference is **FTL's encounter system** married to **RDR2's camp atmosphere** — brief, meaningful NPC interactions that are contextual to the current situation and contribute to the story being told right now.

### Core Rules

1. **Every NPC serves the run's story.** No generic shopkeepers. A visitor at camp is a character in this run's Western, not a vending machine.
2. **NPCs react to run state.** Health, gold, previous outcome, character class, and build direction all feed into NPC dialogue selection.
3. **NPC interactions create forward consequences.** A visitor at Camp 1 should be able to ripple into Stage 2 or 3 — as an ally, an obstacle, or a referenced event.
4. **Mechanical offers are narratively framed.** The Tinkerer doesn't say "Upgrade: +20% fire rate." They say "That cylinder's worn. I can file it smooth — you'll fan that hammer like the devil himself."
5. **Brevity is authenticity.** Western characters don't monologue. They quip. 1-3 lines per interaction. Every word earns its place.

---

## 2. NPCs in the Narrative System

### Plot Thread NPCs

The procedural narrative system (procedural-narrative.md Section 3) already defines per-thread NPC pools:

```
PlotThread {
  npcs: NpcId[]          // Characters that appear in this thread
  dialoguePool: DialoguePoolId  // Thread-specific dialogue
}
```

Each plot thread should define **2-3 named NPCs** who appear across the run in different roles depending on the path:

#### "The Raid" Thread NPCs

| NPC | Camp 1 Role | Stage 2 Role | Camp 2 Role | Stage 3 Role |
|-----|-------------|-------------|-------------|-------------|
| **Mayor Harlan** | Rescued → thanks you / Captured → absent | Success: sends word ahead / Failure: captive in goblin camp | N/A | Captive to protect (if kidnapped) or cheering from sidelines (if rescued) |
| **Dusty McGee** (Mercenary) | Offers to join for gold | Fights alongside you (or absent if declined) | Comments on the fight, adjusts price | Available again at higher/lower price based on Stage 2 outcome |
| **Old Shira** (Shaman) | Offers a boon for the road | Environmental hints during stage | Alternative boon, reacts to first boon's outcome | Appears in final arena if befriended |

#### "The Stranger" Thread NPCs

| NPC | Camp 1 Role | Stage 2 Role | Camp 2 Role | Stage 3 Role |
|-----|-------------|-------------|-------------|-------------|
| **The Stranger** | Absent (they're the Act I boss) | Boss in the mine / Ally through mine (path-dependent) | Appears at camp — either wounded ally or absent enemy | Weakened companion firing from cover (ally path) or second antagonist (enemy path) |
| **Doc Harlow** | Patches you up, offers health items | N/A | Comments on the stranger's condition/escape | Available for emergency healing before final boss |
| **Jeb the Prospector** | Tells you about the mine | Environmental guide (voice lines during stage) | Reveals what he knows about the corruption | Absent (fled) or present (brave) based on choices |

### NPC Dialogue Tiering

Adapted from Hades' priority-weighted pool system (narrative-boss-design.md Section 1) for within-run scope:

**Tier 1 — Thread Essentials:** Lines that must play for the story to make sense. The mayor thanking you. The stranger challenging you. The mercenary's pitch. These always play when triggered. ~5-8 lines per NPC per thread.

**Tier 2 — Run-State Reactions:** Lines conditioned on what has happened in this run:

| Condition | Example Line |
|-----------|-------------|
| Player health < 50% at camp entry | "You look half-dead already. Sure you want to keep riding?" |
| Player has 0 gold | "Can't pay? ...Fine. Take it. Consider it an investment in your survival." |
| Previous stage: soft failure | "I heard what happened at the bridge. Tough break." |
| Previous stage: flawless | "Not a scratch on you. You're either very good or very lucky." |
| Player character: Sheriff | "A lawman? Thought they were all dead." |
| Player character: Cultist | "Something about you gives me the creeps, stranger." |
| Skill tree: Marksman 3+ | "That's some fine shooting iron you carry. Custom work?" |
| Skill tree: Lawman 3+ | "You look like you can take a beating. That's good — you'll need to." |
| Multiplayer: 2+ players | "A whole posse? Things must be worse than I thought." |

~10-15 conditional lines per NPC per thread. Most are single sentences.

**Tier 3 — Flavor Pool:** General characterful lines that fill gaps. Not tied to conditions. Each NPC has 5-10 ambient lines that express personality:

- Dusty McGee: "Gold's gold. Don't care where it came from." / "I don't do this for the excitement. I do it for the gold. The excitement's just... a bonus."
- Doc Harlow: "Hold still. I said hold still." / "I've patched up worse. ...No, actually, I haven't."
- Old Shira: "The earth speaks to those who listen. It's been screaming lately." / "Take this. Don't ask what's in it."

### NPC Dialogue Volume Estimate

| Category | Lines per NPC | NPCs per Thread | Total per Thread |
|----------|--------------|----------------|-----------------|
| Tier 1 (Essential) | 5-8 | 3 | 15-24 |
| Tier 2 (Conditional) | 10-15 | 3 | 30-45 |
| Tier 3 (Flavor) | 5-10 | 3 | 15-30 |
| **Total per thread** | | | **~60-100** |

With 5 plot threads and some NPC reuse across threads: **~250-400 NPC lines total**. Combined with the ~200-300 boss/event lines from the procedural narrative doc, the full script is **~450-700 lines** — achievable for a small team, especially without voice acting initially.

---

## 3. NPCs in the Upgrade Economy

### Camp Visitors as Build Inflection Points

The existing upgrade systems (skill tree, weapon aspects, loot) handle permanent per-run growth. Camp visitors fill a different role: **temporary, contextual build modifiers** that create variety within the upgrade framework.

The key distinction:

| System | Scope | Player Control | Variety Source |
|--------|-------|---------------|---------------|
| **Skill tree** | Permanent per-run | Full (player chooses nodes) | Build diversity |
| **Weapon aspects** | Permanent per-run | Full (player chooses before run) | Playstyle diversity |
| **Loot/drops** | Per-stage | Partial (random + choice) | In-run adaptation |
| **Camp visitors** | Next-stage only | Limited (random visitor + choice) | Run-to-run surprise |

Camp visitors should never replace the skill tree or aspect system. They should **complement** them by offering next-stage-only modifiers that a player would never plan for but can adapt to.

### Visitor Offers as Build Nudges

Drawing from Enter the Gungeon's specialized shop model (npc-systems.md Section 3), different visitors nudge the player toward different strategies for the next stage:

**The Tinkerer's offers should synergize with the player's current build:**

| Player Build | Tinkerer Offer | Why It Works |
|-------------|---------------|-------------|
| Marksman 3+ | "Hollow Point Rounds: +25% damage on first hit after a reload" | Synergizes with Steady Hand (Marksman T1) |
| Gunslinger 3+ | "Oiled Cylinder: -0.3s reload time for next stage" | Synergizes with Speed Loader (Gunslinger T5) |
| Lawman 3+ | "Plated Vest: +1 max HP for next stage" | Synergizes with Tin Star (Lawman T1) |
| Longarm Aspect | "Rifled Barrel: +100px range for next stage" | Enhances the Longarm fantasy |
| Desperado Aspect | "Akimbo Harness: -0.2s reload for next stage" | Addresses the Desperado's weakness |

The Tinkerer reads your build and offers something relevant. This creates the feeling (from FTL's Blue Options) that your choices matter — the world responds to who you are.

**The Shaman's offers should challenge the player's current build:**

| Player Build | Shaman Offer | Trade-off |
|-------------|-------------|-----------|
| Low HP (Marksman build) | "Spirit of the Bear: +3 max HP, but -15% bullet damage" | Offsets glass cannon weakness |
| High HP (Lawman build) | "Blood Pact: Lose 2 max HP, gain +40% damage" | Risky power surge for tanky players |
| Any build | "Windwalker's Gift: +30% move speed, but enemies get +20% speed too" | Affects both sides equally |
| Any build | "Eyes of the Hawk: See hidden items on next stage, but no map" | Information trade-off |

The Shaman offers things you wouldn't normally take — forcing a decision about whether this particular run, on this particular stage, the trade-off is worth it.

### Bounty Board as Upgrade Catalyst

The existing bounty board (camp.md Section 4) is an info panel. It could also serve as an **optional challenge** system that feeds into upgrades:

**Bounty contracts:** Before riding out, the player can accept one optional contract from the board:

| Contract | Condition | Reward |
|----------|-----------|--------|
| "Dead or Alive" | Kill the stage's elite enemy within 30 seconds of it spawning | +1 bonus skill point |
| "Clean Sweep" | Complete the stage without taking damage from environmental hazards | Rare loot drop guaranteed |
| "Sharpshooter" | Achieve 80%+ accuracy across the stage | +50% gold from next stage |
| "Quick Draw" | Win the boss's Draw Phase on the first attempt | Permanent cylinder size +1 for the run |
| "Mercy" | Complete the stage without killing any non-hostile NPCs (if present) | NPC ally appears in the next stage |

Contracts are the roguelite equivalent of Hades' Pact of Punishment — opt-in challenge modifiers that reward skill with build-relevant bonuses. The bounty board is already at camp; making it interactive adds a decision layer without adding a new system.

### NPC-Gated Upgrade Paths

Certain upgrade options could be **exclusively available through specific NPCs**, creating variety based on who you encounter:

**Tinkerer-exclusive:** Weapon modifications that can't be obtained through the skill tree. These are small, next-stage-only changes that feel like a craftsman's touch:

- "Engraved Barrel" — Showdown targets take an additional 10% damage
- "Hair Trigger Filing" — Min shot interval reduced by 0.02s
- "Weighted Grip" — Recoil reduced (tighter spread during Fan the Hammer)

**Shaman-exclusive:** Boons that modify the world, not just the player:

- "Earthen Tremor" — Enemies within 200px of the player when they roll are briefly stunned
- "Spirit Sight" — All enemies visible through walls for the next stage (but player glows too)
- "Ancestor's Rage" — Kill 3 enemies within 2 seconds and the next shot deals 3x damage

**Mercenary-exclusive:** Combat style modifiers from having a companion:

- "Flanking Fire" — When the mercenary and player fire at the same target simultaneously, both deal +25% damage
- "Distraction" — The mercenary taunts the boss for 3 seconds at each phase transition, creating a free damage window
- "Last Stand" — If you reach 1 HP, the mercenary sacrifices themselves to fully heal you (one-time)

This creates the dynamic where **the visitor you encounter changes what kind of run you're having**, not just through narrative, but through mechanical options that aren't available any other way.

---

## 4. Camp Visitors: Full Design

### Expanded Visitor Roster

Building on the camp system's visitor types (camp.md Section 3) and Western archetypes (npc-systems.md Section 8):

#### Core Visitors (Always in Pool)

| Visitor | Western Archetype | Offer Type | Interaction Time |
|---------|-------------------|-----------|-----------------|
| **Trade Caravan** | Traveling Merchant | Sells 3 items for gold | 10-15 seconds |
| **Tinkerer** | Gunsmith | 1 weapon modification for gold | 10-15 seconds |
| **Shaman** | Native Mystic | 1 powerful boon with explicit downside | 10-15 seconds |
| **Bounty Hunter** | Rival | Challenge constraint for bonus reward | 5-10 seconds |
| **Mercenary** | Hired Gun | AI companion for next stage (gold cost) | 10-15 seconds |
| **Gambler** | Card Dealer | Wager with visible odds | 10-15 seconds |

#### New Visitors (Expanded Pool)

| Visitor | Western Archetype | Offer Type | When Available |
|---------|-------------------|-----------|---------------|
| **The Barkeep** | Bartender | Intel about next stage: enemy types, boss hints, hidden areas. 3 rumors for sale, each costs gold. Rumors are always accurate. | Any camp |
| **The Sawbones** | Frontier Doctor | Max HP boost (+1 for next stage), consumable healing salve (auto-heals 2 HP once when below half), or "surgery" (remove one negative effect from Shaman boon). All cost gold. | Any camp |
| **The Coffin Maker** | Undertaker | "Life Insurance": pay gold now, receive a powerful buff if Second Wind triggers next stage. "Dead Man's Gun": powerful cursed weapon for next stage only (+50% damage, but lose 1 HP per 30 seconds). "Last Rites": massive damage buff for 10 seconds after taking lethal damage (if Second Wind active). | Camp 2 only (higher stakes) |
| **The Preacher** | Frontier Preacher | Conditional blessing: powerful buff that lasts the entire next stage IF you meet a condition. "Shield of the Righteous": +2 max HP if you protect all NPCs in the stage. "Wrath of God": +30% damage if you don't take damage in the first wave. Failing the condition removes the buff instantly. | Any camp |

### Visitor Selection Logic

Building on camp.md's selection rules:

```
1. Filter by gold (if player has 0 gold, exclude gold-only visitors or offer free lesser versions)
2. Filter by run state:
   - Camp 1: Full pool, equal weights
   - Camp 2: Bias toward combat-relevant (Tinkerer, Shaman, Mercenary, Coffin Maker)
3. Filter by plot thread:
   - "The Raid": Bonus chance for Mercenary, Sawbones
   - "The Stranger": Bonus chance for Barkeep, Sawbones
   - "The Corruption": Bonus chance for Shaman, Preacher
   - "The Heist": Bonus chance for Gambler, Trade Caravan
   - "The Bounty": Bonus chance for Bounty Hunter, Barkeep
4. Anti-repeat: Never the same visitor type twice in one run
5. Narrative override: If the plot thread defines a specific NPC for this camp beat, that NPC takes the visitor slot
   (e.g., Doc Harlow appears as the Sawbones in "The Stranger" thread, Camp 1)
```

### Visitor Personality Through Offers

Each visitor's offer style should reflect their personality, not just their mechanical function:

**The Trade Caravan (cheerful, transactional):**
- Arrival: *Wagon rumbles in. A weather-beaten woman hops down.* "Evening, stranger. I've got wares if you've got coin."
- Offer: 3 items displayed on a blanket by the fire. Clear prices. Click to buy or pass.
- Decline: "Suit yourself. I'll be in the next town by morning."
- After purchase: "Pleasure doing business."

**The Tinkerer (quiet, professional):**
- Arrival: *An old man approaches, toolbox clinking.* "That iron of yours could use some work."
- Offer: Examines your weapon, offers 1 modification. Shows before/after stats.
- Decline: "Your funeral. That trigger's going to jam, mark my words."
- After purchase: "She'll sing now. Listen for the difference."

**The Shaman (cryptic, solemn):**
- Arrival: *A figure in a feathered cloak materializes by the fire.* "The spirits have much to say tonight."
- Offer: Describes the boon and its cost in metaphorical terms. Full mechanical stats visible in tooltip.
- Decline: "The spirits will remember."
- After purchase: "The price is paid. Use the gift well."

**The Coffin Maker (morbid, matter-of-fact):**
- Arrival: *A thin man with a measuring tape approaches.* "Just getting your measurements. Professionally speaking."
- Offer: Death-related items laid out with grim efficiency.
- Decline: "I'll keep your measurements on file."
- After purchase: "Hope you won't need my other services anytime soon."

---

## 5. In-Stage NPCs

### Mid-Stage Encounter NPCs

The procedural narrative system (procedural-narrative.md Section 7) defines NPC encounters as mid-stage narrative events. These are brief (1-3 lines) and don't pause combat:

**Discovery NPCs (passive):** Found in the environment. Don't initiate conversation — the player finds a body, a note, a survivor hiding. The "NPC" is context, not interaction.

- "You find a wounded prospector behind a rock. He gasps: 'They came from the east... hundreds of them.' He doesn't move again."
- "A child hiding in a barrel peers out at you. Their eyes are wide, but they point toward the church."

**Encounter NPCs (brief interaction):** Appear between combat waves. 1-3 lines. May offer a choice or information:

- A wounded survivor tells you which direction the raiders went (choice: follow or take the shortcut)
- A prospector offers to show you a hidden cache (risk: it might be a trap, or it might be valuable)
- A fleeing merchant drops supplies (retrieve: pick up items while combat continues)

### NPCs as Objective Entities

From the stage objectives design (stage-objectives.md), protected NPCs are already part of the system:

```typescript
const ObjectiveTarget = {
  type: Uint8Array,  // PROTECT, INTERCEPT_DEST, etc.
  health: Float32Array,
  maxHealth: Float32Array,
  // ...
};
```

**Named objective NPCs:** When a Protect objective involves an NPC (not a building), that NPC should have a name and a reason to be protected:

| Scenario | Generic | Named |
|----------|---------|-------|
| "Protect the hostage" | HP bar over a figure | "Mayor Harlan" with 1 pre-fight line: "Don't let them take me again!" |
| "Escort the survivor" | Moving HP bar | "The Prospector" with a line when rescued: "Thank the Lord. They took everything..." |
| "Defend the healer" | Stationary HP bar with heal zone | "Doc Harlow" with a line if damaged: "I'm supposed to be patching YOU up!" |

The objective system doesn't change mechanically. The NPC simply has a name and a voice — 1-2 lines that make the objective feel like a person, not a health bar.

### NPCs as Temporary Allies

When the narrative thread calls for it, an NPC can appear as a combat ally during a stage:

**The Mercenary (hired at camp):**
- Follows the player at a distance, fires at the player's target
- Has 3 HP, can be downed (not killed — drops to one knee, revives after 10 seconds)
- Personality affects behavior:
  - Aggressive: rushes ahead, high damage, gets downed more often
  - Cautious: hangs back, lower damage, rarely downed
  - Greedy: prioritizes picking up gold drops, occasionally helpful in combat

**The Stranger (plot-specific):**
- In "The Stranger" plot thread (Act III, ally path), the Stranger appears as a weakened NPC ally
- Fires occasional shots from cover, can be downed permanently (soft failure condition)
- Has unique dialogue during the boss fight: "Left flank!" / "Watch the ceiling!" / "Together, now!"

**Implementation note:** NPC allies use the same ECS components as enemies (Position, Velocity, Weapon) with an `Ally` tag that prevents friendly fire and changes AI targeting. The ally AI is a simplified version of enemy AI — move toward cover near the player, fire at the nearest enemy, retreat when damaged.

---

## 6. NPC Continuity Within a Run

### The Run-Long NPC Arc

The most powerful NPC design tool in a self-contained run is **continuity** — the same NPC appearing in multiple contexts across the run, transforming based on outcomes.

This is High Noon's unique NPC contribution: **within-run NPC arcs that mirror the three-act plot structure.**

#### Arc Type 1: Vendor → Ally

A camp visitor who provides a service at Camp 1 appears as a combat ally or environmental helper in a later stage.

**Example (The Raid):**
- Camp 1: Dusty McGee offers to fight alongside you for 50 gold
- Stage 2: If hired, Dusty fights as a Mercenary ally. If not hired, he's absent
- Camp 2: If Dusty survived Stage 2, he's emboldened: "That was something. I'll stick around — no charge this time." (Free companion for Stage 3). If Dusty was downed in Stage 2, he's cautious: "I'm done fighting. But take this — you'll need it more than me." (Gives a free item instead)
- Stage 3: Dusty appears as an ally (if brave) or his item provides a passive bonus (if cautious)

#### Arc Type 2: Informant → Obstacle

An NPC who provides information at camp turns out to be untrustworthy — their intel was a trap or they're working for the enemy.

**Example (The Heist):**
- Camp 1: The Barkeep tells you the vault guard changes shift at midnight. "Slip in during the rotation and you're golden."
- Stage 2 (success path): The intel was correct. The guard rotation leaves an opening
- Stage 2 (soft failure path): The Barkeep sold you out. The guards were expecting you. The Barkeep appears briefly in the background, pocketing gold from the enemy lieutenant

This creates a narrative beat without requiring player choice — the thread determines whether the informant was reliable, and the outcome determines what the player experiences.

#### Arc Type 3: Stranger → Reveal

An NPC's true identity or allegiance is revealed across the run.

**Example (The Corruption):**
- Camp 1: Old Shira the Shaman warns you about the corruption: "It's spreading. I can protect you, but it will cost."
- Stage 2: The player discovers that the corruption's source is a shrine — one that looks like Shira's work
- Camp 2: Shira appears again, but her dialogue is different. She's nervous. If the player accepts her offer, she gives a boon that is double-edged (helps you but subtly strengthens the final boss). If the player refuses, she respects the choice: "You're wiser than I thought."
- Stage 3: If the player took Shira's Camp 2 boon, the final boss has an additional mechanic tied to it. If they refused, Shira appears in the arena as a neutral NPC — not helping, not hindering. Her presence is the narrative payoff

### NPC State Tracking

Within-run NPC continuity requires tracking NPC state on the narrative system:

```typescript
interface NpcState {
  id: string;
  name: string;
  disposition: 'friendly' | 'neutral' | 'hostile' | 'absent';
  interacted: boolean;          // Did the player engage with this NPC at camp?
  offerAccepted: boolean;       // Did the player accept their offer?
  survived: boolean;            // If NPC appeared in combat, did they survive?
  dialogueHistory: Set<string>; // Lines already played (no repeats)
}
```

This lives on `world.narrative.npcs` as a `Map<NpcId, NpcState>`. The state is checked at each NPC appearance to determine which dialogue tier and which role the NPC fills.

---

## 7. Multiplayer NPC Design

### Shared Camp Interactions

Per the camp system's multiplayer design (camp.md), camp visitors are shared — all players see the same visitor and can interact independently.

**NPC dialogue in multiplayer:**
- Visitors address the group: "Evening, all of you. Must be serious if they sent a posse."
- Purchase offers are per-player (buying doesn't deplete stock for others)
- If one player accepts a Shaman boon, the NPC acknowledges it: "One of you is brave. The rest of you... we'll see."

### NPC Allies in Multiplayer

When an NPC ally appears during a stage:
- The ally targets the nearest enemy to the group's centroid (not a specific player)
- The ally's HP scales slightly with player count (+1 HP per additional player)
- If the ally is downed, any player can revive them by standing nearby for 2 seconds
- Dialogue addresses the group: "Cover me!" / "I'll hold this side!"

### Narrative NPC Encounters in Multiplayer

Mid-stage NPC encounters are visible to all players simultaneously:
- Dialogue text appears for all players
- If a choice is offered, the first player to interact makes the decision (this mirrors the "host decides" model used in co-op roguelites like RoR2)
- A brief indicator shows which player made the choice: "Player 2 chose to help the prospector"

---

## 8. Implementation Considerations

### Data Structure

NPC definitions live in the shared package alongside narrative content:

```
packages/shared/src/sim/content/
  narrative/
    npcs.ts              // NPC definitions (name, archetype, dialogue pools)
    visitors.ts          // Camp visitor definitions (offers, selection weights)
    npcArcs.ts           // Per-thread NPC arc definitions (role per camp/stage)
```

### NPC Definition Schema

```typescript
interface NpcDefinition {
  id: string;
  name: string;
  archetype: 'tinkerer' | 'shaman' | 'mercenary' | 'barkeep' | 'sawbones'
           | 'coffin_maker' | 'preacher' | 'gambler' | 'trade_caravan'
           | 'bounty_hunter' | 'plot_npc';
  personality: string;          // Brief descriptor for AI/dialogue: "gruff", "nervous", "cheerful"

  dialogue: {
    tier1: DialogueLine[];      // Thread-essential lines
    tier2: ConditionalLine[];   // State-reactive lines
    tier3: DialogueLine[];      // Flavor pool
  };

  visitorOffer?: VisitorOffer;  // If this NPC can appear as a camp visitor
  combatRole?: 'ally' | 'objective' | 'neutral';  // If this NPC appears in combat
}

interface ConditionalLine {
  id: string;
  text: string;
  conditions: {
    healthBelow?: number;       // 0-1 ratio
    goldBelow?: number;
    goldAbove?: number;
    previousOutcome?: 'success' | 'soft_failure';
    playerCharacter?: string;   // 'sheriff', 'cultist', etc.
    skillBranch?: { branch: string; minTier: number };
    playerCount?: { min?: number; max?: number };
    npcState?: { npcId: string; field: string; value: any };
  };
}

interface VisitorOffer {
  type: 'shop' | 'upgrade' | 'boon' | 'challenge' | 'companion' | 'wager' | 'intel';
  items: OfferItem[];
  goldCost?: number;
  scaleCostWithAct?: boolean;   // Camp 2 costs more?
}
```

### NPC Arc Definition

```typescript
interface NpcArc {
  npcId: string;
  threadId: string;
  appearances: {
    trigger: 'camp_1' | 'camp_2' | 'stage_1_mid' | 'stage_2_mid' | 'stage_3_start' | 'stage_3_mid';
    role: 'visitor' | 'ally' | 'objective' | 'background' | 'reveal';
    conditions?: {
      previousOutcome?: 'success' | 'soft_failure';
      npcState?: { field: string; value: any };
    };
    dialogue: string[];         // Line IDs from the NPC's dialogue pool
    onInteract?: {
      updateNpcState: Partial<NpcState>;
      grantItem?: string;
      spawnAlly?: boolean;
    };
  }[];
}
```

### System Integration

| System | NPC Integration Point |
|--------|----------------------|
| **stageProgressionSystem** | Triggers camp NPC selection, checks NPC state for stage events |
| **narrativeSystem** | Reads NPC arcs, selects appropriate dialogue, updates NPC state |
| **enemyAISystem** | Ally NPCs use modified AI (target enemies, avoid player, seek cover) |
| **objectiveSystem** | Named NPCs as protect/escort targets with unique dialogue hooks |
| **campScene** (client) | Renders visitor sprite, handles interaction UI, plays dialogue |
| **dialogueSystem** (client) | Displays NPC text boxes with priority-weighted selection |

### ECS Components for NPC Allies

```typescript
// Marks an entity as an NPC ally
const Ally = {
  npcId: Uint16Array,        // Reference to NPC definition
  behavior: Uint8Array,       // AGGRESSIVE, CAUTIOUS, GREEDY
  reviveTimer: Float32Array,  // Countdown when downed
  isDown: Uint8Array,         // 0 or 1
};
```

The ally system reuses existing combat components (Position, Velocity, Weapon, Health) and adds the `Ally` tag to prevent friendly fire (checked in collision resolution).

### Content Priority

1. **Phase 1 (Camp Visitors):** Implement 6 core visitors with 2-3 dialogue lines each. No NPC arcs yet — visitors are one-off encounters. Prove the camp interaction loop works.
2. **Phase 2 (Narrative Integration):** Add per-thread NPC pools. Implement Tier 1 dialogue (thread-essential). Camp visitors become named characters from the plot thread.
3. **Phase 3 (Run-State Reactivity):** Add Tier 2 conditional dialogue. Visitors react to health, gold, previous outcomes. The NPC starts feeling alive.
4. **Phase 4 (NPC Arcs):** Implement within-run NPC continuity. The same NPC appears across camps and stages, transforming based on outcomes. This is the payoff.
5. **Phase 5 (NPC Allies):** Add combat allies — mercenary companions and plot-specific NPC allies. Requires AI work.
6. **Phase 6 (Multiplayer NPC):** Synchronize NPC state across clients. Shared visitors, shared allies, shared narrative consequences.

---

## Key Takeaways

1. **NPCs are characters in this run's story, not persistent service interfaces.** Every NPC has a name, a personality, and contextual dialogue. 1-3 lines is enough — brevity is Western.
2. **Camp visitors serve dual roles: mechanical offers AND narrative beats.** The Tinkerer isn't just an upgrade menu — they're a gruff old gunsmith who comments on your weapon and your chances.
3. **Within-run NPC arcs are High Noon's unique NPC contribution.** A character who appears at Camp 1, fights beside you in Stage 2, and makes a choice at Camp 2 based on how the fight went — that's a complete story told through NPC continuity.
4. **Visitor offers should complement, not replace, the skill tree.** Visitors provide next-stage-only modifiers that surprise the player and nudge builds in unexpected directions. The skill tree is the player's plan; the visitor is the plan going sideways.
5. **NPC dialogue volume is manageable.** ~250-400 NPC lines across 5 plot threads, plus ~200-300 boss/event lines = ~450-700 total script lines. Short, terse, Western. No monologues. No voice acting required initially.
6. **Build defines NPC options.** A Marksman player sees different Tinkerer offers than a Gunslinger player. The visitor reads your build and responds — creating the FTL Blue Options feeling.
7. **Consequences ripple forward within the run.** A visitor hired at Camp 1 becomes an ally in Stage 2. A visitor refused might become an obstacle. Within-run scope makes this manageable.
