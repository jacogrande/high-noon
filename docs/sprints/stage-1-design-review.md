# Stage 1 Design Review: Implementation vs. Best Practices

Post-cleanup comparison of our Stage 1 implementation against roguelite first-stage
design principles from Enter the Gungeon, Hades, Nuclear Throne, and bullet-hell
readability research.

---

## What We Do Well

### 1. Progressive Mechanic Introduction (Matches Gungeon Floor 1)

Our 3-wave structure isolates lessons exactly like Gungeon's incremental room design:

- **Wave 1**: Drifters only (slow 190-speed projectiles, 0.4s telegraph). Maps to
  Gungeon's Bullet Kin — teaches basic dodge. Knife Drifters add melee awareness.
- **Wave 2**: Adds Deadeyes (1.1s laser telegraph, 650-speed bullet, requires LOS).
  Teaches "use cover or die" — the sniper archetype that forces environmental play.
- **Wave 3**: Full roster + boss. Tests everything learned in waves 1-2.

This is textbook "teach one thing at a time" design.

### 2. Enemy Shape Language (Matches Bullet-Hell Readability Research)

Each Stage 1 enemy has a distinct compound silhouette with 1-2 identifying features:

| Enemy         | Base Shape        | Feature     | Shape Language              |
| ------------- | ----------------- | ----------- | --------------------------- |
| Drifter       | Circle (r=8)      | Hat brim    | Neutral, baseline bandit    |
| Knife Drifter | Circle (r=8)      | Blade wedge | Aggressive, melee-forward   |
| Deadeye       | Diamond (half=10) | Scope line  | Angular, precise, dangerous |
| Spitter       | Ellipse (12×10)   | 3 nubs      | Fat, multi-source, area     |
| Dustdevil     | Circle (r=8)      | Spiral      | Spinning, environmental     |

The Deadeye diamond is the standout — the only non-circular Stage 1 enemy, using
angular shape language to signal "threat tier" at a glance. The Spitter's ellipse
is the largest silhouette, correctly communicating bulk.

### 3. Authentic Western Town Layout

The 3-tier building placement mirrors historical western town structure:

- **Frontage** (Main Street): Dense commercial buildings with porches (half-wall cover)
- **Back row**: Saloon, General Store, Sheriff, Bank placed with thematic rules
- **Far lots**: Sparse residential/utility buildings

The meandering main street with cross alleys creates natural sight-line breaks and
flanking routes. Porches provide the iconic boardwalk — walkable cover that defines
the transition between "safe behind building" and "exposed on Main Street."

### 4. Destructible Cover as Teaching Tool (Matches Gungeon Philosophy)

14 obstacles with mixed heights teach cover mechanics:

- Full walls: Crate (HP 3), Barrel (HP 2), Boulder (HP 5) — solid protection, breakable
- Half walls: Low Wall (HP 4), Fence Rail (HP 3) — peek cover, jumpable
- Indestructible: Hitching Posts — permanent landmarks, light cover in boss arena

The bump from 8→14 obstacles creates a 3-5 tile cover rhythm that ensures the
player usually has nearby cover — matching Gungeon's "flippable tables in early rooms"
principle.

### 5. Connectivity Guarantee

The flood-fill `ensureConnectivity()` system prevents unreachable tile pockets.
The center clear zone with hitching post landmarks frames the boss arena.
Cross-alley skip zones preserve flanking routes.

### 6. Multiplayer Parity

The shared simulation is fully multiplayer-safe:

- Co-op HP scaling (1.5x at 2 players) via `applyCoopHpScale()`
- Wave budget scales at ~60% of HP rate (1.3x at 2 players)
- Downed/revive state activates only with >1 player
- Dustdevil zones, laser telegraphs, cactus damage all player-count-independent
- No hidden single-player/multiplayer divergence

---

## Gaps Identified

### Priority 1: Gameplay Impact

#### Gap 1: Drifter vs. Dustdevil Silhouette Collision

**Problem**: Both are 8px-radius circles. At gameplay speed, a hat brim vs. a spiral
arc may not be distinct enough. Research says silhouette must differentiate types even
when filled solid black.

**Evidence**: Drifter radius=8 (circle + hat). Dustdevil radius=8 (circle + spiral).
Same base shape, same size.

