# Coyote Jane (Stage 1 Trapper Boss)

## Summary

Coyote Jane is a territorial trapper boss for Stage 1 — a frontier huntress who turns the arena into a killbox of bear traps, tripwire mines, and coyote pack ambushes. She hangs back with a long-barreled hunting rifle, placing hazards and picking shots while her traps do the herding.

The fight **inverts the standard boss dynamic**. Most bosses are threats you react to. Jane is a threat you must pursue. She retreats, she fortifies, she waits. The arena is her weapon. The player must push forward through an increasingly dangerous space to reach a boss who doesn't want to be reached.

## Encounter Trigger

- Stage: `Stage 1`
- Timing: `Last wave` (Wave 2 threat slot)
- Boss pool slot: Rotates with Reverend Boomstick and other Stage 1 bosses
- Entity count: Single threat-tier entity + trap entities + summoned coyote adds

---

## Design Reasoning

### Why a Trapper Boss?

The Stage 1 boss pool has ranged pattern-casters (Boomstick), melee berserkers (Mad Dog), and duo fights (Dalton Boys). Jane fills the **arena control** niche — a boss whose primary threat isn't her attacks but the *environment she creates*. This tests a completely different skill: spatial awareness and arena memory.

Trapper bosses are uncommon in roguelites but appear in the broader action game canon. The Angler in Inscryption "hooks" your cards. Kallamar in Cult of the Lamb creates distance and uses area denial. The concept of a boss who fights by controlling space rather than directly attacking is well-established but underrepresented in top-down shooters.

Jane's design is also thematically rich for a Western. The frontier huntress who traps her prey is a classic archetype — but usually the player IS the hunter. Making the trapper the *boss* flips the dynamic: the player is the quarry, walking into a prepared killing ground. The fight is about proving you're not prey.

### Why It Fits Stage 1

Stage 1's other bosses test reactive skills — dodging what comes at you. Jane tests proactive skills:

- **Can you remember where hazards are?** (Arena memory)
- **Can you manage a space that's getting more dangerous over time?** (Strategic thinking under pressure)
- **Can you push forward against a retreating enemy while managing terrain?** (Aggression through obstacles)
- **Can you multitask: clear traps, dodge rifle shots, and handle coyote adds simultaneously?** (Cognitive load management)

These skills become essential in later stages, where arena hazards (fire, corruption, environmental damage) are common. Jane teaches the player to pay attention to the ground, not just the enemies.

### The Retreating Boss Problem

A boss that runs away risks being annoying rather than challenging. Players want to *fight* bosses, not chase them. Jane's design solves this through three mechanisms:

1. **She can't run forever.** The arena has finite space. Jane repositions between cover points at the arena perimeter — she circles the edges, she doesn't flee off-screen. The player always knows where she is.
2. **She commits to attacks.** Her rifle shots require her to stop, kneel, and aim (0.7s telegraph). During this and the bolt-action recovery (1.0s), she's stationary and vulnerable. Every shot she takes is a window to close distance.
3. **Phase 3 forces engagement.** At 35% HP, Jane stops retreating and gets aggressive. The dynamic flips — now she's coming to you, hip-firing at close range. The transition from "chase the trapper" to "escape the huntress" is the emotional peak of the fight.

---

## Boss Fantasy and Lore

Jane Cassidy — "Coyote Jane" — hasn't lived in a town in twelve years. She walked into the desert after burying her husband and she never came back. Out there she learned the language of the wild: where to set a line, how to read a track, when to be patient and when to strike. She's not crazy. She's not feral. She's just decided that people aren't worth the trouble.

She comes to town when she needs something — powder, salt, wire. She trades pelts. She doesn't make conversation. When the trouble started, she didn't take a side. But someone — or something — has pushed into her territory, and she's treating the incursion the way she'd treat any predator: traps, patience, and a clean shot.

### Tone Goals

- **Competence as menace.** Jane isn't physically imposing like Mad Dog or theatrically threatening like Boomstick. She's dangerous because she's *prepared*. The fear comes from realizing you walked into her territory and she's already three steps ahead.
- **Quiet confidence.** She speaks rarely and economically. No boasting, no taunting. Professional distance. She's doing a job — the job is stopping you.
- **Respect for the player.** Jane doesn't underestimate the player. Her dialogue (what little there is) acknowledges that the player is dangerous. She just thinks she's more dangerous. And for most of the fight, she's right.
- **Frontier solitude.** There's a loneliness to Jane that's part of her identity. She's chosen isolation. The coyotes are her only companions. This isn't tragic — it's a choice she's at peace with. But it informs her fighting style: self-reliant, patient, methodical.

