# The Dalton Boys (Stage 1 Duo Boss)

## Summary

The Dalton Boys are a duo boss encounter for Stage 1 — two outlaw brothers who fight as a coordinated pair. Buck Dalton is a hulking melee brawler who charges the player with a hatchet. Clyde Dalton is a wiry sharpshooter who perches at elevated positions and fires aimed rifle shots. Together they create a **split-attention positioning puzzle** where dealing with one brother always exposes you to the other.

This is the "Theseus and Asterius" of High Noon's Stage 1 boss pool: a fight that tests target prioritization, spatial reasoning, and the ability to manage two simultaneous threat vectors.

## Encounter Trigger

- Stage: `Stage 1`
- Timing: `Last wave` (Wave 2 threat slot)
- Boss pool slot: Rotates with Reverend Boomstick and other Stage 1 bosses
- Entity count: Two threat-tier entities with a **shared HP bar**

---

## Design Reasoning

### Why a Duo Boss?

Every other boss in the Stage 1 pool is a single entity. Boomstick tests pattern-reading against one source of projectiles. Duo fights test a fundamentally different skill: **divided attention**. The player must track two enemies with different behavior profiles, decide which to prioritize moment-to-moment, and position themselves in the space *between* two threat zones rather than relative to one.

Duo bosses are among the most celebrated encounters in the roguelite canon. Hades' Theseus and Asterius is the gold standard — an aggressive melee bull and a ranged chariot champion who individually are manageable but together create emergent pressure that's greater than the sum of their parts. The Dalton Boys aim to capture that same dynamic through a Western lens.

### Why It Fits Stage 1

Stage 1 is about teaching. The player has just learned core mechanics through Wave 1's fodder and threats. The Dalton Boys test whether those skills transfer to a more complex scenario:

- **Can you dodge one threat while tracking another?** (Roll timing + spatial awareness)
- **Can you switch targets based on which brother is vulnerable?** (Aim precision + opportunity recognition)
- **Can you position yourself to minimize exposure to both?** (Movement mastery)

These are the foundational skills every later boss will demand. The Daltons teach them through composition rather than complexity — each brother individually is simpler than Boomstick, but together they're comparable.

### The Shared HP Bar

The brothers share a single health pool. Damage dealt to either brother depletes the same bar. This is a deliberate choice:

- **Removes "wrong target" frustration.** The player never wastes damage. Every bullet counts regardless of which brother it hits. This is critical for Stage 1 where new players shouldn't be punished for not knowing the "right" target order.
- **Creates organic target-switching.** Since both brothers contribute to the same bar, the optimal strategy is to shoot whichever brother is currently vulnerable — which naturally forces the player to read the fight and switch targets fluidly.
- **Simplifies phase thresholds.** One HP bar means clean phase transitions at clear percentages, same as every other boss.
- **Prevents "one brother down" degeneration.** If each had a separate HP bar, the fight would collapse into a single-target encounter once one brother dies. The shared bar keeps both brothers active for the entire fight, preserving the duo dynamic until the end.

When the shared HP reaches zero, both brothers go down together. Narratively: they came together, they fall together.

---

## Boss Fantasy and Lore

Buck and Clyde Dalton are outlaw brothers who've been robbing frontier towns since before anyone can remember. Buck is the muscle — enormous, loud, dumb as a fence post, swings first and asks questions never. Clyde is the brains — quiet, calculating, rarely misses with his rifle, always has an escape route planned. They've survived this long because Buck draws all the heat while Clyde picks off anyone who gets too focused on the big one.

They're not evil in a grandiose way. They're not on some mission. They rob towns because it's what they know. They're simple, dangerous men doing a simple, dangerous thing.

### Tone Goals

- **Grounded and human.** No supernatural elements, no grand schemes. Just two brothers who rob and kill. The most "Western" of all the Stage 1 bosses.
- **Personality through contrast.** Buck is loud, taunting, aggressive. Clyde is silent, precise, lethal. The comedy and menace come from the dynamic between them.
- **Brotherly bond.** They cover for each other, call out to each other, react when the other takes damage. The relationship is the character. Hurting one provokes the other.

### Sample Bark Lines