**Fix**: Give Dustdevil a different base size (r=10) or shape (3-pointed star / triangle).
The spiral is a secondary feature — the base shape must carry the distinction.

**Effort**: Small (change `DUSTDEVIL_RADIUS` and redraw in `stage1Shapes.ts`).

---

#### Gap 2: Knife Drifter Not Readable From Behind

**Problem**: The blade wedge only extends forward in the facing direction. When a
Knife Drifter faces away from the player, it looks identical to a regular Drifter.
Research says every enemy needs an always-visible identifier.

**Evidence**: `drawKnifeDrifter()` draws the blade at facing angle only. No eye dot
(only Drifter has one). No body color difference.

**Fix**: Add a permanent visual marker — a darker body tint, a bandana element, or
the blade visible as a small nub on the back side too. Simplest: give Knife Drifter
a slightly different body color than Drifter (they're already different: `0xd4a574`
vs `0xdd6633`), but also add a 2px "sheath" line on the back of the body.

**Effort**: Small.

---

#### Gap 3: No Inter-Wave Reward/Breath Moment

**Problem**: Waves transition with only a 2-3 second spawn delay. Hades inserts a
boon choice between every encounter, giving the player a chance to breathe, feel
progression, and make a meaningful decision. Our waves flow continuously.

**Evidence**: `STAGE_1_ENCOUNTER` wave spawn delays: 0s, 2s, 3s. No decision points.

**Recommendation**: This is a design decision, not a bug. If the game wants Hades-style
pacing, add a "choose one of two buffs" overlay between waves. If it wants Nuclear
Throne-style continuous pressure, the current flow is correct. The western theme
could support either — a "loot the fallen" moment between waves would be thematic.

**Effort**: Medium-large (new UI system, upgrade selection flow).

**NOTE**: We want nuclear throne style constant battle. More like risk of rain, really.

---

### Priority 2: Design Depth

#### Gap 4: Boss Pool Fully Random From Run 1

**Problem**: Hades locks Tartarus to Megaera for the first several runs, then unlocks
Alecto and Tisiphone. This lets new players learn one boss pattern thoroughly before
facing variety. Our 3-boss pool (Boomstick Bill, Mad Dog, Dalton Boys) is fully random
from run 1.

**Evidence**: `STAGE_1_ENCOUNTER.bossPool` has 3 entries with no gating.

**Recommendation**: Consider locking to one boss (e.g., Boomstick Bill — the most
straightforward pattern) for the first 1-2 completions, then unlocking the pool.
Requires a persistence/progress system.

**Effort**: Medium (needs run-count tracking + conditional pool filtering).

**NOTE**: This is okay. We'll keep our boss pool at three for now.

---

#### Gap 5: Cover Placement Is Position-Agnostic

**Problem**: Obstacles are scattered via Poisson-like sampling with minimum spacing
but no relationship to enemy spawn points, sightlines, or approach vectors.
Research says cover should be denser along common enemy approach vectors and sparser
in the center arena.

**Evidence**: `placeMapObstacles()` uses random position + collision check. No concept
of "cover relative to Deadeye sightlines" or "cover near spawn ring."

**Recommendation**: Weight obstacle placement toward the building-gap alleys where
Deadeyes (preferredRange: 260) are likely to position. Keep the center arena sparse
for dodging. This would turn random scatter into tactical terrain.

**Effort**: Medium (add weighted placement zones to the obstacle generator).

---

#### Gap 6: Dustdevil Zones Don't Affect Enemies

**Problem**: Hades' environmental hazards damage both player and enemies, creating
tactical depth — players can lure enemies into hazards. Our Dustdevil zones only
query `[Player, Position, Health]`, excluding all enemies.

**Evidence**: `dustdevilZone.ts` line 15 uses `playerQuery = defineQuery([Player, Position, Health])`.

**Recommendation**: Consider making zones damage enemies too (at reduced rate). This
creates a "lure enemies into the zone" tactic and teaches that the environment is a
tool. However, this adds complexity and may make Dustdevils counterproductive for
the enemy faction.

**Effort**: Small-medium (extend the zone query to include enemies, add friendly-fire
check).

---

#### Gap 7: No NG+ Scaling for Stage 1

**Problem**: The encounter definition is static. Nuclear Throne's Desert stays
relevant through loop mutations that swap enemy types. Once a player masters Stage 1,
there's no reason to replay it.

