# Procedural Narrative Design

How High Noon generates a complete, self-contained story every run. No meta-progression narrative. Each 30-60 minute run is its own Western short film.

See also: [Boss Design Research](../research/boss-design.md), [Narrative Boss Design Research](../research/narrative-boss-design.md), [Narrative Brainstorm](../design/narrative/brainstorm.md)

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Run Structure](#2-run-structure)
3. [Plot Threads](#3-plot-threads)
4. [Stage Design](#4-stage-design)
5. [Boss Encounters as Story Climaxes](#5-boss-encounters-as-story-climaxes)
6. [Branching Outcomes](#6-branching-outcomes)
7. [Narrative Events](#7-narrative-events)
8. [Dialogue System](#8-dialogue-system)
9. [Camp Beats](#9-camp-beats)
10. [Environmental Storytelling](#10-environmental-storytelling)
11. [Replayability Without Meta-Narrative](#11-replayability-without-meta-narrative)
12. [Example Runs](#12-example-runs)
13. [Implementation Considerations](#13-implementation-considerations)

---

## 1. Design Philosophy

### What We Are

Each High Noon run generates a **complete narrative arc** — beginning, middle, and end — in 30-60 minutes. The player experiences an entire Western story: an inciting incident, escalating stakes, branching consequences, and a climactic showdown that resolves everything. Think of each run as a standalone episode of a Western anthology series. The story starts when you load in and concludes when the run ends.

### What We Are Not

We are explicitly **not** doing meta-progression narrative. Unlike Hades (which requires dozens of runs to complete its story) or Cult of the Lamb (where each boss defeat reveals backstory across multiple sessions), High Noon tells you a whole story every time you play.

This is a deliberate design choice with specific advantages:

| Meta-Progression Narrative (Hades)                  | Self-Contained Run Narrative (High Noon) |
| --------------------------------------------------- | ---------------------------------------- |
| Story unfolds over 10-100+ runs                     | Complete story in one run                |
| Death sends you "home" for more story               | Death is a story ending (hard failure)   |
| Repetition is the delivery mechanism                | Repetition generates new stories         |
| Players must invest hours to reach narrative payoff | Every run has narrative payoff           |
| Rewards dedication, punishes casual play            | Every session is satisfying              |
| Fixed cast, deepening relationships                 | Rotating cast, new situations            |
| "I need to play more to see what happens"           | "I wonder what story I'll get this time" |

The closest references are:

- **FTL** — Each run is a desperate retreat with emergent narrative beats, but FTL's story is very thin (text events, no characters). We want more authored content.
- **Slay the Spire** — Self-contained runs with structural variety, but no explicit narrative. We want actual story.
- **Tabletop one-shots** — A GM assembles a self-contained adventure from modular pieces. The "GM" in our case is the procedural story assembly system.
- **Western anthology films** — Each run is an episode. Different town, different trouble, different showdown.

### The Core Tension

The fundamental challenge: **how do you make a procedurally assembled story feel authored?**

The answer from our research: **modular authored content combined at the seams.** Individual scenes, dialogue lines, boss encounters, and narrative events are handwritten. The procedural system selects and sequences them. The player never sees the seams because each piece is crafted to flow naturally from the preceding piece, regardless of which specific predecessor it follows.

---

## 2. Run Structure

### The Three-Act Western

Every run follows a three-act structure that maps to stages:

```
ACT I: THE SETUP          ACT II: THE CHASE           ACT III: THE SHOWDOWN
┌─────────────────┐      ┌─────────────────────┐      ┌──────────────────┐
│ Stage 1          │      │ Stage 2              │      │ Stage 3           │
│ Inciting incident│─────►│ Escalation           │─────►│ Climax            │
│ Establish stakes │      │ Consequences mount   │      │ Final showdown    │
│ First boss event │      │ Second boss event    │      │ Resolution        │
└─────────────────┘      └─────────────────────┘      └──────────────────┘
     ~10-15 min                ~15-20 min                  ~10-15 min
```

Each act serves a narrative function:

**Act I — The Setup (Stage 1):** The player arrives in a procedurally generated town. Something happens — this is the inciting incident. It could be an attack, a discovery, a stranger arriving, or a call for help. The first boss encounter is the culmination of this event. Its outcome determines which direction the story goes.

**Act II — The Chase (Stage 2):** The consequences of Act I play out. The player pursues or is pursued. The environment changes (desert, forest, mine, canyon) based on the story's direction. A second boss encounter raises the stakes and creates the final branch.

**Act III — The Showdown (Stage 3):** Everything converges. The final boss encounter is the story's climax. The arena, the boss's identity, and the stakes are all determined by what happened in Acts I and II. Win or lose, the story has an ending.

### Optional: Extended Runs

For longer sessions or higher difficulty, a 4-5 stage run could add:

- **Stage 2B (The Complication):** A twist between escalation and showdown — a betrayal, a new threat, an unexpected ally
- **Stage 4 (The Epilogue):** A victory lap stage or a "one more thing" twist for the hardest difficulty

But the core is always three acts. Keep it tight.

### Pacing Within a Stage

Each stage contains:

1. **Opening beat** (5-10 seconds) — Brief scene-setting. Camera pan, a line of dialogue, visual context.
2. **Combat encounters** (5-10 minutes) — Waves of enemies contextualized by the plot. Not random monsters — these are goblins raiding a town, outlaws ambushing a trail, corrupted miners in a shaft.
3. **Narrative event** (variable) — A mid-stage moment: an NPC encounter, a discovery, a choice point. Not every stage needs one. When present, it enriches the story.
4. **Boss encounter** (2-4 minutes) — The stage's climax. The narrative event that determines branching.
5. **Outcome beat** (5-10 seconds) — Brief resolution. What happened? What does it mean? Transition to camp or next stage.

---

## 3. Plot Threads

### What Is a Plot Thread?

A plot thread is a **story template** — a modular narrative skeleton that defines an inciting incident, possible stages, key NPCs, boss options, and branching paths. The run's procedural system selects a plot thread at the start and uses it to contextualize everything.

Plot threads are not rigid scripts. They are **constraints on randomness** — they narrow the possibility space from "anything could happen" to "this kind of story is happening, but the details vary."

### Plot Thread Structure

```
PlotThread {
  id: string
  name: string
  incitingIncident: string           // What kicks off the story
  tone: 'action' | 'mystery' | 'horror' | 'revenge' | 'heist'

  stages: [
    {
      act: 1 | 2 | 3
      setting: SettingId              // Town, desert, mine, forest, canyon, etc.
      enemyTheme: EnemyThemeId        // Which enemy types appear and why
      bossPool: BossId[]              // Which bosses can appear at this stage
      narrativeEvents: EventId[]      // Possible mid-stage events
      outcomes: {
        success: { nextStage, narrativeBeat }
        softFailure: { nextStage, narrativeBeat }
        hardFailure: 'run_over' | { nextStage, narrativeBeat }
      }
    },
    // ... stages for each act
  ]

  npcs: NpcId[]                       // Characters that appear in this thread
  dialoguePool: DialoguePoolId        // Thread-specific dialogue
}
```

### Example Plot Threads

**"The Raid"** (Action tone)

- _Inciting incident:_ A hostile force attacks the town.
- _Act I:_ Defend the town. Boss: the raiding party's champion.
- _Outcomes:_ Save the town leader (success) or they're captured (soft failure).
- _Act II:_ Pursue the raiders to their stronghold (success path) or mount a rescue through hostile territory (failure path).
- _Act III:_ Confront the raid leader in their lair. Different boss phase/arena depending on whether you're attacking from a position of strength or desperation.

**"The Stranger"** (Mystery/Revenge tone)

- _Inciting incident:_ A mysterious figure arrives in town. They're looking for someone — or something.
- _Act I:_ The stranger provokes a confrontation. Boss: the stranger (rival gunslinger duel).
- _Outcomes:_ Drive them off (success) or they escape with a clue you needed (soft failure).
- _Act II:_ Track the stranger through the wilderness. Discover their true motive — they're hunting the same target you should be.
- _Act III:_ The real threat is revealed. The stranger is either your ally or your enemy depending on Act I. Final boss is the true antagonist.

**"The Corruption"** (Horror tone)

- _Inciting incident:_ Something is wrong at the mine/ranch/church. People are disappearing or acting strangely.
- _Act I:_ Investigate. Boss: corrupted foreman/preacher (human who transforms mid-fight).
- _Outcomes:_ Contain it early (success) or the corruption spreads to town (soft failure).
- _Act II:_ Hunt the source. The environment itself is becoming hostile. Environmental hazards escalate.
- _Act III:_ Confront the supernatural entity at its source. If you contained it early, the fight is more manageable. If it spread, the arena is more dangerous and the boss is stronger.

**"The Heist"** (Heist tone)

- _Inciting incident:_ An opportunity: a heavily guarded train, a corrupt sheriff's vault, a bandit king's treasure.
- _Act I:_ The setup. Clear the approach. Boss: the first line of defense (a lieutenant or security chief).
- _Outcomes:_ Clean entry (success) or you're detected and it becomes a chase (soft failure).
- _Act II:_ The job itself. Success path: methodical progression through defenses. Failure path: improvised chaos, more enemies, less loot.
- _Act III:_ The getaway or the betrayal. Someone double-crosses. Final boss context depends on the path.

**"The Bounty"** (Revenge tone)

- _Inciting incident:_ There's a price on someone's head. Or a price on yours.
- _Act I:_ The bounty hunter arrives (if you're the target) or you arrive at the target's last known location. Boss: first confrontation.
- _Outcomes:_ You win the first encounter (success) or the target escapes / the hunter wounds you (soft failure).
- _Act II:_ The chase intensifies. Multiple smaller encounters. The hunted becomes the hunter or vice versa.
- _Act III:_ The final duel. This is the most "pure Western showdown" plot thread — the story has been building to a one-on-one moment.

### Thread Selection

At run start, the system selects a plot thread based on:

1. **Weighted random from the full pool.** Equal weights by default.
2. **Bias against recently played threads.** Track the last 3-5 threads played (this is the only cross-run state, and it's preference, not narrative). This prevents playing the same story twice in a row.
3. **Character affinity (optional).** Some threads might be weighted higher for certain characters. The Sheriff might see more "law and order" threads. The Prospector might see more "corruption at the mine" threads. But any character can get any thread.

---

## 4. Stage Design

### Settings as Narrative Context

Each stage takes place in a **setting** — a themed environment that provides both gameplay variety and narrative context. Settings are not purely decorative. They determine:

- Tileset and visual style
- Available environmental hazards
- Enemy composition rationale (why are these enemies here?)
- Cover layout and arena shape
- Ambient storytelling props

### Setting Pool

| Setting    | Visual Identity                   | Narrative Uses                | Environmental Hazards                                |
| ---------- | --------------------------------- | ----------------------------- | ---------------------------------------------------- |
| **Town**   | Buildings, main street, alleys    | Defend, investigate, showdown | Destructible barrels, fire from burning buildings    |
| **Desert** | Open sand, rock outcrops, cacti   | Chase, ambush, journey        | Sandstorm (visibility), heat shimmer                 |
| **Mine**   | Tunnels, tracks, machinery        | Investigation, horror, heist  | Cave-ins (arena shrink), minecart hazards, darkness  |
| **Forest** | Dense trees, clearings, river     | Pursuit, mystery, ambush      | Thick brush (LOS), river current (push)              |
| **Canyon** | High walls, narrow paths, bridges | Showdown, ambush, chase       | Falling rocks, narrow chokepoints                    |
| **Ranch**  | Fences, barn, corral, homestead   | Defense, rescue, horror       | Stampede, fire, collapsible structures               |
| **Train**  | Moving platform, cars, rooftop    | Heist, chase, fight           | Moving platform edges, tunnel ducks, car transitions |

### Contextual Enemy Themes

The same enemy archetype takes different visual/narrative forms depending on the plot thread:

| Base Archetype | "The Raid"     | "The Corruption"      | "The Bounty"       |
| -------------- | -------------- | --------------------- | ------------------ |
| Grunt          | Goblin raider  | Corrupted miner       | Outlaw gang member |
| Charger        | Goblin brute   | Shambling horror      | Mounted bandit     |
| Shooter        | Goblin archer  | Spore-spitting plant  | Hired gun          |
| Shield Bearer  | Goblin captain | Armored husk          | Deputy             |
| Swarmer        | Goblin runts   | Swarm of rats/insects | Dogs               |

The mechanical behavior is identical. The sprites, sounds, and narrative framing change. This gives plot threads visual identity at low implementation cost — one archetype, many skins.

---

## 5. Boss Encounters as Story Climaxes

### The Boss Is the Story Beat

From our research (see [boss-design.md](../research/boss-design.md) Principles 8, 13, 14):

> "Bosses are story events. Each encounter should reveal information, advance a relationship, or create a narrative branch."
>
> "The Western duel ritual. A brief pre-fight moment of tension before combat begins. The anticipation IS the story."

In a self-contained run narrative, bosses serve as **chapter endings**. Each boss encounter:

1. **Resolves the current stage's tension** — The goblins' champion is defeated, the corruption's source is found, the bounty hunter is confronted.
2. **Creates a branching point** — The outcome determines which story path follows.
3. **Reveals narrative information** — Through dialogue, environment, and behavior, the boss tells the player something about the story.

### Boss Contextualization

The same mechanical boss can serve different narrative roles depending on the plot thread. A "Rival Gunslinger" boss fight is mechanically identical whether the character is a bounty hunter, a corrupt deputy, or the player's former partner. What changes:

- **Pre-fight dialogue** (drawn from the plot thread's dialogue pool)
- **Arena dressing** (main street vs. canyon rim vs. burning building)
- **Post-fight outcome** (capture vs. kill vs. they escape)
- **Boss name and sprite variant** (cosmetic only)

This is directly inspired by Gungeon's approach (boss-design.md Section 5): "A single Stage 1 boss with 3-4 arena layouts would create significant run-to-run variety without requiring multiple boss implementations."

### Boss Pool per Stage

Each plot thread defines a **boss pool** for each act. The system selects one:

```
"The Raid" Act I boss pool:
  - Ogre Brute (melee/AoE, tests dodging)
  - War Chief (ranged/summons, tests prioritization)
  - Siege Engine (environmental, tests positioning)
```

Pool size of 2-3 bosses per stage, per thread, is sufficient. With 5 plot threads and 3 stages each, that's 30-45 boss slots filled by ~8-12 unique mechanical boss designs used in different contexts.

### The Pre-Fight Ritual

From the Western duel research (narrative-boss-design.md Section 9), every boss encounter should have a **ritual moment** before combat begins:

1. **The Approach** (2-3 seconds): Player enters the boss arena. Camera pulls back to show the full space. The boss is visible at the far end.
2. **The Staredown** (2-3 seconds): Camera tightens. Brief dialogue exchange (1-2 lines). Music drops to ambient or a building motif.
3. **The Cue** (instant): A visual/audio signal — a bell, a gunshot in the distance, a clock striking noon. Combat begins.

This 4-6 second ritual is not a cutscene the player skips. It's a **tension-building beat** that makes every boss encounter feel significant. It's the Leone staredown compressed into a game-appropriate duration.

For multiplayer: all players see the ritual simultaneously. Boss dialogue addresses the group ("So they sent a posse this time...").

### The Draw Phase (Recurring Mechanic)

A signature boss mechanic that recurs at phase transitions (see boss-design.md Section 8):

At each HP threshold (66%, 33%), the boss and player(s) briefly lock in position (0.5-1s freeze). A quickdraw prompt appears. The first to react (player presses fire, or the timer expires and the boss "draws") gains an advantage:

- **Player wins the draw:** Boss is staggered for 1-2s, takes bonus damage on the first hit.
- **Boss wins the draw (timer expires):** Boss gets a free attack that must be dodged immediately.

This creates a micro-duel moment at each phase transition that reinforces the Western identity. It replaces the standard "invulnerability during phase transition" with an interactive ritual.

---

## 6. Branching Outcomes

### The Three Outcomes

From the narrative brainstorm, every boss encounter (and some narrative events) has three possible outcomes:

**Success:** The player fully achieves the objective. The boss is defeated, the goal is met. The story proceeds on the "best" path — more favorable next stage, better rewards, narrative advantage.

**Soft Failure:** The player survives but doesn't fully achieve the objective. The boss escapes, the secondary objective fails, time runs out on something. The story continues but on a harder or different path. _This is the most interesting outcome for narrative variety._

**Hard Failure:** The player dies. The run ends. But — and this is important — the run's story still has a conclusion. A brief "what happened next" text beat plays over the death screen. The story didn't stop; the player's character simply didn't survive it.

### Why Soft Failure Matters

Soft failure is the engine of narrative variety. Without it, every run is binary: you win each stage or you die. With it, runs diverge meaningfully even among successful completions.

Consider: two players both survive all three stages. Player A succeeded at every boss encounter and got the "golden path." Player B soft-failed Act I and Act II but survived Act III. These are completely different stories even though both players finished the run.

Soft failure should never feel like punishment. It should feel like **the story going sideways in an interesting way.** The player thinks: "I didn't save the mayor, so now I'm doing a rescue mission instead of a pursuit. That's different. That's cool."

### Soft Failure Triggers

Soft failure isn't just "you took too long." It has specific, readable conditions:

| Trigger Type                  | Example                                            | Player Reads It As                   |
| ----------------------------- | -------------------------------------------------- | ------------------------------------ |
| **Secondary objective fails** | Boss escapes while player fights adds              | "I won the fight but lost the prize" |
| **Timer expires**             | The building collapses before you clear it         | "I was too slow"                     |
| **NPC falls**                 | The person you're protecting takes too much damage | "I couldn't protect them"            |
| **Boss enrages**              | Boss hits a rage threshold before being defeated   | "I let it get too strong"            |
| **Environmental failure**     | The bridge blows up, the mine caves in             | "The situation got away from me"     |

The player always survives soft failure. They always continue. The story just changes.

### Branch Mapping

Each stage's outcome points to a specific next stage:

```
                    ┌─ Success ──► Stage 2A (Pursuit through desert)
Stage 1 ───────────┤
(Town defense)      └─ Soft Fail ► Stage 2B (Rescue through forest)
                                         │
                    ┌─ Success ──► Stage 3A (Assault on stronghold)
Stage 2A ──────────┤
(Desert pursuit)    └─ Soft Fail ► Stage 3B (Ambushed, fight from weakness)
                                         │
                    ┌─ Success ──► Stage 3C (Rescue in enemy camp)
Stage 2B ──────────┤
(Forest rescue)     └─ Soft Fail ► Stage 3D (Desperate last stand)
```

This creates 4 possible final stages from a single plot thread, each with different arenas, boss contexts, and narrative resolutions. The player's skill determines which story they experience, but all paths are valid stories.

### Resolution Text

Every run ends with a brief **resolution beat** — 2-3 sentences on a stylized screen describing what happened after the final encounter. This provides narrative closure regardless of outcome:

- **Full success path:** "The goblin king's forces scattered. The town rebuilt. Your name became a legend."
- **Mixed path:** "The mayor was rescued, but the goblin king escaped into the mountains. He would return, but not today."
- **Barely survived:** "You crawled out of the mine as dawn broke. Whatever was down there, it was sealed — for now."
- **Hard failure (death):** "The desert reclaimed another soul. The bounty hunter rode on, and no one remembered the gunslinger who tried."

These are short, evocative, and different for each path through the story. They make the player feel like their run had meaning.

---

## 7. Narrative Events

### Mid-Stage Moments

Not all narrative happens during boss encounters. Narrative events are **small story beats** that occur during a stage's combat flow. They enrich the story without interrupting the action.

### Event Types

**Discovery Events:** The player finds something during exploration — a note, a body, a hidden passage, a mysterious object. Communicated via a brief popup or environmental detail. No gameplay interruption. Provides context for what's happening in the story.

- "You find the sheriff's badge in the dust. He didn't make it this far."
- "Claw marks on the mine walls. Something was dragged deeper."

**NPC Encounters:** A non-hostile character appears briefly during or between combat waves. 1-3 lines of dialogue. May offer a choice, a piece of information, or a trade.

- A wounded survivor tells you which direction the raiders went
- A prospector offers to show you a shortcut (risk/reward choice)
- A child hiding in a barrel asks you to find their parent (optional side objective)

**Choice Events:** The player must make a decision that affects the current stage or the next one. Presented as a brief fork during gameplay. Never pauses combat for more than 2-3 seconds.

- Two paths diverge: the bridge (faster, more exposed) or the ravine (slower, more cover)
- An NPC begs you to save the church or the saloon — you can only reach one

**Environmental Reveals:** The environment itself tells the story. No UI, no dialogue. The player walks through a burned village before anyone says "the raiders came through here." The mine shaft has strange organic growths before anyone mentions corruption.

### Event Frequency

Not every stage needs narrative events beyond the boss encounter. Overloading a 10-minute stage with story beats dilutes the combat focus. Guidelines:

| Stage              | Recommended Events                  |
| ------------------ | ----------------------------------- |
| Act I (Setup)      | 1-2 events (establish the story)    |
| Act II (Chase)     | 0-1 events (let the action breathe) |
| Act III (Showdown) | 0-1 events (focus on the climax)    |

Events should feel like natural parts of the environment, not interruptions. A discovery event is a detail you notice while fighting. An NPC encounter happens during a lull between waves. A choice event is a fork in the path you walk.

---

## 8. Dialogue System

### Within-Run Priority Pools

Adapted from Hades' system (narrative-boss-design.md Section 1) but scoped to a single run instead of across runs:

**Tier 1 — Plot-Thread Essentials:** Lines that must play to make the current story coherent. The inciting incident dialogue. The boss's challenge. The resolution text. These always play when triggered.

**Tier 2 — Contextual Reactions:** Lines conditioned on game state within the current run:

- Player character (Sheriff hears different lines than Prospector)
- Previous stage outcome (boss acknowledges if you failed the last objective)
- Player health ("You don't look so good, stranger...")
- Build state (wielding a specific weapon, having a specific upgrade)
- Multiplayer count ("A whole posse? I'm flattered.")
- Time pressure ("You're late. The fires have already started.")

**Tier 3 — Flavor Pool:** General lines that fill gaps. Atmospheric. Characterful. Not tied to specific conditions.

### Dialogue Volume

A single run needs far less dialogue than Hades' 21,000 lines. Scoped estimate per plot thread:

| Category                  | Lines per Thread | Notes                                |
| ------------------------- | ---------------- | ------------------------------------ |
| Inciting incident         | 3-5              | Varies by RNG details                |
| Boss pre-fight (per boss) | 5-8              | Tier 1 + Tier 2 contextual           |
| Boss mid-fight (per boss) | 3-5              | Phase transitions, reactions         |
| Boss post-fight           | 3-4              | Per outcome (success/soft fail)      |
| NPC events                | 5-10             | 1-3 per event, 2-3 events per thread |
| Camp dialogue             | 5-8              | Between-stage rest beats             |
| Resolution text           | 4-6              | Per final path through the thread    |
| Flavor/ambient            | 10-15            | General pool                         |
| **Total per thread**      | **~40-60**       |                                      |

With 5 plot threads: **200-300 lines total** for a complete narrative system. This is achievable. Lines are short (Western characters don't monologue — they quip), and there's no voice acting requirement initially.

### Dialogue Delivery

Dialogue appears as **brief text boxes** at the top or bottom of the screen during gameplay. No full-screen cutscenes. No pausing the game (except during the pre-fight ritual). The player reads while playing, or the text auto-advances after a few seconds.

Boss dialogue during the pre-fight ritual can be slightly longer (2-3 exchanges). Mid-fight callouts are 1 line maximum ("Is that all you've got?"). Post-fight lines appear during the outcome beat.

### Character Voice

Each NPC and boss should have a distinct voice that's immediately recognizable in 1-2 lines:

- **Terse:** "Leave." / "Your funeral."
- **Theatrical:** "At last! The famed gunslingers grace my humble domain!"
- **Nervous:** "I-I didn't want this. They made me. Please, just go."
- **Menacing:** "I've been watching you since the pass. You're slower than they said."

The Western genre has strong voice archetypes. Lean into them. Every line should feel like it could be in a Coen Brothers or Leone film.

---

## 9. Camp Beats

### The Rest Between Stages

From the loot brainstorm: between stages, players take a "long rest" — heal, restore abilities, and encounter a camp scene. This is the narrative's **breathing room.**

### Camp as Story Moment

The camp isn't just a shop screen. It's a brief narrative beat:

1. **Arrival** (2-3 seconds): Players arrive at camp. Brief establishing shot — a campfire, a crossroads, a waystation.
2. **Reflection** (optional): A line of ambient dialogue acknowledging what just happened. "That could've gone better" (soft failure) or "That's one down" (success).
3. **Visitor** (the mechanical part): The camp visitor system from the loot brainstorm (Trade Caravan, Tinkerer, Shaman). But now contextualized by the plot thread.
4. **Foreshadowing** (2-3 seconds): A hint about what's ahead. "I hear the canyon's crawling with outlaws." / "Something's wrong with the water out east."

### Contextual Visitors

Camp visitors can be plot-relevant:

- In "The Bounty" thread, the Tinkerer might be a weapons dealer who knows the target: "That revolver won't stop them. You need something bigger."
- In "The Corruption" thread, the Shaman's offerings might have a thematic twist: "The earth is sick. I can help — but the cure has side effects."
- In "The Raid" thread, survivors from the town might appear at camp: "Thank you for saving us. We managed to grab some supplies before we fled."

The core mechanical function (buy/upgrade/trade) stays the same. The narrative wrapper changes per thread.

---

## 10. Environmental Storytelling

### The Arena Tells the Story

From the research (narrative-boss-design.md Section 8):

> "Boss arenas can tell stories without a single word of dialogue."

Every stage's environment should communicate the story visually:

**Before the player reads any dialogue, they should already feel the story.**

| Story Beat                 | Environmental Tell                                        |
| -------------------------- | --------------------------------------------------------- |
| Town under attack          | Burning buildings, overturned carts, NPCs fleeing         |
| Corruption spreading       | Organic growths on walls, discolored ground, dead animals |
| Pursuit through wilderness | Trail markers, abandoned campsites, distant dust clouds   |
| Approaching the stronghold | Fortifications, guard posts, increasing enemy density     |
| Supernatural horror        | Unnatural lighting, impossible geometry, reality glitches |

### Boss Arena as Narrative Culmination

The boss arena should be the most visually expressive space in the stage. It summarizes the story so far:

- **"The Raid" final boss arena:** The goblin king's throne room — stolen goods from the town piled around the edges. If the mayor was kidnapped, they're visible in a cage.
- **"The Bounty" final boss arena:** An empty main street at high noon. Tumbleweed. Spectators watching from windows. The clock tower visible.
- **"The Corruption" final boss arena:** The mine's deepest chamber. Organic horror growing from the walls. The corruption is visible as a physical presence.

The arena doesn't just provide cover and hazards — it tells the player "this is where the story ends."

### Spectators and Witnesses

From Hades' Elysium Stadium and Western film tradition: witnesses give boss encounters narrative weight. When others watch, the fight matters beyond the two combatants.

- Town NPCs watching from building windows during a main street showdown
- Goblin soldiers cowering at the edges of the throne room
- Corrupted creatures frozen in place, watching

Spectators don't need to be interactive. Their presence alone communicates: this fight has stakes beyond your survival.

---

## 11. Replayability Without Meta-Narrative

### The Variety Budget

Since we don't have meta-progression to keep players engaged across hundreds of runs, we need enough **within-run variety** that two consecutive runs feel substantially different. The variety comes from multiple layers combining:

| Layer                         | Variety Sources        | Combinations |
| ----------------------------- | ---------------------- | ------------ |
| Plot thread                   | 5 threads              | 5            |
| Act I boss (from pool of 2-3) | ~3 per thread          | 15           |
| Act I outcome                 | 2 paths                | 30           |
| Act II boss                   | ~3 per thread per path | 90           |
| Act II outcome                | 2 paths                | 180          |
| Act III boss                  | ~2 per thread per path | 360          |
| Arena variants (2-3 per boss) | ~2.5 average           | 900          |
| Character played              | 3 characters           | 2,700        |

Even with conservative numbers, the combinatorial space is enormous. Two players will rarely have the same story.

### What Changes vs. What Stays

To prevent the system from feeling like random noise, some things should be **consistent within a thread** while others vary:

**Consistent (per thread):**

- The inciting incident's nature (an attack, a mystery, a job)
- The general narrative arc (setup → chase → showdown)
- The tone (action, horror, mystery, revenge)
- Key NPC identities (the quest-giver, the antagonist)

**Variable (per run):**

- Which boss from the pool
- Which arena layout
- Which path through the branch tree
- Which camp visitors appear
- Which mid-stage narrative events trigger
- Enemy composition details
- Loot and upgrade availability

This balance means every "Raid" run feels like a raid story, but the details — who you fight, where you go, what you find — change each time.

### The Recency Filter

The only cross-run state for narrative purposes is a **recency filter**: a short list of recently played plot threads (last 3-5 runs). The system avoids repeating the same thread consecutively. This prevents the worst-case scenario of getting "The Raid" three times in a row.

This is not meta-progression. It's anti-repetition. The player never sees it or interacts with it. It just ensures variety.

### Multiplayer Narrative

In co-op, the story is shared. All players experience the same plot thread, outcomes, and dialogue. Boss pre-fight dialogue addresses the group. Narrative events are visible to all players simultaneously.

The story doesn't need to be "about" all players equally. It's about the situation they're in together. This mirrors Western ensemble films (The Magnificent Seven, The Wild Bunch) where the group faces a shared challenge.

---

## 12. Example Runs

### Run A: "The Raid" — Success Path

**Act I (Town):** Goblins attack the town. The player defends the main street. Mid-stage event: a survivor tells you the goblins are headed for the town hall. Boss: Ogre Brute attacks in the town square. The Goblin King is visible in the background directing troops. **Player wins and damages the King enough to make him retreat early.** Success: the mayor is safe.

**Camp:** A grateful townsperson offers supplies. The Tinkerer is at camp: "I've been tracking these goblins. Their camp is through the canyon."

**Act II (Canyon):** The player pursues the retreating goblins through a narrow canyon. Ambushes from the cliffs. Mid-stage event: you find goblin supply caches (bonus loot). Boss: The Goblin War Chief blocks the canyon exit with his elite guard. **Player wins.** Success: clear path to the goblin camp.

**Camp:** A mercenary appears at camp: "I heard you're going after the Goblin King. I want a cut of whatever he's hoarding."

**Act III (Goblin Camp):** The player storms the goblin stronghold. Dense enemy encounters in a fortified camp. Boss: The Goblin King himself — three phases, summons adds, uses environmental traps (spike pits, fire). **Player wins.** Resolution: "The Goblin King's reign ended at sunset. The stolen goods were returned. The town would remember the day a stranger rode in and set things right."

### Run B: "The Raid" — Soft Failure Path

**Act I (Town):** Same inciting incident. Same Ogre Brute boss. **But the player doesn't deal enough damage to the Goblin King before the Brute is killed.** Soft failure: the Goblin King escapes with the kidnapped mayor.

**Camp:** Atmosphere is grimmer. "They took the mayor. We have to go after them." The Shaman is at camp: "The forest is dangerous at night. Take this — you'll need it." (Different offerings than the success path.)

**Act II (Forest):** Instead of pursuit through a canyon, the player navigates a dense forest at night. Visibility is lower. Enemies are more ambush-oriented. Mid-stage event: you find the mayor's hat on the trail. Boss: A Goblin Tracker with hound companions, fought in a forest clearing. **Player wins.** Success: you locate the goblin camp.

**Camp:** The mercenary appears again but with different dialogue: "Rescue mission? That's riskier. I want double."

**Act III (Goblin Camp):** The camp layout is different — the mayor is in a cage that the player must protect (environmental objective). The Goblin King's boss fight has an added mechanic: the cage takes periodic damage and if it's destroyed, the mayor dies (soft failure even in the final act). **Player wins and saves the mayor.** Resolution: "The mayor was bruised but alive. 'You took your time,' they said. But they were smiling."

### Run C: "The Stranger" — Mixed Path

**Act I (Town):** A lone figure rides into town. Tense standoff in the saloon. Boss: Rival Gunslinger duel on main street. **Soft failure: the stranger wounds the player and escapes with a map from the sheriff's office.**

**Camp:** Player is recovering. A doctor NPC patches you up. "That stranger... I've seen them before. They're hunting something in the mine."

**Act II (Mine):** The player follows the stranger into the mine. The environment is unsettling — the mine goes deeper than it should. Mid-stage event: you find the stranger's journal. They're hunting the same supernatural threat you've been hearing about. Boss: The stranger again, but this time in a cramped mine shaft. Different arena = different fight. **Player wins.** The stranger, defeated, tells you what they know: "It's down there. I tried to stop it alone. We both know how that went."

**Act III (Deep Mine):** The real threat is a supernatural horror boss. The stranger appears as a weakened NPC ally (fires occasional shots, can be downed). The arena is the deepest mine chamber, walls pulsing with corruption. **Player wins.** Resolution: "The stranger never gave their name. As the sun came up, they tipped their hat and rode east. Whatever was in that mine, it wouldn't trouble anyone again."

---

## 13. Implementation Considerations

### Data Structure

The narrative system is data-driven. Plot threads, stages, boss pools, dialogue pools, and branching logic are all defined in content data, not hardcoded in systems.

```
packages/shared/src/sim/content/
  narrative/
    plotThreads.ts       // PlotThread definitions
    stages.ts            // Stage configurations per thread/path
    bossPools.ts         // Boss assignments per stage
    dialoguePools.ts     // Tiered dialogue per thread
    narrativeEvents.ts   // Mid-stage event definitions
    resolutions.ts       // Ending text per path
```

### World State for Narrative

The `GameWorld` needs narrative state:

```typescript
interface NarrativeState {
  threadId: string; // Current plot thread
  currentAct: 1 | 2 | 3;
  previousOutcomes: ("success" | "soft_failure")[]; // Per completed act
  currentPath: string; // Resolved stage ID for current act
  activeEvents: string[]; // Triggered narrative events this stage
  dialogueHistory: Set<string>; // Lines already played this run (no repeats)
}
```

This lives on `world.narrative` alongside `world.encounter` for wave spawning.

### System Integration

The narrative system touches several existing systems:

| System            | Integration Point                                                               |
| ----------------- | ------------------------------------------------------------------------------- |
| **Wave Spawner**  | `world.encounter` is set by the narrative system based on thread + stage + path |
| **Enemy Prefabs** | Visual theme (sprite set) selected by plot thread                               |
| **Boss System**   | Boss ID selected from pool; arena variant selected; dialogue pool attached      |
| **Camera**        | Pre-fight ritual uses camera system (tighten, pan, zoom)                        |
| **HUD/UI**        | Dialogue display, objective indicators, resolution screen                       |

### Content Priority

For an initial implementation, prioritize depth over breadth:

1. **One plot thread, fully fleshed out.** All three acts, both branch paths, all dialogue, 2 boss options per stage. This proves the system works.
2. **A second thread to demonstrate variety.** Different tone, different settings. This proves threads feel different.
3. **Scale to 3-5 threads.** Each thread reuses bosses and settings where appropriate.

The mechanical boss implementations are the most expensive part. Narrative wrapping (dialogue, arena variants, branch logic) is cheap by comparison. Invest in 8-12 solid boss designs and re-contextualize them across threads.

---

## Key Takeaways

1. **Each run is a complete 30-60 minute story.** No meta-narrative. No "play 50 hours to see the ending." Every run has an ending.
2. **Plot threads are modular story templates.** They constrain randomness to produce coherent stories. 5 threads with branching paths create hundreds of unique run experiences.
3. **Bosses are story climaxes, not just combat checks.** The pre-fight ritual, contextual dialogue, and branching outcomes make each boss encounter a narrative event.
4. **Soft failure is the narrative engine.** It creates meaningful divergence between runs without requiring player death. Two successful runs through the same thread can tell very different stories.
5. **Environmental storytelling does the heavy lifting.** The arena, the setting, the enemy themes — these tell the story without dialogue. Dialogue enhances; environment establishes.
6. **The variety budget is combinatorial.** 5 threads x 2-3 bosses x 2 outcomes x 3 acts x 2-3 arenas x 3 characters = thousands of distinct run configurations. Meta-narrative isn't needed for replayability.
