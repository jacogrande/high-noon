# Player Mechanics Design

This document outlines the core player mechanics for High Noon, examining design philosophy, contemporary implementations, and common pitfalls.

## Overview

High Noon players have five core actions:

1. **Move** - 8-directional WASD movement
2. **Roll** - Directional dodge with invincibility frames
3. **Jump** - Vertical movement on a simulated Z-axis
4. **Shoot** - Mouse-aimed ranged attacks
5. **Special Ability** - Character-specific abilities

These mechanics work together to create a "twitchy" feel where skilled players can navigate dense bullet patterns through precise movement and well-timed defensive options.

---

## 1. Movement (8-Directional WASD)

### Design Philosophy

Movement is the most fundamental mechanic—players will be holding movement keys almost constantly. It must feel immediately responsive while still conveying a sense of weight and physicality.

### Key Design Decisions

#### Diagonal Speed Normalization

When pressing two keys (e.g., W+D), the naive implementation moves ~41% faster diagonally (√2 ≈ 1.414). This feels unfair and creates dominant strategies.

**Solution:** Normalize the input vector before applying speed.

```
inputVector = normalize(inputVector) * moveSpeed
```

#### Acceleration vs. Instant Response

Two schools of thought:

| Approach | Examples                         | Feel                                         |
| -------- | -------------------------------- | -------------------------------------------- |
| Instant  | Mega Man X, Zelda                | Precise, arcade-like, immediately responsive |
| Momentum | Super Mario, Hyper Light Drifter | Weighty, satisfying, requires prediction     |

**Recommendation for High Noon:** Lean toward instant/snappy with subtle acceleration (reach max speed in 2-4 frames). The bullet-hell nature demands precise positioning. Heavy momentum makes dodging frustrating.

#### Animation Directions

Classic games like A Link to the Past use 4 sprite directions for 8-directional movement. The character faces the nearest cardinal direction while moving diagonally.

**Options:**

- 4 directions (simpler art, classic feel)
- 8 directions (more fluid, higher art cost)
- 4 directions + lean/tilt for diagonals (compromise)

### Common Pitfalls

1. **Input delay** - Any perceptible delay (>100ms) between keypress and movement feels "laggy." Process input immediately.

2. **Slippery stops** - High deceleration feels slippery. Match deceleration to acceleration or use instant stops.

3. **Animation mismatch** - If the walk cycle doesn't match movement speed, it looks like ice skating.

### Contemporary Examples

- **Enter the Gungeon** - Instant acceleration, 8-directional sprites, tight and responsive
- **Nuclear Throne** - Very snappy, minimal momentum, camera follows tightly
- **Hades** - Slight momentum for "weighty" feel, but still very responsive

---

## 2. Dodge Roll

### Design Philosophy

The dodge roll is the primary defensive tool. It serves multiple purposes:

- Escape dense bullet patterns
- Reposition quickly
- Provide invincibility during overwhelm moments
- Create risk/reward decisions (commit to direction)

The roll should feel powerful but not spammable—a skilled "get out of jail" card that rewards timing.

### Key Design Decisions

#### Invincibility Frames (I-Frames)

The critical feature. During part of the roll animation, the player cannot take damage.

**Enter the Gungeon's approach:**

- Total duration: ~0.7 seconds
- I-frames: First half (~0.35 seconds)
- Vulnerable: Second half (still moving, can take damage)

This split creates skill expression—mistiming means taking a hit during recovery.

#### Direction Commitment

Once a roll begins, the player cannot change direction. This:

- Prevents "panic rolling" from being a universal solution
- Creates risk/reward (commit to a direction)
- Forces reading bullet patterns instead of reacting

#### Roll Direction

Keyboard input provides 8 cardinal directions for rolling. An alternative is 360° roll toward the cursor position, which offers more precision but may feel less predictable.

#### Cooldown vs. Recovery

Two approaches to limiting roll spam:

1. **Hard cooldown** - Timer prevents rolling for X seconds after
2. **Recovery window** - Can roll again immediately after animation, but vulnerable gap exists

Enter the Gungeon uses recovery windows—you can chain rolls, but the vulnerable second half means you're exposed between I-frame windows.

#### Roll Interactions

Rolls can have additional properties:

- **Contact damage** - Rolling through enemies damages them (Gungeon: 3 damage)
- **Table flipping** - Rolling into tables flips them for cover
- **Item synergies** - Upgrades modify roll (teleport blink, bullet reflection, etc.)

### Common Pitfalls

1. **I-frames too long** - Trivializes bullet patterns. Players roll through everything.

2. **I-frames too short** - Feels useless. Players stop using it.

3. **No recovery vulnerability** - Infinite roll spam breaks difficulty.

4. **Input buffering issues** - Roll should buffer during other actions but not queue multiple rolls.

5. **Animation doesn't match I-frames** - Visual clarity is crucial. Players must learn the timing visually.

### Contemporary Examples

- **Enter the Gungeon** - The gold standard. Named their studio after it. I-frames + vulnerable recovery + contact damage.
- **Hades** - Dash instead of roll. Shorter, faster, can be upgraded to add I-frames.
- **Dark Souls** - Slower, more committal. I-frames tied to equipment weight.

