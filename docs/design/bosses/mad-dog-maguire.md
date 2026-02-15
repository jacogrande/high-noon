# "Mad Dog" Maguire (Stage 1 Berserker Boss)

## Summary

"Mad Dog" Maguire is a pure melee berserker boss for Stage 1 — an escaped convict wielding a prison ball-and-chain as an improvised weapon. He has **zero ranged attacks**. No bullets, no projectiles, no area-denial zones. Just an enormous man with an enormous reach who never stops coming.

The fight is a relentless kiting challenge that tests distance management, dodge roll economy, and sustained concentration. Where Reverend Boomstick asks "can you weave through bullet patterns?", Mad Dog asks **"can you keep running and still fight back?"**

## Encounter Trigger

- Stage: `Stage 1`
- Timing: `Last wave` (Wave 2 threat slot)
- Boss pool slot: Rotates with Reverend Boomstick and other Stage 1 bosses
- Entity count: Single threat-tier entity

---

## Design Reasoning

### Why a Pure Melee Boss?

The Stage 1 boss pool needs mechanical diversity. Boomstick is a ranged pattern-caster. The Dalton Boys are a split-attention duo. Mad Dog fills the third axis: **relentless forward pressure with no projectiles**. This creates a fight that feels fundamentally different from anything else in the pool.

Pure melee bosses are rare in top-down shooters because the default player strategy against melee enemies is trivial: walk backward and shoot. Mad Dog must solve this problem. His design uses three tools to prevent the kiting degeneracy:

1. **Extended reach.** The ball-and-chain has deceptive range — far longer than the player expects from a melee attack. What looks like a safe distance isn't.
2. **Closing speed.** Mad Dog has burst movement options (Shackle Lunge) that close distance instantly, punishing players who maintain a "comfortable" distance.
3. **Arena pressure.** His attacks leave lingering hazards (cracked ground, debris) that gradually reduce the kiting space, forcing the player to engage more tightly as the fight progresses.

The result is a fight where "run away and shoot" works for 30 seconds before the arena shrinks, the boss gets faster, and the player realizes they need to weave *in and out* — dodging through attacks to create punish windows rather than maintaining permanent distance.

### Why It Fits Stage 1

Mad Dog tests the skill that defines Stage 1 mastery: **movement efficiency**. Waves 1 fodder teaches the player to kite. Mad Dog tests whether they can kite *under sustained pressure* without panic-rolling into walls or wasting dodge cooldowns.

This is the most "action game" boss in the pool. No reading projectile patterns, no managing multiple targets, no tracking trap positions. Just you, him, and the question of whether your movement is good enough. It's the boss that makes the player realize their dodge roll has a cooldown and they need to budget it.

### The Simplicity Argument

Mad Dog is deliberately the simplest boss in the pool in terms of things to track. One enemy, no projectiles, no adds until Phase 3. This is a feature:

- **Low cognitive load, high execution demand.** The challenge is physical (positioning, timing) not mental (pattern recognition, target prioritization). This creates a different kind of tension — the "I know what he's going to do, I just need to not mess up" feeling.
- **First-time readability.** A new player facing Mad Dog for the first time understands the threat immediately: big man swinging big chain, stay away. No learning curve for the *concept*, only for the *execution*.
- **Speed-run appeal.** Skilled players will optimize Mad Dog fights into tight dodge-through-and-punish loops, creating beautiful high-level play that looks completely different from beginner kiting. The skill ceiling is in execution, not knowledge.

---

## Boss Fantasy and Lore

Ezekiel "Mad Dog" Maguire was the most dangerous prisoner in the Territory. Three murder convictions, two escape attempts, one dead warden. They put him in triple irons and loaded him on a transport wagon bound for the hangman's court in Silver Creek.

The wagon crashed. Nobody knows if it was an accident, a rescue attempt, or if Maguire just kicked the thing apart from the inside. When the dust settled, the two guards were dead, the horses were loose, and Maguire was gone — taking his ball-and-chain with him because nobody had the key to remove it.

He didn't break free of the chain. He made it a weapon. Now he's somewhere between the crash site and wherever his rage takes him next. He's not after anything. He's not working for anyone. He's just moving, and god help whatever's in his path.

### Tone Goals

