# Stage 4: The Crossroads — Final Boss Design

Research and design document for High Noon's final stage. A single-boss encounter at a supernatural crossroads where the player faces **Old Scratch** — the Devil of Western folklore — in a multi-phase showdown that tests every skill the player has built across the run.

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Thematic Foundation](#2-thematic-foundation)
3. [Arena Design: The Crossroads](#3-arena-design-the-crossroads)
4. [Boss: Old Scratch](#4-boss-old-scratch)
5. [Phase 1: The Wager](#5-phase-1-the-wager)
6. [Phase 2: The Cheat](#6-phase-2-the-cheat)
7. [Phase 3: The Devil Unleashed](#7-phase-3-the-devil-unleashed)
8. [Phase 4: The Final Draw](#8-phase-4-the-final-draw)
9. [Add Enemies & Hazards](#9-add-enemies--hazards)
10. [Tuning & Pacing](#10-tuning--pacing)
11. [Implementation Notes](#11-implementation-notes)
12. [Research Sources & Inspirations](#12-research-sources--inspirations)

---

## 1. Design Philosophy

### What the Final Boss Must Accomplish

The final boss of a roguelite run must:

1. **Test mastery, not luck.** The player has spent 3 stages building skills and a character build. The boss should let every build archetype shine while demanding the core skills everyone shares: dodge-rolling, aim, positioning, resource management (cylinder/cooldowns).

2. **Escalate through transformation, not inflation.** Research across Hades, Gungeon, Cuphead, and Isaac shows the best bosses change *what* the player is doing each phase, not just make the same thing harder. Cuphead's Devil removes platforms. The Lich changes arenas. Hades adds priority-targeting puzzles. Raw stat inflation is the weakest form of escalation.

3. **Create a crescendo.** Great final fights follow a dramatic arc: tense opening → rule break → chaos → intimate climax. The emotional shape matters as much as the numbers.

4. **Be a mirror.** From Hades (fighting your father with mirrored abilities) to Gungeon's Lich (a gunslinger like you, but perfected): the most resonant final bosses reflect the player back at themselves. In a game called High Noon, the final boss should be the one gunslinger you can't out-draw.

5. **Reward the Western fantasy.** This is the showdown. The clock strikes twelve. Two figures on a dusty road. Everything the genre has been building toward. The fight should *feel* like the climax of a Sergio Leone film.

### Lessons From Other Games

| Game | Key Lesson | Applied Here |
|------|-----------|--------------|
| **Hades** (Hades fight) | Boss as dark mirror; vase-healing creates priority puzzles; Extreme Measures adds visibility reduction | Old Scratch mirrors player weapons in Phase 1; hellfire pillars as priority targets; dust storm in Phase 3 |
| **Enter the Gungeon** (Lich) | Arena shrinks across phases; hand-drag transition is a "stomach drop" moment | Crossroads arms collapse in Phase 3; the ground cracking open at Phase 2 transition |
| **Cuphead** (Devil) | Platform removal = escalation through restriction; each phase is a visual transformation | Arena restriction via hellfire; complete visual shift each phase |
| **Nuclear Throne** (Throne) | Destructible generators give player strategic agency beyond "shoot boss" | Hellfire pillars can be destroyed to deny boss healing and clear arena space |
| **Binding of Isaac** (Mega Satan) | No HP bar = sustained tension; boss wave interludes as breathers | Hidden HP in Phase 4 draw sequence; Ghost Rider waves between Phase 2 and 3 |
| **20 Minutes Till Dawn** (Shoggoth) | Electric barrier forces engagement; telegraph lines before lasers | Ring of hellfire prevents escape; all major attacks have visual telegraphs |
| **Hotline Miami** (cautionary tale) | Boss must use the same mechanics the player has been mastering, not introduce puzzle gimmicks | Every phase is beat with shooting, dodging, and positioning — no gimmick kills |

---

## 2. Thematic Foundation

### The Devil at the Crossroads

The deepest root of American supernatural folklore: at the crossroads where two roads meet, you can strike a bargain with the Devil. Robert Johnson sold his soul there for mastery of the blues. The tradition stretches back through African diasporic Vodun (Papa Legba guards the crossroads), through medieval European pacts with Satan (the legend of Theophilus, 6th century), to the universal human fascination with liminal spaces where worlds intersect.

In Western Americana, this becomes the gambler, the card sharp, the gentleman in black who offers you everything you want — for a price you don't understand until it's too late. "The Devil Went Down to Georgia" crystallized the trope: a skill contest where the mortal can *win* if they're good enough. Johnny beat the Devil with a fiddle. Our player beats him with a gun.

### Why This Works for High Noon

The roguelite upgrade loop *is* the Faustian bargain. Every node the player took on the Sheriff/Undertaker/Prospector tree, every item they picked up — those are the deals they've been making. The Devil is the one who was offering. Now the bill comes due.

This creates natural mechanical hooks:
- The Devil can reference the player's build (different dialogue/attacks based on character choice)
- Phase 2's "rule break" can involve the Devil leveraging the player's own power against them
- The final draw mirrors the Stage 1 duel objective, bringing the run full circle

### Visual Identity: The Gentleman in Black

Old Scratch appears as a tall, gaunt figure in a long black duster and wide-brimmed hat. Not horns and pitchfork — that's too literal. He's the Man in Black from every Western: Johnny Cash, the gunslinger from the Dark Tower, the stranger who walks into town and everything goes wrong. Pale face, burning eyes, thin smile. He carries a black-iron revolver that mirrors the player's weapon.

As the fight progresses and the veneer of civility drops:
- **Phase 1:** Gentleman gunslinger. Duster, hat, human silhouette. Fires with precision.
- **Phase 2:** The mask slips. Eyes burn red. Shadow tendrils leak from under the duster. Movements become unnaturally fast. The hat is gone — replaced by curved horns silhouetted against firelight.
- **Phase 3:** True form. The duster tears open revealing a torso of shadow and embers. Lower body dissolves into a column of black smoke rooted to the ground. Massive. The "gentleman" is a memory.
- **Phase 4:** Returns to Phase 1 form — but damaged, flickering. Back to two gunslingers. One last draw.

---

## 3. Arena Design: The Crossroads

### Layout

A dirt crossroads where four roads meet at right angles, forming a **+** shape. The intersection at the center is the primary combat space. Each road extends outward as a corridor before hitting impassable boundaries (the edge of reality — beyond the crossroads, there is only darkness and swirling dust).

```
            ║ NORTH ROAD ║
            ║            ║
            ║            ║
════════════╬════════════╬════════════
 WEST ROAD  ║   CENTER   ║ EAST ROAD
════════════╬════════════╬════════════
            ║            ║
            ║            ║
            ║ SOUTH ROAD ║
```

### Dimensions

- **Total map:** 48x48 tiles (1536x1536 px) — square, unlike previous rectangular stages
- **Center clearing:** 16x16 tiles (512x512 px) — the intersection
- **Roads:** 8 tiles wide, extending 16 tiles from center to edge
- **Corners:** Impassable darkness (wall tiles) — the four quadrants between roads are not accessible
- **Base tile style:** New `crossroads_dirt` — cracked, sun-bleached earth with an eerie reddish tint

### Environmental Features

**The Signpost (center):** A crooked wooden signpost at the exact center of the crossroads. Four signs pointing in four directions. Purely decorative in Phase 1, but it becomes mechanically relevant in Phase 3 (see below). *Not* a collision obstacle — the player can walk through it.

**Road Lanterns:** Four iron lanterns, one at each corner of the center clearing (where road meets intersection). These cast warm light in Phase 1. In Phase 2, they gutter and die. In Phase 3, they reignite with hellfire, becoming **Hellfire Pillars** — environmental hazards that also heal the boss (see Phase 3).

**The Boundary:** Beyond the roads, there's no wall tile — instead, the ground dissolves into swirling black dust and ash. Entering this area applies a rapid slow (80% speed reduction) and deals 5 DPS, functionally preventing escape. The visual effect is the player's sprite becoming translucent, as though being erased.

**Hazards by Phase:**
| Phase | Hazard | Effect |
|-------|--------|--------|
| 1 | None | Clean, fair arena |
| 2 | Brimstone Cracks | Lines of fire along road edges; deal 4 DPS on contact |
| 3 | Hellfire Pillars (4) | 48px radius fire zones at corner positions; deal 6 DPS; heal boss 2 HP/s each; destructible (40 HP each) |
| 4 | All hazards extinguished | Clean arena again — just two gunslingers |

### Arena Progression (The Shrink)

Inspired by Cuphead's platform removal and Gungeon's Lich arena compression:

- **Phase 1:** Full arena accessible. Four roads + center. Player has maximum space to maneuver.
- **Phase 2:** The outer halves of each road begin collapsing (the boundary creeps inward). Playable road length drops from 16 tiles to 10 tiles. The brimstone cracks appear along road edges, further narrowing safe movement within roads.
- **Phase 3:** Roads collapse to just 6 tiles from center edge. The arena is now almost entirely the center clearing (512x512 px) plus short stubs. Hellfire Pillars in the corners further restrict the safe zone. This is claustrophobic by design.
- **Phase 4:** Arena freezes at Phase 3 size, but all hazards extinguish. The reduced space remains — you're close, it's tight, and there's nowhere to run.

---

## 4. Boss: Old Scratch

### Identity

**Old Scratch** — known by many names: The Gentleman, The Man at the Crossroads, The Devil of the Dust. A figure from frontier legend who appears where roads cross, offering travelers their heart's desire. He speaks like a Southern gentleman. He fights like the fastest gun who ever lived.

### Core Stats

| Stat | Value | Notes |
|------|-------|-------|
| **Total HP** | **400** | Highest in the game (Hollow Man: 280, Coyote Jane: 250) |
| **Radius** | 18 px | Slightly larger than player (16 px), smaller than Mad Dog |
| **Base Speed** | Phase-dependent | P1: 120 px/s (deliberate), P2: 180 px/s, P3: 0 (stationary true form), P4: 0 (stationary) |
| **Phase Thresholds** | 75% / 45% / 15% | P2 at 300 HP, P3 at 180 HP, P4 at 60 HP |
| **Drop Chance** | 1.0 | Guaranteed drop — it's the final boss |
| **Collision Layer** | ENEMY | Standard |

### Phase HP Distribution

The 400 HP is divided across phases, but importantly the boss **heals between Phase 2 and Phase 3** (like Hades regenerating his HP bar), creating a dramatic "oh no" moment:

- Phase 1: 400 → 300 HP (100 damage to trigger P2)
- Phase 2: 300 → 180 HP (120 damage to trigger P3)
- **Transition to P3:** Boss heals to 250 HP (the Devil drops pretense and draws on infernal power)
- Phase 3: 250 → 60 HP (190 damage to trigger P4)
- Phase 4: 60 → 0 HP (the final draw — see below)

**Effective total damage required: ~410 HP** (100 + 120 + 190 + variable for Phase 4)

This mid-fight heal serves the same purpose as Hades's HP refill: it prevents the player from feeling like they're "almost done" when the hardest phase hasn't started. It also narratively represents the Devil revealing he was holding back.

### Unique Mechanic: Infernal Counter

Old Scratch has a passive ability: **Infernal Counter.** When the player fires a bullet that would hit him during specific "counter windows" (telegraphed by a red flash on his body), he sidesteps and immediately returns fire with a fast snap-shot (12 damage, 800 px/s). This:

- Teaches the player to read attack windows rather than holding down fire
- Rewards precise timing over spray-and-pray
- Echoes the duel trope — drawing at the wrong moment gets you killed
- Has a 1.5s internal cooldown so it can't chain-punish

The counter windows occur during his **idle stance** animation between attack sequences (approximately 0.4s windows). During active attacks, he does NOT counter — that's the damage window.

---

## 5. Phase 1: The Wager

*"Well now... you made it this far. I'll admit, I'm impressed. How about a friendly game? Just you and me, like civilized folk."*

### Overview

Phase 1 is a **gentleman's duel**. Old Scratch fights "fairly" — one-on-one, no adds, no environmental hazards. He uses a mirrored version of the player's weapon archetype, establishing him as the dark mirror. The arena is fully open. The music is tense but restrained — a lone guitar, a ticking clock.

This phase teaches the player Old Scratch's core patterns before the fight escalates. It's the "learn the boss" phase, similar to Hades Phase 1 or Cuphead Devil Phase 1.

### Attack Patterns (Weapon-Mirrored)

Old Scratch's attacks adapt based on the player's character class, making him feel like a dark reflection:

#### vs. Sheriff (Revolver)

| Attack | Telegraph | Damage | Notes |
|--------|-----------|--------|-------|
| **Dead-Eye Shot** | 0.4s red laser sight line | 14 | Single precise shot, 700 px/s. Aims where the player IS, not where they're going. Dodgeable on reaction. |
| **Devil's Fan** | 0.3s — spins cylinder | 8 per bullet | 4-bullet spread (0.5 rad arc), 500 px/s. Short range (250 px). Punishes close range. |
| **Black Iron Reload** | 0.7s — opens cylinder | — | Reload animation. This is the primary damage window — 0.7s of vulnerability. |
| **Sidewinder** | 0.2s lean | — | Lateral dash (200 px, 400 px/s). Repositioning move used between attacks. 2s cooldown. |

**Pattern Cycle:** Dead-Eye → Sidewinder → Devil's Fan → Black Iron Reload → repeat. The cycle is consistent in Phase 1 so the player learns the rhythm. ~4s per cycle.

#### vs. Undertaker (Shotgun)

| Attack | Telegraph | Damage | Notes |
|--------|-----------|--------|-------|
| **Brimstone Blast** | 0.3s — raises sawed-off | 10 per pellet (5 pellets) | Tight spread (0.4 rad), 400 px/s. 150 px range. He closes distance first. |
| **Coffin Nail** | 0.5s — snaps fingers | 6 + 4 DPS (2s) | Places a cursed zone (100 px radius) at player position. Delayed 0.8s. Area denial. |
| **Shadow Step** | 0.15s flicker | — | Short-range teleport (150 px) toward player. Closes gap for shotgun. 3s cooldown. |

#### vs. Prospector (Melee)

| Attack | Telegraph | Damage | Notes |
|--------|-----------|--------|-------|
| **Hellpick Swing** | 0.25s windup | 12 | Wide melee arc (100°, 70 px reach). Knockback 50 px. |
| **Infernal Charge** | 0.4s crouch + ground glow | 15 | Charges 200 px at 350 px/s. Leaves a short fire trail (3s, 4 DPS). |
| **Devil's Dynamite** | Tosses with 0.3s telegraph | 18 | 80 px blast radius, 1.2s fuse. Can be dodged. |

### Infernal Counter (Active in Phase 1)

Counter windows occur during the 0.3s idle stance between attack sequences. A red shimmer plays on Old Scratch's sprite. Shooting during this window triggers the counter. Shooting at any other time is safe.

### Phase 1 Pacing

- Duration target: **30-45 seconds** for a skilled player
- 100 HP to burn through
- Generous dodge windows; the phase is about learning, not punishing
- No healing, no adds, no hazards
- Music: sparse, ticking, building tension

---

## 6. Phase 2: The Cheat

### Transition: "The Ground Breaks"

When Old Scratch hits 75% HP (300), he staggers, then laughs:

*"Heh. Alright. I've been playing nice."*

He stamps his boot on the ground. **Cracks of brimstone fire** split open along the road edges. The outer road sections crumble into darkness. The arena visibly shrinks. The four corner lanterns gutter and die. The music shifts — the lone guitar is joined by a deep, pulsing bass drone and distant thunder.

This is the "oh no" moment — the rules have changed. The transition takes ~2 seconds (boss is invulnerable with i-frames during the animation).

### Overview

Phase 2 introduces **adds** and **environmental hazards**. Old Scratch stops fighting "fair." He summons Ghost Riders — spectral cowboy enemies that harass the player while he continues his attack patterns with increased aggression. The brimstone cracks narrow the roads, compressing the safe space.

This is the "juggling" phase — the player must manage multiple threats simultaneously, similar to Hades's ally summons at 50%/20% HP, or Mega Satan's boss wave interludes.

### Attack Changes from Phase 1

All Phase 1 attacks are retained but with tighter timings:
- Telegraph durations reduced by 20%
- Cooldowns reduced by 15%
- **Sidewinder/Shadow Step** gains a follow-up: after repositioning, Old Scratch fires a snap-shot (8 damage) during the landing animation

**New attacks:**

| Attack | Telegraph | Damage | Notes |
|--------|-----------|--------|-------|
| **Crossroads Salvo** | 0.6s — both arms raise | 10 per bullet | Fires 6 bullets in a ring (60° spacing), expanding outward at 300 px/s. Gaps are dodge-rollable. Used every 3rd attack cycle. |
| **Brimstone Lash** | 0.5s — ground glows in a line | 12 | A line of fire erupts along one road (N/S/E/W), crossing the entire length. 0.8s active duration. Telegraphed by which direction Old Scratch faces. |
| **Summon Ghost Rider** | 0.4s — raises hand | — | Spawns a Ghost Rider at a random road endpoint. Up to 2 alive at once. Used every ~10 seconds. |

### Ghost Rider (New Add Enemy)

Spectral cowboys on phantom horses. They gallop down the roads toward the player, firing as they ride.

| Stat | Value |
|------|-------|
| HP | 20 |
| Speed | 160 px/s |
| Tier | THREAT |
| Attack | Single shot every 1.5s (8 damage, 500 px/s) |
| Behavior | Rides in a straight line down one road, turns at the intersection, chases player. Despawns after 8s if not killed. |
| Drop Chance | 0% (boss-phase add) |
| Visual | Translucent blue-white cowboy on horseback, trailing spectral dust |

Ghost Riders keep the player moving and prevent them from camping a safe position. Their linear movement along roads makes them predictable but dangerous when combined with Old Scratch's attacks.

### Phase 2 Pacing

- Duration target: **45-60 seconds**
- 120 HP to burn through (300 → 180)
- Increased pressure from adds + tighter attack windows
- Brimstone cracks along road edges punish sloppy movement
- Player must prioritize: Ghost Riders threaten sustained damage, but ignoring Old Scratch means missing damage windows
- Music: driving rhythm, drums join, increasingly urgent

---

## 7. Phase 3: The Devil Unleashed

### Transition: "The Reveal"

At 45% HP (180), Old Scratch drops to one knee. For a beat, he's still. Then:

*"You want to see what you've really been dealing with?"*

He rises. The duster tears apart. His form expands — the gentleman is gone, replaced by a towering figure of shadow and hellfire. Horns crown his head. His lower body becomes a column of black smoke anchored to the center of the crossroads. The four corner lanterns reignite with massive hellfire, becoming the **Hellfire Pillars.**

**The mid-fight heal:** Old Scratch's HP refills to **250 HP**. The HP bar visually refills in a burst of flame. This is the Hades moment — the player thought they were more than halfway done, but the hardest phase is starting fresh.

The roads collapse further (6 tiles from center edge). The arena is now essentially the center clearing plus short stubs. The signpost at center catches fire, becoming a visual beacon.

The music transforms completely: full orchestral chaos, choir vocals, pounding percussion. This is the climax.

### Overview

Phase 3 is the **bullet hell / arena management** phase. Old Scratch is stationary at center (anchored by his true form) but commands the entire arena with ranged attacks, area denial, and the Hellfire Pillars. The player must manage space, destroy pillars to deny healing and create safe zones, and find windows to deal damage.

This is inspired by:
- **Cuphead's Devil Phase 2** — the boss becomes a massive, stationary threat
- **Gungeon's Dragun Phase 2** — navigating bullet patterns with small damage windows
- **Hades's vase mechanic** — the Hellfire Pillars heal Old Scratch like Hades heals from vases, creating a priority puzzle
- **Nuclear Throne's generators** — destroying environmental objects gives strategic advantage

### Attack Patterns

Old Scratch's Phase 1/2 weapon attacks are completely replaced. His true form uses infernal powers:

| Attack | Telegraph | Damage | Notes |
|--------|-----------|--------|-------|
| **Hellfire Sweep** | 0.5s — one arm sweeps back | 10 per hit | A rotating arc of 8 fire projectiles sweeps 180° across the arena. 400 px/s. Gaps between projectiles are tight but rollable. Used every 4s. |
| **Soul Geyser** | 0.8s — ground circles glow at target positions | 15 | 3 eruptions at player's position (tracked, but snapshot — doesn't follow after telegraph). Each is a 64 px radius burst. 0.6s between each. Player must keep moving. |
| **Crossroads Convergence** | 1.0s — all 4 roads flash | 8 per bullet | Fires a wave of 6 bullets down each road simultaneously (24 total bullets converging on center). Gaps exist between bullets in each wave. The player must be in the intersection and dodge between the converging lines. |
| **Chain Lightning** | 0.3s — sparks between pillars | 6 per tick (3 ticks) | Lightning arcs between all living Hellfire Pillars. If player is between two pillars, they take damage. Destroying pillars breaks chain paths. |
| **Stampede** | 1.2s — distant rumbling + dust from one road | 20 | A spectral cattle stampede charges down one road through the intersection and out the opposite side. 800 px/s, 6 tiles wide (fills the road). Must dodge to a perpendicular road or roll through with i-frames. Very telegraphed, very punishing. Used every ~15s. |

### Hellfire Pillars (Priority Puzzle)

Four pillars, one at each corner of the center clearing. Each:
- Has **40 HP** — destructible
- Deals **6 DPS** in a 48 px radius (contact damage zone)
- Heals Old Scratch **2 HP/s** per living pillar (max 8 HP/s with all 4)
- Enables **Chain Lightning** attack (only arcs between living pillars)
- **Respawns after 20s** if destroyed — the player can't permanently eliminate them, but destroying them creates temporary windows of safety and denies healing

**Strategic depth:** A player who ignores pillars faces a boss healing 8 HP/s while navigating Chain Lightning between all four corners. A player who destroys pillars gets a safer arena and denies healing, but spends time and ammo not damaging the boss. The optimal play is destroying 2-3 pillars to reduce healing and eliminate Chain Lightning angles, then focusing the boss during the respawn window.

### Dust Storm (Visibility Reduction)

At 50% of Phase 3 HP (~125 HP remaining), a **Dust Storm** rolls in, reducing visibility to a 200 px radius around the player (similar to Hades Extreme Measures 4 darkness, and Hollow Man's Canyon Dust Storm). This:

- Makes Hellfire Pillar positions harder to track
- Makes Stampede telegraph harder to read (must listen for audio cue)
- Increases tension dramatically
- Lasts for the remainder of Phase 3

### Phase 3 Pacing

- Duration target: **60-90 seconds** (the longest phase, by design)
- 190 HP to burn through (250 → 60), offset by pillar healing
- Highest mechanical complexity: dodge attacks + manage pillars + deal damage + navigate dust storm
- This is the test of everything the player has learned
- Music: peak intensity, then slowly strips instruments as Old Scratch weakens, building toward silence

---

## 8. Phase 4: The Final Draw

### Transition: "Back to the Beginning"

At 15% HP (60), Old Scratch's true form shudders. The smoke and fire collapse inward. The Hellfire Pillars die permanently. The dust storm clears. The brimstone cracks seal. Silence.

Old Scratch reforms as the gentleman — but broken. His duster is scorched and torn. He's clutching his side. He staggers to one end of the north road. The player is nudged (not forced) to the south road by a brief cutscene camera pan.

*"One more draw. That's all I've got left in me. You?"*

The music cuts to dead silence. A lonely wind. A clock ticking.

### Overview

Phase 4 is the **showdown** — a callback to Stage 1's duel objective, but elevated into the final moment of the game. It is a pure skill test with no adds, no hazards, no gimmicks.

This phase is inspired by:
- The Leone standoff ("The Good, the Bad and the Ugly" three-way duel)
- "The Devil Went Down to Georgia" — beating the Devil at his own game
- Stage 1's duel ring mechanic, brought full circle

### The Draw Mechanic

Phase 4 is a rapid-fire duel with a unique mechanic: **The Quick Draw.**

The phase proceeds in **draw rounds**. Each round:

1. **Staredown (1.5-2.5s):** Both combatants face each other. A visual indicator (a slowly filling ring, like a crosshair closing) appears on Old Scratch. The ring fills at a variable rate — the player must watch for the **flash** (a white frame flash on Old Scratch's gun hand, exactly 3 frames / 50ms at 60Hz).

2. **The Flash:** The signal to fire. If the player shoots within **0.3s** of the flash, they land a **Perfect Draw** — dealing 20 damage and staggering Old Scratch for 0.5s. If they shoot between 0.3-0.6s, it's a **Good Draw** — 10 damage, no stagger. If they shoot after 0.6s, Old Scratch fires first — the player takes 15 damage but can dodge-roll to avoid it.

3. **If the player shoots BEFORE the flash** (anticipation/panic shot): Old Scratch sidesteps and fires — guaranteed 15 damage (no dodge — this is a punish for jumping the gun). The Infernal Counter, weaponized.

4. **Scramble (2-3s):** After the draw, both combatants can move freely and fire normally for a brief scramble window. Old Scratch uses Phase 1 attack patterns at accelerated speed. Then both return to staredown positions for the next round.

### Draw Round Pacing

| Round | Staredown Duration | Old Scratch HP at Start | Notes |
|-------|-------------------|------------------------|-------|
| 1 | 2.5s | 60 | Long staredown, generous window. Tutorial round. |
| 2 | 2.0s | ~40-50 | Shorter. Scramble phase is more aggressive. |
| 3 | 1.5s | ~20-30 | Quick. Old Scratch fires faster if player misses. |
| 4+ | 1.5s (fixed) | <20 | Repeats until one side falls. |

With perfect draws (20 damage each), the player can end Phase 4 in 3 rounds. With mixed performance, it takes 4-6 rounds. Missing draws and taking damage extends the phase and threatens the player's HP.

### Why This Works

- **It's a pure skill test.** No build advantages, no ability spam. Just reflexes and nerve.
- **It mirrors Stage 1.** The run began with a duel (The Stranger Draws). It ends with one.
- **The tension is real.** The staredown, the silence, the variable timing — the player's hands will shake. That's the Western fantasy.
- **It's short.** After the marathon of Phase 3, the final phase is quick and decisive. 30-45 seconds. The emotional contrast is enormous.
- **Normal combat between draws** means the player's build still matters — the scramble phases let their upgrades shine.

### Death Sequence

When Old Scratch's HP hits 0, he drops his revolver. Falls to his knees.

*"Well I'll be damned. ...Wait. I already am."*

He dissolves into black smoke that swirls upward and dissipates. The crossroads begin to fade — the cracked earth smooths, the boundary darkness retreats, warm sunlight breaks through. The signpost, no longer burning, stands intact. The player stands alone at the crossroads as the music resolves into a warm, major-key Western theme.

---

## 9. Add Enemies & Hazards

### Ghost Rider (Phase 2 Add)

| Field | Value |
|-------|-------|
| EnemyType | `GHOST_RIDER` (new) |
| Tier | THREAT |
| HP | 20 |
| Speed | 160 px/s |
| Radius | 14 px |
| Attack | Single shot, 8 damage, 500 px/s, 1.5s cooldown |
| AI | Linear path along road → turn at intersection → chase player |
| Lifespan | 8s max, then despawns |
| Drop Chance | 0% |
| Budget Cost | N/A (boss-phase spawned, not wave-system) |
| Visual | Translucent blue-white mounted cowboy, trailing spectral particles |

Ghost Riders are not spawned by the wave system — they're spawned directly by Old Scratch's `attack()` function, similar to how Coyote Jane spawns Coyotes or Boomstick spawns adds.

### Hellfire Pillar (Phase 3 Hazard-Entity)

| Field | Value |
|-------|-------|
| EnemyType | `HELLFIRE_PILLAR` (new) |
| Tier | N/A (environmental) |
| HP | 40 |
| Speed | 0 (stationary) |
| Radius | 24 px (visual), 48 px (damage zone) |
| Damage Zone | 6 DPS to player on contact |
| Boss Heal | 2 HP/s per living pillar |
| Respawn | 20s after destruction |
| Drop Chance | 0% |
| Chain Lightning | Arcs to other living pillars every 8s |

Pillars are spawned as entities with health, allowing the player to target and destroy them. They use a simple component (Position + Health + Collider + a new `HealAura` or similar tag) rather than the full Enemy AI stack.

### Brimstone Crack (Phase 2-3 Terrain Hazard)

Could be implemented as a new tile type (`TileType.BRIMSTONE`) similar to lava, or as entity-based line hazards spawned during phase transitions. The entity approach is more flexible for the "lines along road edges" layout.

| Field | Value |
|-------|-------|
| Type | Line hazard entity |
| Damage | 4 DPS on contact |
| Width | 2 tiles (64 px) |
| Placement | Along road edges, narrowing safe road width by 2 tiles per side |

---

## 10. Tuning & Pacing

### Full Fight Timeline (Target)

| Phase | Duration | Cumulative | Player HP Context |
|-------|----------|------------|------------------|
| Intro / Dialogue | 3s | 3s | Full HP |
| **Phase 1: The Wager** | 30-45s | ~40s | Lose 0-10 HP (learning) |
| P1→P2 Transition | 2s | ~42s | — |
| **Phase 2: The Cheat** | 45-60s | ~100s | Lose 10-20 HP (pressure) |
| P2→P3 Transition + Heal | 3s | ~103s | Stomach-drop moment |
| **Phase 3: The Devil Unleashed** | 60-90s | ~180s | Lose 10-25 HP (the gauntlet) |
| P3→P4 Transition | 3s | ~183s | Breather |
| **Phase 4: The Final Draw** | 30-45s | ~220s | Win or lose |
| Death Sequence | 4s | ~224s | Victory |

**Total fight: approximately 3-4 minutes.** This is in line with best-in-class final boss durations (Hades: ~3 min, Cuphead Devil: ~3 min, Gungeon Lich: ~4-5 min).

### Damage Budget

The player enters Stage 4 with whatever HP they have remaining (max 40 for Sheriff, potentially higher with upgrades). Assuming a well-played run, they might have 30-40 HP.

Target damage taken by a skilled player across the full fight: **15-25 HP**

| Phase | Expected Damage Taken | Source |
|-------|----------------------|--------|
| Phase 1 | 0-8 | Learning the patterns; generous windows |
| Phase 2 | 5-10 | Ghost Rider chip damage + tighter attack windows |
| Phase 3 | 5-12 | Arena complexity; pillar DPS; stampede risk |
| Phase 4 | 0-15 | Depends entirely on draw performance |

This means a player entering with 30+ HP has a comfortable margin if they play well, but a player entering with 15 HP is on a knife's edge — exactly the tension a final boss should create.

### Difficulty Scaling Considerations

For future difficulty modifiers (roguelite Pact-style system):

- **Easy mode:** Phase 1 counters disabled. Phase 3 only 2 pillars. Phase 4 staredown always 2.5s.
- **Hard mode:** Phase 2 Ghost Riders are 3 max. Phase 3 pillars respawn in 15s. Phase 4 scramble windows shortened.
- **Extreme:** Phase 1 counter window widened. Old Scratch has a 5th phase where all four phases replay at accelerated speed (Gungeon Advanced Dragun energy).

---

## 11. Implementation Notes

### New EnemyType Values Needed

```typescript
// Add to EnemyType in components.ts:
OLD_SCRATCH: 21,      // The Devil — final boss
GHOST_RIDER: 22,      // Phase 2 spectral cowboy add
HELLFIRE_PILLAR: 23,  // Phase 3 destructible hazard-entity
```

### Boss Module Structure

Old Scratch follows the existing `BossModule` interface in `registry.ts`:

```typescript
const OldScratchBoss: BossModule = {
  type: EnemyType.OLD_SCRATCH,
  displayName: 'Old Scratch',
  color: 0x880000,        // Deep crimson
  radius: 18,
  dropChance: 1.0,
  spawnCount: 1,

  spawn(world, x, y) { /* ... */ },
  tick(world, eid, dt) { /* phase transitions, pillar management */ },
  attack(world, eid, dt) { /* phase-specific attack logic */ },
}
```

Key implementation considerations:

- **Phase state machine:** Use existing `BossPhase` component (phases 1-4). Phase transitions in `tick()`, attack selection in `attack()`.
- **Character-adaptive attacks:** Read `world.characterId` (or detect player weapon type) in `attack()` to select Phase 1 attack set.
- **Ghost Rider spawning:** Spawn directly from `attack()` like Coyote Jane's coyotes. Use a counter to cap at 2 alive.
- **Hellfire Pillars:** Spawn as entities in `tick()` during P3 transition. Track their EIDs for respawn timer. Healing logic in `tick()` — iterate living pillars, add to Old Scratch's HP each tick.
- **Draw mechanic (Phase 4):** Custom state machine within the attack function. Use a timer for staredown, check player input timing against the flash frame, calculate damage based on reaction time.
- **Arena shrinking:** Modify tilemap during phase transitions (set outer road tiles to WALL). This is a new capability — existing stages don't modify the map mid-encounter. Could also be done with entity-based boundary walls.

### New ObjectiveConfig Type

Stage 4 uses a new objective type: `'showdown'`

```typescript
export const STAGE_4_SHOWDOWN: ObjectiveConfig = {
  type: 'showdown',
  description: 'Face the Devil',
  // No secondary objective mechanics — it's just the boss
}
```

The showdown objective type signals to the encounter system that this is a boss-only stage with no wave spawning — the boss IS the entire encounter.

### Map Config

```typescript
export const STAGE_4_MAP_CONFIG: MapConfig = {
  width: 48,
  height: 48,
  tileSize: 32,
  baseTiles: { style: 'crossroads_dirt', variantCount: 4 },
  centerClearRadius: 8,  // Larger center clearing
  obstacles: {
    count: 0,           // No procedural obstacles — hand-crafted layout
    minSpacing: 0,
    templates: [],
  },
  hazards: [],          // Hazards spawned dynamically by boss phases
  // Custom crossroads layout handled by a dedicated map generator
}
```

The crossroads map needs a custom generator (not the procedural noise-based one used for Stages 1-3). The generator should:
1. Fill the entire map with WALL tiles
2. Carve out the + shape (center clearing + four roads)
3. Place the signpost and lantern positions as metadata
4. Use the `crossroads_dirt` tile style for floor tiles

### Stage 4 Encounter Definition

```typescript
export const STAGE_4_ENCOUNTER: StageEncounter = {
  mapConfig: STAGE_4_MAP_CONFIG,
  objective: STAGE_4_SHOWDOWN,
  bossPool: [EnemyType.OLD_SCRATCH],  // Only one boss — always Old Scratch
  waves: [
    // Single "wave" — just the boss, no fodder
    {
      fodderBudget: 0,
      fodderPool: [],
      maxFodderAlive: 0,
      threats: [
        { type: EnemyType.OLD_SCRATCH, count: 1 },
      ],
      spawnDelay: 0,
      threatClearRatio: 1.0,
    },
  ],
}
```

### New Components Potentially Needed

- **`HealAura`** — for Hellfire Pillars. Fields: `targetEid` (boss to heal), `hpPerSecond`, `radius`
- **`BossPhaseTimer`** — extended from existing BossPhase to track phase-specific state (draw round number, staredown timer, pillar respawn timers)
- **`DrawState`** — Phase 4 specific: `staredownTimer`, `flashFired`, `playerShotTiming`, `roundNumber`
- **`GhostRiderLifespan`** — simple timer for Ghost Rider despawn

### New Systems

- **`oldScratchPhaseSystem`** — manages phase transitions, pillar spawning/respawning, arena modification
- **`drawMechanicSystem`** — Phase 4 quick-draw logic, timing validation, damage calculation
- **`hellfirePillarSystem`** — pillar healing tick, chain lightning firing, respawn timer
- **`ghostRiderAISystem`** — linear road movement, turn at intersection, chase player

---

## 12. Research Sources & Inspirations

### Games Analyzed

- **Hades** (Supergiant Games) — Final boss design: dark mirror, HP regeneration between phases, vase priority puzzles, Extreme Measures visibility reduction. The gold standard for roguelite final bosses.
- **Enter the Gungeon** (Dodge Roll) — Lich: arena shrinking across 3 phases, hand-drag transition moment. Dragun: bullet maze with damage windows, secret advanced form.
- **Cuphead** (Studio MDHR) — The Devil: 4-phase visual transformation, progressive platform removal, parry mechanic stays relevant throughout.
- **Nuclear Throne** (Vlambeer) — Generator destructibles give strategic choice. Death explosion punishes complacency. Loop scaling.
- **Binding of Isaac** (Edmund McMillen) — Mega Satan: hidden HP bar, boss wave interludes. The Beast: genre-shifting final phase. Delirium: shape-shifting (cautionary — telefragging is widely hated).
- **Vampire Survivors** (poncle) — The Ender: dramatic merger introduction, forced engagement, DPS check design. Reaper: designed to be unbeatable until you're strong enough.
- **Hotline Miami** (Dennaton) — Cautionary tale: boss fights that abandon core mechanics feel unfair. Every High Noon boss phase must be beatable with the same skills used throughout the game.
- **20 Minutes Till Dawn** (flanne) — Electric barrier for forced engagement. Telegraph lines before lasers. Distance-based attack selection.

### Western Folklore

- **The Devil at the Crossroads** — Robert Johnson legend, Vodun crossroads tradition, medieval Theophilus pact. The thematic foundation.
- **"The Devil Went Down to Georgia"** (Charlie Daniels, 1979) — Skill contest with the Devil where the mortal wins. The emotional template for Phase 4.
- **Ghost Riders in the Sky** (Stan Jones, 1948) — Damned cowboys chasing the Devil's herd across endless skies. Visual inspiration for Ghost Rider adds.
- **The Man in Black** archetype — Johnny Cash, Roland Deschain (Dark Tower), the stranger who walks into town. Old Scratch's visual identity.
- **Sergio Leone's "The Good, the Bad and the Ugly"** — The three-way standoff. Camera language of the Western duel: wide shot → tight cuts → the draw. The emotional pacing template for Phase 4.

### Design Principles Applied

1. **Each phase changes what the player does** — P1: learn patterns. P2: juggle adds + boss. P3: manage arena + dodge bullet hell. P4: reaction-time duel.
2. **The arena is a character** — It shrinks, ignites, darkens, then clears. The crossroads tells a story through its transformation.
3. **The boss is a mirror** — Old Scratch uses the player's weapon archetype in Phase 1. He's what you'd become if you made the wrong deal.
4. **Priority puzzles create decisions** — Hellfire Pillars force "damage the boss vs. clear the arena" choices, exactly like Hades's vases and Nuclear Throne's generators.
5. **Emotional arc: tension → betrayal → chaos → intimacy** — Phase 1's gentleman duel → Phase 2's rule-breaking → Phase 3's overwhelming power → Phase 4's quiet, decisive showdown.
6. **The end mirrors the beginning** — Stage 1 starts with a duel. Stage 4 ends with one. The run is a circle. The crossroads is where all roads meet.