---

## 3. Jump (Z-Axis in 2D)

### Design Philosophy

Adding a Z-axis (height) to a top-down game creates depth and tactical options. Players can:

- Jump over ground-based hazards
- Avoid low-flying projectiles
- Access elevated platforms
- Create visual variety in movement

The challenge is communicating height clearly in a 2D perspective.

### Key Design Decisions

#### Visual Communication

The player exists in X/Y screen space but has a conceptual Z position. Methods to communicate this:

**Shadow anchoring (most common):**

- The shadow stays at ground level
- The sprite rises above the shadow
- Distance between sprite and shadow = height

**Scale changes:**

- Sprite slightly scales up when airborne (closer to camera)
- Subtle but reinforces height

**Animation:**

- Jump anticipation squash
- Airborne pose
- Landing squash/stretch

#### Collision Implications

What happens to collisions during a jump?

| Collision Type                | During Jump                                                     |
| ----------------------------- | --------------------------------------------------------------- |
| Ground hazards (lava, spikes) | Pass over if Z > hazard height                                  |
| Ground enemies                | Either pass over or use Z-based collision                       |
| Bullets                       | Design choice: do all bullets hit at all Z? Or only matching Z? |
| Walls                         | Usually still collide (walls are full height)                   |

**Recommendation:** Keep bullet collision simple—all bullets hit regardless of Z. Jump is for hazards and positioning, not bullet dodging. This keeps the roll as the primary defensive tool.

#### Jump Arc

Classic parabolic arc with:

- Initial upward velocity
- Gravity pulling down
- Peak at midpoint
- Landing at origin Z

Consider whether players can move horizontally during jump (yes for most action games).

#### Landing Recovery

Brief landing lag creates commitment and prevents jump spam from being overpowered. 4-8 frames of recovery is common.

### Common Pitfalls

1. **Unclear shadow** - If the shadow is hard to see, players can't judge landing position.

2. **Z-collision confusion** - If some things use Z-collision and others don't, it's inconsistent and frustrating.

3. **Jump as invincibility** - If jumping dodges bullets, it competes with roll. Pick one primary defensive option.

4. **No landing commitment** - Without recovery, players bunny-hop constantly.

5. **Camera issues** - If the camera moves with jump height, it's disorienting.

### Contemporary Examples

- **Zelda: A Link to the Past** - Roc's Feather creates clean jump with shadow
- **Hyper Light Drifter** - No jump, but uses similar visual language for dashing over gaps
- **CrossCode** - Full Z-axis with jumping, solved with clear shadows and consistent collision rules

---

## 4. Shooting (Mouse-Aimed)

### Design Philosophy

High Noon uses keyboard movement (WASD) and mouse aiming. This provides:

- Precise 360° aiming
- Immediate response (no aim acceleration needed)
- Clear visual feedback via cursor

The shooting should feel punchy and satisfying while supporting the "bullet hell" aesthetic where players both dodge and deal projectiles.

### Key Design Decisions

#### Aim Visualization

**Cursor options:**

- Crosshair (precise, but can get lost in chaos)
- Line/laser from player to cursor (clear aim direction)
- Weapon-specific indicators

**Player facing:**
The sprite should face the aim direction, not movement direction. This requires 8-16 directional sprites or smooth rotation.

#### Firing Modes

| Mode               | Use Case                             |
| ------------------ | ------------------------------------ |
| Hold to fire       | Full-auto weapons, constant pressure |
| Click to fire      | Semi-auto, precision shots           |
| Charge and release | Powerful shots with risk/reward      |

Most top-down shooters support both via weapon types.

#### Camera and Aiming

Options for how the camera handles aim direction:

1. **Fixed on player** - Simple, but can't see far in aim direction
2. **Offset toward cursor** - Camera leads slightly toward aim (Gungeon does this)
3. **Cursor distance affects offset** - More offset when aiming far

Option 2 is the standard for the genre.

### Common Pitfalls

1. **Input snapping** - Never snap aim directly to input position. Interpolate smoothly to avoid jitter.

2. **Hardware jitter** - Add a minimum threshold before registering aim changes to filter noise.

3. **Aim-movement lock** - In some games, shooting locks movement direction. Allow full movement freedom while shooting.

4. **Cursor lost in chaos** - Cursor needs to be visually distinct and never obscured.

### Contemporary Examples

- **Enter the Gungeon** - Camera offset, clear cursor, weapon determines fire rate
- **Nuclear Throne** - Extremely responsive, no smoothing, raw and immediate
- **Hades** - Generous auto-aim, prioritizes action feel over precision

---

## 5. Special Ability (Character-Specific)

### Design Philosophy

Special abilities differentiate characters and create playstyle variety. In a roguelike context, abilities should:

- Define a character's identity
- Synergize with run upgrades
- Provide meaningful choices (when to use vs. save)
- Scale with skill (higher mastery = better results)

### Key Design Decisions

#### Resource System

How is ability usage limited?

