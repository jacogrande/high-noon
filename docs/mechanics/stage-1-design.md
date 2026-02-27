# Stage 1: Town Outskirts -- Enemy & Encounter Design

Stage 1 is the player's first encounter with High Noon's combat. It must teach the core skills of a bullet hell without ever feeling like a tutorial. Every lesson is delivered through enemy behavior, not text boxes.

**Design philosophy**: Each enemy teaches exactly ONE skill. The player learns by dying to a pattern, understanding it, and adapting. The boss combines all taught skills into a final exam.

---

## The Problem with Current Stage 1

The current Stage 1 encounter introduces **7+ enemy types** across 2 waves (Swarmer, Grunt, Rattlesnake, Shooter, Lasso Bandit, Goblin Rogue, Dynamite Tosser, Armored Bandit, Vulture). For comparison:

- **Nuclear Throne Desert**: 3 enemy types (Bandit, Scorpion, Maggot)
- **Enter the Gungeon Floor 1**: 2-3 types per room, ~7 total across an entire floor of 5+ rooms
- **Risk of Rain 2 Stage 1**: 4 enemy types (Beetle, Lemurian, Wisp, Stone Golem)

Players can't learn what they can't parse. When 7 visually distinct enemies spawn simultaneously, the player processes none of them individually. The encounter becomes noise. Stage 1 should use **4 core fodder archetypes** introduced sequentially, with a single threat type per wave, culminating in a boss.

---

## The Four Archetypes

### 1. Drifter (Basic Grunt -- "Shoot Things")

**Teaches**: The fundamental loop -- see enemy, aim, shoot, kill. Builds confidence.

**Behavior**: Walks toward the player. Fires a single slow bullet every ~2s. Low HP (dies in 1-2 shots). Appears in groups of 2-4.

**Why it works**: The Drifter is the Bullet Kin. It's the control group. A lone Drifter is trivial. Three Drifters from different angles create crossfire the player must navigate. The single slow bullet gives the player time to observe projectile behavior for the first time -- they see it, understand its speed, and either dodge or get hit. Getting hit by a Drifter costs a little health, not a lot. It's a gentle tap on the shoulder: "Hey, those things hurt."

**Key properties**:
| Property | Value | Rationale |
|----------|-------|-----------|
| HP | 8-10 | Dies in 1-2 player shots |
| Speed | 70 | Slower than player (player ~200), easy to kite |
| Attack | Single aimed bullet | Simplest possible ranged pattern |
| Bullet speed | 180-200 | Slow enough to dodge on reaction |
| Telegraph | 0.4s pause + flash | Clear, generous windup |
| Cooldown | 2.0s | Low pressure per-enemy |
| Damage | 3 | Non-threatening individually |

**Variants (same base, different flavor)**:
- **Pistol Drifter**: Fires a single bullet at range. The default.
- **Knife Drifter**: Melee only, slightly faster (speed 85), slightly more HP (12). Teaches kiting. Approaches and slashes at close range. Very short attack range. Think Bullet Kin vs. melee Shotgun Kin.

Both variants share the same visual silhouette with a minor weapon distinction. The player learns "Drifter" as one concept, not two. The melee variant simply teaches that some enemies must be kept at distance.

**Reference**: Bullet Kin (Gungeon), Bandit (Nuclear Throne), Beetle (RoR2)

---

### 2. Deadeye (Sniper -- "Keep Moving")

**Teaches**: Never stand still. Proactive movement beats reactive dodging.

**Behavior**: Stands at long range. Locks onto the player's **current position** with a visible laser/sight-line. After a long telegraph (1.0-1.5s), fires a very fast, very narrow shot at where the player **was** when the telegraph started. If the player moved during the telegraph, the shot misses entirely. If they didn't move, it hits almost guaranteed.

