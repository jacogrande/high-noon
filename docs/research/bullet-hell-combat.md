# Bullet Hell Combat Design for Top-Down Roguelites

Research document covering bullet pattern design, readability, difficulty scaling, dodge mechanics, game feel, boss encounters, multiplayer considerations, and common pitfalls. All analysis is through the lens of top-down twin-stick shooters (Enter the Gungeon, Nuclear Throne, Hades, Nova Drift, Archvale) rather than vertically-scrolling shmups.

See also: [Boss Design](./boss-design.md) for boss encounter mechanics, [Player Mechanics](../mechanics/player-mechanics.md) for High Noon's core movement and dodge system, [Enemy Spawning](./enemy-spawning.md) for wave/budget spawn systems.

---

## Table of Contents

1. [The Bullet Hell Distinction](#1-the-bullet-hell-distinction)
2. [Bullet Pattern Fundamentals](#2-bullet-pattern-fundamentals)
3. [Readability and Visual Fairness](#3-readability-and-visual-fairness)
4. [Hitbox Design](#4-hitbox-design)
5. [Dodge Mechanics and Player Agency](#5-dodge-mechanics-and-player-agency)
6. [Difficulty Scaling and Pacing](#6-difficulty-scaling-and-pacing)
7. [Game Feel: Audio and Visual Feedback](#7-game-feel-audio-and-visual-feedback)
8. [Boss Design in Bullet Hell](#8-boss-design-in-bullet-hell)
9. [Multiplayer Bullet Hell](#9-multiplayer-bullet-hell)
10. [Performance and Technical Constraints](#10-performance-and-technical-constraints)
11. [Common Pitfalls](#11-common-pitfalls)
12. [Recommendations for High Noon](#12-recommendations-for-high-noon)

---

## 1. The Bullet Hell Distinction

### Bullet Hell vs. Bullet Spam

The defining quality of bullet hell is **intentional pattern design**, not raw projectile count. From Sparen's Danmaku Design Studio (the most comprehensive pattern design resource in the shmup community):

> "The differentiating factor of bullet hell is NOT the number of bullets. You can have many bullets, but if they aren't thoughtfully used, it's bullet spam — not bullet hell."

The distinction matters because players process patterns differently from chaos:

- **100 bullets in a recognizable spiral** are easier to dodge than **30 independent random bullets**. Humans are extraordinary pattern recognition machines but poor at tracking many independent threats simultaneously.
- Bullet hell leverages this: dense but structured patterns create the *feeling* of overwhelming danger while remaining fair and learnable.
- Bullet spam — large quantities of unstructured projectiles — creates frustration because deaths feel random rather than the result of a readable mistake.

### The Information Problem

Abstracting Games identifies the core challenge as **information delivery under time pressure**. Players must simultaneously:

1. React to immediate threats (bullets arriving now)
2. Read the developing pattern (bullets arriving in 0.5–2 seconds)
3. Plan macro-movement (where to position for the next pattern phase)

If any of these information channels breaks down — bullets are hard to see, patterns are illegible, or there's no time to reposition — the game feels random rather than skillful. Every design decision below serves this information hierarchy.

### Top-Down Changes the Design Space

Traditional bullet hell (Touhou, DoDonPachi) is vertically scrolling with unidirectional player fire. Top-down twin-stick changes the dynamics:

| Dimension | Scrolling Shmup | Top-Down Twin-Stick |
|---|---|---|
| Threat direction | Primarily from above | 360 degrees |
| Player aim | Fixed forward | Independent of movement |
| Arena | Scrolling, infinite vertical | Bounded rooms/arenas |
| Movement focus | Micro-positioning | Kiting, circle-strafing, cornering |
| Engagement style | Dodge through patterns | Dodge while simultaneously aiming |
| Environmental interaction | None | Walls, cover, destructibles |

This means:
- Patterns must be readable **from any angle**, not just when approached from below.
- Arena geometry (walls, pillars, pits) becomes part of the pattern — players can be cornered.
- Aim-while-dodging adds cognitive load, so patterns should be slightly less dense than in pure shmups.
- Camera framing is critical: how much of the 360-degree threat space is visible at once?

---

## 2. Bullet Pattern Fundamentals

### Pattern Archetypes

Every bullet pattern, no matter how complex, is composed from a small set of primitives:

#### Aimed

Bullets directed at the player's current position. The simplest and most universal pattern type.

- Single aimed shot: sniper enemies, low density but demands awareness
- Aimed burst: 3–5 rapid shots at the player's position, dodged by moving perpendicular
- Predictive aim: bullets lead the player's velocity vector — punishes linear movement

**Design note:** Aimed patterns feel fair because the player can see the causal relationship (enemy points at me, bullet comes toward me). They also prevent permanent safe spots.

#### Radial (Rings)

N bullets equally spaced around a circle: `angle[i] = seedAngle + i * (360/N)`.

- Seed angle fixed: creates consistent gaps the player can memorize
- Seed angle rotating: creates spirals (see below)
- N determines gap size: 8-way ring has 45-degree gaps; 24-way ring has 15-degree gaps

**Design note:** Rings are the bread and butter of bullet hell. They're immediately readable — gaps are visible before bullets reach the player. Start with rings when prototyping any new enemy.

#### Spread (Wall/Fan)

A formation that blocks passage, forcing the player into a constrained region. An even N-way spread traps the player in a fixed angle range, and a secondary pattern exploits that confinement.

- Horizontal/vertical walls force lateral/vertical dodging
- Fan spreads (120-degree arc) create pressure cones
- Alternating walls with offset gaps create weave patterns

**Design note:** Walls are most interesting as the constraining layer in a multi-layer pattern. A wall alone is trivially dodged; a wall plus aimed shots creates decision-making.

#### Spiral

Rings with incrementally rotating seed angles. The rotation rate and direction determine the feel:

- Slow rotation: long, sweeping arms that players run alongside
- Fast rotation: dense spiral that requires threading through
- Direction changes: clockwise → counter-clockwise forces repositioning
- Multiple spirals at different speeds create Moiré-like interference patterns

**Design note:** Spirals are visually spectacular and create a "flow" state where players move with the pattern rather than against it. They reward players who read the rotation direction.

#### Random/Scatter

Random trajectories with controlled density. Must be used carefully.

- Keep density consistent across the random spread
- Maintain the same general "shape" each firing — e.g., a 180-degree forward scatter should never randomly cluster into a 30-degree cone
- Use seeded randomness or min-separation constraints to prevent undodgeable clusters

**Design note:** Scatter patterns feel chaotic and unpredictable. Use them sparingly and primarily as a secondary layer over structured patterns. Pure scatter patterns feel unfair.

### Pattern Composition

Complex patterns are built by **layering** these primitives:

```
Layer 1: Slow radial ring (macro constraint — forces player to pick a gap)
Layer 2: Aimed burst through the gap (micro challenge — dodge within the chosen gap)
Layer 3: Expanding spiral that sweeps gaps over time (tempo — forces continuous movement)
```

The layering principle:
- **Base layer**: Slow, predictable, creates the macro structure (where am I allowed to be?)
- **Pressure layer**: Aimed or timed, creates micro decisions (when do I move?)
- **Tempo layer**: Forces movement over time, prevents camping (spirals, sweeps, expanding rings)

**Sparen's key insight:** "Patterns use multiple subpatterns/emitters composed together. The art is in how subpatterns interact, not in any single subpattern's complexity."

### Mathematical Foundations

All good patterns are defined by **equations over time**, not random generation:

```
angle(t) = baseAngle + angularVelocity * t
speed(t) = baseSpeed + acceleration * t
x(t) = origin.x + cos(angle) * speed * t
y(t) = origin.y + sin(angle) * speed * t
```

Important: Use floating-point angles, not integer degrees. A pattern with 1,500+ possible directions is far less likely to have exploitable safe spots than one quantized to 360 integer degrees.

---

## 3. Readability and Visual Fairness

### The Cardinal Rule

> "With a good shmup you always know what mistake you made when dying. It is purely about skill — there is no RNG, and off-screen sniping is limited and always telegraphed."

Every death should be a learning moment. If a player dies and thinks "that was bullshit," the readability has failed.

### Visual Hierarchy

From Boghog's Bullet Hell Shmup 101, the z-ordering rules for visual clarity:

1. **Enemy bullets rendered on top** of all other game objects — always
2. **Smaller, faster bullets** drawn over bigger, slower bullets
3. **Single bullets / small groups** drawn over large, easy-to-read formations
4. **Player character** must be instantly locatable — distinct silhouette, bright color
5. **Background uses mid-tones** — reserve extreme values (bright whites, saturated colors) for gameplay elements

### Bullet Visual Design

**Color coding by threat type:**
- Distinct colors for different bullet speeds or behaviors
- Enemy bullets visually distinct from player bullets (different shape, color, trail)
- Colorful energy balls for enemy projectiles — they read as "dangerous" and stand out against backgrounds

**Directional graphics:**
- Bullet sprites that show their travel direction improve readability dramatically
- Players can read velocity from the sprite orientation without tracking motion over frames
- Particularly important for fast-moving or small projectiles

**Trails and effects:**
- Bullets with unusual trajectories (homing, curved, accelerating) need extra visual indicators
- Short trails behind bullets help the eye track motion direction and speed
- Glowing/pulsing effects on high-damage bullets signal danger level

### Telegraph Systems

Telegraphs give players advance warning about incoming attacks. Critical for fairness in action-heavy combat:

**Area markers (Hades model):**
- Red floor indicators show where area attacks will land
- Players don't need to know who threw it or when — they need to see **where** the danger will be
- Duration of the telegraph inversely proportional to the attack's danger: bigger damage = longer warning

**Wind-up animations:**
- Enemy plays a distinct animation before firing (Gungeon boss arm raises, Hades ground slams)
- Animation duration = reaction window — typically 0.3–0.8 seconds
- The animation itself communicates attack direction and type

**Audio cues:**
- Distinct warning sounds for dangerous attacks
- Charging/building sounds that escalate before release
- Directional audio can signal off-screen threats

**The 80% rule (Hades):** 80% of the time, the player's eyes should be on their own character. Telegraphs must be perceivable in peripheral vision, not demand the player look away from their character.

### Grouping and Coherence

- **Single stray bullets are hard to read and feel unfair.** Always group bullets into lines, arcs, or other recognizable shapes.
- Connected bullets (moving in formation) register as a single threat to dodge, reducing cognitive load.
- Bullets that appear independent (scattered, varied speeds, different directions) each register as a separate threat — 30 independent bullets are harder to process than 100 in formation.

---

## 4. Hitbox Design

### The Forgiving Hitbox Principle

The player's collision hitbox should be **much smaller** than their visual sprite. This is the single most impactful fairness mechanic in bullet hell:

- Casual players occasionally survive what looked like certain death — this feels exciting, not cheap
- Hardcore players learn the exact hitbox limits and exploit them for advanced positioning
- Both groups enjoy the result: narrow escapes feel earned

### Touhou Hitbox Reference

The gold standard for hitbox design:

| Game | Hitbox Size | Notes |
|---|---|---|
| Touhou (Reimu) | 5x5 to 10x10 pixels | Centered on character's waist area |
| Touhou (focused mode) | Hitbox becomes visible | Players can see exact collision boundary |

Starting with Perfect Cherry Blossom, Touhou made the hitbox visible during focus mode — a transparency measure that increased trust and enabled deeper skill expression.

### Bullet Hitbox Scaling

Bullet hitboxes should also be forgiving, but with a twist:

- **Large bullets**: Hitbox smaller than visual (proportionally more "safe area")
- **Small bullets**: Hitbox closer to visual size (less forgiveness needed, less room for error)
- **General ratio**: ~60–80% of visual size for standard bullets, ~40–60% for large/slow projectiles

Enter the Gungeon uses pixel-perfect hit detection with **custom offsets per projectile type** — each bullet's hitbox was individually tuned.

### Implementation Approach

For a twin-stick top-down game using circle colliders:
- Player collider radius: significantly smaller than sprite radius (e.g., 4–6px collider on a 16px sprite)
- Bullet collider: slightly smaller than bullet sprite
- Boss bullets (large): proportionally smaller hitbox-to-visual ratio than regular bullets
- Make the player hitbox visible in debug mode (the debug overlay sprint already supports this)

---

## 5. Dodge Mechanics and Player Agency

### I-Frame Dodge (The Gungeon Model)

Enter the Gungeon's dodge roll is the definitive top-down dodge mechanic. The studio literally named themselves "Dodge Roll" after it:

| Property | Value |
|---|---|
| Total duration | ~0.7 seconds |
| I-frame window | ~0.35 seconds (first half) |
| Vulnerable recovery | ~0.35 seconds (second half) |
| Distance covered | ~3 tiles |
| Can pass through bullets | Yes, during i-frames |
| Cooldown | Brief recovery prevents spam |

**Critical design insight from the developers:** "Literally every attack in the game was built with the dodge roll in mind." The dodge roll is not an escape valve — it's the core mechanic that attacks are designed *around*.

This means:
- Every pattern must have timing where a well-placed dodge roll provides safety
- Patterns that require multiple consecutive rolls are the skill ceiling, not the baseline
- The dodge recovery window is where skill expression happens — committing early wastes i-frames, committing late risks the hit

### Focus/Precision Mode (The Touhou Model)

Touhou's two movement states create a constant strategic decision:

| Mode | Speed | Shot | Hitbox |
|---|---|---|---|
| Unfocused | Fast | Wide spread | Hidden |
| Focused | Slow | Narrow/powerful | Visible |

The player constantly switches between fast repositioning and slow precision threading. This dual-speed system is one of the genre's most copied innovations.

### Bullet Cancellation

Screen-clearing abilities serve as both a panic button and a strategic resource:

- **Gungeon Blanks**: Delete all enemy bullets in the room (2 per floor by default)
- **Gungeon Table Flip**: Flip a table to delete bullets in a small radius and create cover
- **Traditional shmup Bombs**: Clear entire screen — reward restraint (saving for emergencies scores higher)
- **Phase-transition cancellation**: Many games convert cancelled bullets into score/health pickups when a boss transitions phases, rewarding players who allow maximum density before triggering the phase

### Grazing (Risk-Reward Layer)

Touhou's graze system tracks bullets that enter the sprite but miss the hitbox:

- Near-misses award score bonuses and build meter
- Transforms close calls from frightening moments into satisfying ones
- Creates a risk-reward loop: playing dangerously is literally rewarding
- Deltarune adapted this as "Graze" building Tension Points and reducing turn duration

### Slowdown/Bullet Time

Some games offer temporary slow-motion to help players navigate dense patterns:

- Nuclear Throne's Crystal character has an active slow ability
- Ikaruga's polarity system lets players absorb matching-color bullets
- Max Payne's bullet time applied to twin-stick (Hotline Miami's aiming slowdown)

### The Core Principle

> "In bullet hell, the aim isn't dodging individual bullets, but recognizing patterns and navigating through openings in them."

Player agency comes from reading the pattern, choosing the opening, and executing the movement — not from frame-perfect reaction to each individual projectile.

---

## 6. Difficulty Scaling and Pacing

### Four Dimensions of Pattern Difficulty

Boghog identifies four independent difficulty axes that bullet patterns can test:

1. **Planning** — What the player does between dodges: memorizing pattern sequences, identifying safe zones, setting up positions for the next phase
2. **Precision** — How tight the required movements are: gap width, timing windows, hitbox threading
3. **Reading** — Ability to see a bullet's origin and predict its trajectory from partial information
4. **Multitasking** — Tracking multiple independent sub-patterns simultaneously

Good difficulty escalation increases load on these axes independently, not all at once:

| Stage | Planning | Precision | Reading | Multitasking |
|---|---|---|---|---|
| Early | Low (obvious patterns) | Low (wide gaps) | Low (slow, bright bullets) | Low (single patterns) |
| Mid | Medium (pattern combos) | Medium (tighter gaps) | Medium (faster, varied bullets) | Medium (2 layers) |
| Late | High (multi-phase sequences) | High (hitbox-width gaps) | High (fast + unusual trajectories) | High (3+ independent layers) |

### Density Scaling

Sparen's Guide A4 separates two independent density axes:

- **Spatial density**: More bullets per unit area = more spatially dense
- **Temporal density**: Faster spawn rate / shorter intervals between volleys

These are distinct levers:
- High spatial + low temporal = occasional dense waves with breathing room
- Low spatial + high temporal = constant pressure from moderate waves
- High spatial + high temporal = endgame difficulty ceiling

### Macro vs. Micro Dodging

- **Macrododging**: Tight formations requiring significant movement — focus on the pattern as a whole, "where do I need to be in 2 seconds?"
- **Micrododging**: Dense arrays requiring precise small adjustments — focus on a small screen area, "thread through this gap now"

The best encounters alternate between macro and micro, preventing players from settling into either mindset.

### Pacing: The Intensity Curve

> "Constant intensity wears players out. Creating variations in intensity makes intense moments stand out more."

The intensity graph should look like a sine wave with an upward trend, not a flat line:

```
Intensity
  ▲
  │     ╱╲        ╱╲╱╲
  │    ╱  ╲  ╱╲  ╱      ╲
  │   ╱    ╲╱  ╲╱        ╲╱╲
  │  ╱                        ╲
  │ ╱
  └──────────────────────────────► Time
    Wave1  Wave2  Wave3  BOSS
```

Valleys between peaks serve multiple functions:
- Recovery time prevents fatigue
- Makes the next peak feel more intense by contrast
- Allows players to appreciate their power growth
- Creates natural checkpoints for mental reset

### Roguelite Run-to-Run Variation

**Hades Heat System:** Granular difficulty toggles let players customize challenge. Each Heat modifier targets a specific skill dimension (tighter timing, more enemies, reduced healing, boss modifications). This is the gold standard for player-controlled difficulty.

**Risk of Rain 2 Timer:** Difficulty increases with real time elapsed. Skilled players who clear stages fast face easier subsequent stages. Slow players face escalating danger. The same boss encounter is contextually different depending on when you reach it.

**Vampire Survivors Inverse Model:** Players generate overwhelming barrages; difficulty comes from enemy density outpacing weapon upgrades. If growth outpaces upgrades, runs feel punishing. If upgrades outpace growth, runs feel trivial. The balance point is narrow but satisfying.

---

## 7. Game Feel: Audio and Visual Feedback

### Vlambeer's "Art of Screenshake" (The Gold Standard)

Jan Willem Nijman's GDC presentation defines what makes a single gunshot feel powerful. The full technique list:

1. **Muzzle flash** — Visual pop at the gun barrel
2. **Bigger, fatter bullets** — Makes the player feel powerful (visual size > collision size)
3. **Impact effects** — Visual burst on collision
4. **Hit animation** — Enemy sprite responds to being struck (flash, deform, flinch)
5. **Enemy knockback** — Physical pushback from hits
6. **Permanence** — Lasting evidence of combat (corpses, debris, bullet holes, blood)
7. **Camera lerp** — Smooth follow rather than locked center
8. **Camera kick** — Push camera opposite to shooting direction
9. **Screen shake** — Rattle the viewport when something impactful happens
10. **Player knockback/recoil** — Physical response to firing
11. **Hit stop (freeze frames)** — Momentary pause when hitting an enemy
12. **Gun delay** — Animation anticipation before firing
13. **Gun kickback** — Visual recoil on the weapon sprite

> "All these changes were tiny, but affected the feel of the game incredibly."

### Hit Stop Timing

| Intensity | Duration | Frames (60fps) | Use Case |
|---|---|---|---|
| Light | 0.03–0.05s | 2–3 | Standard enemy hit |
| Medium | 0.05–0.1s | 3–6 | Heavy hit, elite enemy kill |
| Heavy | 0.1–0.2s | 6–12 | Boss phase transition, critical kill |

Rules:
- Hit stop should affect **both** the attacker and the target — freezing just one looks wrong
- Stack multiple light hit stops for rapid-fire weapons rather than one long freeze
- The freeze must be brief enough that players don't become conscious of the pause
- Gate simulation updates (timeScale 0), not just animation — the entire world pauses

### Screen Shake Design

- **Trauma-based**: Accumulate trauma from events, decay over time, shake intensity = trauma^2
- Perlin noise produces smoother shake than random offsets
- X/Y translation + slight rotation feels more natural than translation alone
- Pixel-round the final camera position to prevent sub-pixel sprite shimmer
- Scale shake intensity to game state: more shake during desperate combat, less during exploration

### The Integration Principle

> "Squash and stretch without camera shake may feel loose; camera shake without hit-stop can be overwhelming. Truly memorable experiences orchestrate these tools together: a button press triggers character animation stretching, a burst of audio with screen shake and particles, and time halts briefly as the blade connects."

No single juice technique works in isolation. The *combination* of simultaneous small effects creates the feeling of impact. The key is proportion — everything should scale together.

### Sound Design Principles

- **Distinct firing sounds** per weapon type — the sound should communicate power and fire rate
- **Impact sounds** serve as confirmation feedback (hit registered, kill confirmed)
- **Layered bullet sounds**: pitched/filtered variants prevent repetitive audio when many bullets fire simultaneously
- **Warning sounds** for dangerous attacks telegraph incoming threats
- **Spatial audio**: gunfire from screen-left should sound different from screen-right
- **Frequency separation**: player sounds in one frequency band, enemy sounds in another, prevents masking

---

## 8. Boss Design in Bullet Hell

### The Cardinal Rule

> "Force the player to stay alert." — Giest118's Guide to Good Bullet Hell Bosses

### Attack Design for Bosses

**Variety matters more than complexity:**
- Switch attacks frequently — individual attacks should last only **5–10 seconds** before transitioning
- If two attacks don't FEEL different and don't require different dodging approaches, they're the same attack
- Each attack should test a different player skill: one tests precision, another tests reading, another tests repositioning

**Preventing safe spots:**
- Add an aimed component to at least one layer of every pattern
- Use floating-point directions (1,500+ possible angles) to prevent exploitable gaps
- Touhou's anti-safespot system: bosses detect when players remain stationary and dynamically alter patterns to punish camping

**Small, mobile bosses are disproportionately hard:**
- When a small boss moves rapidly while filling the screen with dense patterns, landing consistent damage becomes nearly impossible
- Health values must account for actual damage uptime, not theoretical DPS
- Give players windows where the boss is vulnerable (telegraphed recovery, stationary phases)

### Phase Transitions

Phase transitions are the punctuation marks of boss fights:

- **Bullet cancellation**: Many games convert all on-screen bullets into pickups during transitions — rewards players who allow maximum density before triggering the phase change
- **Visual transformation**: New colors, animations, arena changes signal "this is different now"
- **Genuine pattern change**: Each phase must introduce new patterns, not just faster versions of Phase 1
- **Breathing room**: Brief safe period during transition for the player to reposition and recalibrate

### Health Gates and Enrage

**Health gates** (boss becomes temporarily invulnerable at HP thresholds):
- Prevents overpowered builds from skipping phases
- Ensures every player sees the full mechanical vocabulary of the fight
- Should be signaled clearly (visual invulnerability effect, dialogue, arena change)

**Enrage timers**:
- Soft enrage: gradually increasing difficulty (more bullets, faster patterns, less recovery)
- Hard enrage: fixed time limit, after which the boss becomes dramatically more dangerous
- Purpose: prevents overly cautious play, makes DPS matter, keeps fights from dragging
- Typical range: 5–10 minutes for major encounters

### Pattern Memorization vs. Reaction

The best bosses combine both:

| Element | Type | Example |
|---|---|---|
| Pattern structure | Memorizable | "Phase 2 always opens with a spiral, then a wall" |
| Aimed layers | Reactive | Specific bullet angles depend on player position |
| Timing windows | Learnable | Recovery frames after each attack are consistent |
| Combo sequences | Both | Fixed order, but reactive elements within each step |

Touhou spell cards lean toward memorization (fixed patterns with the same shape every time). Gungeon bosses lean toward reaction (randomized room layouts and varied attack selection). The ideal is a skeleton of memorizable structure with reactive flesh.

---

## 9. Multiplayer Bullet Hell

### Density Scaling (The Scaling Problem)

Naive scaling (2x players = 2x health, 2x bullets) doesn't work because:
- Player synergy is multiplicative, not additive (elemental combos, build specialization, revival)
- Pure health scaling creates "unfun bullet sponges" (Gunfire Reborn community feedback)
- Pure bullet density scaling creates visual noise that degrades readability

**Recommended approach (from Gunfire Reborn analysis):**
- **1.5–1.75x health per additional player** (not 2x), because coordinated teams deal more than 2x damage
- **Increase enemy count** rather than per-enemy health for density scaling
- Increase bullet density moderately — more sources, not denser per-source patterns
- Scale arena size with player count to maintain dodge space per player

### Screen Readability with Multiple Players

- **Distinct player indicators**: Each player needs a unique, instantly recognizable visual marker
- **Arena sizing**: Co-op arenas must be larger — players bump into each other and walls in cramped spaces
- **Reduce per-enemy pattern density** but increase enemy count — maintains total threat while keeping individual patterns readable
- **Friendly fire** (if enabled) adds another readability layer — must be visually obvious which bullets are player-sourced

### Design Adjustments

**Rabbit and Steel** (co-op bullet hell, 1–4 players) provides key insights:
- Solo play replaces cooperative mechanics with more aggressive bullet patterns
- Some attacks specifically require coordination (spread to designated positions, stack together)
- Stages can feel cramped in co-op mode — arena sizing is critical

**For High Noon specifically:**
- Solo mode runs the full shared sim locally — bullet density can be higher because there's only one player to track
- Multiplayer should reduce per-enemy density but increase enemy count
- Boss patterns may need multiplayer-specific variants (more aimed shots distributed across players, less screen-filling radials)
- Consider "threat assignment" where specific attacks target specific players, reducing visual noise while maintaining pressure on everyone

---

## 10. Performance and Technical Constraints

### Object Pooling (Essential for Browser/WebGL)

Pre-allocate a pool of bullet entities at initialization:

- **Spawn**: Grab an unused entity from pool, activate, set position/velocity
- **Despawn**: Deactivate entity, return to pool
- After pool size stabilizes: **zero allocations or deallocations** during gameplay
- JavaScript GC pauses are more noticeable than in native games — pooling is not optional

> "After object creation on initialization, no new objects should be created during the run of the game."

**Luna Abyss innovation**: Create a "production line" of bullets outside the play space and yank them into position as needed. Boss-specific pools are created as the player approaches and destroyed afterward to manage memory.

### Data-Oriented Design (ECS)

With bitECS (the project's ECS framework):
- Struct of Arrays layout: all positions in one contiguous Float32Array, all velocities in another
- Maximizes CPU cache utilization — sequential reads through typed arrays
- Single system update pass for all bullets instead of per-entity Update() overhead
- Real-world result: developers report going from ~100 entities struggling to **5,000+ entities** smoothly after switching to data-oriented design

### Collision Detection

- **Spatial hashing**: Divide space into a grid, check only same/adjacent cells
- Cell size: slightly larger than the largest bullet diameter
- Hash table capacity: ~10x the number of inserted objects
- **Player-vs-bullets shortcut**: With only 1–4 players, skip spatial indexing — just check all bullets against each player hitbox (cheaper than maintaining the data structure for a handful of targets)

### Rendering Optimization

- **Batch rendering**: Single draw call for all bullets of the same sprite type
- PixiJS handles sprite batching automatically when sprites share the same texture atlas
- Avoid per-bullet container overhead — flat sprite list in a single container
- Consider GPU instancing for extreme counts (4,000+)

### Practical Limits

| Metric | Guideline |
|---|---|
| Maximum simultaneous bullets | ~4,000 (practical ceiling for smooth browser performance) |
| Comfortable operating range | 200–800 (typical active count during intense combat) |
| Bullet update cost | Trivial with SoA/ECS — position update is a tight typed-array loop |
| Collision cost | Dominated by broad-phase — spatial hash keeps narrow-phase checks minimal |
| Sprite rendering | PixiJS batches efficiently up to thousands; profile if exceeding 2,000 visible sprites |

---

## 11. Common Pitfalls

### Pattern Design Mistakes

| Mistake | Why It's Bad | Fix |
|---|---|---|
| Single stray bullets | Hard to read, feel unfair — no pattern context to predict | Always group bullets into lines, arcs, or formations |
| Pure random scatter | Creates occasional undodgeable clusters | Use seeded randomness with min-separation constraints |
| All patterns feel the same | Two boss attacks requiring the same dodge approach are one attack | Each attack should test a different player skill |
| Homing at high counts | Throws balance off — unavoidable without i-frame spamming | Limit homing to low-count special bullets; give them visual distinction |
| Only aimed patterns | Players just circle-strafe; no macro decision-making | Mix aimed with radial/wall patterns that constrain movement space |
| Integer angle quantization | Creates repeating safe spots every N degrees | Use floating-point angles (1,500+ possible directions) |

### Visual Noise Failures

| Mistake | Why It's Bad | Fix |
|---|---|---|
| Bullets obscured by effects | Player can't see what kills them | Bullets render on top of ALL other elements |
| Busy/high-contrast backgrounds | Background competes with bullet visibility | Backgrounds use mid-tones; reserve extremes for gameplay elements |
| Player bullets look like enemy bullets | Players dodge their own shots, ignore real threats | Distinct color/shape/trail for player vs. enemy projectiles |
| No trails on unusual bullets | Curved/homing/accelerating bullets surprise players | Add trails to any bullet with non-linear trajectory |
| Missing telegraph for heavy attacks | Death feels arbitrary | 0.3–0.8s visual/audio warning for any attack that deals major damage |

### Difficulty and Pacing Failures

| Mistake | Why It's Bad | Fix |
|---|---|---|
| Constant maximum intensity | Exhausts players, removes contrast | Alternate high-low intensity — valleys make peaks land harder |
| Difficulty spikes between stages | Player feels punished for progressing | Smooth difficulty curves; new patterns introduce at low density first |
| Random undodgeable configurations | Deaths feel unfair, erodes trust | Constrain random patterns to ensure minimum gap width at all times |
| No recovery between waves | No time to process, heal, breathe | 1–3 second gaps between waves for mental reset |
| Bullet spam disguised as difficulty | Quantity without design doesn't feel like skill | Design patterns with intentional structure, then scale density |

### Technical Pitfalls

| Mistake | Impact | Fix |
|---|---|---|
| Dynamic bullet allocation | GC stutters during intense combat | Pre-allocated object pool |
| Per-bullet OOP updates | Cache misses, function call overhead | ECS/SoA batch updates |
| Not testing at scale | "Works with 20 bullets" ships, breaks at 200 | Profile with intended max bullet count during development |
| Collision every bullet vs. every entity | O(n^2) explosion | Spatial hash for bullet-vs-enemy; brute-force for bullet-vs-player |

---

## 12. Recommendations for High Noon

Based on this research, applied to High Noon's existing architecture (top-down twin-stick, ECS with bitECS, PixiJS rendering, 60Hz sim, dodge roll + jump):

### Pattern Design

1. **Start every enemy pattern from a primitive** (aimed, ring, spread, spiral) before adding complexity. Test the primitive alone first.
2. **Boss patterns should layer 2–3 primitives**, each testing a different skill axis. A ring (macro positioning) + aimed burst (micro dodge) + sweeping spiral (tempo/urgency) is a strong template.
3. **Use floating-point angles** in all pattern calculations — the shared sim's deterministic RNG already supports this.
4. **Ensure minimum gap width** in every pattern — no generated configuration should produce gaps narrower than 2x the player's collider radius. Validate this constraint in content definitions.
5. **Alternate intensity** within encounters: wave 1 moderate → wave 2 intense → breathing room → wave 3 peak. The waveSpawner budget system already enables this via encounter definitions.

### Hitbox Tuning

6. **Player collider should be 30–50% of sprite radius** — check current `Collider.radius` for the player entity against sprite size. Smaller hitbox = more satisfying near-misses.
7. **Large boss bullets should have proportionally smaller hitbox-to-visual ratio** (~50–60%) than regular bullets (~70–80%).
8. **The debug overlay's collider visualization (Sprint: Debug Overlay) enables visual hitbox tuning** — use it during playtesting to verify perceived fairness matches actual collision.

### Dodge Integration

9. **Every attack pattern must be dodgeable with a single well-timed roll.** Multi-roll requirements are the skill ceiling, not the floor. Design patterns with a "roll solution" and a "threading solution" (for players who don't want to spend the roll).
10. **Jump (Z-axis) should dodge ground-level patterns** — this gives High Noon a unique defensive option that most top-down bullet hells lack. Design some patterns as "ground sweeps" that the jump avoids.

### Game Feel

11. **Hit stop is already implemented (HitStop.ts)** — verify it's applied to all significant combat events, not just player damage. Enemy kills, critical hits, and boss phase transitions should all trigger appropriate-duration freezes.
12. **Camera kick and trauma-based shake are already implemented** — ensure bullet impacts on the player contribute trauma proportional to damage.
13. **Permanence**: bullet hole decals, corpse persistence, and debris add weight to combat. These are identified in the roadmap's Phase 2 (Game Feel & Polish).

### Multiplayer

14. **Scale bullet density per-player cautiously**: 1.5x total bullets for 2 players, not 2x. Increase enemy count to maintain pressure without visual noise.
15. **Boss patterns in multiplayer should distribute aimed components across players** — each player gets targeted by specific attacks rather than everyone dodging the same screen-filling radial.
16. **Arena sizing must account for player count** — camera bounds may need expansion for 4-player sessions.

### Performance

17. **Bullet pooling is essential** — the shared sim's `spawnBullet`/`removeBullet` functions should draw from a pre-allocated pool. Verify no per-bullet allocations exist in the hot path.
18. **Target 200–800 active bullets as the comfortable operating range** for typical combat. Stress-test at 2,000+ to verify the ECS batch update and PixiJS sprite batch rendering hold up.
19. **Spatial hash collision (already implemented) handles the broad phase** — ensure cell size is tuned to the largest bullet collider radius in use.

### Content Authoring

20. **Define patterns as data, not code** — bullet pattern definitions should live in `packages/shared/src/sim/content/` alongside weapon and enemy definitions. Pattern shape, speed curve, density, and layering should all be tunable constants.
21. **Tag patterns by difficulty axis** (precision, reading, multitasking) in content definitions so encounter designers can compose waves that escalate along specific axes rather than randomly piling on complexity.

---

## Reference Numbers

Quick-reference table of concrete values from the research:

| Parameter | Recommended Value | Source |
|---|---|---|
| Player hitbox ratio | 30–50% of sprite radius | Touhou hitbox analysis |
| Large bullet hitbox ratio | 50–60% of visual size | Bullet hitbox scaling research |
| Standard bullet hitbox ratio | 70–80% of visual size | Bullet hitbox scaling research |
| Dodge roll total duration | ~0.5–0.7s | Enter the Gungeon |
| Dodge roll i-frame window | ~50% of total duration | Enter the Gungeon |
| Telegraph duration (heavy attack) | 0.3–0.8s | Hades, general |
| Hit stop (light) | 0.03–0.05s (2–3 frames) | Game feel research |
| Hit stop (medium) | 0.05–0.1s (3–6 frames) | Game feel research |
| Hit stop (heavy) | 0.1–0.2s (6–12 frames) | Game feel research |
| Boss attack cycle | 5–10s per attack | Giest118's Guide |
| Boss enrage timer | 5–10 minutes | MMO/boss design |
| Active bullet comfort zone | 200–800 simultaneous | Performance profiling |
| Active bullet hard ceiling | ~4,000 simultaneous | Little Polygon |
| Multiplayer HP scaling | 1.5–1.75x per player | Gunfire Reborn community |
| Pattern angle precision | Float (1,500+ directions) | Giest118's Guide |
| Minimum gap width | >=2x player collider radius | Fairness constraint |
| Intensity valley duration | 1–3s between waves | Pacing research |

---

## Sources

- Sparen's Danmaku Design Studio — [Pattern Fundamentals (A2)](https://sparen.github.io/ph3tutorials/ddsga2.html), [Pattern Types (A3)](https://sparen.github.io/ph3tutorials/ddsga3.html), [Bullet Density (A4)](https://sparen.github.io/ph3tutorials/ddsga4.html)
- Boghog — [Bullet Hell Shmup 101](https://shmups.wiki/library/Boghog's_bullet_hell_shmup_101), [Difficulty Design: What Makes a Bullet Pattern Hard?](https://cohost.org/boghog/post/5119567-difficulty-design)
- Giest118 — [Guide to Making Good Bullet Hell Bosses](https://shmups.system11.org/viewtopic.php?t=44816)
- Vlambeer / Jan Willem Nijman — [The Art of Screenshake (GDC)](https://gdcvault.com/play/1020034/Performative-Game-Development-The-Design)
- [Building the Bullet Hell Systems of Luna Abyss (Game Developer)](https://www.gamedeveloper.com/design/building-the-bullet-hell-systems-of-luna-abyss)
- [Bullet Hells and the Information Problem (Abstracting Games)](https://abstractinggames.com/2021/06/20/297/)
- [What Other Games Can Learn From Bullet Hell (Paste Magazine)](https://www.pastemagazine.com/games/bullet-hell/what-other-games-can-learn-from-the-bullet-hell-ge)
- [Q&A: The Guns and Dungeons of Enter the Gungeon (Game Developer)](https://www.gamedeveloper.com/design/q-a-the-guns-and-dungeons-of-i-enter-the-gungeon-i-)
- [Improving Combat Impact of Action Games (Game Developer)](https://www.gamedeveloper.com/audio/improving-the-combat-impact-of-action-games)
- [The 1-Pixel Collision Box (Significant Bits)](https://significant-bits.com/the-1-pixel-collision-box/)
- [Touhou Wiki — Hitbox](https://en.touhouwiki.net/wiki/Hitbox), [Spell Cards](https://en.touhouwiki.net/wiki/Spell_card), [Anti-Safespot Behavior](https://en.touhouwiki.net/wiki/Bullet_Pattern_Cheat_Defensive_Behavior)
- [Enter the Gungeon Wiki — Dodge Roll](https://enterthegungeon.wiki.gg/wiki/Dodge_Roll_(Move))
- [Optimization for Bullet Hell Games (Thesis)](https://www.theseus.fi/handle/10024/894844)
- [ECS and Data-Oriented Design](https://outscal.com/blog/entity-component-system-csharp-guide)
- [Spatial Hashing for Collision Detection](https://www.gorillasun.de/blog/particle-system-optimization-grid-lookup-spatial-hashing/)