| System                    | Pros                       | Cons                         |
| ------------------------- | -------------------------- | ---------------------------- |
| Cooldown                  | Simple, predictable        | Encourages using on cooldown |
| Charges (regenerating)    | Burst potential + recovery | More complex to balance      |
| Resource meter (build up) | Rewards aggression         | Passive play = no ability    |
| Ammo/consumable           | Scarcity creates tension   | Can feel punishing           |

**Recommendation:** Cooldown or charges are cleanest for action gameplay. Resource meters work if you want to reward aggressive play.

#### Ability Archetypes

Common special ability patterns:

**Offensive:**

- High damage burst (shotgun blast, slam)
- Area denial (grenade, trap)
- Execute (bonus damage to low health)

**Defensive:**

- Temporary invincibility
- Shield/block
- Health recovery

**Mobility:**

- Teleport/blink
- Speed boost
- Phase through enemies

**Utility:**

- Slow time
- Reveal enemies
- Pull items/pickups

#### Upgrade Integration

In roguelikes, abilities should interact with the upgrade system:

**Hades approach:**

- Base dash is simple
- Boons modify dash (add damage, effects, extra charges)
- Different gods offer different modifications
- Same input, wildly different results

This creates emergent builds without adding new buttons.

#### Cooldown Visualization

Players must always know ability status:

- UI element (meter, icon cooldown sweep)
- Character effects (glowing when ready)
- Audio cue when available

### Common Pitfalls

1. **Forgettable abilities** - If the ability isn't powerful enough, players ignore it. It should feel impactful.

2. **Must-use abilities** - If always optimal to use on cooldown, there's no decision. Create situational value.

3. **Synergy-breaking** - If abilities don't interact with upgrades, they feel disconnected from the run.

4. **Balance across characters** - Different abilities need different power curves. Don't force equal cooldowns.

5. **Animation lock too long** - Long cast times in a fast game feel terrible. Keep it snappy.

### Contemporary Examples

- **Hades** - Cast (crystal throw) and Call (god summon). Both heavily modified by boons.
- **Enter the Gungeon** - Character-specific actives (lockpicks, dog companion, roll bomb)
- **Risk of Rain 2** - Each survivor has 4 abilities with distinct cooldowns and synergies

---

## Mechanic Interactions

The five mechanics should work together cohesively:

### Movement + Roll

- Roll should feel like an extension of movement, not a separate system
- Direction should flow naturally from movement to roll

### Roll + Jump

- Can you roll in mid-air? If yes, creates advanced tech
- If no, landing recovery prevents roll spam

### Shoot + Movement

- Full movement while shooting is essential
- Consider move speed penalty while firing (risk/reward)

### Shoot + Roll

- Usually cannot shoot during roll (commitment)
- Some upgrades might allow roll-shooting

### Ability + Everything

- Abilities might enhance other mechanics
- Example: ability that makes next roll deal damage
- Example: ability that fires bullets in move direction

---

## Tuning Guidelines

Start with these baseline values and tune:

| Mechanic | Parameter     | Starting Value             |
| -------- | ------------- | -------------------------- |
| Movement | Max speed     | 200-300 units/sec          |
| Movement | Acceleration  | 2-4 frames to max          |
| Roll     | Duration      | 0.5-0.7 sec                |
| Roll     | I-frames      | 40-60% of duration         |
| Roll     | Distance      | 2-3x player width          |
| Roll     | Cooldown      | 0 (recovery only)          |
| Jump     | Duration      | 0.4-0.6 sec                |
| Jump     | Max height    | 1-1.5x player height       |
| Jump     | Landing lag   | 4-8 frames                 |
| Shoot    | Min fire rate | 4-6 shots/sec              |
| Ability  | Cooldown      | 8-15 sec (varies by power) |

---

## References

### Movement & Game Feel

- [Game Feel: A Beginner's Guide](https://gamedesignskills.com/game-design/game-feel/)
- [Fixing Diagonal Movement](https://jslegenddev.substack.com/p/how-to-fix-diagonal-movement-in-2d)
- [Game Feel Tips: Speed, Gravity, Friction](https://www.gamedeveloper.com/design/game-feel-tips-ii-speed-gravity-friction)

### Dodge Roll

- [Enter the Gungeon Wiki: Dodge Roll](<https://enterthegungeon.wiki.gg/wiki/Dodge_Roll_(Move)>)
- [Q&A: The guns and dungeons of Enter the Gungeon](https://www.gamedeveloper.com/design/q-a-the-guns-and-dungeons-of-i-enter-the-gungeon-i-)

### Aiming & Top-Down Shooters

- [Everything I Learned About Dual-Stick Shooter Controls](https://www.gamedeveloper.com/design/everything-i-learned-about-dual-stick-shooter-controls) (general aiming principles still apply)
- [Twin-stick shooter - Wikipedia](https://en.wikipedia.org/wiki/Twin-stick_shooter) (genre background)

### Z-Axis & Jumping

- [Z-order in top-down 2D games](https://eliasdaler.wordpress.com/2013/11/20/z-order-in-top-down-2d-games/)

### Ability Systems

- [Fueling your Mechanics with Gameplay Ability Systems](https://www.gamebreaking.com/posts/ability-systems)