- **Primal threat.** Mad Dog isn't clever or theatrical. He's a natural disaster in human form. The fear he generates is visceral, not intellectual.
- **Tragic undertone.** He's a man who's been caged and beaten until the man is mostly gone. The shackles he couldn't remove are now his identity. There's a sadness underneath the violence if you look for it — but the game doesn't force it. It's texture, not text.
- **Physical spectacle.** The ball-and-chain should feel *heavy*. Every swing should shake the screen. Every impact should crack the ground. The player should feel the weight of what they're dodging.

### Sample Bark Lines

Mad Dog doesn't speak in complete sentences. He's beyond that.

- *(guttural roar on first seeing the player)*
- "RUN." *(Phase 2 transition — the only clear word he says)*
- *(heavy breathing during recovery windows — not a taunt, just the sound of an animal catching its breath)*
- *(chain rattling as he winds up — the audio telegraph)*

If the game has a narrator or NPC commentator:
- "They put three sets of chains on that man. Weren't enough."
- "Don't try to reason with him. There's nothing left to reason with."
- "The prison wagon crashed two days ago. He's been walking since."

### Visual Design

- Enormous frame — the largest humanoid enemy sprite in Stage 1
- Torn prison uniform, half-shredded. One sleeve completely gone, showing a scarred, muscular arm.
- Broken shackles on both wrists, with dangling chain links
- The ball-and-chain: a heavy iron sphere on a 4-foot chain, attached to his right ankle. He swings it with his hands, using the ankle attachment as a pivot.
- Hunched posture, head down, eyes up — the look of something that's been caged and isn't anymore
- No hat. Shaved head, scarred. No adornment. The design screams "institutional" — this is a man who was property.
- Movement animation: heavy, deliberate footfalls that get faster as the fight progresses. Dust clouds on each step. The ground shakes subtly (screen shake impulse on heavy steps in Phase 3).

---

## Combat Design

### Core Combat Loop

Kite. Dodge. Punish. Repeat. But the devil is in the details.

Mad Dog advances constantly. The player retreats, maintaining distance. When Mad Dog commits to a swing, the attack has a wide arc and extended range — but a significant recovery window. The player rolls through or around the swing, gets behind Mad Dog during recovery, dumps damage, then retreats before the next swing.

The rhythm is: **retreat → bait attack → dodge → punish → retreat**. It's a matador fight. The player is the toreador, Mad Dog is the bull.

The complexity comes from three escalating pressures:
1. His reach gets less predictable (Whirlwind in Phase 2)
2. His closing speed gets more dangerous (Shackle Lunge in Phase 2)
3. The arena gets smaller (ground hazards in Phase 3)

### Attack Patterns

#### 1. Chain Sweep (Primary — all phases)

- Telegraph: Winds the ball-and-chain to one side (0.5s), chain rattling audio cue
- Attack: 180° sweep in front of Mad Dog, extending ~70px from his body (much longer than expected melee range)
- Damage: 10
- Recovery: 0.7s — Mad Dog is pulled by the momentum of the chain, leaving his back exposed
- Visual: The chain carves a visible arc through the air. Dust/debris spray along the sweep line.
- Intent: The bread-and-butter attack. Wide arc means lateral dodging is risky — the player should roll *through* the sweep (toward Mad Dog) or retreat beyond the 70px range. Teaches that "dodge toward the threat" is sometimes correct.

#### 2. Overhead Slam (Primary — all phases)

- Telegraph: Raises the ball overhead with both hands (0.6s), shadow circle appears on ground at player's position
- Attack: Slams the ball down at the targeted position. Impact creates a 40px radius AoE at the impact point.
- Damage: 14 (high — the punish for standing still)
- Recovery: 0.9s — the ball embeds in the ground briefly, Mad Dog has to wrench it free
- Visual: Ground cracks radially from impact point. Screen shake on impact. The embedded ball is visually distinctive (tells the player "he's stuck").
- Intent: Targeted AoE that punishes stationary play. The shadow telegraph gives clear positional information. The long recovery is the biggest punish window in the fight — this is where the player dumps their damage.

#### 3. Chain Whirlwind (Phase 2+ — new attack)

