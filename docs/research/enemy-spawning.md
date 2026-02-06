# Enemy Spawning Systems Research

This document examines how contemporary action roguelites handle enemy spawning within stages — wave structure, enemy counts, spawn positioning, difficulty scaling, and pacing. It extracts design principles and recommends an approach for High Noon.

## Table of Contents

1. [Spawn Model Taxonomy](#spawn-model-taxonomy)
2. [Case Studies](#case-studies)
3. [Pacing Theory](#pacing-theory)
4. [Fairness Design](#fairness-design)
5. [Reward Psychology](#reward-psychology)
6. [Design Recommendations for High Noon](#design-recommendations-for-high-noon)

---

## Spawn Model Taxonomy

Four fundamentally different approaches exist. Every action roguelite uses one of these or a hybrid.

### Fixed/Curated

Pre-designed rooms with predetermined (or semi-random) enemy placements, assembled procedurally into floors.

**How it works:** Designers handcraft hundreds of room templates. Each template specifies enemy spawn points and types. The level generator picks rooms from the pool and connects them. Enemies spawn when the player enters.

**Used by:** Enter the Gungeon, The Binding of Isaac

**Strengths:** Guaranteed encounter quality. Every room is individually playtested. No degenerate combinations. Precise control over difficulty per-room.

**Weaknesses:** High content creation cost (Gungeon has ~300 rooms for floor 1 alone). Can feel repetitive after many runs. No dynamic adaptation to player skill.

### Wave-Based

Rooms spawn enemies in sequential waves. Each wave triggers after the previous is cleared.

**How it works:** A room defines 2-3 waves, each with a specific enemy composition. Killing the last enemy in a wave immediately triggers the next. Room completes when the final wave is cleared.

**Used by:** Hades

**Strengths:** Natural pacing within rooms — build-up, escalation, climax. Clear player objectives (finish the wave). Allows designed crescendos. Easy to create survival variants (timed instead of wave-based).

**Weaknesses:** Can feel predictable. Less adaptive to player power. Content-bound (needs authored wave definitions).

### Director/Budget

A runtime "Director" AI accumulates credits over time and spends them to spawn enemies. Enemy types have costs; the Director buys what it can afford.

**How it works:** Credits accumulate based on elapsed time and difficulty coefficient. The Director periodically attempts to spend credits on enemy groups from a weighted pool. A separate boss Director handles teleporter events. Overcrowding caps prevent runaway entity counts.

**Used by:** Risk of Rain 2, Left 4 Dead

**Strengths:** Highly adaptive to player skill (slow players face more enemies, fast players face fewer). Excellent replayability — no two stages feel identical. Creates organic difficulty scaling. Real-time intensity management.

**Weaknesses:** Can produce unfair spikes if poorly tuned. Harder to playtest exhaustively. Complex to implement and balance. Players can't learn specific patterns.

### Timer-Based

Enemies spawn on fixed time intervals with escalating waves.

**How it works:** Each minute introduces a new wave with specified enemy types and counts. Spawn intervals and enemy HP scale with elapsed time. Simple: time passes, enemies appear.

**Used by:** Vampire Survivors

**Strengths:** Extremely predictable and learnable. Simple to implement. Creates clear progression milestones. Works well for survival/horde gameplay.

**Weaknesses:** No adaptation to player skill. Can feel mechanical. Difficulty may mismatch player progression. Limited dynamic tension.

### Comparison

| Model | Replayability | Dev Cost | Adapts to Skill | Pacing Control | Best For |
|-------|--------------|----------|-----------------|----------------|----------|
| Fixed/Curated | Medium | High | None | High (per-room) | Precision bullet-hell |
| Wave-Based | Medium | Medium | Low | High (per-wave) | Narrative action |
| Director/Budget | High | Medium | High | Medium | Open exploration |
| Timer-Based | Low-Medium | Low | None | Low | Horde survival |

---

## Case Studies

### Hades (Supergiant Games, 2020)

Hades uses **wave-based spawning within curated encounter pools**. It is the gold standard for room-based pacing in an action roguelite.

#### Wave Structure

Rooms contain 2-3 waves on average. The wave count varies by biome:

| Biome | Avg Waves | Range |
|-------|-----------|-------|
| Tartarus | 1.9-2.0 | 1-3 |
| Asphodel | 2.3-2.5 | 2-3 |
| Elysium | 2.3-2.5 | 2-3 |
| Temple of Styx | N/A | Small consecutive rooms |

**Wave triggers:** The next wave spawns **the instant you kill the last enemy** from the previous wave. No timer, no delay — immediate escalation. This creates relentless pacing within a room while the transition between rooms provides breathing room.

**Survival rooms (Tartarus only):** Instead of discrete waves, enemies spawn continuously for 45 seconds. The player must survive, not clear. After the timer, Hades destroys all remaining enemies. This is an exciting variant because the objective shifts from "kill everything" to "stay alive."

#### Enemy Composition

Hades uses a **curated encounter pool** system rather than pure randomization:

- Encounters are defined in `EncounterData.lua` — static sets of enemy compositions and wave structures
- Room layouts are fixed, but which encounter from the pool is placed in each room is randomized
- Certain elite combinations are explicitly forbidden via `BlockEliteAttributes`
- Biome-specific enemy pools ensure thematic consistency (Tartarus has wretches, Elysium has exalted warriors)

**Budget-like scaling:** Each enemy type has a point value, and encounter difficulty is tracked numerically. Elite rooms have higher difficulty values but use fewer, tougher enemies.

#### Spawn Positioning

- Rooms contain **many predefined spawn points** — enemies don't appear at arbitrary positions
- Spawn location is **influenced by player position** — enemies tend to spawn near the player rather than across the room
- Speedrunners exploit this: hugging walls or standing near doors manipulates spawns to reduce travel distance
- **Spawn rings** appear as visual telegraphs showing where enemies will materialize, giving the player a moment to reposition

#### Difficulty Scaling (Pact of Punishment)

The Heat system lets players opt into specific difficulty modifiers:

| Modifier | Effect on Spawning |
|----------|-------------------|
| **Jury Summons** (1-3 ranks) | +20% enemy count per rank (max +60%) |
| **Forced Overtime** (1-2 ranks) | Enemies move/attack 20-40% faster, spawn faster between waves |
| **Hard Labor** (1-5 ranks) | +20% enemy damage per rank (no spawn change) |
| **Middle Management** | Mini-bosses gain new abilities |
| **Extreme Measures** (1-4 ranks) | Boss phases and attacks change |

**Key insight:** Hades separates "more enemies" from "harder enemies" into different dials. Jury Summons adds quantity; Hard Labor and Forced Overtime add quality. This gives players granular control over what kind of challenge they want.

#### Biome Pacing

- **Tartarus (rooms 1-15):** 11 combat encounters, weakest enemies, introduces survival rooms. Average room: ~60-90 seconds.
- **Asphodel (rooms 16-25):** 6 combat encounters, lava hazards restrict movement, mini-boss (Megagorgon + Skull-Crusher). Fewer but harder rooms.
- **Elysium (rooms 26-37):** 8 combat encounters, Exalted enemy classes with varied weapons, traps become offensive tools.
- **Temple of Styx (rooms 38+):** Hub with 5 wings of 4-5 small chambers each. 2 elite wings end with mini-bosses. Completely different structure — smaller, faster encounters.

**Full run:** 30-45 minutes for experienced players. Speedruns under 8 minutes.

#### What Makes It Work

1. **Instant wave triggers** eliminate dead time within rooms
2. **Room transitions** provide natural breathing room between encounters
3. **Spawn rings** telegraph where enemies will appear — the player is never ambushed
4. **Curated encounters** guarantee every room is a designed experience, not a random soup
5. **Player-chosen difficulty** (Heat) creates buy-in — the player agreed to this challenge level

---

### Enter the Gungeon (Dodge Roll, 2016)

Gungeon uses **fixed/curated room design** with semi-randomized enemy placement. Every room is handcrafted and individually playtested.

#### Room Structure

- Rooms are **pre-designed, not procedurally generated** — nearly 300 templates for floor 1 alone
- The floor generator picks rooms from the pool and connects them via a graph algorithm
- Each floor contains ~20 rooms per run, with multiple possible "flows" (graph layouts)
- Duplicate rooms are avoided within a single floor

**Enemy placement:** Semi-randomized within room templates. The system finds random valid positions within the room's floor collider bounds. Enemy types vary between runs even in the same room layout, but enemy count is bounded (typically 4-8 per room).

#### Combat Flow

- Combat triggers **immediately upon entering** a room — no approach phase
- Doors **seal shut** and all enemies activate at once
- Most rooms spawn **all enemies simultaneously** (no waves in standard rooms)
- Doors unlock only after every enemy is dead
- **Challenge Shrines** are the exception — they trigger multiple waves of escalating difficulty

**No waves in normal rooms** is a key design difference from Hades. The entire encounter is one simultaneous challenge. This creates a "puzzle" feel: you enter, assess all threats at once, prioritize, and execute.

#### Floor Difficulty Scaling

| Floor | Health Multiplier | Shop Cost | New Enemy Types |
|-------|-------------------|-----------|-----------------|
| Keep of the Lead Lord (1) | 1.0x | 100% | Bullet Kin, Shotgun Kin, etc. (~40 types) |
| Gungeon Proper (2) | 1.3x | 110% | Lead Maiden, Gunjurer, etc. (+4 types) |
| Black Powder Mine (3) | 1.6x | 140% | Coaler, Jammomancer, etc. (+26 types) |
| Hollow (4) | 1.85x | 150% | Skullet, Shelleton, etc. (undead themed) |
| Forge (5) | 2.1x | 160% | Ashen variants, Revolvenant, etc. |

**Important pattern:** Earlier enemies carry forward to later floors with scaled HP, but newer enemies introduced on a floor have relatively low base HP. This means late-game floors mix tough veterans with fragile but aggressive newcomers.

**Boss DPS cap:** Bosses have a damage-per-second cap (30 DPS on floor 1, up to 80 on Bullet Hell) that prevents instant kills even with overpowered weapons. This ensures boss fights always last a minimum duration.

#### Jammed (Champion) Enemies

Gungeon's elite system is driven by the **Curse** stat:

| Curse Level | Jammed Chance | Jammed Stats |
|-------------|---------------|-------------|
| 1-6 | 1-5% | HP × 3.5 + 10, +50% speed, -33% cooldowns, 1 full heart damage |
| 7-9 | 10-25% | Same |
| 10+ | 50% | Same, plus Lord of the Jammed (unkillable pursuer) spawns |

**Curse accumulates** from items, shrines, and player choices throughout a run. It's a risk/reward mechanic: cursed items are powerful but make every room more dangerous. This is elegant because the player opts into difficulty organically through gameplay decisions.

#### Room Design Philosophy

Dodge Roll's developers stated they found it was better to **handcraft individual rooms and playtest them**, then use procedural generation only to connect rooms into floors. This guarantees every encounter is a designed experience.

Room obstacles (tables, pits, cover) are **co-designed with enemy placements** — pits create hazard zones, tables provide cover, and obstacle placement creates natural choke points and flanking routes.

**Difficulty gating:** The game locks harder room variants and reinforcement waves behind metrics like number of times the player has seen that room or total hours played. New players never see the hardest rooms.

#### What Makes It Work

1. **All enemies at once** creates immediate "puzzle assessment" — read the room, prioritize, execute
2. **Handcrafted rooms** guarantee quality — no degenerate random combinations
3. **Door locking** creates commitment — you must deal with what's in front of you
4. **Curse system** lets players opt into difficulty through gameplay choices, not menus
5. **Health scaling** (not count scaling) keeps rooms readable — same number of enemies, tougher to kill

---

### Nuclear Throne (Vlambeer, 2015)

Nuclear Throne uses **all-at-once spawning** in procedurally generated open arenas. It is the fastest-paced game studied.

#### Level Structure

Levels are **open arenas**, not discrete rooms. Generated using a "walker" algorithm:
- Walkers start at a point and move in a random direction, carving out floor tiles
- At the end of each walk, objects of interest are placed (ammo crates, explosive barrels)
- Each area has unique generation parameters (Desert is wide-open; Scrapyard is tighter)

**Area structure:**
- Overworld areas (1, 3, 5, 7): Three sub-levels, boss on the third
- Intermission areas (2, 4, 6): Single sub-level, smaller encounters

#### Spawning

**All enemies spawn at level generation** — there are no waves, no reinforcements, no Director. When you enter a level, everything is already placed.

The only exception: **IDPD (Inter-Dimensional Police Department)** reinforcements arrive via portals mid-level after you've killed 20-80% of existing enemies AND killed at least one IDPD unit. This is a punishment mechanic for looping, not a standard spawn system.

**Spawn positions:** Enemies are placed on floor tiles during generation at `(x + 16, y + 16)` from tile positions. There is no documented minimum distance from the player — community reports confirm enemies sometimes spawn dangerously close.

#### Enemy Count and Difficulty

Enemy count scales with a hidden **"difficulty" parameter** equal to the number of portals entered. Each portal adds 1 difficulty. This means:
- Skipping areas (via secret routes like the Oasis) results in lower enemy counts
- Looping the game increases enemy count significantly
- Specific per-area enemy counts are not fixed — they scale dynamically

**Loop scaling:**
- Enemy HP: +5% per loop (bosses: +33% first loop, then +5%)
- Additional Big Bandits spawn every loop (+2 per loop)
- Ammo pickup fadeaway time decreases each loop (pressure to play aggressively)
- Boss attacks gain additional bullet patterns per loop

#### Level Completion

A level ends when **combined remaining enemy HP drops to 140 or below**. At that point:
- A portal appears
- All remaining enemies are instantly killed
- All pickups on the map are pulled toward the player

This is a brilliant design decision. It eliminates the "hunting for the last enemy" problem. The player never has to search a level for one remaining target hiding in a corner — the game just ends when threat is negligible.

#### Pacing

Nuclear Throne is the fastest game studied:
- **Full run:** 15-20 minutes
- **Individual levels:** ~2-3 minutes
- **Boss fights:** Under 30 seconds
- **Zero loading time** between levels

The game rewards aggression through time-limited ammo pickups that fade if not collected quickly. Fadeaway time decreases each loop. Sitting still is actively punished — you run out of ammo.

**4:3 aspect ratio:** Vlambeer deliberately chose a narrower field of view to "balance out the threat from more directions." The smaller visible area increases tension and forces faster reactions.

#### What Makes It Work

1. **No waves** — everything is present from the start; the level IS the encounter
2. **140 HP threshold** for completion eliminates last-enemy hunts
3. **Fading ammo** creates urgency and rewards aggressive play
4. **Simple procedural generation** creates sufficient variety without content overhead
5. **Breakneck speed** — levels are over before they can drag

---

### Risk of Rain 2 (Hopoo Games, 2020)

Risk of Rain 2 uses the most sophisticated spawn system studied: a **multi-Director credit-based system** with continuous difficulty scaling.

#### The Director System

Three types of Directors manage spawning:

| Director | When Active | Credit Rate | Purpose |
|----------|------------|-------------|---------|
| **Fast Standard** | Map entry → teleporter activation | 0.75× multiplier, 4.5-9s between spawns | Constant pressure |
| **Slow Standard** | Map entry → teleporter activation | 0.75× multiplier, 22.5-30s between spawns | Periodic large groups |
| **Teleporter Boss** | 3s after teleporter activation | 2.0× multiplier, immediate | Boss + adds |
| **Scene** | Map load (one-time) | Fixed budget | Place interactables (chests, shrines) |

**Credit accumulation formula:**
```
creditsPerSecond = creditMultiplier × (1 + 0.4 × difficultyCoefficient) × (playerCount + 1) / 2
```

The Director spends accumulated credits on enemy groups of up to 4 of the same type. If fewer than the desired count can be afforded, it spawns as many as it can.

**"Too cheap" avoidance:** The Director avoids spawning enemies that cost less than 1/6 of its current budget. This prevents it from endlessly spawning the weakest enemies when it has enough credits for something dangerous.

**Overcrowding cap:** If 40+ enemies exist on the map, spawn attempts fail (except for the Teleporter Boss Director, which bypasses this).

#### Difficulty Coefficient

The core scaling formula:

```
playerFactor = 1 + 0.3 × (playerCount - 1)
timeFactor = 0.0506 × difficultyValue × playerCount^0.2
stageFactor = 1.15^stagesCompleted
coefficient = (playerFactor + timeInMinutes × timeFactor) × stageFactor
```

Where `difficultyValue` is 1 (Drizzle), 2 (Rainstorm), or 3 (Monsoon).

**Key insight:** Stage completion is **exponential** (1.15^n) while time is **linear**. This means rushing through stages is far more punishing than spending extra time on one stage. A player who fully loots one stage faces dramatically less difficulty than one who rushed through two.

**Enemy scaling from coefficient:**
- Enemy level = `1 + (coefficient - playerFactor) / 0.33`
- Each enemy level: +30% HP, +20% damage
- Elite enemies cost 6× (Tier 1) or 36× (Tier 2) their base credit cost

#### Spawn Positioning

- Maps have predefined **spawn nodes** — enemies can only appear at valid positions
- Each enemy type has a **minimum and maximum spawn distance** from the target (player)
- The Director picks spawn nodes within the valid distance range

#### Teleporter Event

The teleporter event is where Risk of Rain 2's spawning shines:
- Standard Directors **deactivate** 3 seconds after activation
- Teleporter Boss Director **activates** with 2× credit multiplier and immediate spawn timer
- First spawn is always a Champion (boss) category enemy
- **Shrine of the Mountain:** Each activated shrine gives +100% credits to the Teleporter Director (and +100% item drops as reward)
- **Horde of Many:** If no Champion card fits the budget, the Director spawns multiple Elite non-boss enemies instead — a swarm event

#### Multiplayer Scaling

- `playerFactor` increases by 0.3 per additional player
- Credit accumulation scales with `(playerCount + 1) / 2`
- Enemy HP scales with `√livingPlayers`
- Interactable credits increase by 50% per additional player
- Diminishing returns on player count exponent (0.2) prevent runaway scaling

#### What Makes It Work

1. **Dual Directors (fast + slow)** create natural pacing — constant trickle plus periodic surges
2. **Time-based difficulty** creates urgency without a visible timer
3. **Stage completion penalty** (exponential) rewards thorough play over rushing
4. **Credit budget** prevents unfair swarms — expensive enemies cost more
5. **Teleporter event** provides a clear climax per stage
6. **"Too cheap" avoidance** ensures spawns remain threatening as difficulty rises

---

## Pacing Theory

### The Build-Release Cycle

The most important concept in combat pacing, derived from Left 4 Dead's AI Director:

```
BUILD UP → SUSTAINED PEAK → PEAK FADE → RELAX → BUILD UP → ...
```

| Phase | Duration | Description |
|-------|----------|-------------|
| **Build Up** | 10-20s | Threats increase. Enemies spawn, pressure mounts. |
| **Sustained Peak** | 3-5s | Maximum intensity. Player is fully engaged, reacting constantly. |
| **Peak Fade** | 5-10s | Threats diminish naturally. Last enemies die, action winds down. |
| **Relax** | 30-45s | Minimal threat. Player recovers, explores, collects rewards, makes decisions. |

**Left 4 Dead's Director** explicitly tracks "Survivor Intensity" and transitions between these phases. It will not trigger relaxation until a natural break occurs, and it will not resume building until the relax timer expires. This prevents both unrelenting pressure and extended boredom.

**Hades achieves this through structure:** the build-release cycle maps perfectly to room combat (build/peak) → room transition and reward selection (relax). Each room IS a build-peak cycle.

**Risk of Rain 2 achieves this through Directors:** the dual fast/slow Directors create mini-cycles within a stage, with the teleporter event serving as the major climax.

### Csikszentmihalyi's Flow

The flow channel sits between anxiety (too hard) and boredom (too easy). Spawning systems maintain flow by:

- **Matching spawn pressure to player power** — stronger players should face more/harder enemies
- **Providing clear feedback** — the player should always know what's happening and why
- **Escalating gradually** — difficulty spikes break flow; steady ramps maintain it
- **Allowing mastery expression** — skilled players should be able to handle higher intensity

**Hades and Gungeon** maintain flow through curated difficulty that's been playtested. **Risk of Rain 2** maintains flow dynamically through the coefficient system. **Nuclear Throne** maintains flow through raw speed — levels are so short that any intensity mismatch is over in seconds.

### Encounter Duration

Across all games studied:

| Game | Room/Level Duration | Full Run |
|------|-------------------|----------|
| Hades | 60-90s per room | 30-45 min |
| Enter the Gungeon | 30-60s per room | 30-45 min |
| Nuclear Throne | 2-3 min per level | 15-20 min |
| Risk of Rain 2 | 5-10 min per stage | 40-60 min |

**Guideline:** Individual combat encounters should last 30-90 seconds. Any encounter over 2 minutes risks feeling like a slog. Boss fights can go longer (2-5 minutes) because they provide unique spectacle.

### The Contrast Principle

Peaks feel intense **because** of the valleys that surround them. Without rest, the player goes numb. Without action, the player gets bored.

- Remaining at a trough too long → tedium
- Remaining at a peak too long → desensitization
- Alternating → engagement

**Hades' room transitions** are the perfect implementation: a forced valley (choosing a reward, walking to the next room) between peaks (room combat). The player never chooses to rest — the structure imposes it.

---

## Fairness Design

### Spawn Positioning Rules

Every game studied follows some version of these rules:

| Rule | Purpose | Who Does It |
|------|---------|-------------|
| **Minimum distance from player** | Prevent instant-kill spawns | RoR2 (per-enemy min distance), Hades (spawn rings give warning) |
| **Off-screen spawning** | Never spawn in the player's view | RoR2 (spawn nodes), Terraria (62+ tile minimum) |
| **Spawn telegraph** | Visual/audio warning before enemy appears | Hades (spawn rings), RoR2 (portal effects) |
| **Grace period** | Newly spawned enemies don't attack immediately | Hades (spawn animation), Gungeon (brief contact damage immunity) |
| **Overcrowding cap** | Prevent unreadable enemy density | RoR2 (40 monster cap), VS (300 entity cap) |

**Nuclear Throne is the exception:** enemies can spawn close to the player at level start with no warning. This contributes to its punishing reputation but also its adrenaline-soaked feel.

### Attack Fairness After Spawning

| Game | First Attack Timing |
|------|-------------------|
| Hades | Enemies follow normal telegraph → attack cycle after materializing |
| Gungeon | Brief grace period on room entry; enemies activate simultaneously |
| Nuclear Throne | Immediate — enemies are already active when the level loads |
| Risk of Rain 2 | Enemies spawn with their normal AI state; they must detect and approach before attacking |

**Best practice:** Enemies should have a 0.3-1.0 second grace period after spawning before their first attack. This can be implemented as an initial AI delay rather than explicit invulnerability.

### Staggered Fire Timing

**Enter the Gungeon** uses deliberate fire desynchronization: each enemy gets a random delay before its first shot. This prevents "wall of bullets on room entry" — the effect that makes all enemies firing simultaneously feel unfair even when each individual enemy is dodgeable.

**Hades** achieves this through wave sequencing — enemies in later waves haven't started their attack timers yet, so fire naturally staggers across time.

### Player I-Frames

Every game studied provides brief invulnerability after the player takes damage (0.3-1.0 seconds). This prevents multi-hit stacking from overlapping damage sources. Without i-frames, a player surrounded by 5 enemies could lose all HP in a single frame — unfair and unreadable.

---

## Reward Psychology

### Variable Ratio Reinforcement

The most addictive reward schedule: the player is rewarded after a **random** number of actions. Unlike fixed schedules, variable ratio reinforcement:

- Produces high-frequency, persistent behavior
- Creates no post-reinforcement pause (no "I just got a reward, I can relax")
- Keeps players motivated by the **possibility** of reward at any moment

In roguelites, this manifests as:
- Random enemy drops (health, ammo, currency)
- Chest loot quality randomization
- Rare upgrade discoveries

### The "One More Room" Loop

What makes players continue playing after a room clears?

1. **Immediate reward:** Loot appears the instant enemies die (Hades: boon/resource. Gungeon: currency/drops.)
2. **Choice presentation:** The player sees what's behind the next doors (Hades: reward icons on doors. Gungeon: map reveals adjacent rooms.)
3. **Sunk cost momentum:** The run has built up power — abandoning it wastes that investment
4. **Curiosity:** What combination of rewards lies ahead?

**Critical pattern:** The reward appears at the END of the combat encounter, not during it. This creates a clear cycle: fight → reward → choose → fight. The reward is the release valve after the combat tension.

### Meta-Progression and Perceived Waste

**No run should feel wasted.** Every game studied offers some form of persistent progression:
- **Hades:** Darkness (upgrades), Titan Blood (weapon aspects), character relationships
- **Gungeon:** Hegemony Credits (unlock items), NPC rescues, shortcut construction
- **Nuclear Throne:** Character unlocks via reaching specific areas
- **Risk of Rain 2:** Completing challenges unlocks new items, survivors, and abilities

This ensures that even a failed run contributes to something. The player is always making progress toward permanent rewards, even when they die on floor 1.

### Optimal Run Length

Across all games studied, **20-45 minutes** is the sweet spot for a full run. Shorter runs (Nuclear Throne: 15-20 min) work for higher-intensity games. Longer runs (RoR2: 40-60 min) work when the difficulty curve creates a compelling power fantasy over time.

---

## Design Recommendations for High Noon

### Core Vision: Compact Open-Map Combat

High Noon stages are **compact open maps** — a full environment (railroad town, canyon outpost, desert fort) small enough to cross in ~60 seconds of walking. The player is never far from a fight. Combat is **relentless** — there's no long exploration phase or quiet downtime. The stage is a pressure cooker: enemies are always coming, and the player is always moving, shooting, and dodging.

The combat feel is a **blended layered encounter** — every fight has fodder to mow down AND dangerous enemies demanding focused mechanics, simultaneously. Think Risk of Rain 2: you're cleaving through Lemurians with AoE while a Stone Titan demands your positioning. The ratio shifts over time, but both layers are always present. Bullet hell emerges organically from the volume of enemies on screen, not from a discrete "now it's bullet hell time" switch.

### The Layered Encounter Model

Every wave contains two layers that coexist:

**Fodder layer** — Swarmers, basic Grunts. Constant stream. They fill the screen, fire slow/medium projectiles from all directions, and die fast. AoE effects chew through them. They create the bullet hell through sheer volume and the murder-spree dopamine through rapid kills. They're the popcorn — always there, always satisfying to kill.

**Threat layer** — Gunmen, Chargers, Shield Bearers, Bombers. Fewer of them, but each one demands attention. Telegraphed attacks, meaningful HP, mechanics that require positioning or timing. The player has to prioritize them while weaving through the fodder's bullet curtain. They're the steak — the thing you're actually paying attention to.

**The magic is in the ratio.** Early waves are mostly fodder with 1-2 threats. Late waves have dense fodder AND 3-4 serious threats. The player's attention splits: AoE and movement handle the fodder, deliberate aim and dodge-timing handle the threats. This is what RoR2 gets right — you're never just doing one thing.

```
Wave Composition Over a Stage:

  Wave 1:  ░░░░░░░░░░ ██           (mostly fodder, 1 threat — learning)
  Wave 2:  ░░░░░░░░░░░░░ ██ ██     (more fodder, 2 threats — escalation)
  Wave 3:  ░░░░░░░░░░░░░░░ ██ ██ ██  (heavy fodder, 3 threats — pressure)
  Wave 4:  ░░░░░░░░░░░░░░░░░░ ██ ██ ██ ██  (peak fodder, 4 threats — climax)
  Boss:    ░░░░░░░░░░░ ████████████████     (fodder as adds, boss as ultimate threat)

  ░ = fodder    █ = threat
```

**Why this works better than discrete duel/swarm:**
- No artificial mode-switching. The blend feels organic, like a real chaotic fight.
- The player is always making **triage decisions**: "Do I focus the Charger winding up, or clear the Swarmers boxing me in?" This is engaging moment-to-moment gameplay.
- AoE upgrades and weapons have value in every wave (always fodder to cleave). Single-target upgrades have value in every wave (always threats to focus). No upgrade feels wasted.
- Bullet hell scales naturally with enemy count rather than being toggled on/off.

### Recommended Model: Director-Wave Hybrid

A **zone-aware Director with escalating blended waves** gives the best fit.

**Why not pure room-based (Hades)?** There are no rooms. The player roams freely through a compact town. Locking the player in place breaks the open-map fantasy.

**Why not pure Director (RoR2)?** RoR2's timer-only model creates constant pressure that works for its 3D pacing but lacks authored escalation beats. High Noon needs wave structure for pacing — breathers, climaxes, boss triggers.

**Why not fixed/curated (Gungeon)?** Content cost is extreme and doesn't suit open maps. A town isn't a series of pre-authored rooms — it's one contiguous space.

### How the Director-Wave System Works

```
Stage Start
  │
  │  Player spawns. 5-10s to orient, grab nearby pickups.
  │  Tension cue: distant gunshots, dust clouds on horizon.
  │
  ├─► Wave 1: "First Blood" (10-15s after stage start)
  │     8-10 Swarmers + 1 Gunman step out.
  │     Player learns the threats while mowing through fodder.
  │     Fodder-heavy, low pressure. Introduces the stage's enemy palette.
  │     Kill all → 5-8s breather (loot drops)
  │
  ├─► Wave 2: "The Gang Rides In"
  │     12-15 fodder + 2 threats (new archetype introduced — Charger or Shooter)
  │     More bullets on screen. Player starts splitting attention.
  │     Side objective may activate mid-wave.
  │     Kill all → 5-8s breather
  │
  ├─► Wave 3: "No Mercy"
  │     18-20 fodder + 3 threats with synergy (e.g., Shield Bearer protecting a Shooter)
  │     Fodder includes some Grunts that shoot back. Bullet density climbing.
  │     Player is now managing real chaos — AoE for the horde, focus fire for the threats.
  │     Kill all → 5s breather
  │
  ├─► Wave 4: "All Hell Breaks Loose"
  │     20-25 fodder + 3-4 threats including Elites. Peak bullet density.
  │     Player at peak power from accumulated pickups. Maximum murder-spree energy
  │     while simultaneously handling the hardest mechanical challenge.
  │     Kill all → loot explosion
  │
  └─► Boss Event
        "The Sheriff arrives" / train pulls in / dynamite blows the bridge
        Boss + continuous fodder spawns as adds. Same layered model at maximum intensity.
```

**Key pacing rule:** Waves overlap slightly when the player is doing well. If the player clears a wave fast, the next wave's first spawns start during the breather. Slow players get the full breather. This creates invisible skill-adaptive pacing — good players get a faster, denser experience without explicit difficulty adjustment.

**Continuous reinforcement:** Within a wave, fodder that dies is replaced immediately (up to the wave's budget). The wave doesn't thin out until the fodder budget is nearly spent. Threats don't respawn — killing them is permanent progress toward wave clear. This means the player can feel the wave winding down as threats drop, even while fodder keeps coming.

### Zone System

The compact map is divided into **zones** — logical areas that influence spawning. On a 60-second-to-cross map, zones are close together and the player moves between them frequently.

**Railroad Town example zones:**
- Main Street (wide open, good sightlines — lots of fodder spawn points)
- Saloon (interior, tight quarters — threats spawn here for close-range pressure)
- Train Station (elevated platforms, cover)
- Back Alleys (tight, flanking routes — ambush spawns)
- Church / Graveyard (open with obstacles)
- Rooftops (elevated enemy spawn points, sniper perches)

**Zone properties:**
```
Zone {
  spawnPoints: Vec2[]       // Where enemies materialize (doors, alleys, map edges)
  weight: number            // Director preference (higher = more spawns here)
  maxConcurrent: number     // Cap on enemies in this zone
  archetypeAffinity: string[] // e.g., rooftops prefer Shooters, alleys prefer Swarmers
}
```

The Director **biases spawns toward the player's current zone and adjacent zones**. On a compact map, almost everything is reachable. Fodder spawns from all nearby zones — the flood-from-everywhere feeling. Threats spawn from 1-2 zones, giving the player a chance to read them before they engage.

### Budget System

Each wave has **two budgets**: a fodder budget and a threat budget. Both scale with wave number and stage depth.

**Enemy costs:**

| Enemy Type | Tier | Cost |
|------------|------|------|
| Swarmer | Fodder | 1 |
| Grunt | Fodder | 2 |
| Gunman | Threat | 3 |
| Shooter | Threat | 3 |
| Charger | Threat | 3 |
| Bomber | Threat | 4 |
| Shield Bearer | Threat | 4 |
| Support | Threat | 5 |

**Wave budgets (stage 1):**

| Wave | Fodder Budget | Threat Budget | Max Alive | Typical Feel |
|------|--------------|---------------|-----------|-------------|
| 1 | 10-14 | 3-4 | 12 | Casual mowing + 1 real fight |
| 2 | 16-20 | 6-8 | 16 | Busy screen + 2 priority targets |
| 3 | 22-28 | 10-14 | 20 | Dense chaos + 3 demands on attention |
| 4 | 28-35 | 14-18 | 25 | Peak everything — murder-spree AND mechanical challenge |

**Fodder reinforcement:** When fodder dies, the Director immediately spawns replacements from the remaining budget. The alive count stays near max until the budget runs dry. This keeps the screen full and the bullet hell dense throughout the wave.

**Threat persistence:** Threats don't reinforce. Killing a threat is meaningful progress. Once all threats are dead, the remaining fodder is a victory lap / cleanup. This gives the wave a natural resolution — the tension drops as threats fall, even though fodder keeps coming.

**Budget scales with stage depth:** Later stages (canyon, fort) start at higher base budgets and promote Grunts from fodder to mixed roles (they shoot back more aggressively, acting as semi-threats).

### Bullet Hell Design

Bullet hell emerges from the **volume of fodder** on screen, not from a discrete mode switch. It's always present and scales with the wave.

**Projectile philosophy:**
- **Fodder projectiles:** Slow-medium speed, low individual damage. Each one is a minor threat. But 15 of them from all directions creates a curtain the player must weave through. The bullet hell is incidental — a byproduct of having lots of enemies, not a deliberate pattern.
- **Threat projectiles:** Faster, aimed, higher damage. Telegraphed. These are the ones the player actively dodges. Missing a dodge costs significant HP.
- **The interplay:** The player is dodging threat shots with precision WHILE navigating through the ambient fodder bullet curtain. This is what creates the skill ceiling — it's not just bullet hell, it's bullet hell with focus targets.

**How to make it work:**
1. **Slow fodder bullets:** Fodder projectiles move at 60-70% of threat projectile speed. Gives the player time to read the curtain even with 30+ bullets on screen.
2. **Bright, distinct projectiles:** High contrast, color-coded by threat level. Fodder bullets are dim/small. Threat bullets are bright/large. The player's eye naturally tracks the dangerous ones.
3. **Bullet lifetime caps:** Fodder bullets despawn after 2-3 seconds to prevent screen pollution. Volume comes from active enemies, not lingering hazards.
4. **Directional bias:** Fodder enemies fire toward the player's current position (not predicted), so strafing creates natural gaps — classic bullet hell design.
5. **Density control:** The Director tracks total active projectiles. If count exceeds ~80-100, fodder enemies delay their next shot. This prevents truly unreadable screens while maintaining the chaos feeling.

### Spawn Behavior

**Spatial rules (fairness):**
1. **Contextual spawn points:** Enemies come from doors, alleys, rooftops, map edges — never from thin air
2. **Minimum distance:** No spawn within 200px of the player
3. **Spawn telegraph:** Dust cloud / shadow 0.3s before fodder materializes, 0.5s for threats
4. **Flooding:** Fodder pours from multiple spawn points simultaneously — 3-5 points active, 2-3 enemies per point per second. Creates the "they're coming from everywhere" feeling.
5. **Threat entrance:** Threats spawn from 1-2 points, clearly visible. They step out with presence — the player should clock them immediately.

**Timing rules (pacing):**
1. **Grace period:** Threats wait 0.5-0.8s before first attack. Fodder waits 0.2-0.3s.
2. **Staggered fire:** Threats stagger by 0.3-1.0s. Fodder staggers naturally from continuous spawning.
3. **Attack tokens (threats only):** Maximum 2-3 threats in telegraph/attack state simultaneously. Fodder fires freely — that's the bullet hell.
4. **Continuous spawning:** Fodder spawns throughout the wave at 2-4 enemies/second (scaling with wave). No downtime within a wave.
5. **Reinforcement:** Dead fodder is replaced immediately from remaining budget. The wave stays dense until the budget is nearly spent, then thins out as threats are cleared.

### Side Objectives (Engagement Hooks)

Side objectives activate **during** waves. On a compact map with constant combat, objectives are concurrent challenges, not separate activities.

**Objective types:**
- **Defend:** Protect a location or NPC for N seconds while fighting the current wave
- **Rescue:** Fight through to a captive NPC — the wave's threats may be clustered around them
- **Destroy:** Blow up an enemy cache / barricade (creates an explosion that chain-kills nearby fodder — satisfying)
- **Bounty:** A named elite threat appears mid-wave — killing them drops a guaranteed rare upgrade
- **Timed kill streak:** "Kill 15 enemies in 10 seconds" — naturally completable during heavy fodder moments, rewards aggression

**Why objectives are addictive:**
1. They create **micro-goals** completable mid-combat (dopamine hits without interrupting flow)
2. They pull the player across the map, preventing camping
3. They offer **risk/reward decisions** — "Do I push toward the bounty while managing 3 other threats?"
4. Destroying objectives can chain-kill fodder — satisfying emergent combos
5. They give the player **agency** in an otherwise Director-driven experience

**Objective activation:** 1-2 objectives per stage, activated during specific waves. Objectives that spawn new threats mid-wave are the most exciting — the player must decide whether to engage the bounty now or clear the current threats first.

### The Addiction Loop

What makes the player unable to stop playing?

```
Stage Flow:

  Enemies appear → Mow fodder (AoE dopamine) while focusing threats (skill)
       ↓                                              ↓
  Kill streak feels amazing                Threat kill feels earned
       ↓                                              ↓
  Loot drops from everything              Upgrades make BOTH layers more fun
       ↓                                              ↓
  Stage escalates → Boss event → Dramatic climax → Next stage, new enemies
       ↓
  "Just one more stage"
```

**Key engagement drivers:**

1. **Constant dual-reward stream.** Every second the player is getting two kinds of satisfaction: the popcorn pleasure of fodder kills (rapid, effortless, loot everywhere) and the earned satisfaction of threat kills (focused, skillful, meaningful). Neither gets boring because the other keeps it fresh. This is strictly more engaging than alternating modes — you're never in a "wrong" state.

2. **Variable ratio reinforcement at high frequency.** Every kill has a chance to drop health, currency, or a rare upgrade. With fodder dying at 2-3/second, that's 2-3 lottery pulls per second. During dense waves the player is pulling the slot machine lever constantly. The rare upgrade drop during a chaotic moment hits harder because the player wasn't focused on it — it's a genuine surprise.

3. **AoE upgrade payoff.** When the player picks up an AoE weapon or ability, the next wave's fodder exists to make them feel like a god. The upgrade's value is immediately demonstrated by 10 enemies dying at once. This creates an instant "that was worth it" feedback loop that makes every upgrade exciting.

4. **Power fantasy escalation.** By wave 3-4, the player has accumulated pickups and upgrades. The same wave that would have been hard at the start is now a murder spree. But the threats have escalated too — so there's still skill challenge. The player feels powerful AND tested simultaneously. This is the sweet spot.

5. **Near-miss psychology.** Dying with 1 threat left in wave 4 — screen full of fodder, health bar crashed by a Charger you didn't see coming — is devastating in the best way. "I almost had it. One more run." Visible wave progress makes every death feel close to victory.

6. **Kill combo feedback.** Rapid fodder kills chain — combo counter, escalating screen shake, pitch-rising sound effects, larger loot drops at higher combos. The player optimizes their movement to maintain combo while handling threats. AoE becomes a combo tool, not just a damage tool.

7. **Boss anticipation.** The boss event is teased throughout (train whistle, wanted posters, thunder). The final wave before the boss is the hardest blend — peak fodder AND peak threats. Beating it earns the showdown.

8. **Sunk cost momentum.** Each stage builds power. Dying wastes the investment. "Just one more stage."

9. **Session time deception.** A stage takes 3-5 minutes. That's "just one more." Five stages later, 20 minutes have passed. The compact stage length makes each commitment feel small.

### Pacing Targets

| Metric | Target |
|--------|--------|
| Stage duration (full clear) | 3-5 minutes |
| Wave 1 start delay | 5-10 seconds (orient + grab nearby pickup) |
| Wave duration | 30-50 seconds |
| Breather between waves | 5-8 seconds (just long enough to grab drops) |
| Side objective duration | 15-30 seconds (concurrent with waves) |
| Boss event duration | 60-90 seconds |
| Full run (4-5 stages) | 20-30 minutes |

**Pacing curve within a stage:**
```
Intensity
    ▲
    │                         ████
    │                  ┌───┐  █  █
    │           ┌───┐  │   │  █  █
    │    ┌───┐  │   │  │   │  █  █
    │    │   │  │   │  │   │  █  █
    │────┘   └──┘   └──┘   └──█  █
    │                         █  █
    └──────────────────────────────► Time
      W1    W2    W3    W4   BOSS
```

Each wave is higher than the last. Breathers are brief dips, not valleys. The trend is relentlessly upward. The boss is the peak.

**The curve should feel like a spaghetti western shootout:** it starts and never really stops — just keeps escalating until the climax.

### Difficulty Scaling Levers

Use multiple independent levers that the player can opt into (like Hades' Pact of Punishment):

| Lever | What It Scales | Keeps Readable? |
|-------|---------------|-----------------|
| **Shorter telegraphs** | Threat reaction time | Yes — same enemy count |
| **Faster bullets** | Dodge difficulty (both tiers) | Yes — same visual density |
| **Denser fodder** | Fodder count + bullet volume | Somewhat — more chaos |
| **More threats per wave** | Attention splitting | Yes — same fodder, harder focus |
| **Elite variants** | Threat durability + abilities | Yes — same count, tougher |
| **Harder compositions** | Threat archetype synergies | Yes — smarter combos |
| **Shorter breathers** | Recovery time between waves | Yes — pacing pressure |
| **Promoted fodder** | Grunts gain threat-tier behaviors | Challenging — blurs the tiers |

**The best scaling lever: "More threats per wave."** Adding 1-2 extra threats to each wave forces harder triage decisions without increasing visual noise. The fodder is the same, but now you're juggling 4 priority targets instead of 2. This scales the skill ceiling cleanly.

**The scariest scaling lever: "Promoted fodder."** At high difficulty, some Grunts get threat-tier telegraphed attacks. Now the fodder layer isn't safe to ignore. The player can't just AoE mindlessly — they have to watch for promoted enemies in the horde. This is where the game reaches its highest skill ceiling.

### Multiplayer Considerations

When the server runs this system:

- **Same Director-Wave system** runs in shared package — deterministic, authoritative
- **Enemy spawning** is event-driven: server calls `spawnEnemy` prefab, emits `SpawnEnemy { id, archetype, posQ, seed }` to clients
- **Budget scales with player count:** fodder budget `× 1 + 0.3 × (playerCount - 1)`, threat budget `× 1 + 0.5 × (playerCount - 1)` (more threats because multiple players can split focus)
- **Attack tokens** scale: `maxAttackTokens = 2 + playerCount` (threats only)
- **Spawn positioning** considers all player positions — spawns bias toward the **centroid** of all players but with flanking variance
- **Wave clear** is authoritative: server determines when all threats are dead and fodder budget is spent
- **Side objectives** are server-authoritative: server picks which objectives activate, tracks completion
- **Zone tracking** per player: the Director distributes spawns to keep all players engaged (prevents one player tanking everything)
- **Bullet density scaling in MP:** Total projectile cap scales with player count (`80 + 20 × playerCount`). More players can handle more visual noise.

### What to Skip for Now

These systems add value but aren't needed for the initial implementation:

- **Full AI Director (RoR2-style)** — The wave-based Director hybrid is simpler and gives enough variety. A pure credit-over-time Director can be explored later.
- **Dynamic difficulty adjustment** — Player-chosen difficulty (like Hades' Heat) is more transparent and better received than invisible adaptation.
- **Combo system** — Kill combo counter and escalating rewards are a polish feature. Get the core loop feeling right first.
- **Procedural map generation** — Start with hand-designed maps. Procedural layouts can come later as a content multiplier.
- **Seeded deterministic spawning** — Needed for replays and competitive multiplayer, but can be added without changing the encounter structure

---

## References

### Developer Talks and Interviews

- [Replayability in Left 4 Dead (GDC)](https://gdcvault.com/play/1014305/Replayability-in-Left-4) — Michael Booth on the AI Director
- [Performative Game Development: Nuclear Throne (GDC)](https://gdcvault.com/play/1020034/Performative-Game-Development-The-Design) — Vlambeer on public development
- [Breathing Life into Greek Myth (GDC)](https://gdcvault.com/play/1027149/Breathing-Life-into-Greek-Myth) — Supergiant on Hades design
- [Q&A: The guns and dungeons of Enter the Gungeon](https://www.gamedeveloper.com/design/q-a-the-guns-and-dungeons-of-i-enter-the-gungeon-i-) — Dodge Roll on room design

### Wiki and Technical Documentation

- [Hades: Chambers and Encounters](https://hades.fandom.com/wiki/Chambers_and_Encounters)
- [Hades: Pact of Punishment](https://hades.fandom.com/wiki/Pact_of_Punishment)
- [Enter the Gungeon: Curse](https://enterthegungeon.wiki.gg/wiki/Curse)
- [Dungeon Generation in Enter the Gungeon](https://www.boristhebrave.com/2019/07/28/dungeon-generation-in-enter-the-gungeon/) — Boris the Brave technical analysis
- [Risk of Rain 2: Directors](https://riskofrain2.fandom.com/wiki/Directors)
- [Risk of Rain 2: Difficulty](https://riskofrain2.fandom.com/wiki/Difficulty)
- [Nuclear Throne: Enemies](https://nuclear-throne.fandom.com/wiki/Enemies)
- [Nuclear Throne: Areas](https://nuclear-throne.fandom.com/wiki/Areas)

### Game Design Theory

- [The Art and Science of Pacing Combat Encounters](https://www.gamedeveloper.com/design/the-art-and-science-of-pacing-and-sequencing-combat-encounters)
- [Pacing — The Level Design Book](https://book.leveldesignbook.com/process/preproduction/pacing)
- [Encounter Design — The Level Design Book](https://book.leveldesignbook.com/process/combat/encounter)
- [Cognitive Flow: The Psychology of Great Game Design](https://www.gamedeveloper.com/design/cognitive-flow-the-psychology-of-great-game-design)
- [Reward Schedules and When to Use Them](https://www.gamedeveloper.com/business/reward-schedules-and-when-to-use-them)
- [The Incredible Power of Dijkstra Maps](https://www.roguebasin.com/index.php/The_Incredible_Power_of_Dijkstra_Maps)

### Modding and Data Sources

- [Hades EncounterBalancer mod (GitHub)](https://github.com/cgullsHadesMods/hades-EncounterBalancer) — reveals encounter data structures
- [Hades SpawnPositionSelector mod (GitHub)](https://github.com/parasHadesMods/SpawnPositionSelector) — reveals spawn point system
- [NTT Scripting Cheat Sheet (Nuclear Throne)](https://yal.cc/r/17/ntt/gml/) — reveals enemy spawning functions
- [RoR2 Difficulty Math Breakdown (Steam Guide)](https://steamcommunity.com/sharedfiles/filedetails/?id=2200625979)