**Buck (frequent, loud):**
- "Hold 'em steady, Clyde — I'll finish this close!"
- "You shoot like my dead grandmother, and she didn't have thumbs!"
- "That all you got? I've taken worse from a mule!"

**Clyde (rare, quiet — only during transitions or key moments):**
- "Buck. Move." *(phase 2 transition — one word commands)*
- "Don't get cocky. Aim." *(if Buck is taking heavy damage)*
- "...Left side." *(calling out the player's position to Buck)*

**Together (phase 3 — the back-to-back moment):**
- Buck: "Just like Abilene, brother?"
- Clyde: "Just like Abilene."

### Visual Design

**Buck Dalton:**
- Massive frame, barrel chest, rolled sleeves, suspenders over a sweat-stained undershirt
- Wide-brimmed hat, pushed back, showing a scarred forehead
- Carries a hatchet in one hand, sometimes two
- Moves with heavy footfalls, dust kicks up with each step
- Expressions: grinning, snarling, laughing — always animated

**Clyde Dalton:**
- Lean, angular, dark duster coat, hat pulled low over his eyes
- Lever-action rifle, always held. Never puts it down.
- Moves in quick, efficient bursts — crouches, repositions, never wastes motion
- Expressions: still, watchful, flat. A poker face.
- Smaller than Buck by a head, but the one you should actually be scared of

**Together:** The visual contrast is immediate and readable at top-down scale. Buck is large sprite, heavy animation, always in motion. Clyde is small sprite, still between repositions, perched at elevation. The player can always tell who is who at a glance.

---

## Combat Design

### Core Combat Loop

The player navigates the space between two overlapping threat zones: Buck's close-range melee pressure and Clyde's long-range aimed shots. Engaging one brother always means turning your back to the other. The core decision every second is: **which brother do I deal with right now, and how do I position to minimize the other's threat?**

This is not a fight you can solve by standing in one spot and dodging. It's a fight you solve by *moving through the arena* — using the space between the brothers, using cover to break Clyde's sightline, using distance to escape Buck's range.

### Attack Patterns

#### Buck's Moveset

**1. Hatchet Combo (Primary — all phases)**
- Telegraph: Raises hatchet overhead (0.45s wind-up), flash on blade
- Attack: Two-swing combo — wide horizontal arc, then overhead chop
- Horizontal arc: 140° cone in front of Buck, ~50px range
- Overhead chop: Targeted circle AoE at player's position, ~30px radius
- Recovery: 0.7s after the second swing (punish window)
- Intent: Forces lateral dodge on swing one, positional dodge on swing two. The combo has a rhythm: dodge-dodge-shoot.

**2. Bull Rush (Phase 1+)**
- Telegraph: Lowers head, scrapes ground with foot (0.5s wind-up), ground indicator shows charge direction
- Attack: Charges in a locked straight line at 280 units/sec for up to 200px
- If Buck hits a wall or arena edge: stunned for 1.0s (big punish)
- If Buck hits the player: 12 damage + knockback
- Recovery: 0.5s skid at end of charge (small punish even without wall hit)
- Intent: Creates large punish windows if the player baits the charge into a wall. Tests dodge roll timing. Also moves Buck across the arena, creating positional variety.

**3. Hatchet Hurl (Phase 2+ — new attack)**
- Telegraph: Draws arm back (0.4s), hatchet glints
- Attack: Throws hatchet in a line at the player's position. Travels 300px, then returns to Buck like a boomerang (can hit on the way back)
- Damage: 8 on hit (outgoing or return)
- Intent: Gives Buck a ranged option so the player can't just infinitely kite him. The return path creates a delayed danger — the player must track where the hatchet is even after dodging the initial throw.

#### Clyde's Moveset

**1. Aimed Shot (Primary — all phases)**
- Telegraph: Red laser sight appears from Clyde's position to the player (0.6s charge), accompanied by a charging audio cue (rising whine)
- Attack: Single high-damage rifle bullet along the laser line
- Damage: 14 (high — meant to punish)
- Recovery: 0.9s bolt-action cycling (Clyde is stationary and vulnerable during this)
- Intent: Heavy single shot with a long, readable telegraph. The laser sight gives the player clear information and time to dodge. The long recovery is the primary punish window for damaging Clyde. Teaches players to read and react rather than panic.

**2. Reposition Dash (Utility — all phases)**
- Behavior: Clyde dashes between 3-4 fixed elevated positions around the arena perimeter (rooftop corners, balcony, water tower)
- Dash is fast (0.3s travel time) with a brief dust-puff telegraph at the destination before he arrives
- Clyde is **vulnerable during the dash** — he's in the open, moving between perches. This is the secondary window to hit him.
- Pattern: After every 2 aimed shots, Clyde repositions. This is predictable and learnable.
- Intent: Keeps Clyde mobile so the player can't just stand behind cover permanently. The dash vulnerability rewards players who track Clyde's pattern and pre-aim at his next perch.

**3. Covering Fire (Phase 2+ — new attack)**
- Telegraph: Clyde braces rifle with both hands (0.4s), wider muzzle glow
- Attack: Rapid 3-shot burst in a tight spread aimed at the player
- Damage: 6 per bullet (less than aimed shot, but harder to dodge all three)
- Recovery: 0.6s
- Intent: Punishes players who are tunnel-visioning on Buck. The burst is harder to dodge than the single aimed shot, so Clyde becomes more threatening in Phase 2. Also used when the player is trying to close distance on Clyde — it's a "stay away" tool.

#### Combined Patterns

The brothers don't have scripted combination attacks in Phases 1-2. Their synergy is **emergent**: Buck forces movement, Clyde punishes movement. Dodging Buck's hatchet combo repositions you into Clyde's sightline. Chasing Clyde during his reposition dash exposes you to Buck closing distance.

In Phase 2, the **Back to Back** maneuver is the one scripted combination:
- Both brothers move to arena center
- Buck swings in a 360° hatchet arc (must roll through or be outside radius)
- Simultaneously, Clyde rapid-fires outward in the player's direction
- Duration: 2 seconds
- Then they split apart and resume independent patterns
- This is a brief pressure spike, not a sustained mode. It happens once per phase cycle.

### Phase Structure

**Phase 1: The Ambush (100% to 70%)**

Buck and Clyde start at opposite sides of the arena. Buck immediately begins advancing. Clyde takes his first perch.

- Buck: Hatchet Combo + Bull Rush at moderate cadence. 1.8s cooldown between attack chains.
- Clyde: Aimed Shot every 4s, repositions after every 2 shots.
- Tempo: Measured, learnable. The player has time to understand each brother's patterns independently before they start overlapping.
- Teaching moments: Clyde's laser sight is very obvious. Buck's wind-ups are long. The player learns to read both threats.

**Phase 2: The Job Goes Sideways (70% to 35%)**

Transition: Buck roars, Clyde racks a fresh round. Brief invulnerability (0.45s). Both brothers reposition.

- Buck gains Hatchet Hurl. Throws between melee combos, creating ranged threat from the melee brother.
- Clyde gains Covering Fire. Uses it when the player is close to Buck (protecting his brother) or when the player tries to rush Clyde's perch.
- Cooldowns tighten: Buck's chain cooldown drops to 1.4s. Clyde fires every 3s.
- **Back to Back** maneuver happens once, approximately 15-20 seconds into Phase 2 (and again later if phase lasts long enough).
- Spawns: 3 Swarmers on phase transition. They add ambient pressure and body-blocking but are easily dispatched. Their purpose is to clutter the space and make dodging Buck slightly harder.

**Phase 3: Blood and Kin (35% to 0%)**

Transition: This is the emotional peak. Whichever brother has taken more recent damage stumbles, drops to one knee. The other brother reacts.

Two variants depending on which brother is "injured" (determined by which brother took the last hit that crossed the 35% threshold):

**Variant A — Buck is hurt:**
- Buck slows down (movement speed -30%), attacks less frequently, visually limping
- Clyde drops from his perch and fights on the ground alongside Buck — close-range rifle shots, faster repositioning, more aggressive
- Clyde stops using his perches entirely. Both brothers are now ground-level threats.
- Clyde's behavior shifts to protective: he positions himself between Buck and the player
- The fight becomes a close-range scramble with two ground threats

**Variant B — Clyde is hurt:**
- Clyde retreats to his most distant perch, fires less frequently, visually clutching his side
- Buck goes berserk: movement speed +30%, attack cooldown drops to 1.0s, starts throwing dynamite (area denial, 80px radius, 1.0s fuse)
- Buck actively body-blocks sightlines to Clyde, trying to protect his brother
- The fight becomes about getting past an enraged Buck to finish off the injured Clyde

Both variants add 2 Goblin Rogues on transition for ambient pressure.

The variant system means Phase 3 plays differently depending on how the player approached the fight. Players who focused on Buck get variant A. Players who focused on Clyde get variant B. This rewards adaptability and prevents a single memorized strategy from trivializing the final phase.

### Tuning Reference

| Parameter | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| Buck telegraph | 0.45-0.50s | 0.40-0.45s | 0.35-0.40s |
| Buck recovery | 0.70s | 0.60s | 0.50s |
| Buck cooldown | 1.8s | 1.4s | 1.0s |
| Buck move speed | 70 | 75 | 60 (A) / 90 (B) |
| Clyde telegraph | 0.60s | 0.55s | 0.50s |
| Clyde recovery | 0.90s | 0.70s | 0.60s |
| Clyde fire rate | 4.0s | 3.0s | 3.5s (A) / 4.0s (B) |
| Shared HP | ~250 | | |
| Phase thresholds | 70% | 35% | 0% |
| Transition i-frames | 0.45s | 0.45s | — |

---

## Challenge Design

### What Skills Are Tested?

| Player Skill | How the Daltons Test It |
|---|---|
| **Target prioritization** | Two targets, one shared HP bar. Shoot whoever is vulnerable *right now*. |
| **Split attention** | Must track Buck's position (melee threat) AND Clyde's laser sight (ranged threat) simultaneously. |
| **Spatial positioning** | Optimal position is one where Buck can't reach you AND you have cover from Clyde. That position shifts constantly. |
| **Dodge roll timing** | Buck's combos and Clyde's aimed shot both require precise dodge timing, but at different rhythms. |
| **Opportunity recognition** | Clyde's post-shot recovery and dash, Buck's post-charge stun — both are fleeting windows that reward aggressive play. |
| **Adaptability** | Phase 3 variant changes the fight dynamics. The player must read the new situation and adjust. |

### Difficulty Curve Within the Fight

1. **Opening 30 seconds:** Low pressure. Brothers are far apart. Player learns each one's patterns in semi-isolation.
2. **Phase 1 middle:** Pressure builds as Buck closes distance and Clyde's shots start overlapping with melee dodges.
3. **Phase 2 entry:** Spike. New attacks, tighter timings, Back to Back combo. Swarmers add clutter.
4. **Phase 2 middle:** Highest sustained pressure. Both brothers at full capability.
5. **Phase 3:** Emotional climax. One brother goes down, the other compensates. The fight changes character. Desperation.

### Anti-Trivialization

- **Shared HP bar** prevents instant-killing one brother to trivialize the fight.
- **Clyde's elevated perches** mean he can't be easily reached — the player must wait for dash windows or post-shot recovery.
- **Buck's aggression** prevents the player from camping at range and plinking Clyde.
- **Phase 3 variant** means even players who've learned Phases 1-2 face an unpredictable final third.

---

## Why This Boss Is Fun

### The Positioning Dance

Every second of this fight is a spatial puzzle. "Where do I stand so Buck can't hit me but I can shoot Clyde?" That answer changes constantly as both brothers move. It's a dynamic dance, not a static pattern. Players who enjoy the movement system will love this fight because it demands constant, purposeful repositioning — not just reactive dodging.

### The Brothers' Dynamic

The fight has *character*. Buck charging in while Clyde coolly lines up a shot tells a story without a single word. The Phase 3 moment where one brother goes down and the other reacts is an emotional beat embedded in gameplay. Players will remember "the time Buck went berserk because I hurt Clyde" as a narrative moment, not just a phase transition.

### Readable Mastery Curve

New players can survive by focusing on one brother at a time — dodge Buck, then shoot Clyde during recovery, then deal with Buck again. Expert players will interleave: dodge Buck's swing, snap-aim to hit Clyde during his reposition dash, then turn back to punish Buck's recovery. The fight rewards optimization without requiring it for survival.

### The "I Did It" Feeling

Duo fights have a uniquely satisfying victory moment because the player managed something that felt overwhelming. Juggling two threats feels harder than it mechanically is, which means the victory feels *more earned* than single-target fights of equivalent difficulty. This is the Theseus/Asterius effect.

### Emergent Stories

Because Phase 3 depends on how the player played Phases 1-2, every player's Dalton Boys fight ends differently. "I accidentally focused Buck and Clyde dropped down and almost killed me" is a different story from "I kept hitting Clyde so Buck went completely insane." This generates the water-cooler moments roguelites thrive on.

---

## Aesthetic and Audio

### Arena

The Dalton Boys work best in a **town main street** setting with elevation:

- Long rectangular arena with buildings on both sides
- 3-4 elevated positions for Clyde: rooftop corners, a balcony, a water tower
- Ground-level obstacles for Buck to charge into: wagons, barrels, a horse trough
- Destructible cover that gets smashed during the fight (Buck's charges break things), gradually opening sightlines
- Scattered crates and barrels that can block Clyde's laser sight — but only temporarily, because he'll reposition

The arena should feel like a real town street — not a featureless rectangle. The buildings have windows, porches, signs. The fight happens in a place, not an arena.

### Music

- **Phase 1:** Tense standoff — sparse guitar, low percussion, building tempo. A "heist gone wrong" feel.
- **Phase 2:** Full action — driving rhythm, dual melody lines (one for each brother — heavy drums for Buck, sharp strings for Clyde). The Back to Back moment should have a musical sting.
- **Phase 3:** Desperate — the melody fractures. Whichever brother is hurt, the music reflects it. Buck hurt: strings become dominant, frantic. Clyde hurt: drums become dominant, pounding. The music tells you what happened even if you're focused on gameplay.

### Sound Design

- Buck: Heavy footsteps, grunts with each swing, the chunk of hatchet into wood/ground, bellowing taunts
- Clyde: Bolt-action cycling (distinctive metallic sound), quiet breathing, the whistle of a passing rifle round, dust-scuff on repositioning
- Together: The sounds should layer cleanly — you can hear which brother is doing what even without looking. Buck's sounds are low-frequency. Clyde's are high-frequency. No frequency collision.

---

## Narrative Impact

### Plot Thread Fit

The Dalton Boys are natural fits for:

| Plot Thread | Role | Narrative Context |
|---|---|---|
| **The Raid** | Raid champions | The Daltons are leading the raid on town. Buck's the battering ram, Clyde's covering the operation from the rooftops. |
| **The Heist** | Security obstacle | The Daltons are guarding something. Buck patrols the ground floor, Clyde watches from above. You walked into their turf. |
| **The Bounty** | Bounty targets | Both brothers have prices on their heads. Bringing them in is the job. The question is whether you can take them both. |

They fit less naturally into "The Corruption" or "The Stranger" threads, which lean supernatural or mysterious. The Daltons are grounded and human — they work in action and crime stories.

### Narrative Effects and Branch Hooks

**1. Success path (both brothers defeated + side objective met)**

- The Daltons are captured or killed. The town is safe.
- Their loot can be recovered (retrieve objective variant) or their intel obtained (they were working for someone).
- Stage 2 opens with the player pursuing whoever hired the Daltons — or with the Daltons' gang seeking revenge.

**2. Soft-failure path (brothers defeated, but side objective failed)**

- The fight cost the town. Maybe the Daltons' crew escaped with the goods during the boss fight. Maybe the building they were holed up in is destroyed.
- Stage 2 shifts to recovery: resource scarcity, alternate route, or pursuit of the escaped loot.
- Variant: if the fight is paired with an intercept objective, the Daltons can be the fleeing bosses — at 35% HP, Clyde signals for horses and both brothers attempt to flee. Failure to stop them = soft failure. They reappear in Stage 2 with reinforcements.

**3. Hard-failure path (player dies)**

- The Dalton Boys ride off with everything.
- Death screen text: "The Daltons added another town to their list. Nobody came looking for the bodies."
- Next run may reference the Daltons' growing infamy if the same plot thread is selected.

### Boss Dialogue in the Narrative System

The Daltons support the priority-weighted dialogue pool:

**Tier 1 (Essential — first encounter):**
- Buck: "Well well. Someone with a backbone in this dust pile."
- Clyde: *(silence — he just raises his rifle)*

**Tier 2 (Contextual):**
- If player has a damage-boosting upgrade: Clyde: "Buck. This one's packing. Watch yourself."
- If player is low HP entering the fight: Buck: "Ha! Barely standing and still picking fights? I like that."
- On phase 2 transition: Buck: "Alright, enough playing around."
- On phase 3 (Buck hurt): Clyde: "That's my brother." *(said flatly, but the shift to ground-level aggression speaks louder)*
- On phase 3 (Clyde hurt): Buck: "NOBODY touches Clyde!" *(followed by the berserk behavior)*

**Tier 3 (General pool):**
- Buck: "Stand still so I can split you proper!"
- Buck: "Clyde, are you just gonna watch?!"
- Clyde: "...Reloading." *(during recovery window — tells the player this is a punish window)*

---

## Potential Variations

1. **Arena variant:** Ranch/barn setting instead of town. Buck fights in the corral, Clyde shoots from the hayloft. More enclosed, more chaotic.
2. **Objective variant:** "Stolen Goods" retrieve — the Daltons have scattered loot bags around the arena. Collecting them during the fight is the side objective. Buck's charges can knock bags around.
3. **Boss variant:** A third Dalton brother (Danny — the kid) as a Phase 3 addition on higher difficulty. Fast, fragile, uses dual pistols. Adds a third vector of pressure.
4. **Co-op scaling:** In multiplayer, Buck and Clyde can split targets — Buck chases one player while Clyde shoots another. Each player effectively fights one brother, but the brothers occasionally swap targets to prevent settling.

---

## Best-Practice Alignment

This design follows principles from:
- `docs/research/boss-design.md`
- `docs/research/narrative-boss-design.md`
- `docs/mechanics/stage-objectives.md`

Applied practices:

- **Designed around player moveset:** Tests dodge, aim, positioning, and movement. No new mechanics — just familiar skills applied to a two-target scenario.
- **Telegraph -> attack -> recovery:** Both brothers follow the TAR framework. Clyde's laser sight is the longest telegraph in Stage 1 (0.6s). Buck's recovery windows are the most generous punish windows in Stage 1 (0.7-1.0s).
- **Additive phase escalation:** Phase 2 adds new attacks to both brothers. Phase 3 restructures the fight based on player behavior. Each phase increases complexity while keeping the base patterns.
- **Arena as participant:** Elevated perches define Clyde's behavior. Destructible cover shapes sightlines. Buck's charges reshape the arena.
- **Narrative punctuation:** The brothers' relationship, the Phase 3 reaction moment, and the variant endings make this fight a story beat, not just a stats check.
- **Soft-failure potential:** Multiple natural hooks for intercept, retrieve, and race objectives.
- **Multiplayer-aware:** Shared HP bar scales simply (multiply HP by player count factor). Brothers can split attention across multiple players naturally.

---

## Implementation Considerations

### ECS Architecture

Two entities, each with full Enemy/EnemyAI/AttackConfig components, plus:

- A new `DuoBoss` component linking the two entities to a shared HP pool entity
- Shared HP lives on a third invisible entity (or on one brother with the other referencing it)
- Phase transitions triggered by the shared HP entity, broadcast to both brothers
- Phase 3 variant selection requires tracking which brother received the threshold-crossing hit

### AI State Extensions

- Clyde needs a `PERCHED` sub-state within `IDLE`/`CHASE` — he doesn't chase the player, he repositions between fixed perch positions
- Buck's AI is standard CHASE -> TELEGRAPH -> ATTACK -> RECOVERY with an additional target-of-opportunity check for Bull Rush (triggers when player is in a straight line at medium range)
- Back to Back is a scripted sequence triggered once per Phase 2 cycle: both brothers pathfind to center, execute combined attack, then resume independent AI

### Performance

- Two boss entities + 3-5 adds is well within the entity budget
- Clyde's laser sight is a visual-only effect (client-side render line), not a physics entity
- Elevated positions are predefined arena data, not dynamic pathfinding targets
