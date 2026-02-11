# Stage Objectives Design

How side objectives create the difference between success and soft failure. A taxonomy of objective types, Western-themed examples, construction rules, and implementation guidance.

See also: [Procedural Narrative](./procedural-narrative.md), [Boss Design Research](../research/boss-design.md), [Enemy AI](./enemy-ai.md)

---

## Table of Contents

1. [The Problem](#1-the-problem)
2. [Design Rules](#2-design-rules)
3. [Objective Types](#3-objective-types)
4. [Western Scenarios](#4-western-scenarios)
5. [Construction Grammar](#5-construction-grammar)
6. [Communicating Objectives to the Player](#6-communicating-objectives-to-the-player)
7. [Reward Structure](#7-reward-structure)
8. [Bonus Objectives](#8-bonus-objectives)
9. [Objective Pools per Act](#9-objective-pools-per-act)
10. [Implementation Notes](#10-implementation-notes)

---

## 1. The Problem

The procedural narrative system defines three outcomes per stage: success, soft failure, and hard failure. Hard failure is death — that's simple. But the distinction between success and soft failure needs more than "deal enough damage before the timer runs out."

If every side objective is a damage gate (hurt this target before X), the narrative branching feels mechanical rather than dramatic. Runs that diverge on a soft failure should feel like "the situation got away from me in an interesting way" — not "I didn't DPS fast enough."

We need a **vocabulary of objective types** so that each stage's success/soft failure condition feels different. A town defense encounter should feel different from a pursuit, which should feel different from a rescue, which should feel different from a showdown.

### Lessons from Other Games

The best side objective systems share common traits:

**Into the Breach** layers 3-4 simultaneous objectives (survive, protect buildings, bonus goals, keep mechs alive) and works because the player has complete information and can triage. Every turn is a priority decision.

**RoR2's teleporter holdout** works because it asks you to fight in a specific area, not to stop fighting. It aligns with the core loop rather than contradicting it.

**Gungeon's Master Rounds** (flawless boss kills) work because they're simple to understand, require no extra UI, and the reward is proportional to the difficulty.

**FTL's fleeing ships** work because the charging bar is visible and the player has multiple ways to prevent escape (target engines, board the ship, use ion weapons). The objective creates tactical variety, not just speed pressure.

**Dead Cells' cursed chests** work because the cost and reward are both clear and immediate. The player opts in with full information.

What fails across games:

- **Escort NPCs with bad pathfinding** — universally hated
- **Hidden timers** — if the player doesn't know how long they have, time pressure feels random
- **Objectives that contradict the core loop** — a movement-based game shouldn't ask you to stand still
- **Too many simultaneous real-time objectives** — 2 is ideal, 3 is the maximum for an action game (Into the Breach can do 4 because it's turn-based)

---

## 2. Design Rules

### Rule 1: The Side Objective Must Be Readable in 2 Seconds

The player should understand what they need to protect/prevent/chase/collect the instant it appears. This means:

- Distinct visual language (glowing NPC, red dynamite, fleeing enemy with a sack)
- No text required to understand the objective (text can elaborate, but the visual tells the story)
- The objective entity behaves in a way that communicates its role (the hostage cowers, the dynamite carrier runs toward the building, the fleeing boss moves toward the exit)

### Rule 2: The Side Objective Must Complement the Core Loop

High Noon's core loop is: move, dodge, shoot. Every side objective must be achievable through some combination of these actions. Never ask the player to stop doing the fun thing.

| Good                                                 | Bad                                            |
| ---------------------------------------------------- | ---------------------------------------------- |
| Shoot dynamite carriers before they reach the bridge | Stand still on a pressure plate for 10 seconds |
| Kill the fleeing boss before it reaches the exit     | Navigate a menu to defuse a bomb               |
| Protect the NPC by killing enemies near them         | Escort a slow NPC through the entire level     |
| Collect dropped loot bags between combat waves       | Backtrack through already-cleared areas        |

### Rule 3: Soft Failure Must Feel Like a Story, Not a Punishment

The player should think "the story went sideways" rather than "I wasn't good enough." This means:

- Soft failure consequences are **narrative** (the mayor was kidnapped, the bridge was destroyed, the villain escaped) not **mechanical penalties** (you lose 20% max HP)
- The soft failure path should be **interesting**, not strictly worse. A rescue mission through the forest is different from a pursuit through the canyon — not harder, just different
- Soft failure should be **clearly telegraphed** before it happens. The player sees the dynamite carrier running, sees the boss heading for the exit, sees the hostage's health dropping. They made a choice about priorities, not a mistake about mechanics

### Rule 4: One Primary + One Side Objective per Stage

The primary objective is always "survive / kill the boss." The side objective is what distinguishes success from soft failure. One side objective per stage is the right number for a real-time action game. Two simultaneous side objectives is the absolute maximum and should be reserved for climactic Act III encounters.

### Rule 5: The Side Objective Should Create a Dilemma, Not Extra Work

The best side objectives force a **priority decision**: do I chase the boss or save the hostages? Do I kill the dynamite carrier or the elite enemy shooting at me? The player can't do both at once. They must choose.

If the side objective can be completed while doing the primary objective with no tradeoff, it's not creating interesting gameplay. If it requires completely ignoring the primary objective, it's contradicting the core loop. The sweet spot: the side objective pulls the player's attention in a different direction for 5-15 seconds at a time.

---

## 3. Objective Types

### Type 1: Protect

**Core mechanic:** An entity (NPC, building, object) has a health bar. Enemies attack it. If it's destroyed/killed, soft failure triggers.

**Why it's fun:** Creates triage decisions. When a dynamite carrier runs toward the building AND an elite is attacking you, which do you deal with first? The protect objective pulls you out of pure combat optimization into spatial awareness.

**Key design concerns:**

- The protected entity must be **visible and stationary** (or slow-moving). Escort missions where the NPC walks into danger are universally hated
- The entity's HP must be **generous enough** that the player doesn't feel like they're babysitting. A few hits should be survivable. A sustained assault should be the threat
- Enemies should **telegraph** when they're targeting the protected entity (different color indicator, path lines, audio cue)
- The protected entity should provide a **benefit** to the player while alive (healing zone, cover, buff aura) so protecting it feels like protecting your own advantage, not a chore

**Reference games:** Into the Breach (buildings), FTL (ship systems), Cult of the Lamb (followers in cages)

### Type 2: Intercept

**Core mechanic:** Enemies are trying to reach a location or escape the arena. The player must kill/stop them before they arrive/leave. The enemies prioritize their goal over fighting the player.

**Why it's fun:** Creates a target priority puzzle. The interceptable enemies are usually weaker than combat enemies but more urgent. Do you kill the tough elite shooting you, or sprint across the arena to catch the carrier before it reaches the bridge? Intercept objectives reward spatial awareness and quick decision-making.

**Key design concerns:**

- The interceptable enemy must be **visually distinct** (carrying something, glowing, moving differently)
- Their path must be **predictable** (they run in a straight line toward their goal, they don't dodge)
- The player must have time to react — the enemy should be visible for at least 2-3 seconds before reaching its goal
- Multiple interceptable enemies should come **sequentially**, not simultaneously (the player can handle one at a time; 3 at once from different directions is frustrating in a real-time game)

**Subtypes:**

- **Dynamite carrier** — enemy runs toward a structure and plants a charge
- **Fleeing boss** — the boss runs toward an exit during or after the fight
- **Signal runner** — enemy trying to reach a bell/fire to call reinforcements
- **Looter** — enemy grabbing items and trying to escape with them

**Reference games:** FTL (fleeing ships with charging FTL bar), Dead Cells (fleeing elites), Into the Breach (emerging Vek)

### Type 3: Holdout

**Core mechanic:** The player must remain within a defined area while fighting enemies that try to push them out or overwhelm them. Leaving the zone pauses progress toward the objective.

**Why it's fun:** Constrains the player's usual movement freedom, creating pressure. High Noon's core movement is about fluid repositioning — forcing the player to fight within a zone inverts that, testing whether they can dodge and shoot in a confined space. The zone also creates a natural focal point for combat.

**Key design concerns:**

- The zone must be **large enough** to allow dodging. A zone smaller than 3x the player's roll distance feels punishing
- Zone boundaries should be **soft** (leaving pauses progress) not **hard** (leaving damages you). Hard boundaries in a twitchy game feel unfair when a dodge roll carries you out
- The progress meter should be **clearly visible** — a fill bar attached to the zone or on the HUD
- Enemies from outside the zone should be a mix of ranged (shooting in) and melee (rushing in). Pure ranged enemies outside the zone would force the player to leave to fight them

**Reference games:** RoR2 (teleporter holdout — charge bar only fills while inside the sphere)

### Type 4: Retrieve

**Core mechanic:** Items are scattered across the arena (or drop from specific enemies). The player must collect them. Uncollected items may be lost (picked up by other enemies, destroyed by fire, etc.).

**Why it's fun:** Adds a movement puzzle to combat. The player must plan a route through the arena that lets them fight efficiently AND collect items. Items near dangerous enemy positions create risk/reward microdecisions.

**Key design concerns:**

- Items must be **visually prominent** (glow, particle effect, distinct color)
- Items should not require precise clicking — walk-over pickup with a generous radius
- The collection threshold for success should be **partial** (collect 4 of 6 for success, not all 6). All-or-nothing collection objectives in a chaotic game feel punishing
- Items should persist long enough that the player can prioritize combat first and collect after, unless the narrative specifically calls for urgency (items being destroyed/stolen)

**Subtypes:**

- **Scattered loot** — explosion or event scatters items across the arena, player collects
- **Enemy drops** — specific enemies carry items that drop when killed
- **Environmental finds** — items in destructible containers or hidden spots
- **Documents/evidence** — a variant where the items provide narrative benefit (intel on the next stage)

**Reference games:** RoR2 (item pickups during teleporter event), Gungeon (rat thief hoard)

### Type 5: Defuse

**Core mechanic:** An environmental threat is counting down or spreading. The player must interact with it (shoot it, stand near it, activate something) to neutralize it while also fighting enemies.

**Why it's fun:** Creates micro-interruptions in the combat flow. The player fights, then must break away for 2-3 seconds to deal with the threat, then re-engages combat. The rhythm alternates between offense and crisis management.

**Key design concerns:**

- The defuse action should be **quick** (1-3 seconds of interaction or a single well-aimed shot). Long channel times in a bullet-hell game are miserable
- The threat should have **clear visual progression** (fire spreading tile by tile, fuse burning shorter, timer counting down)
- Multiple defuse points should be **spaced across the arena** so the player moves through the space rather than camping one spot
- Failing one defuse point should not immediately trigger soft failure — partial success should be possible (2 of 3 charges defused = structure is damaged but standing)

**Subtypes:**

- **Fire suppression** — fire spreads across flammable structures. Player shoots water barrels to extinguish, or interacts with a well/pump
- **Bomb defusal** — planted charges with visible fuse timers. Player stands near them briefly to defuse, or shoots the fuse
- **Corruption spread** — supernatural hazard expanding across the arena. Player destroys source totems/nodes while fighting
- **Structural collapse** — support beams taking damage. Player kills enemies attacking the beams, or props up weakened sections

**Reference games:** Dead Cells (timed switches), FTL (fire/breach management)

### Type 6: Race

**Core mechanic:** The player and an enemy (or environmental hazard) are both moving toward the same goal. The player must arrive first or outpace the threat.

**Why it's fun:** Creates forward momentum and urgency. Instead of the typical "clear the room" loop, the player is pushing through enemies toward a destination. Fights become obstacles to push past rather than encounters to savor.

**Key design concerns:**

- The race should have **visible progress** — the enemy/hazard's position relative to the goal is always clear
- The player should be able to **influence the race** beyond just moving fast — kill enemies that are blocking your path, shoot the fleeing boss to slow them, destroy obstacles
- The race should not be so tight that the player can't fight at all. The tension is between fighting efficiently and moving quickly — not between fighting and not fighting
- The destination should be visible from the start so the player can plan their route

**Subtypes:**

- **Pursuit** — boss or VIP flees toward an exit, player chases
- **Parallel race** — two paths toward the same goal, player on one, enemy on the other
- **Advancing hazard** — fire, flood, or collapse advancing from behind while the player fights forward
- **Deadline arrival** — reach a location before a timed event (execution, train departure, bridge demolition)

**Reference games:** Dead Cells (timed doors), FTL (rebel fleet as strategic race)

---

## 4. Western Scenarios

Each scenario maps a Western trope to a specific objective type, with concrete gameplay details.

### Scenario 1: "Save the Mayor" (Protect)

**Western trope:** Hostage rescue during a raid.

**Setup:** The town is under attack. The mayor is barricaded in the town hall. Raiders are trying to break in. The mayor's door has a health bar.

**Gameplay:**

- Primary objective: Kill the boss (raid champion) in the town square
- Side objective: Prevent raiders from breaking down the town hall door
- Raiders spawn from the edges and split — some attack the player, some run to the door and start bashing it
- The door has enough HP to survive ~4 hits. A raider bashing the door telegraphs with a wind-up animation (0.5s), giving the player time to shoot them
- If the door is broken, the mayor is kidnapped and dragged toward the edge of the map. The player has 10 seconds to kill the kidnapper before they escape. If they escape: soft failure

**Why it works:** The raiders attacking the door are weaker than combat enemies but more urgent. The player constantly triages between the boss fight and door defense. The 10-second kidnapper window creates a dramatic "last chance" moment.

### Scenario 2: "The Bridge Must Hold" (Defuse)

**Western trope:** Preventing dynamite from destroying critical infrastructure.

**Setup:** A bridge connects the town to the only escape route. Enemies are planting dynamite charges on the bridge supports.

**Gameplay:**

- Primary objective: Survive all waves
- Side objective: Prevent 3 bridge supports from being destroyed
- Dynamite carriers spawn every 30-40 seconds. They are visually distinct (carrying a red barrel) and move toward the nearest intact support
- When they reach a support, they start a 5-second plant animation. The fuse is visible (a red glow counting down). The player can:
  - Kill the carrier before they reach the support (barrel drops harmlessly)
  - Shoot the carrier during plant (barrel explodes, damaging the support but not destroying it)
  - Shoot the planted charge's fuse directly (defuses it — requires aim precision)
  - Ignore it (support destroyed)
- If 2+ supports are destroyed: soft failure (bridge is impassable, next stage changes to an alternate route)
- If 1 support is destroyed: success, but the bridge is weakened (environmental note in next stage)

**Why it works:** Multiple valid responses to each dynamite carrier (kill early, snipe the fuse, let one go and save another). The carriers arriving sequentially creates a rhythm of urgency pulses within the broader combat flow.

### Scenario 3: "The Villain Escapes" (Intercept + Race)

**Western trope:** The villain flees while their minions cover the retreat.

**Setup:** The boss fight is a gang leader. At 33% HP, they break off and run toward the edge of the arena where a horse is waiting.

**Gameplay:**

- Primary objective: Kill the gang leader
- Side objective: Kill the gang leader before they reach their horse
- At 33% HP, the gang leader starts fleeing. They move at 80% player speed. Their remaining minions become more aggressive, actively blocking the player's path
- The fleeing boss drops loot or narrative items as they run (a trail of coins, a dropped letter). These are collectible but optional — pursuing them slows the player
- If the boss reaches the horse: soft failure (they escape, reappearing as a harder encounter in the next stage)
- If the boss is killed mid-flee: success + bonus loot from the dropped trail

**Why it works:** The minions actively blocking creates a dilemma — fight through them or dodge past them. The dropped loot trail is a temptation that tests greed vs. urgency. The boss being slower than the player means success is always possible — the question is whether the minions slow you enough.

### Scenario 4: "Hold the Jail" (Holdout)

**Western trope:** Defending a position until reinforcements arrive (Rio Bravo).

**Setup:** The player is holed up in the sheriff's office. A prisoner inside is the target — the gang wants them freed. Marshals are coming but won't arrive until the holdout timer fills.

**Gameplay:**

- Primary objective: Survive until the marshals arrive
- Side objective: Keep the prisoner locked up (the jail door has HP; if breached, the prisoner escapes = soft failure)
- A holdout zone encompasses the jail building. The reinforcement timer only fills while the player is inside the zone
- Enemies approach from all directions. Some attack the player, some attack the building walls (creating new entry points), some target the jail door specifically
- Between waves: brief respite to heal, pick up ammo drops, repair barricades by standing near broken walls (1-2 second interaction)
- The zone is generous (the whole building + front porch area) so the player isn't pinned in a closet
- If the player must leave the zone to chase a flanking enemy, the timer pauses (soft penalty, not failure)

**Why it works:** The holdout zone aligns with the Western fantasy of "holding the fort." The timer pausing when you leave (rather than failing) means quick sorties to deal with flankers are viable but costly. Barricade repair between waves gives the player agency over the environment.

### Scenario 5: "The Burning Town" (Defuse + Protect)

**Western trope:** Fighting while putting out fires during a raid.

**Setup:** Raiders have set the town on fire. Civilians are trapped in burning buildings. The fire is spreading.

**Gameplay:**

- Primary objective: Kill the raid boss
- Side objective: Prevent fire from reaching the church (where most civilians are sheltering)
- Fire spreads from building to building every 15-20 seconds along connected structures. It follows a visible path (rooflines, wooden walkways)
- Water troughs are scattered around town. The player can shoot a water trough to release water, extinguishing fire on adjacent tiles. Each trough has 2-3 uses
- Alternatively, the player can destroy connecting structures (shoot a wooden bridge between buildings) to create a firebreak. This removes cover but stops the spread
- If fire reaches the church: soft failure (civilians flee into the streets and some die)
- The fire is also a hazard for the player and enemies — standing in burning tiles deals damage

**Why it works:** Two ways to deal with the fire (water troughs or firebreaks) creates interesting choices. Destroying connections to stop fire also removes cover the player might need. The fire is a shared hazard affecting enemies too, so strategic arson is sometimes viable — let a building burn to kill enemies inside it.

### Scenario 6: "Stolen Goods" (Retrieve)

**Western trope:** Recovering stolen loot during or after a heist gone wrong.

**Setup:** An explosion has scattered gold bags across the arena. Looter enemies are trying to grab them and escape.

**Gameplay:**

- Primary objective: Survive all waves
- Side objective: Recover at least 4 of 6 gold bags
- Gold bags are scattered at fixed positions when the encounter starts. They glow and are visible through walls
- Looter enemies (distinct: carrying empty sacks, moving fast, low HP) spawn periodically and beeline for uncollected bags. If a looter reaches a bag, they grab it and run toward the exit
- Killing a looter who has a bag drops it. Killing a looter before they grab a bag is efficient but requires reading their pathing
- The player can also just walk over bags to collect them proactively
- If fewer than 4 bags are recovered: soft failure (reduced resources in the next stage)
- Bags collected beyond 4 provide bonus gold

**Why it works:** The looters create an intercept puzzle layered on normal combat. Proactive collection (grab bags early before looters arrive) trades combat attention for objective safety. The 4/6 threshold means partial success is possible — the player doesn't need perfection.

### Scenario 7: "The Mine is Collapsing" (Race + Defuse)

**Western trope:** Escaping a mine disaster while rescuing trapped miners.

**Setup:** Sabotage has triggered a cave-in. The mine is collapsing from the back toward the entrance. Miners are trapped in side chambers.

**Gameplay:**

- Primary objective: Reach the mine exit before the collapse catches you
- Side objective: Free trapped miners from side chambers along the route
- The collapse advances from the rear of the map at a steady pace (visible dust cloud, falling rocks). Sections behind the collapse line are destroyed and impassable
- Miners are in cages/rubble in side chambers branching off the main tunnel. Freeing them requires a brief interaction (1-2 seconds). Freed miners run toward the exit on their own (they don't need escort)
- Enemies (corrupted miners, mine creatures) block the main path. Fighting them efficiently is essential — dawdling means the collapse catches up
- If you exit without freeing any miners: success (you survived) but feels like a hollow victory
- If you free 2+ of 3 miners: full success
- If you free 1 or 0: soft failure (miners lost, narrative consequence)
- The collapse cannot kill the player directly (it pushes them forward with increasing speed) but traps them if they're in a dead-end side chamber when it arrives

**Why it works:** The advancing hazard creates constant forward pressure. Side chambers are risk/reward detours — each one costs time but saves a life. The collapse pushing rather than killing prevents feel-bad instant deaths while maintaining urgency.

### Scenario 8: "The Quick-Draw Signal" (Intercept)

**Western trope:** Preventing an alarm that calls reinforcements.

**Setup:** During a camp assault, enemies try to ring a bell / light a signal fire to call reinforcements.

**Gameplay:**

- Primary objective: Kill all enemies in the camp
- Side objective: Prevent enemies from reaching the signal post (a bell on a raised platform at one edge of the arena)
- When the encounter starts, 1-2 enemies immediately break for the signal. They are fast but fragile (2 HP)
- If the signal is rung: a large reinforcement wave spawns (soft failure — you still have to fight them, making the encounter significantly harder, and the next stage is altered because the enemy was warned)
- The signal runners use the most direct path and don't dodge, making them easy to hit IF you notice them. They're a priority awareness check
- The signal post can be destroyed preemptively if the player spots it early and shoots it. Destroying it before any runner reaches it eliminates the side objective entirely (it auto-succeeds)

**Why it works:** The objective is binary and fast — either you catch the runners or you don't. But the time window is tight enough (3-5 seconds from spawn to signal) that it tests awareness, not grinding. The preemptive destruction option rewards observant players.

---

## 5. Construction Grammar

### How to Build a Stage Objective

Every stage objective is assembled from three components:

```
OBJECTIVE = PRIMARY + SIDE + CONDITION
```

**Primary:** Always "survive waves" or "defeat the boss." This never changes. The player always needs to fight.

**Side:** One objective type from Section 3 (Protect, Intercept, Holdout, Retrieve, Defuse, Race). This defines what distinguishes success from soft failure.

**Condition:** The specific Western-themed instantiation. "Protect the mayor" is a Protect objective themed as a hostage. "Stop the dynamite" is an Intercept objective themed as frontier demolition.

### Compatibility Matrix

Not every objective type works equally well at every point in the run:

| Objective Type | Act I (Setup)                | Act II (Chase) | Act III (Showdown)             | Boss Encounter                           |
| -------------- | ---------------------------- | -------------- | ------------------------------ | ---------------------------------------- |
| **Protect**    | Strong                       | OK             | Weak (focus should be on boss) | OK (protect NPC during boss)             |
| **Intercept**  | Strong                       | Strong         | Strong                         | Strong (boss fleeing at low HP)          |
| **Holdout**    | OK                           | OK             | Strong (last stand)            | Weak (contradicts boss mobility)         |
| **Retrieve**   | Strong                       | OK             | Weak                           | Weak                                     |
| **Defuse**     | Strong                       | Strong         | OK                             | OK (boss triggers environmental threats) |
| **Race**       | Weak (too early for urgency) | Strong         | Strong                         | OK                                       |

### Pairing Objective Types with Plot Threads

Each plot thread from procedural-narrative.md has natural objective affinities:

| Plot Thread        | Natural Objectives         | Why                                                                                        |
| ------------------ | -------------------------- | ------------------------------------------------------------------------------------------ |
| **The Raid**       | Protect, Defuse, Intercept | Defending a town involves protecting things, stopping demolition, catching fleeing enemies |
| **The Stranger**   | Intercept, Race            | The stranger flees, the mystery requires pursuit                                           |
| **The Corruption** | Defuse, Protect            | Corruption spreads (defuse), innocent NPCs are at risk (protect)                           |
| **The Heist**      | Retrieve, Race, Holdout    | Grabbing loot, escaping before alarms, cracking a vault (holdout)                          |
| **The Bounty**     | Intercept, Race            | Chasing a target, preventing escape                                                        |

### Objective Escalation Across Acts

The same objective type should escalate across acts, not repeat identically:

**Act I — Introduction:** The objective is straightforward. One entity to protect, one dynamite carrier to intercept, one fire to put out. The player learns the mechanic.

**Act II — Complication:** The objective has a twist. The entity you're protecting is also being targeted by a new enemy type. The dynamite carriers now come from two directions. The fire is spreading faster because the environment is drier.

**Act III — Culmination:** The objective integrates with the boss fight. The boss triggers the environmental threat directly (the boss throws dynamite at the bridge, the boss sets the fire, the boss tries to flee). The side objective and the primary objective converge — dealing with the boss IS dealing with the side objective.

---

## 6. Communicating Objectives to the Player

### Visual Language

Every objective entity needs a distinct visual treatment that the player can read without UI:

| Entity Type                           | Visual Treatment                            | Player Reads As            |
| ------------------------------------- | ------------------------------------------- | -------------------------- |
| Protected NPC/building                | Blue glow / shield icon overhead            | "Keep this alive"          |
| Destructible structure (bridge, door) | HP bar visible when damaged                 | "This can break"           |
| Dynamite carrier                      | Red barrel on back, fuse glow               | "Stop this enemy"          |
| Fleeing enemy                         | Speed lines, dust trail, moves toward exit  | "Chase that one"           |
| Signal runner                         | Distinct color (yellow?), runs straight     | "Don't let them get there" |
| Collectible item                      | Gold glow, pulsing, pickup radius indicator | "Grab that"                |
| Fire / corruption                     | Red/purple tile overlay, spreading visibly  | "That's getting worse"     |
| Holdout zone                          | Circle on ground (like RoR2's teleporter)   | "Stay in here"             |
| Defuse point                          | Ticking animation, red glow intensifying    | "Interact with that"       |

### HUD Elements

Minimal HUD additions — no more than 2 objective-related elements:

1. **Side objective indicator** (top of screen): A single icon + brief text describing the current side objective. "Protect the Town Hall" with a door icon. "3/6 Gold Bags Recovered" with a bag counter. "Signal Post Intact" with a bell icon.

2. **Objective entity health bar** (world-space): A small HP bar above the protected entity, visible only when the entity has taken damage. Not visible at full HP to reduce clutter.

No minimap markers, no compass pings, no waypoint lines. The objective entities should be visible in the world. If the player can't see the objective, the arena is too big or the camera is too tight.

### Audio Cues

- **New threat to objective:** A distinct sound (bell chime, rumble, warning horn) when a dynamite carrier spawns, when fire reaches a new building, when the fleeing boss starts running
- **Objective taking damage:** A cracking/breaking sound that's distinct from player/enemy damage sounds
- **Objective failed:** A dramatic low sound (building collapsing, bell ringing, horse galloping away). This should be impactful but brief — the game continues

### The Opening Beat

When a stage begins, the 5-10 second opening beat (from procedural-narrative.md) should visually establish the side objective:

- Camera pans to show the mayor in the town hall, then the approaching raiders
- Camera shows the bridge, then the dynamite cache the enemies are loading from
- Camera shows the signal post on the hill, then the enemy camp below it

The player enters combat already knowing what they need to protect/stop/collect. No mid-fight tutorial popups.

---

## 7. Reward Structure

### Success vs. Soft Failure: Narrative, Not Mechanical

The primary difference between success and soft failure is **which stage comes next** in the branching narrative. This is the most important reward — the story changes.

Beyond the narrative branch, success should provide minor mechanical advantages that make the player feel good without making the soft failure path punishing:

| Outcome          | Narrative Effect                     | Mechanical Bonus                                                                                                 |
| ---------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Success**      | Story continues on the "golden path" | Bonus gold/XP, extra loot from the objective (rescued mayor gives a reward, recovered gold bags are actual gold) |
| **Soft Failure** | Story branches to alternate path     | Standard gold/XP for the combat itself, no bonus. Next stage may have slightly different enemy composition       |

What soft failure should **never** do:

- Reduce the player's max HP
- Remove upgrades or items
- Make the player weaker in a permanent way
- Lock content behind success-only gates

The alternate path IS the content. Soft failure opens different stages, different bosses, different arenas. It's not a penalty — it's variety.

### Per-Objective-Type Rewards

| Objective Type | Success Bonus                                                      | Soft Failure Consequence                                                            |
| -------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **Protect**    | The protected NPC gives a reward (item, gold, information)         | NPC is captured/killed — different next stage, NPC absent from future camp visits   |
| **Intercept**  | Enemy drops loot, structural integrity maintained                  | Structure damaged/destroyed — route changes, boss escapes and returns stronger      |
| **Holdout**    | Reinforcements arrive and help clear remaining enemies             | Position overrun — retreat, different tactical situation in next stage              |
| **Retrieve**   | Collected items provide gold and narrative intel                   | Lost items mean reduced resources, missing intel means harder next stage navigation |
| **Defuse**     | Environment intact, providing cover/paths in subsequent encounters | Partial destruction — arena layout changes, hazard zones persist                    |
| **Race**       | Arrive first, gaining tactical advantage                           | Arrive second — enemy is prepared, harder next encounter setup                      |

---

## 8. Bonus Objectives

### The Third Layer: Optional Mastery

Beyond success/soft failure, some stages can have a **bonus objective** — a harder challenge that rewards skilled play without being required for any narrative outcome.

Bonus objectives are inspired by:

- **Gungeon's Master Rounds** (no-hit boss kill = extra HP)
- **Hades' Erebus Gates** (no-damage clear = boosted reward)
- **Dead Cells' timed doors** (speed clear = bonus loot)
- **Hades' Thanatos competition** (out-kill a rival = bonus health)

### Bonus Objective Types

**Flawless Stage:** Complete the stage without taking damage. Reward: bonus upgrade point or rare item. This is always available — no special trigger needed. It's a standing challenge that skilled players can always pursue.

**Speed Clear:** Complete the stage under a time threshold. Reward: bonus gold. The timer is visible but not intrusive — a small clock in the corner. The threshold is generous (most competent play achieves it; only exploration/dawdling misses it).

**Style Kill:** Achieve a certain number of kills with a specific mechanic (6 roll-through kills, 4 showdown kills, 3 environmental kills). Reward: bonus XP. The counter is visible when progress is made. This encourages varied play rather than optimal DPS.

**Full Completion:** Achieve the side objective with no partial losses (all hostages saved, all bags collected, zero structural damage). Reward: narrative bonus (NPC gives extra dialogue revealing info about a future stage, or an extra camp visitor appears).

### Bonus Objective Rules

- Bonus objectives are **never required** for success or narrative progression
- They are **silent** — no popup announces them. The player discovers them naturally (sees the timer, realizes they haven't been hit, notices the kill counter)
- Rewards are meaningful but not build-defining. Missing them should never feel bad
- Only 1 bonus objective per stage. It's a cherry on top, not another plate to spin

---

## 9. Objective Pools per Act

### How Objectives Are Assigned

Each stage in a run draws its side objective from a pool defined by the plot thread and act. The pool is curated, not random — every entry is authored to fit the narrative context.

### Act I Pools (The Setup)

Act I objectives establish the story and are relatively simple:

| Plot Thread        | Objective Pool                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| **The Raid**       | Protect (mayor in town hall), Defuse (fire spreading in town), Intercept (raiders stealing supplies) |
| **The Stranger**   | Intercept (stranger fleeing after confrontation), Retrieve (stranger dropped a clue item)            |
| **The Corruption** | Defuse (corruption spreading through mine), Protect (miners trapped in side chamber)                 |
| **The Heist**      | Intercept (alarm runners), Holdout (crack the vault while defending)                                 |
| **The Bounty**     | Intercept (bounty target fleeing), Retrieve (bounty's ledger before it burns)                        |

### Act II Pools (The Chase)

Act II objectives are more complex and reflect consequences from Act I:

| Plot Thread        | Success Path Objective                    | Soft Failure Path Objective                   |
| ------------------ | ----------------------------------------- | --------------------------------------------- |
| **The Raid**       | Intercept (escaping war chief in canyon)  | Protect (wounded ally during forest rescue)   |
| **The Stranger**   | Race (reach the mine before the stranger) | Defuse (stranger left traps along your path)  |
| **The Corruption** | Defuse (corruption spreading to new area) | Protect (town civilians from corruption wave) |
| **The Heist**      | Retrieve (scattered loot during getaway)  | Race (escape before lockdown)                 |
| **The Bounty**     | Race (catch the target at next location)  | Holdout (survive ambush at false lead)        |

### Act III Pools (The Showdown)

Act III objectives are integrated with the boss fight:

| Plot Thread        | Boss-Integrated Objective                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| **The Raid**       | Protect (caged mayor during boss fight) or Intercept (boss tries to flee at low HP)                         |
| **The Stranger**   | Intercept (true antagonist tries to escape during supernatural reveal) or Protect (stranger-turned-ally)    |
| **The Corruption** | Defuse (corruption nodes that heal the boss) or Race (destroy the source before corruption fills the arena) |
| **The Heist**      | Retrieve (final loot from boss's hoard) or Race (building collapsing around the fight)                      |
| **The Bounty**     | Intercept (bounty makes final escape attempt) or Holdout (final duel in shrinking arena)                    |

---

## 10. Implementation Notes

### ECS Components

Side objectives require a few new components:

```typescript
// Objective target entity marker
const ObjectiveTarget = {
  type: Uint8Array, // PROTECT, INTERCEPT_DEST, HOLDOUT_ZONE, RETRIEVE_ITEM, DEFUSE_POINT
  health: Float32Array, // For destructible targets
  maxHealth: Float32Array,
  progress: Float32Array, // For holdout zones and defuse interactions (0-1)
  failed: Uint8Array, // 0 or 1 — has this objective point been lost?
};

// Enemy behavior modifier for side objective roles
const ObjectiveRole = {
  role: Uint8Array, // ATTACKER (targets objective), RUNNER (flees to destination), CARRIER (grabs and escapes)
  targetEid: Uint16Array, // Which objective entity they're targeting
};
```

### World State

```typescript
interface ObjectiveState {
  type: "protect" | "intercept" | "holdout" | "retrieve" | "defuse" | "race";
  status: "active" | "success" | "soft_failure";
  description: string; // "Protect the Town Hall"
  progress: number; // 0-1 for holdout/retrieve; unused for others
  targetEids: number[]; // Entity IDs of objective-relevant entities
  threshold: number; // e.g., 4 of 6 bags needed for retrieve success
  collected: number; // Current count for retrieve
}
```

This lives on `world.objective` alongside `world.encounter` and `world.narrative`.

### System Integration

A new `objectiveSystem` runs after enemy AI but before health resolution:

1. **Check objective role enemies** — update their pathing to target objective entities instead of the player
2. **Check objective entity health** — if a protected entity reaches 0 HP, mark it as failed
3. **Check holdout zone** — if player is inside the zone, increment progress
4. **Check retrieve pickups** — if player walks over a retrieve item, increment collected
5. **Check defuse interactions** — if player is near a defuse point and interacting, increment its progress
6. **Check overall status** — if failure conditions met, set `world.objective.status = 'soft_failure'`. If success conditions met, set `status = 'success'`

The narrative system reads `world.objective.status` at stage end to determine which branch to follow.

### Enemy AI Extensions

Objective-role enemies need modified behavior:

- **Attacker role:** Same as CHASE state but targets the objective entity instead of the player. Uses the same flow field pathfinding but with a different target position
- **Runner role:** Ignores the player entirely. Moves in a straight line toward the objective destination at high speed. Does not attack. Low HP. Dies in 1-2 hits
- **Carrier role:** Like Runner, but first moves to a pickup point, grabs an item (brief pickup animation), then runs toward the exit. Can be killed at any point — drops the item if carrying one

These roles are set via the `ObjectiveRole` component and gate behavior in `enemyAISystem`. Non-role enemies behave normally.

### Content Priority

For initial implementation:

1. **Implement the Protect type first.** It's the simplest (add HP to an entity, have some enemies target it). It immediately creates dilemma gameplay.
2. **Add Intercept second.** Runner enemies are easy to implement (move toward destination, die easily) and create dramatic moments.
3. **Add Defuse third.** Fire spread is visually impressive and creates spatial gameplay.
4. **Holdout, Retrieve, Race** can come later — they're more complex but less essential for the core narrative loop.

Each objective type can be tested in isolation before being integrated with the narrative branching system.

---

## Key Takeaways

1. **Six objective types** (Protect, Intercept, Holdout, Retrieve, Defuse, Race) provide enough variety that no two stages feel identical.
2. **One side objective per stage.** Two max. Real-time action games can't handle the cognitive load of 3+ simultaneous objectives.
3. **Soft failure is narrative, not punishment.** The story branches. The player doesn't get weaker.
4. **Every objective must be readable in 2 seconds** through visuals alone. If it needs a text explanation, it's too complex.
5. **The objective must complement the core loop** (move, dodge, shoot). Never ask the player to stop doing the fun thing.
6. **Western tropes provide natural objective variety.** Save the hostages, stop the dynamite, chase the villain, hold the jail, recover the gold, escape the mine. Each one feels different and fits the setting.
7. **Bonus objectives are silent, optional mastery rewards.** They reward skilled play without punishing anyone who misses them.