### Sample Bark Lines

**Pre-fight (rare — she'd rather not talk):**
- "You're on my land. Turn around."
- *(the player doesn't turn around)*
- "...Figured you'd say that."

**During fight (very sparse — she's focused):**
- *(whistle — summoning coyotes. No words needed.)*
- "Watch your step." *(said flatly after the player triggers a trap — it's not a taunt, it's a genuine observation)*
- "Hm." *(when the player destroys one of her traps — mild annoyance, nothing more)*

**Phase 3 transition:**
- "Alright. No more patience."

**If the player has been playing aggressively (closing distance, destroying traps):**
- "You hunt too. Good."

### Visual Design

- Lean, weathered, mid-40s. Sun-darkened skin, deep-set eyes. Years of squinting into desert glare.
- Rawhide duster coat, tanned leather, hand-stitched. Bone and tooth necklace. A coyote fang earring.
- Wide-brimmed hat, battered, pulled low. (Unlike Clyde Dalton's "cool" hat, Jane's is functional — sun protection, not style.)
- Long-barreled hunting rifle, bolt-action, worn but immaculate. She takes care of her tools.
- Belt with pouches and loops: traps, wire, caltrops, a knife. The utility belt of a working hunter.
- Moves in a crouch when repositioning. Upright and still when aiming. The transition between crouched movement and standing aim is the visual telegraph for an incoming shot.
- No cape, no flourish, no ornamentation. Everything she wears is practical. The design communicates: this person survives.

**The Coyotes:**
- Smaller sprites, lean and angular. Desert coyotes, not wolves — scruffy, opportunistic, fast.
- Move in quick, darting patterns. They don't charge — they circle and nip.
- Distinct from Swarmers in movement style: Swarmers beeline, coyotes arc and flank.

---

## Combat Design

### Core Combat Loop

The fight has two concurrent layers:

**Layer 1: Navigate the arena.** Jane places bear traps, tripwire mines, and (in Phase 2) caltrop zones. The player must track these hazards while fighting, clearing them with bullets or memorizing their positions to avoid them. The arena starts clean and gets progressively more hazardous.

**Layer 2: Close distance and punish.** Jane stays at range, repositioning between cover points at the arena perimeter. Her rifle shots are powerful but telegraphed (laser sight, long charge). The player must close the distance to hit Jane during her post-shot recovery or during repositioning dashes. But closing distance means moving through the trapped arena.

These layers create the core tension: **the shortest path to Jane is the most dangerous one.** The safe path is longer and gives her more time to set up. Every movement decision balances speed against safety.

### Attack Patterns

#### Jane's Moveset

**1. Hunting Rifle Shot (Primary — all phases)**

- Telegraph: Jane stops moving, kneels, and steadies her rifle. A red laser sight line appears from her position to the player (0.7s charge time). Audio: a rising mechanical tension sound (the trigger being pulled).
- Attack: Single high-damage bullet along the laser line.
- Damage: 16 (the highest single-hit damage of any Stage 1 boss attack)
- Bullet speed: 600 units/sec (fast — hard to reaction-dodge if close, but the laser gives you 0.7s to sidestep)
- Recovery: 1.0s bolt-action cycling. Jane is stationary during this. **This is the primary punish window.** If the player is close enough, they can dump 3-4 shots into Jane before she moves again.
- Intent: High risk, high reward for both sides. Jane deals massive damage if she hits. But the long telegraph + long recovery means every shot she takes is a gamble. The laser sight gives perfect information — the player always knows exactly when and where the shot is coming.

**2. Bear Trap Placement (Utility — all phases)**

- Behavior: While repositioning between cover points, Jane drops bear traps on the ground behind her.
- Trap properties:
  - Visible: copper/iron sprite on the ground, glinting in light. Readable at top-down scale.
  - Trigger radius: 16px (generous — brush against it and it snaps)
  - Effect: Immobilizes the player for 0.8s. Deals 4 damage.
  - Destructible: 1 bullet to destroy. Destroyed traps disappear with a metallic snap.
  - Duration: Permanent until triggered or destroyed.
- Placement rate: ~1 trap per reposition (she drops it mid-dash)
- Intent: Area denial that accumulates over time. Early traps are easy to track. After 3-4 repositions, the arena has scattered hazards. Getting immobilized near Jane is extremely dangerous (she'll have a free rifle shot on a stationary target). Destroying traps costs ammo/attention. Ignoring them costs mobility. The player must choose.

**3. Reposition Dash (Utility — all phases)**

- Behavior: Jane dashes between 5-6 cover points around the arena perimeter (behind wagons, around building corners, beside water troughs). Each dash is fast (0.3s) with a brief dust-trail telegraph.
- Pattern: After every 1-2 rifle shots, Jane repositions to a different cover point. She favors points that are far from the player.
- Vulnerability: Jane can be hit during the dash (she's in the open for 0.3s), but it requires pre-aiming at her destination. Skilled players will learn her cover point rotation and predict her next position.
- Intent: Keeps Jane mobile, prevents the player from establishing a safe firing position. Forces the player to constantly re-evaluate approach angles.

**4. Tripwire Mine (Phase 2+ — new hazard)**

- Placement: Jane throws a small device that creates a near-invisible wire between two anchor points (walls, obstacles, trap stakes). The wire shimmers faintly.
- Trigger: Walking through the wire detonates it. 60px radius explosion.
- Damage: 10 (explosion)
- Destructible: Shoot either anchor point to disarm (2 bullets per anchor). Or shoot the wire itself with precise aim (1 bullet, smaller target).
- Duration: Permanent until triggered or disarmed.
- Placement rate: 1 per 2 repositions
- Intent: More dangerous than bear traps (higher damage, harder to see, explosion has radius) but less frequent and destructible. Introduces a "can you see it?" skill check. The faint shimmer rewards attentive players. In a cluttered arena with dust and combat effects, spotting tripwires requires deliberate attention.

**5. Coyote Whistle (Phase 2+ — summon)**

- Behavior: Jane puts two fingers to her mouth and whistles (0.3s animation, distinctive audio cue).
- Summons: 2 Coyote adds spawn from arena edges
- Coyote stats:
  - HP: 6 (fragile — 2-3 player shots)
  - Speed: 120 units/sec (fast, faster than the player)
  - Behavior: Circle the player at medium range, then dart in for a bite (4 damage) and retreat. They don't charge — they harass.
  - Distinct from Swarmers: Coyotes circle and feint before committing. They approach from flanks, not head-on.
- Cooldown: 12 seconds (Jane won't whistle again while coyotes are alive)
- Intent: Coyotes serve two functions. First, they demand attention — ignoring them means taking chip damage from flanking bites while trying to deal with traps and rifle shots. Second, they herd: their circling behavior pushes the player toward trapped areas. Jane placed the traps, the coyotes push you into them. It's a hunting strategy — beaters driving game toward the snare line.

**6. Caltrop Scatter (Phase 3 — new hazard)**

- Behavior: While moving, Jane throws caltrops behind her in a 40px radius scatter pattern.
- Caltrop properties:
  - Visual: Small metallic sprites scattered on the ground
  - Effect: Entering a caltrop zone slows the player by 30%
  - Duration: 8 seconds, then fade
  - Not destructible (too small and numerous)
- Intent: Phase 3's closing tool. Jane uses caltrops to create slow zones between herself and the player during her new aggressive behavior. They're temporary (unlike traps) but ubiquitous. Combined with existing bear traps and tripwires, the arena in Phase 3 is a patchwork of hazards.

**7. Hip Shot (Phase 3 — new attack, replaces aimed shots when close)**

- Telegraph: Jane raises her rifle to hip level (0.3s — much shorter than the aimed shot)
- Attack: Quick snap-shot, less accurate (bullet offset of ±8°), lower damage
- Damage: 8 (half of aimed shot)
- Recovery: 0.5s (much shorter — she's not cycling the bolt as carefully)
- Intent: Phase 3 Jane is no longer a patient sniper. She's a cornered predator fighting at close range. Hip shots are less dangerous individually but come much faster, creating sustained pressure instead of high-stakes single shots. The transition from slow, powerful aimed shots to fast, light hip shots changes the fight's rhythm entirely.

### Phase Structure

**Phase 1: The Killbox (100% to 70%)**

The fight opens with Jane already at a perch, rifle aimed. The player enters the arena and the laser sight is already tracking them.

- Moveset: Rifle Shot + Bear Trap placement + Reposition Dash
- Tempo: Deliberate and measured. Jane fires every 4-5 seconds, repositions after 1-2 shots, drops 1 trap per reposition.
- Arena state: Clean initially. After 60 seconds, 4-6 bear traps are scattered around the arena. The player's safe movement paths are narrowing.
- Teaching goal: The player learns three things. (1) The laser sight means a shot is coming — move laterally. (2) Jane's post-shot recovery is the punish window — close distance during it. (3) Bear traps are visible and destructible — shoot them or remember their positions. The fight is slow enough that the player can learn without being overwhelmed.
- Emotional state: Creeping tension. The arena is getting more dangerous every few seconds. The player starts feeling the walls closing in. The first time they hit a bear trap and get immobilized while Jane lines up a shot, they understand the threat model.

**Phase 2: The Hunt (70% to 35%)**

Transition: Jane drops a smoke charge at her feet, vanishes momentarily (0.45s invulnerability), and reappears at the farthest perch. A coyote howl echoes.

- Gains: Tripwire Mines, Coyote Whistle
- Tempo increase: Jane fires every 3-4 seconds. Repositions after every shot. Drops traps more frequently.
- Coyotes arrive 3 seconds after the phase transition whistle. They immediately begin circling.
- Tripwires start appearing between obstacles and walls. The arena has two types of invisible boundary now: traps you can see (bear traps) and traps you almost can't (tripwires).
- The coyotes' herding behavior pushes the player toward trapped zones. The player must manage three things simultaneously: dodge rifle shots, deal with coyotes, and navigate the trap field. This is the cognitive peak of the fight.
- The player is forced to make triage decisions constantly. Clear the coyotes first? Rush Jane during her recovery? Stop to destroy nearby traps? All three are valid but none is cost-free.

**Phase 3: Cornered Animal (35% to 0%)**

Transition: Jane's last coyote lets out a yelp (if alive), and Jane straightens from her crouch. She racks the rifle aggressively and steps out from cover. "Alright. No more patience."

The dynamic inverts. Jane stops retreating. She advances on the player.

- Gains: Caltrop Scatter, Hip Shot
- Loses: She stops placing new bear traps and tripwires (existing ones remain). She stops using the slow aimed rifle shot — switches entirely to hip shots.
- Movement: Jane moves toward the player at 85 units/sec (fast for a boss), weaving between her own trap field (she never triggers her own traps).
- Attack style: Hip shots every 2 seconds, caltrops scattered during movement. She's aggressive but not reckless — she still repositions laterally, but toward the player instead of away.
- The arena is at its most hazardous: all the traps from Phases 1-2 are still present, plus Jane's new caltrop trails. Jane moves through it effortlessly (she placed it all — she knows where everything is). The player does not.
- Summons: 2 more coyotes on transition. They're more aggressive in Phase 3 — shorter circling time before committing to bites.
- The emotional shift is dramatic. For 2-3 minutes, the player has been the aggressor, pushing forward against a retreating boss. Now Jane is hunting *them*. The trapped arena that was an obstacle to reaching her is now an obstacle to escaping her. The killbox she built? The player is inside it.

### Tuning Reference

| Parameter | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| Rifle shot telegraph | 0.70s | 0.65s | — (no aimed shots) |
| Rifle shot recovery | 1.00s | 0.85s | — |
| Hip shot telegraph | — | — | 0.30s |
| Hip shot recovery | — | — | 0.50s |
| Rifle damage | 16 | 16 | — |
| Hip shot damage | — | — | 8 |
| Fire rate | Every 4-5s | Every 3-4s | Every 2s |
| Reposition frequency | Every 2 shots | Every shot | Continuous movement |
| Bear trap placement | 1 per reposition | 1 per reposition | None (existing remain) |
| Tripwires | — | 1 per 2 repos | None (existing remain) |
| Coyotes alive max | — | 2 | 2 (resummons on death) |
| Movement speed | 50 | 55 | 85 |
| Movement behavior | Retreating | Retreating | Advancing |
| HP | ~220 | | |
| Phase thresholds | 70% | 35% | 0% |
| Transition i-frames | 0.45s | 0.45s | — |

---

## Challenge Design

### What Skills Are Tested?

| Player Skill | How Coyote Jane Tests It |
|---|---|
| **Spatial awareness** | The arena fills with traps over time. The player must track hazard locations while fighting. Walking into a bear trap near Jane is almost always fatal (immobilize + free rifle shot). |
| **Arena memory** | Traps are placed incrementally during repositions. The player must remember where they are — especially tripwires, which are nearly invisible. |
| **Multitasking** | Three concurrent demands: dodge rifle shots, manage coyote adds, navigate trap field. Prioritizing wrong gets you killed. |
| **Aggressive pursuit** | Jane punishes passive play. If the player stays at range and trades shots, Jane wins — her rifle hits harder and she's behind cover. The player must push into the trapped arena to reach her recovery windows. |
| **Target prioritization** | Coyotes are low-HP distractions. Spending too long on them lets Jane reposition and place more traps. Ignoring them means chip damage and being herded into traps. The balance is: kill them quickly, then refocus on Jane. |
| **Adaptability** | Phase 3 completely changes the fight's character. Skills that served the player in Phases 1-2 (patient approach, trap avoidance) are suddenly insufficient. They must switch to reactive dodging while navigating their own arena knowledge. |

### Difficulty Curve Within the Fight

1. **Phase 1 opening (0-30s):** Clean arena, simple pattern. Dodge laser, shoot during recovery. Manageable.
2. **Phase 1 middle (30-60s):** 4-6 traps on the ground. Movement paths narrowing. The first "oh no" trap trigger.
3. **Phase 1 end (60-90s):** Arena is moderately hazardous. The player is spending mental energy tracking traps AND fighting.
4. **Phase 2 entry:** Spike. Tripwires add invisible hazards. Coyotes add harassment. Cognitive load jumps.
5. **Phase 2 middle:** Peak complexity. The arena is a minefield. Coyotes push the player around. Jane fires from cover. The player must triage constantly.
6. **Phase 3 entry:** The inversion. Emotional shock of Jane advancing. The player's approach strategy no longer works.
7. **Phase 3 middle-to-end:** The hunted becomes the prey. Caltrops + existing traps + aggressive Jane + coyotes = maximum pressure in a hazardous arena. Frantic, desperate, exhilarating.

### Anti-Trivialization

- **Retreating behavior** in Phases 1-2 prevents face-tanking. The player can't just stand still and DPS — Jane won't let them get close easily.
- **Trap accumulation** means longer fights are harder fights. High-DPS builds shorten the fight and face fewer traps. Low-DPS builds face a progressively more dangerous arena. The fight naturally scales with player power.
- **Coyote harassment** prevents tunnel-vision on Jane. Even with a powerful build, ignoring coyotes means taking damage and being herded.
- **Phase 3 aggression** prevents infinite patience. The player can't slowly clear every trap and carefully approach — Jane is coming, and she's faster than expected.
- **Trap durability (1 bullet per trap)** means trap-clearing costs ammo and attention but is always possible. The player is never *trapped* — just taxed.

---

## Why This Boss Is Fun

### The Arena Evolves

No other boss in the pool changes the arena this dynamically. When the fight starts, the ground is clean. By Phase 2, it's a minefield. By Phase 3, it's a patchwork of bear traps, tripwire shimmers, caltrop zones, and debris. The arena tells the story of the fight — here's where Jane was perched, there's the trap line she set up, those caltrops mark her Phase 3 approach route. Every fight's arena looks different because Jane places traps based on the player's position.

### The Phase 3 Inversion

The moment Jane stops retreating and starts advancing is one of the best emotional beats in Stage 1. For minutes, the player has been carefully pushing forward through a dangerous space to reach a retreating boss. When that boss suddenly turns around and starts hunting *you* through the trap field *she built* — the feeling is electric. The dynamic flips completely, and all the spatial knowledge the player accumulated becomes survival knowledge instead of approach knowledge.

### The Huntress Fantasy (For Both Sides)

In Phases 1-2, the player is the hunter. They're pushing into Jane's territory, clearing her traps, closing distance, finding punish windows. It feels deliberate and skilled. In Phase 3, the player is the hunted. They're navigating a hostile environment while a predator closes in. Both halves are satisfying in different ways — and the transition between them is the dramatic peak.

### The Trap Destruction Rhythm

Shooting a bear trap has a satisfying metallic snap. Disarming a tripwire has a tense wire-cut sound. Clearing a path through Jane's killbox feels like dismantling a puzzle — each trap destroyed is a small victory. Players who enjoy systematic destruction (clearing out hazards, optimizing their path) will love this fight's secondary layer.

### Coyote Management

The coyotes add a living, dynamic element to the trap puzzle. They're not random — their circling-and-darting behavior pushes the player in specific directions (toward traps). Recognizing this and countering it (killing coyotes quickly, or using their behavior to lead them into Jane's own traps) is a satisfying strategic layer.

### Readability Rewarded

Jane's entire threat model is based on visible information. Bear traps are visible. Tripwires shimmer. The laser sight shows exactly where the rifle shot is going. Coyotes telegraph their dart-in with a crouch. Nothing is hidden — everything is readable. The challenge is processing all of it simultaneously. Players who develop awareness are rewarded with clean, efficient runs through the killbox.

---

## Aesthetic and Audio

### Arena

Coyote Jane works best in a **town edge / wilderness transition** setting:

- One side of the arena is town structures (buildings, porches, wagons). The other side fades into scrubland (rocks, dead trees, brush).
- Jane's cover points are distributed around the perimeter: behind a wagon, beside a building corner, crouched behind a rock outcrop, in the shadow of a water tower.
- The terrain has natural "lanes" between obstacles that Jane traps. The player can see the lanes and anticipate where traps will appear.
- Elevated ground at one or two perimeter points (a porch roof, a boulder) that Jane uses early in the fight.
- The arena should feel like the boundary between civilization and wilderness — exactly where a frontier huntress would set her trapline.

### Music

- **Phase 1:** Sparse, ambient tension. Desert wind. A lone plucked guitar string every few seconds. The sound of space and patience. The music mirrors Jane: unhurried, watchful.
- **Phase 2:** The guitar picks up a slow, stalking rhythm. Coyote howls woven into the score. Low percussion like distant drums. The music reflects the increasing danger — more layers, more tension, but still controlled.
- **Phase 3 transition:** The music stops for one beat. Silence. Then — driving, aggressive percussion. The guitar becomes urgent, almost frantic. The patient hunter is gone. The predator has arrived. The music shift is the first thing the player notices, even before Jane's movement changes.

### Sound Design

- Rifle: A sharp, echoing crack. The single loudest sound in the fight. Each shot should feel significant — not a rapid-fire patter but a deliberate, powerful report. The bolt-action cycling is a metallic chunk-chunk that signals recovery.
- Bear traps: A spring-loaded SNAP when triggered (startling even when expected). A quieter metallic tink when destroyed by the player (satisfying). A faint creak when placed (nearly inaudible — you might hear it if you're paying attention, rewarding audio awareness).
- Tripwires: A taut wire hum when placed. A sharp ping when disarmed. An explosive crack when triggered.
- Coyotes: Yipping calls when summoned. Growls when circling. A sharp bark before each dart-in (audio telegraph). Whimpering when hit.
- Jane's movement: Quiet. Leather-on-dirt. Almost silent footsteps. The contrast with Mad Dog's thundering stomps is deliberate — Jane is quiet where he is loud.
- Caltrop scatter: A metallic rain sound. Tinkling on stone.
- Whistle: Two sharp notes (Jane's summoning whistle). Distinctive, learned quickly. The player hears it and knows coyotes are coming.

---

## Narrative Impact

### Plot Thread Fit

Jane's "territorial loner" characterization makes her fit naturally into threads where the frontier itself is contested:

| Plot Thread | Role | Narrative Context |
|---|---|---|
| **The Corruption** | Guardian of the source | Jane has been living near whatever is causing the corruption. She's not corrupted — she's protecting her territory from everyone, including the player who's trying to investigate. Defeating her opens access to the corruption's source. She may even reluctantly share what she's seen. |
| **The Stranger** | The stranger's adversary | Jane and the stranger have history. The stranger came looking for something on Jane's land. Jane drove them off. The player encounters Jane while following the stranger's trail. Defeating her reveals the stranger's true objective. |
| **The Bounty** | Bounty target | Jane has a price on her head — maybe justified (she killed someone who trespassed), maybe not (a land company wants her gone). The player's job is to bring her in. The fight is the confrontation. Success = capture or kill. The moral question (was the bounty just?) feeds Act II. |
| **The Raid** | Third-party complication | Jane's territory overlaps with the raid's path. She doesn't care about the raid — she cares about people trampling through her land. She's as likely to trap raiders as the player. An optional ally-of-convenience beat if the player is perceptive. |

### Narrative Effects and Branch Hooks

**1. Success path (Jane defeated + side objective met)**

- Jane is subdued. She doesn't die easily in narrative terms — she's too tough for that. Captured, driven off, or convinced to stand down.
- If she's spared/captured, she can become a camp visitor in Act II — trading trapping supplies, sharing wilderness knowledge, or marking hazard locations on the next stage's map. She's more useful alive.
- Her territory can be explored for clues, resources, or the thing she was guarding.
- If the side objective was "Protect" (e.g., protect a supply wagon from Jane's traps while fighting her), success means the supplies reach town intact.

**2. Soft-failure path (Jane defeated, but side objective failed)**

- Jane is stopped but the collateral cost was high. Supplies lost to traps. Structures damaged. Time wasted navigating her killbox while something else failed.
- Jane escapes during the chaos (she's a survivalist — she knows when to cut losses). She reappears in Act II as a recurring obstacle, placing traps in the player's path through the wilderness.
- The soft failure feeds naturally into Stage 2's environmental hazards: Jane's traps are now scattered along the route, creating an Intercept/Defuse layer in the next stage.

**3. Hard-failure path (player dies)**

- Jane watches the player fall from a distance. She doesn't gloat. She doesn't approach. She just waits until they stop moving, then turns and walks back into the wilderness.
- Death screen text: "They found the traps. They didn't find her. Nobody ever does."
- The most understated death in Stage 1. No drama, no villain speech. Just the quiet efficiency of a predator who outlasted her prey.

### Boss Dialogue in the Narrative System

Jane's dialogue pool is small by design. She's not a talker. What she says matters more because she says so little.

**Tier 1 (Essential — first encounter):**
- "You're on my land. Turn around."
- *(pause)*
- "...Figured you'd say that." *(rifles up)*

**Tier 2 (Contextual):**
- If the player destroys 3+ traps in Phase 1: "Hm. You've got eyes." *(grudging respect)*
- If the player gets caught in a bear trap: *(nothing — silence is worse than a taunt. She just lines up the shot.)*
- If the player kills a coyote: *(a sharp intake of breath — the only time Jane shows emotion during the fight. The coyotes matter to her.)*
- On Phase 3 transition: "Alright. No more patience."
- If the player is low HP entering Phase 3: "Should've turned around."
- If player kills both coyotes in Phase 2: "You'll pay for that." *(Phase 3 coyotes are replaced by a single Coyote Alpha — larger, 15 HP, knockback bite. Killing her companions makes Phase 3 harder, not easier.)*

**Tier 3 (General pool):**
- "Quiet now." *(during rifle aim — almost to herself)*
- *(whistle)* *(coyote summon — no words needed)*
- "Hmph." *(on taking damage — annoyance, not pain)*

### The Coyote Alpha Variant

If the player kills both coyotes in Phase 2, Jane's Phase 3 summon is a Coyote Alpha instead of 2 regular coyotes. This is a narrative-mechanical integration: killing her companions makes her angry, and that anger manifests as a tougher summon. It rewards players who left the coyotes alive (managing them rather than killing them) and punishes players who "cleared the adds" without thinking about consequences.

This is a minor twist, not a major mechanic. But it's the kind of detail that makes players tell stories: "I killed her coyotes and she summoned this huge one that almost killed me."

---

## Potential Variations

1. **Arena variant:** Wilderness/canyon setting instead of town edge. Natural terrain (rock formations, dry creek beds) replaces buildings. Traps blend into the environment more (bear traps in brush, tripwires between rocks). Harder to read, higher skill ceiling.
2. **Objective variant:** "The Quick-Draw Signal" intercept — Jane has set up a signal post at one end of the arena. If one of her coyotes reaches it and howls, reinforcements arrive (more coyotes, or a mini-boss — a Coyote Alpha from the start). The player must intercept the signal coyote while fighting Jane.
3. **Boss variant:** "Widowmaker" — Jane has a second weapon: a knife for close range. If the player closes to melee distance, Jane switches to fast knife attacks instead of retreating. Creates a risk-reward for aggressive pursuit.
4. **Co-op scaling:** More traps placed per reposition (more players = more arena to cover). Coyotes can fixate on different players, splitting the group. Jane's laser sight can target one player while another closes distance — coordinated pushes are the optimal strategy.

---

## Best-Practice Alignment

This design follows principles from:
- `docs/research/boss-design.md`
- `docs/research/narrative-boss-design.md`
- `docs/mechanics/stage-objectives.md`

Applied practices:

- **Designed around player moveset:** Tests movement (navigating traps), dodge roll (rolling through hazards and attacks), aim (destroying traps, hitting Jane during brief windows), and jump (evading ground-level hazards). Every player tool is relevant.
- **Telegraph -> attack -> recovery:** Jane's rifle has the longest telegraph in Stage 1 (0.7s laser sight) and the most rewarding recovery (1.0s stationary). The fight is maximally fair.
- **Additive phase escalation:** Phase 2 adds tripwires, coyotes, and covering fire. Phase 3 adds caltrops and hip shots while inverting the movement dynamic. Each phase adds without removing.
- **Arena as participant:** The arena IS the primary threat. Jane's traps transform the space over the course of the fight. The ground at the start is not the ground at the end. This is the purest expression of "arena as participant" in the Stage 1 pool.
- **Anti-trivialization through accumulation.** Longer fights mean more traps, which means more danger. The fight naturally punishes low DPS without an explicit enrage timer.
- **Narrative punctuation:** Jane's quiet competence, the Phase 3 inversion, and the coyote bond create a memorable character from minimal dialogue.
- **Soft-failure potential:** Jane's traps naturally extend into side objectives. Her territory can contain the MacGuffin. The killbox creates organic environmental threats for side objective integration.
- **Readability first:** Every hazard is visible (or nearly visible for tripwires — the shimmer rewards attention). The laser sight is the clearest telegraph in the game. The fight teaches observation as a skill.

---

## Implementation Considerations

### ECS Architecture

Jane is a single boss entity with standard Enemy/EnemyAI/AttackConfig components. Her unique systems:

- `TrapEntity` component for bear traps: `{ type, triggerRadius, damage, immobilizeDuration, hp }`. Bear traps are separate entities spawned during Jane's reposition dash.
- `TripwireEntity` component: `{ anchor1, anchor2, explosionRadius, damage, hp }`. Tripwires are pairs of anchor entities with a logical line between them. Collision detection checks if a moving entity crosses the line between anchors.
- `CaltropZone` component: similar to Mad Dog's `SlowZone` but temporary (has a `duration` field that ticks down).
- Coyote adds use the existing Enemy/EnemyAI system with a custom steering behavior: `CIRCLE_AND_DART` state that orbits the player at a preferred radius, then dashes in for a bite attack and retreats.

### AI Behavior — Jane

- Jane's AI adds a `RETREAT` sub-state that pathfinds to the farthest available cover point from the player
- Cover points are predefined arena data (like Clyde's perches)
- Attack priority: Reposition if player is close -> Aimed Shot if player is at range -> Drop trap during reposition
- Phase 3 flips the AI: `RETREAT` becomes `ADVANCE`, cover points become waypoints on a path toward the player, aimed shot is replaced by hip shot

### AI Behavior — Coyotes

- New steering behavior: `CIRCLE` at 100-120px radius, picking a tangent direction (clockwise/counterclockwise, alternating between coyotes)
- After 2-3 seconds of circling, transition to `DART_IN`: dash at player, melee bite, dash back to circle radius
- Coyotes should avoid Jane's traps (pathfind around them) — this is a simple check against known trap entity positions

### Trap Performance

- Bear traps are static entities (no AI, no movement). Lightweight.
- Tripwires are logical checks, not physics objects. O(n) per moving entity where n = number of active tripwires. Expected max ~8 tripwires in a fight — negligible.
- Caltrops are zone entities like ground hazards — overlap check only. Expected max ~6 zones active at once.
- Total extra entities in a Phase 3 fight: ~12-20 traps + 2-3 coyotes. Well within budget.