**Evidence**: `STAGE_1_ENCOUNTER` has fixed fodder budgets, threat counts, and pool
compositions. No difficulty parameter.

**Recommendation**: Add a `difficultyMultiplier` that scales budgets and introduces
harder substitutions (Drifter → Knife Drifter, add Spitters to Wave 1) on repeat
completions. Low priority — this is a "depth" feature, not a "launch" feature.

**Effort**: Medium.

**NOTE**: This is fine. We'll add knobs and dials for difficulty later.

---

### Priority 3: Polish

#### Gap 8: Main Street Has No Gameplay Identity

**Problem**: Road tiles look different but have no gameplay effect. Research says
the main street should be the "kill zone" — wide, exposed, dangerous. Currently
it's just a visual feature.

**Recommendation**: Consider a minor movement speed bonus on road tiles, or make
enemies preferentially patrol the main street. This creates the classic "dash across
the street under fire" western moment.

**Effort**: Small-medium.

---

#### Gap 9: No Zero-Stakes Tutorial Moment

**Problem**: Gungeon has a literal Halls of Knowledge tutorial. We throw the player
into Wave 1 immediately. Even though Wave 1 is gentle, there's no zero-stakes
introduction to movement and dodge rolling.

**Recommendation**: A 5-second pre-wave phase where the player can move freely,
or a single slow Drifter that spawns close enough to guarantee first-shot success.
Could also be a separate "tutorial" encounter that runs once per account.

**Effort**: Small (spawn delay + UI hint) to Large (full tutorial system).

**NOTE**: This is fine. We don't need this. We'll just throw the player in the real game for now.

---

#### Gap 10: Spur Roads Create Dead Ends

**Problem**: Spur roads (4-8 tile branches off the main street) lead to walls. If
a player retreats down one during combat, they're trapped.

**Mitigating factor**: Spurs are short enough that the player can see the dead end
before committing. This is arguably a risk-reward feature — spur ends are safe
from flanking but dangerous if enemies follow.

**Recommendation**: Monitor playtesting. If players consistently die in spur dead
ends, either remove spurs or add a destructible wall at the end as an emergency
escape.

**Effort**: No change needed unless playtesting reveals a problem.

---

## Summary Scorecard

| Category                     | Grade | Notes                                                  |
| ---------------------------- | :---: | ------------------------------------------------------ |
| Wave structure / pacing      |   A   | Textbook progressive introduction                      |
| Enemy visual identity        |  B+   | Strong shapes, but Drifter/Dustdevil collision         |
| Town layout authenticity     |   A   | Porches, alleys, landmarks, density gradient           |
| Cover design                 |   B   | Good variety, but position-agnostic placement          |
| Multiplayer parity           |   A   | Full co-op scaling, no divergence                      |
| Test coverage                |   A   | Integration tests for all attack types, waves, map gen |
| First-time player experience |   B   | No tutorial, no inter-wave rewards                     |
| Replayability                |  C+   | Static encounter, no NG+ scaling                       |

**Overall**: Stage 1 is a solid, well-tested first stage that follows most roguelite
best practices for progressive mechanic introduction and environmental design. The
main gaps are in replayability (static encounters, no NG+ scaling) and first-time
player experience (no tutorial, continuous wave pressure). The most impactful quick
wins are fixing the Drifter/Dustdevil silhouette collision and adding a Knife Drifter
back-facing marker.

---

## Sources

- Enter the Gungeon Floor 1 design: [Gamasutra Q&A](https://www.gamedeveloper.com/design/q-a-the-guns-and-dungeons-of-i-enter-the-gungeon-i-)
- Hades Tartarus design: [Hades Wiki](https://hades.fandom.com/wiki/Tartarus)
- Nuclear Throne Desert: [NT Wiki](https://nuclear-throne.fandom.com/wiki/Desert)
- Cover placement: [The Level Design Book](https://book.leveldesignbook.com/process/combat/cover)
- Enemy readability: [The Level Design Book — Enemy Design](https://book.leveldesignbook.com/process/combat/enemy)
- Shape language: [80 Level — Character Design](https://medium.com/@EightyLevel/character-design-shape-language-and-readability-6ee4bb6f98a6)
- Roguelite design pillars: [Six Principles of Roguelike Design](https://blackshellmedia.com/2017/04/six-principles-roguelike-design-nuclear-throne-exemplifies/)