**Why it works**: This is the RoR2 Wisp / Nuclear Throne sniper pattern. The bullet is so fast that dodging it reactively (after it's fired) is nearly impossible. But the telegraph is so long that dodging it proactively (moving before it fires) is trivial. The lesson is binary:

- Stood still? Hit.
- Moved? Miss.

There is no "git gud" dodge timing. The player just has to internalize the habit of constant movement. This is the single most important skill in a bullet hell, and the Deadeye teaches it with zero ambiguity.

**The laser sight is critical**. The player must see a visible line from the Deadeye to their position. This communicates:
1. "I'm aiming at you"
2. "I'm about to fire"
3. "If you're still here when I shoot, you're dead"

The laser should change color or intensity as the telegraph progresses (e.g., faint red -> bright red -> FIRE). Audio reinforcement: a rising tone that culminates in a crack.

**Key properties**:
| Property | Value | Rationale |
|----------|-------|-----------|
| HP | 14-16 | Survives 2-3 player shots (time to fire at least once) |
| Speed | 40 | Very slow, nearly stationary -- a fixed threat |
| Attack | Single fast aimed bullet | Binary: hit or miss |
| Bullet speed | 600+ | Nearly undodgeable reactively |
| Telegraph | 1.0-1.2s | Long, clear, generous |
| Cooldown | 3.5-4.0s | Slow cycle, one-shot-at-a-time feel |
| Damage | 8-10 | Hurts! Punishes stillness hard |
| Preferred range | 250-300 | Stays far away, maintains distance |

**Spawning rule**: Deadeyes should never appear in groups larger than 2 in Stage 1. Multiple simultaneous lock-ons become confusing before the player has internalized the "just move" lesson. One at a time is ideal for the first encounter.

**Reference**: Lesser Wisp (RoR2), Sniper (Nuclear Throne), Stone Golem (RoR2 -- different speed, same teaching principle)

---

### 3. Spitter (Pattern Sprayer -- "Dodge Through Gaps")

**Teaches**: Reading bullet patterns. Finding gaps. Weaving.

**Behavior**: Slow, tanky enemy that periodically vomits a wide arc of slow-moving projectiles. The bullets are slow enough that the player has time to see the pattern, identify the gaps, and navigate through them. The Spitter creates a "wall" of bullets that the player must thread.

**Why it works**: This is the pattern-reading teacher. Where the Deadeye teaches "move to avoid," the Spitter teaches "move *carefully* to avoid." The bullets are slow (the player can outrun them laterally), but they cover a wide area. The player's first instinct will be to run away from the wall of bullets. That works. But the *skilled* response is to dodge through a gap, which is faster and keeps you closer to the Spitter to deal damage.

This is where the player first encounters the core bullet hell skill: **seeing what's not there** -- the gaps between bullets, not the bullets themselves.

The Spitter should be noticeably tankier than Drifters. It survives long enough to fire 2-3 volleys, giving the player multiple opportunities to practice the pattern. If it dies before firing, it hasn't taught anything.

**Key properties**:
| Property | Value | Rationale |
|----------|-------|-----------|
| HP | 20-25 | Survives long enough to fire 2-3 volleys |
| Speed | 45-50 | Very slow approach |
| Attack | 5-7 bullet arc, wide spread (~90-120 degrees) | Creates a "wall" with readable gaps |
| Bullet speed | 120-150 | Very slow -- player can outrun them |
| Bullet drag | Moderate | Bullets decelerate, giving even more time |
| Telegraph | 0.5s | Shorter than Deadeye, but pattern is readable |
| Cooldown | 3.0s | Time between volleys to breathe and deal damage |
| Damage | 3-4 per bullet | Individual bullets aren't deadly |
| Preferred range | 120-150 | Wants medium range |

**Pattern design**: The spread should have **consistent, visible gaps**. Not random spray -- a fan pattern where every other angle is empty. Think of it like a comb: teeth with spaces between them. The gaps must be wide enough for the player to pass through without pixel-perfect dodging. This isn't Stage 3; the gaps should be generous.

As the player improves, later stages can tighten the gaps, add more bullets, or overlay aimed shots onto the pattern. But in Stage 1, the pattern is baby's-first-bullet-wall.

**Reference**: Scorpion (Nuclear Throne), Shotgun Kin (Gungeon), Lemurian groups (RoR2), RotMG Beach enemies

---

### 4. Dustdevil (Area Denial -- "Respect the Ground")

**Teaches**: Spatial awareness. Ground is not always safe. Positioning has consequences.

**Behavior**: A whirling dust spirit that drifts toward the player at moderate speed. On reaching attack range, it stops and creates a **lingering danger zone** on the ground -- a swirling dust cloud that damages the player on contact for 2-3 seconds. Then it repositions and does it again. The danger zone is visually obvious (dust particles, orange/red tinting on the ground).

**Why it works**: Every other enemy teaches the player to react to bullets -- things that move toward you. The Dustdevil teaches that **space itself can become dangerous**. The player must track not just enemies and projectiles, but also *zones* they can't stand in. This is the foundation for later mechanics: lava tiles, dynamite, boss arena hazards, and the Dynamite Tosser in Stage 2+.

Combined with Drifters and a Deadeye, the Dustdevil creates spatial pressure: "The Deadeye forces me to move, the Drifters force me to shoot, and the Dustdevil just eliminated the safe spot I was going to move to." This three-way pressure is the core of bullet hell design -- no single enemy is hard, but the combination creates a spatial puzzle.

**Key properties**:
| Property | Value | Rationale |
|----------|-------|-----------|
| HP | 12-14 | Medium -- can be killed, but takes focus |
| Speed | 65-75 | Moderate drift speed |
| Attack | Ground AoE zone | 50-60px radius, lasts 2.5-3.0s |
| Telegraph | 0.4s swirl-up animation | Ground indicator appears during telegraph |
| Cooldown | 4.0-5.0s | Slow cycle -- zones are the threat, not the enemy |
| Damage | 2-3/tick while standing in zone | Damage-over-time, not instant kill |
| Zone visual | Swirling dust + ground discoloration | Must be immediately readable |

**The zone must be escapable**. If the player is standing on the zone when it appears, they take 1 tick of damage and can walk out. It's a "get off me" mechanic, not a trap. The teaching moment is: "I should have been paying attention to where the Dustdevil was."

**Design alternative**: If a new enemy type feels like too much scope, the Dynamite Tosser already fills this role conceptually (area denial with friendly fire). However, the Dustdevil has a key difference: it's a **persistent, repositioning** area denial enemy, not a one-shot-and-done lobber. The lingering zones accumulate, progressively shrinking the safe area. The Dynamite Tosser's explosion is instant and gone. For Stage 1 teaching purposes, the lingering zone is more educational because the player can see the danger persist and must plan around it.

**Reference**: Pinhead (Gungeon -- area denial via explosion), Bomber archetype (enemy-ai.md), lava zones (RotMG), Maggot nest (Nuclear Throne -- area becomes dangerous)

---

## Wave Structure

### Key Principle: Introduce, Then Combine

Nuclear Throne's Desert uses only 3 enemies across 3 levels. Enter the Gungeon introduces 2-3 per room across a 5+ room floor. The research is clear: **fewer types, more thoroughly explored**.

Stage 1 should have **3 waves** (up from current 2), each with a clear teaching beat:

### Wave 1: "Welcome to the Dust" (Learn to Shoot)

**Enemies**: Drifters only (pistol + knife variants)

**Purpose**: The player's first combat. No complexity. Just "point, shoot, dodge a slow bullet, kill." This is the Enter the Gungeon first-room energy. The player should feel powerful. They should clear this wave and think, "I got this."

**Composition**:
| Entry | Type | Count | Role |
|-------|------|-------|------|
| Fodder | Pistol Drifter | 4-5 budget | Basic ranged grunts |
| Fodder | Knife Drifter | 2-3 budget | Teaches kiting melee |

- Max 3 alive at once
- Slow spawn rate (one every 2-3s)
- No threats
- Wave ends when budget exhausted and all dead

**Beat**: Player spawns. 2 Drifters approach from the edges. Player shoots them. More trickle in. A Knife Drifter closes to melee range, the player backs up and kills it. Wave clear. Confidence established.

---

### Wave 2: "Don't Stand Still" (Learn Core Skills)

**Enemies**: Drifters + 1 Deadeye + 1 Spitter

**Purpose**: Introduce the two "teacher" enemies while Drifters maintain baseline pressure. The Deadeye teaches proactive movement. The Spitter teaches pattern reading. Both spawn as **threats** (finite count, must kill to advance).

**Composition**:
| Entry | Type | Count | Role |
|-------|------|-------|------|
| Fodder | Pistol Drifter | 5-6 budget | Ongoing pressure |
| Fodder | Knife Drifter | 2-3 budget | Close-range pressure |
| Threat | Deadeye | 1 | "Keep moving" teacher |
| Threat | Spitter | 1 | "Dodge through gaps" teacher |

- Max 4 fodder alive
- Threats spawn from edges with initial delay
- Deadeye seeks a distant position before engaging
- Wave advances when both threats are dead

**Beat**: Wave starts with 2 Drifters and the Deadeye. The player is fighting Drifters when they notice a red laser locking onto them. They move. The shot misses. "Oh, I get it -- don't stand still." Meanwhile, the Spitter lumbers in from the opposite side and fires a slow wall of bullets. The player runs sideways, or weaves through a gap. They kill the threats while managing Drifter pressure. Skills learned.

---

### Wave 3: "The Exam" (Boss Wave)

**Enemies**: All 4 types + Stage Boss

**Purpose**: Combine all learned skills under pressure. Dustdevils restrict space, Drifters create crossfire, a Deadeye forces movement, a Spitter creates bullet walls, and the boss tests everything at once.

**Composition**:
| Entry | Type | Count | Role |
|-------|------|-------|------|
| Fodder | Pistol Drifter | 6-8 budget | Ongoing crossfire |
| Fodder | Knife Drifter | 2-3 budget | Rush pressure |
| Fodder | Dustdevil | 3-4 budget | Area denial, shrinking safe space |
| Threat | Deadeye | 1 | Sniping pressure (spawns mid-wave) |
| Threat | Boss (from pool) | 1 | Final exam |

- Max 5 fodder alive
- Boss spawns at center/landmark with 3s entrance delay
- Deadeye spawns after boss reaches Phase 2 (adds sniper pressure during the hard part)
- Wave advances when boss is dead

**Beat**: Dustdevils drift in, creating zones. Drifters attack from the edges. The player is managing space and shooting when the boss enters with a cinematic moment. The boss combines patterns the player has seen: aimed shots (Deadeye-like), spread patterns (Spitter-like), and possibly a charge or area denial (Dustdevil-like). The player uses every skill they've learned. When they win, they've proven they understand High Noon's core loop.

---

## Boss Design (Stage 1)

The Stage 1 boss should be a **skills test**, not a puzzle. Its attacks should be recognizable variations of the patterns the player just learned from the 4 archetypes. The existing boss pool (Boomstick, Mad Dog, Dalton) can work if their patterns align with this philosophy.

**Boss attack mapping**:
| Boss Attack | Maps to Archetype | Skill Tested |
|-------------|-------------------|--------------|
| Aimed burst (2-3 fast bullets) | Deadeye | Proactive movement |
| Wide spread volley | Spitter | Pattern reading / gap weaving |
| Rush/charge with telegraph | Dustdevil (area commitment) | Spatial planning |
| Rapid single shots | Drifter | Basic dodging under pressure |

The boss should cycle through these attacks in a readable pattern. Phase transitions (at 66% and 33% HP) should increase speed/bullet count but not introduce fundamentally new patterns. The player should never see something in the boss fight they haven't seen a simpler version of from a regular enemy.

---

## Map Design: Town Outskirts

The Stage 1 map should support the teaching goals:

### Open Space with Light Cover

- **Mostly open**: The player needs room to dodge, run from Deadeye lasers, and weave through Spitter walls. Tight corridors punish new players unfairly.
- **Scattered low cover**: A few destructible barrels/crates that block bullets but not movement. Teaches that cover exists as a tool, but doesn't make it mandatory.
- **No dead ends**: Every position should have at least 2 escape routes. New players panic when cornered; the map should prevent that.

### Landmark Positioning

- **Center**: Open area for the boss entrance. The boss should have room to telegraph and the player should have room to dodge.
- **Edges**: Spawn points for Drifters and Deadeyes. Deadeyes should spawn at map edges to establish their "sniper at range" identity.
- **Mid-ground**: Spitter and Dustdevil spawn zones. These enemies work best at medium range.

### Environmental Teaching

- **A few hazard tiles** (1-2 small lava/cactus patches): Teaches the player that ground can be dangerous *before* Dustdevils appear. When Dustdevils create zones, the player already understands the concept.
- **Destructible props**: Barrels that explode when shot, damaging nearby enemies. Teaches the player to use the environment offensively. This creates a power fantasy moment: "I blew up 3 Drifters with one barrel."
- **Clear boundaries**: The playable area should be visually obvious. Fences, cliffs, or building walls. No ambiguity about where the player can go.

---

## Difficulty Tuning

### Stage 1 Should Be Generous

The goal is not challenge -- it's education. The player should complete Stage 1 on their first or second attempt. Death is okay (it teaches), but consistent failure drives players away before they reach the good stuff.

**Tuning targets**:
- Average clear time: 2-3 minutes
- Expected deaths (first attempt): 0-1
- Player HP loss (skilled): 10-20%
- Player HP loss (new player): 50-70%

**Levers for difficulty**:
| Lever | Stage 1 Value | Stage 2+ Escalation |
|-------|---------------|---------------------|
| Deadeye telegraph | 1.0-1.2s | 0.7-0.8s |
| Spitter bullet count | 5-6 | 7-9 |
| Spitter gap width | ~25-30px | ~15-20px |
| Dustdevil zone duration | 2.5s | 3.5-4.0s |
| Drifter fire rate | 2.0s cooldown | 1.5s |
| Max enemies alive | 3-5 | 6-8 |
| Fodder spawn rate | 1 per 2.5s | 1 per 1.5s |

### Fairness Systems Active in Stage 1

- **Initial delay**: All enemies wait 0.3-1.0s before first attack after spawning (existing system)
- **Staggered fire**: Enemies don't all shoot on the same frame (existing system)
- **Projectile cap**: Fodder enemies gated by `world.maxProjectiles` (existing system)
- **No off-screen sniping**: Deadeyes must be visible on screen before they can begin their telegraph
- **Generous i-frames**: Player invulnerability after taking damage prevents multi-hit stacking

---

## Enemy Introduction Across the Full Run

Stage 1 introduces the 4 core archetypes. Later stages layer on complexity by introducing enemies that **combine or subvert** these patterns:

| Stage | New Enemies | Builds On |
|-------|-------------|-----------|
| **Stage 1** | Drifter, Deadeye, Spitter, Dustdevil | Core skills: shoot, move, weave, respect ground |
| **Stage 2** | Charger, Lasso Bandit, Dynamite Tosser | Dodge timing (Charger), CC avoidance (Lasso), area denial escalation (Dynamite) |
| **Stage 3** | Armored Bandit, Healer Shaman, Vulture | Flanking puzzle (Armor), target priority (Healer), vertical threat (Vulture) |
| **Stage 4** | Boss-only | All skills combined |

This sequencing ensures each stage teaches new lessons that build on established foundations. A player who mastered Stage 1's "dodge through the Spitter's wall" is ready for Stage 2's "dodge the Charger's rush." A player who learned "Dustdevils deny ground" is ready for "Dynamite Tossers deny ground *explosively*."

---

## Mapping to Existing Enemies

The 4 archetypes map to the existing enemy system as follows:

| New Archetype | Closest Existing Enemy | Changes Needed |
|---------------|----------------------|----------------|
| **Drifter (Pistol)** | Swarmer / Grunt hybrid | Slower bullet speed, longer telegraph, lower damage. More "wandering bandit" than "rushing creature" |
| **Drifter (Knife)** | Goblin Rogue | Slower, less HP, less damage. A shuffling melee approach, not a fast rogue |
| **Deadeye** | Shooter (partially) | NEW behavior: lock-on laser sight, very fast single shot, long telegraph. The Shooter's spread pattern is fundamentally different |
| **Spitter** | Shooter (partially) | NEW behavior: slow wide-arc bullet wall. Existing Shooter fires 3 bullets at medium speed -- the Spitter fires 5-7 at very slow speed |
| **Dustdevil** | Dynamite Tosser (partially) | NEW behavior: lingering repositionable zone, not a thrown explosive. Could be adapted from Dynamite Tosser's area denial system |

**Implementation note**: The Deadeye requires a new attack behavior -- the lock-on laser sight. This needs:
- A new visual component/state for the aim line (rendered client-side, but the aim-lock logic is in shared)
- `AttackConfig` already supports `aimX`/`aimY` for locked aim direction -- the Deadeye locks aim at TELEGRAPH entry, same as the Charger locks charge direction
- A new `BulletSpriteId` for the sniper round (small, fast, distinct)

The Spitter can reuse the existing `projectile` attack style with higher `projectileCount` and wider `spreadAngle`. The main tuning is making bullets much slower than existing Shooter bullets.

The Dustdevil requires a new `attackStyle: 'zone'` or can be implemented as a custom attack that spawns a hazard entity (similar to how Dynamite Tosser spawns a dynamite entity, but the "explosion" is a lingering zone rather than instant damage).

---

## Summary

| Archetype | Lesson | One-Liner |
|-----------|--------|-----------|
| **Drifter** | Shoot things, kite melee | "The one you kill to feel good" |
| **Deadeye** | Keep moving, always | "The one that punishes standing still" |
| **Spitter** | Read patterns, find gaps | "The one that makes you dance" |
| **Dustdevil** | Respect the ground, plan positioning | "The one that steals your safe spot" |
| **Boss** | All of the above, at once | "The exam" |

Four enemies. Four skills. One stage. No tutorial needed.