- Telegraph: Plants feet wide, begins spinning the chain overhead (0.4s wind-up), rising audio pitch
- Attack: Spins the ball-and-chain in a full 360° arc around himself while advancing forward. The spin radius is ~60px from his body. Lasts 1.5 seconds (2 full rotations).
- Damage: 8 per hit (can only hit once per rotation)
- Recovery: 0.6s — dizzy stagger
- Visual: The chain becomes a visible spinning circle. Sparks fly if it hits obstacles. Mad Dog walks forward during the spin at 50% speed.
- Intent: The panic attack. Players who've been comfortably kiting at medium range suddenly face an advancing wall of damage that covers 360°. Forces the player to either retreat beyond the spin radius or commit to rolling through a tight window between rotations. The dizzy recovery afterwards is generous — the risk matches the reward.

#### 4. Shackle Lunge (Phase 2+ — new attack)

- Telegraph: Crouches low, one hand on the ground (0.4s), followed by a directional ground indicator
- Attack: Explosive forward lunge covering 120px in ~0.2s. If it connects, Mad Dog grabs the player, lifts them, and throws them (10 damage + displacement to a random nearby position).
- Recovery: 0.5s if the lunge misses (short skid). The throw animation takes 0.6s if it hits (during which the player is invulnerable — it's a displacement, not a death sentence).
- Visual: Dust explosion on launch. If he grabs the player, a brief grapple animation. If he misses, he skids and slams into whatever's behind the player's original position.
- Intent: The distance-closer. Punishes players who maintain a "safe" mid-range distance by sitting just beyond Chain Sweep range. Forces the player to either stay far enough that the lunge falls short OR be ready to dodge laterally when they see the crouch telegraph. Also repositions the player if it connects — losing positional advantage is the real punishment, not the damage.

#### 5. Ground Pound (Phase 3 only — environmental attack)

- Telegraph: Raises both fists overhead, ball dangling (0.5s), red impact zone appears
- Attack: Smashes the ground with both fists AND the ball simultaneously. AoE ring expands outward from impact point (think shockwave).
- Shockwave: Travels outward at 200 units/sec, 15px wide ring. Must be rolled through (i-frames) or jumped over.
- Damage: 10 (direct hit at center), 6 (shockwave)
- Recovery: 0.8s
- **Environmental effect:** Each Ground Pound leaves a permanent cracked terrain patch (30px radius) at the impact site. Cracked terrain slows the player by 20% when walked over. The arena accumulates these patches throughout Phase 3.
- Intent: This is the arena-shrinking mechanic. As Phase 3 progresses, more of the ground is cracked, making kiting progressively harder. The player must plan their retreat paths around hazard zones, adding a spatial memory component to the physical execution challenge. The shockwave also introduces the only "projectile-like" element in the fight — a rolling wave that must be dodged with timing, not positioning.

### Phase Structure

**Phase 1: The Beast Wakes (100% to 70%)**

Mad Dog enters the arena from the edge, dragging his chain. He sees the player and roars. The fight begins.

- Moveset: Chain Sweep + Overhead Slam. Simple two-attack rotation.
- Movement speed: 65 units/sec (slower than Boomstick's 55 — but Mad Dog never stops to cast. He's always advancing.)
- Cooldown between attacks: 1.6s
- Behavior: Walks directly at the player. No steering tricks, no flanking. Pure straight-line aggression.
- Teaching goal: The player learns the two base attacks, their telegraphs, and their recovery windows. They establish a kiting rhythm. They learn that Overhead Slam's recovery is the primary DPS window.
- Danger level: Low-moderate. A player who keeps moving will rarely get hit. The pressure is psychological — he never stops coming — not mechanical.

**Phase 2: Off the Chain (70% to 35%)**

Transition: Mad Dog rips one of his remaining shackle cuffs off and hurls it at the ground. Brief invulnerability (0.45s). He straightens up — for the first time he's standing at full height instead of hunching.

- Gains Chain Whirlwind and Shackle Lunge
- Movement speed: 75 units/sec (noticeable increase)
- Cooldown between attacks: 1.2s (faster rhythm)
- Behavior: Still primarily direct pursuit, but now alternates between closing with Shackle Lunge and pressuring with Whirlwind when close. The attack selection is more varied — the player can't predict whether the next move will be a sweep, a slam, a spin, or a lunge.
- The "safe distance" the player established in Phase 1 is now unsafe. Shackle Lunge reaches further than Chain Sweep, and Whirlwind advances. The player must either play at longer range or learn to dodge through attacks.
- No adds. Mad Dog doesn't need them. Adding enemies would dilute the one-on-one intensity.

**Phase 3: Frenzy (35% to 0%)**

Transition: Mad Dog stumbles, drops to one knee. For a moment he's still. Then his head snaps up, eyes wide, and he screams. It's not a taunt — it's the sound of whatever restraint he had left breaking.

- Gains Ground Pound (arena-degrading shockwave)
- Movement speed: 60 units/sec (he's *slower* — exhaustion is setting in)
- **BUT:** Attack speed increases dramatically. Cooldown drops to 0.8s. Attacks chain into each other with almost no gap.
- Chain Sweep becomes 360° (full circle, no safe side)
- The paradox of Phase 3: he's slower to reach you, but far deadlier when he does. The arena is accumulating cracked terrain from Ground Pounds. The kiting space is shrinking. His movement speed decrease is offset by the terrain slow zones — in cracked areas, the player is barely faster than him.
- Spawns: 2 Swarmers on phase transition. Their purpose is minimal — they're scavengers drawn by the noise, not reinforcements. They exist to add a tiny bit of clutter and prevent the player from completely ignoring everything except Mad Dog.
- The fight becomes a shrinking circle of engagement. The edges of the arena are filling with cracked ground. The center is where Mad Dog is. The player's viable space narrows every 10 seconds. This creates an escalating urgency: *finish him before the arena runs out.*

### Tuning Reference

| Parameter | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| Movement speed | 65 | 75 | 60 |
| Chain Sweep telegraph | 0.50s | 0.45s | 0.40s |
| Chain Sweep arc | 180° | 180° | 360° |
| Chain Sweep range | 70px | 70px | 70px |
| Overhead Slam telegraph | 0.60s | 0.55s | 0.50s |
| Overhead Slam recovery | 0.90s | 0.80s | 0.70s |
| Attack cooldown | 1.6s | 1.2s | 0.8s |
| Shackle Lunge range | — | 120px | 120px |
| Whirlwind duration | — | 1.5s | 1.5s |
| Ground Pound frequency | — | — | Every 3rd attack |
| HP | ~200 | | |
| Phase thresholds | 70% | 35% | 0% |
| Transition i-frames | 0.45s | 0.45s | — |

---

## Challenge Design

### What Skills Are Tested?

| Player Skill | How Mad Dog Tests It |
|---|---|
| **Distance management** | Must maintain precise range — too close = swept, too far = lunged. The optimal distance shifts across phases. |
| **Dodge roll economy** | Rolls have cooldowns. Panic-rolling through every attack will leave the player vulnerable. Must choose which attacks to roll through vs. which to outspace. |
| **Punish window recognition** | Overhead Slam recovery is the primary DPS window. Players who identify this and commit to it kill Mad Dog much faster. Missing windows extends the fight and increases Phase 3 pressure. |
| **Spatial awareness** | Phase 3 cracked terrain creates a memory puzzle: where is it safe to retreat? Players who track terrain damage can kite efficiently; those who don't walk into slow zones and get caught. |
| **Sustained concentration** | No breaks, no add phases, no safe periods. The entire fight is continuous forward pressure. Mental endurance. |
| **Aggression timing** | The fight punishes pure passivity. Staying far away is safe but slow. Dodging *through* attacks to reach recovery windows is risky but efficient. The best play requires controlled aggression — going in, not just running away. |

### Difficulty Curve Within the Fight

1. **Phase 1 (0-30s):** Tutorial. Low pressure. The player establishes rhythm. Learns two attacks. Feels comfortable.
2. **Phase 1 end (30-60s):** Confidence builds. The player finds the Overhead Slam punish window and thinks "I've got this."
3. **Phase 2 entry:** Spike. Whirlwind and Lunge shatter the comfortable rhythm. Suddenly the safe distance doesn't exist.
4. **Phase 2 middle:** The highest mechanical challenge. Full moveset, faster timing, the player must dodge four different attacks with different timings and ranges.
5. **Phase 3 opening:** Emotional shock. The roar, the 360° sweeps, the shockwaves. Overwhelming.
6. **Phase 3 middle-to-end:** The shrinking arena creates escalating urgency. The player either finds the aggressive dodge-through rhythm or gets cornered. The final 15% HP is a sprint — both for the player (finish him) and Mad Dog (catch them).

### Anti-Trivialization

- **Extended reach** prevents trivial kiting. You can't just hold backward and shoot.
- **Shackle Lunge** punishes comfortable mid-range play.
- **Arena degradation** in Phase 3 prevents infinite kiting by shrinking the viable space.
- **No projectiles to destroy/reflect.** Some builds in roguelites can trivialize ranged bosses with deflection or projectile-clearing abilities. Mad Dog is immune to all of that. You have to outplay him physically.
- **Speed increase in Phase 2, attack speed increase in Phase 3** — there's no plateau where the player settles into a rhythm permanently.

---

## Why This Boss Is Fun

### The Matador Fantasy

This is the most viscerally satisfying fight in Stage 1. Every dodge is a near-miss. Every punish window is earned by rolling *toward* danger, not away from it. The player feels like a matador dancing around a bull. When it clicks — when the player stops running and starts weaving — it's one of the best feelings in action gaming.

### Physical Spectacle

Mad Dog is loud, heavy, and destructive. The screen shakes. The ground cracks. Debris flies. His chain carves arcs through dust clouds. He smashes through barrels and wagons like they aren't there. The fight has a *weight* to it that projectile-based bosses can't match. Every near-miss feels physical.

### The Simplicity Payoff

Because the fight has low cognitive overhead (one enemy, no projectiles, no mechanics to track), all of the player's attention is on execution. This creates a flow state more easily than complex pattern-reading fights. The player is entirely in the moment — react, dodge, punish, retreat. It's meditative in its intensity.

### The Rhythm Discovery

Phase 1's rhythm is: retreat-dodge-punish. Phase 2 disrupts that rhythm with new attacks. Phase 3 forces a new rhythm: aggressive dodge-through play. The journey from "running away" to "dancing through his attacks" is a skill arc the player experiences *within a single fight*. That progression is deeply satisfying.

### The Arena Narrative

The cracked ground in Phase 3 is a visual record of the fight. The player can look at the arena and see the story: here's where he slammed, there's where the shockwave went, the whole northwest corner is destroyed. The arena itself tells the story of the battle. No other boss in the pool does this.

### The Close Call

Because Mad Dog is melee-only, every hit the player takes feels preventable. There's no "unfair" random bullet in a spread that clips you. If Mad Dog hit you, you made a positioning mistake. This makes the fight deeply fair — and makes close victories (surviving at 1 HP, barely dodging the last swing) feel incredibly earned.

---

## Aesthetic and Audio

### Arena

Mad Dog works best in an **open town square or crossroads** with destructible objects:

- Wide, roughly square arena with enough room to kite but not infinite space
- Scattered destructible obstacles: wagons, barrels, crates, a wooden fence. Mad Dog's Chain Sweep and charges destroy these on contact, gradually clearing the arena. The arena starts cluttered and opens up as the fight progresses (opposite of Phase 3's ground hazards — the obstacles disappear as the ground hazards appear, maintaining consistent difficulty).
- No elevated positions (no sniping — this is a ground fight)
- Arena edges: building walls that Mad Dog can charge into for stun windows. The player can use the architecture to bait charges.
- Lighting: harsh, direct overhead (high noon). Strong shadows. The dust Mad Dog kicks up catches the light.

### Music

- **Phase 1:** Low, rumbling percussion. Slow, heavy. A chain-link rhythm in the drums. Minimal melody — this is primal, not dramatic.
- **Phase 2:** Tempo increase. The chain rhythm doubles. Low brass enters — a threatening horn motif. The feeling of being hunted.
- **Phase 3:** The percussion becomes overwhelming. A heartbeat baseline. The horn becomes a wail. The music feels like it's breaking down — mirroring Mad Dog's frenzy. When the cracked terrain accumulates, the audio environment shifts: crumbling sounds, groaning earth. The music and the arena share the same escalation curve.

### Sound Design

- Chain rattling: constant ambient sound when Mad Dog is moving. Gets faster/louder as he speeds up. This is the audio telegraph for "he's getting close."
- Chain Sweep: a heavy whoosh, like a helicopter blade passing. Air displacement.
- Overhead Slam: a bass-heavy THUD that shakes the subwoofer. Cracking stone. The heaviest impact sound in the game.
- Shackle Lunge: explosive burst — boots on stone, chain snapping taut. The sound arrives before the visual (speed).
- Whirlwind: sustained whooshing that rotates in stereo (the player can hear which side the chain is on).
- Ground Pound: the biggest sound in the fight. A shockwave you feel in your chest. Crack and rumble of fracturing stone.
- Recovery windows: heavy breathing, chain clinking as it settles. The sudden quiet after a big attack is part of the audio design — the silence is the punish window.
- Footsteps: heavy, rhythmic, getting faster. The player can hear Mad Dog approaching without looking. This is critical for the kiting gameplay — audio awareness supplements visual awareness.

---

## Narrative Impact

### Plot Thread Fit

Mad Dog's narrative is incidental — he's not part of any scheme. This makes him versatile:

| Plot Thread | Role | Narrative Context |
|---|---|---|
| **The Raid** | Collateral chaos | The prison wagon crashed during the raid. Mad Dog is a third party — as dangerous to the raiders as to the player. He appeared during the chaos and is now the most immediate threat. |
| **The Bounty** | Escaped bounty | Mad Dog is the bounty. Someone wants him recaptured or killed. The crash wasn't an accident — someone arranged it, and finding out who is the Act II hook. |
| **The Corruption** | Corruption victim | Mad Dog was exposed to something in the mine-prison. His frenzy isn't natural — it's the corruption manifesting physically. Defeating him reveals symptoms that point to the true threat. |
| **The Stranger** | The stranger's quarry | The mysterious stranger is actually hunting Mad Dog. The player encounters Mad Dog first and must decide: help the stranger's hunt or stay out of it. |

The "force of nature" characterization means Mad Dog can appear in almost any plot thread as an inciting incident or complication without feeling forced.

### Narrative Effects and Branch Hooks

**1. Success path (Mad Dog defeated + side objective met)**

- Mad Dog is subdued or killed. The town assesses the damage.
- If the side objective was "Protect" (e.g., protect the general store from the rampaging prisoner): the store survives, shop is available in camp with bonus stock.
- The prison wagon wreckage can be investigated — documents inside reveal who was transporting Mad Dog and why. This feeds the Act II hook.
- The chain and ball can be recovered as a trophy or evidence.

**2. Soft-failure path (Mad Dog defeated, but side objective failed)**

- Mad Dog is stopped but the town took collateral damage. Buildings destroyed, structures compromised.
- The soft failure isn't Mad Dog's fault per se — it's that his rampage was so destructive that the side objective was lost in the chaos.
- Stage 2 opens with reduced resources, alternate routes (the road is blocked by debris), or rescue priorities.
- Variant: if using a "Defuse" objective (stop fires that Mad Dog's rampage started), soft failure means the town partially burns. The next stage setting shifts from town to wilderness as the survivors relocate.

**3. Hard-failure path (player dies)**

- Mad Dog continues his rampage. The town is destroyed.
- Death screen text: "They found what was left of the town three days later. The chain marks went west."
- The image of Mad Dog walking away, still dragging his chain, is the run's final beat. No villain speech, no grand plan. Just destruction moving on.

### Boss Dialogue in the Narrative System

Mad Dog subverts the dialogue system. He barely speaks. This IS the characterization.

**Tier 1 (Essential — first encounter):**
- *(No words. A guttural roar. The pre-fight ritual is just Mad Dog turning to face the player, chain dragging, and then charging.)*
- If there's a narrator/NPC: "Oh lord. That's the one from the wagon."

**Tier 2 (Contextual):**
- On phase 2 transition: "RUN." *(the only clear word — and it's a command, not a taunt. He's telling you what you should do.)*
- If the player has been dodging well: *(frustrated growling, chain smashing the ground — he can't catch you and it's making him angrier)*
- If the player gets hit: *(a satisfied grunt — animalistic, not verbal)*
- On phase 3 transition: *(the scream — prolonged, breaking, the sound of the last human part giving way)*

**Tier 3 (General):**
- *(Heavy breathing, chain rattling, footsteps. Mad Dog's "dialogue" is his soundscape.)*

The absence of dialogue IS the narrative statement. Every other Stage 1 boss talks. Mad Dog's silence makes him stand out and makes the fight feel different — lonelier, more dangerous, more primal.

---

## Potential Variations

1. **Arena variant:** Ranch/corral setting. Fences that Mad Dog smashes through, opening new arena sections as the fight progresses. A hay barn that collapses in Phase 3 (environmental spectacle + arena reshaping).
2. **Objective variant:** "The Burning Town" defuse — Mad Dog's rampage knocks over lanterns and starts fires. The side objective is containing the fires while fighting him. His movement becomes the objective trigger.
3. **Boss variant (harder):** "Unchained" — Mad Dog breaks the chain in Phase 3 and fights with bare fists. Loses reach but gains massive speed. The ball stays on the ground as a permanent obstacle. Completely changes the Phase 3 dynamic from arena-shrinking to speed-racing.
4. **Co-op scaling:** Mad Dog gains a target-swap lunge — periodically marks a distant player and lunges at them, preventing anyone from safely plinking at range. HP scales with player count. His singular aggression becomes scarier when he picks YOU specifically out of a group.

---

## Best-Practice Alignment

This design follows principles from:
- `docs/research/boss-design.md`
- `docs/research/narrative-boss-design.md`
- `docs/mechanics/stage-objectives.md`

Applied practices:

- **Designed around player moveset:** Tests dodge roll timing, movement precision, and jump (for Phase 3 shockwaves). The player's existing tools are sufficient — no new mechanics to learn.
- **Telegraph -> attack -> recovery:** Every attack has a generous telegraph (0.4-0.6s) and a rewarding recovery window (0.6-0.9s). The fight is fair by construction.
- **Additive phase escalation:** Phase 2 adds Whirlwind and Lunge. Phase 3 adds Ground Pound and 360° Sweep. The base attacks persist throughout. Complexity accumulates.
- **Arena as participant:** Destructible obstacles in early phases, cracked terrain in Phase 3. The arena transforms as the fight progresses, telling the story of the battle.
- **Anti-trivialization through arena degradation.** Can't be cheesed by kiting forever — the viable space shrinks.
- **Narrative punctuation:** Mad Dog's silence, the physical spectacle, and the environmental destruction make this a memorable encounter even without dialogue.
- **Soft-failure potential:** His rampage naturally creates side objectives (fires, structural damage, fleeing civilians). The boss IS the environmental threat.
- **Readability first:** One enemy, large sprite, obvious telegraphs, no projectiles. The most readable fight in Stage 1.

---

## Implementation Considerations

### ECS Architecture

Single entity with standard Enemy/EnemyAI/AttackConfig components, plus:

- Extended collider radius (18-20px, larger than standard threats)
- `BossPhase` component for phase tracking (same as Boomstick)
- A new `GroundHazard` component for cracked terrain patches (spawned as separate entities on Ground Pound impact)
- Ground hazards need a `SlowZone` effect that applies a speed multiplier to entities inside them

### AI Behavior

- Mad Dog's AI is the simplest boss AI: CHASE -> TELEGRAPH -> ATTACK -> RECOVERY -> CHASE
- No preferred range — his steering always targets the player directly (separation radius only from arena walls)
- Attack selection is weighted random from available attacks, with Chain Sweep having highest weight (most common) and Overhead Slam/Whirlwind/Lunge having lower weights
- Shackle Lunge triggers opportunistically when the player is between 80-140px (the "comfortable kiting distance")
- Ground Pound triggers every 3rd attack in Phase 3 (cadence counter, same pattern as Boomstick's boom delay)

### Destructible Obstacles

- Arena obstacles have HP (1-2 hits from Mad Dog) and are destroyed by Chain Sweep/Bull Rush contact
- Obstacles block player movement but NOT Mad Dog's chain (the chain passes through obstacles — only Mad Dog's body is stopped)
- Destroyed obstacles leave debris sprites (cosmetic) but no gameplay effect
- The obstacle system already exists for arena furniture — Mad Dog just interacts with it more aggressively

### Performance

- Single entity + terrain patches is lightweight
- Ground hazard entities are static (no AI, no movement) — just colliders with a slow effect
- Maximum ~15 ground hazard patches in a typical Phase 3 (one per Ground Pound, ~5 Ground Pounds expected)
