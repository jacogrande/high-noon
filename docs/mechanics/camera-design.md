# Camera Design

This document outlines the camera system for High Noon, covering follow behavior, smoothing math, screen effects, and integration with the fixed-timestep simulation.

## Overview

The camera has four core responsibilities:

1. **Follow** - Track the player smoothly while revealing the aim direction
2. **Smooth** - Absorb jitter and create natural motion without perceptible lag
3. **Shake** - Provide visceral feedback for impacts, shots, and explosions
4. **Bound** - Prevent showing outside the arena/room

These work together to create a camera that players never consciously notice during gameplay but that amplifies every action through subtle motion and feedback.

---

## 1. Follow Behavior (Aim-Offset)

### Design Philosophy

In a mouse-aimed top-down shooter, the most important thing the player needs to see is what they're aiming at. A camera locked to the player wastes half the screen on space behind them. The camera should always be biased toward the aim direction.

### Key Design Decisions

#### Camera Target Calculation

The camera tracks a point between the player and the cursor, weighted toward the player. This is the standard for the genre (Enter the Gungeon, Nuclear Throne, Hotline Miami).

```
target = player + (cursor - player) * aimWeight
```

Where `aimWeight` controls how far toward the cursor the camera shifts.

| Aim Weight | Feel | Example |
|---|---|---|
| 0.0 | Locked on player, no aim offset | Binding of Isaac |
| 0.10-0.15 | Subtle shift, barely noticeable | Hades |
| 0.15-0.25 | Clear aim reveal, still centered | Nuclear Throne |
| 0.25-0.35 | Aggressive offset, player off-center | Enter the Gungeon |

**Recommendation for High Noon:** Start at 0.20. This gives clear aim-direction reveal without the "jerky" feel some players report with Enter the Gungeon's more aggressive offset.

#### Maximum Aim Offset

The raw cursor position can be arbitrarily far from the player (edge of screen or beyond). Clamp the offset distance to prevent the player from leaving the visible area.

```
aimVector = cursor - player
if length(aimVector) > maxAimOffset:
    aimVector = normalize(aimVector) * maxAimOffset

target = player + aimVector * aimWeight
```

A `maxAimOffset` of 100-150 pixels keeps the player visible at all zoom levels.

#### Deadzone

A small rectangular region around the current camera target where movement doesn't trigger camera updates. This filters out micro-movements and mouse jitter.

For a twitchy action game, the deadzone should be small (5-15% of viewport) or absent entirely. Large deadzones suit exploration games, not shooters.

**Recommendation for High Noon:** Start with no deadzone. The aim-offset already creates smooth implicit follow behavior. Add a small deadzone (10% viewport) only if testing reveals jitter issues.

### Common Pitfalls

1. **Aim weight too high** - Player gets pushed to screen edge. Hard to see threats from behind.

2. **No max offset clamp** - Cursor at screen edge pulls camera so far that the player is barely visible.

3. **Cursor-relative vs player-relative** - The crosshair should be rendered in world space relative to the player, not relative to the camera. Otherwise the crosshair drifts when the camera moves.

4. **Asymmetric feel** - If aim offset only works on one axis or feels different horizontally vs vertically, it's disorienting.

### Contemporary Examples

- **Nuclear Throne** - Camera at midpoint between player and cursor (`aimWeight = 0.5`). Very aggressive, but works because of tight zoom and small arenas.
- **Enter the Gungeon** - Moderate offset with room-boundary clamping. Some players report it feels "sudden and jerky" when flicking aim quickly.
- **Hotline Miami** - Camera between player and cursor with separate distance parameters for camera and cursor rendering.

---

## 2. Smoothing

### Design Philosophy

The camera must never teleport or jerk. All position changes flow through a smoothing function that creates natural-feeling motion. But for a twitchy game, the smoothing must be fast enough that it never feels like the camera is "behind" the action.

### Key Design Decisions

#### Frame-Rate Independent Exponential Decay

The naive `lerp(current, target, 0.1)` per frame is frame-rate dependent: it moves faster at higher frame rates. The correct approach uses exponential decay that produces identical results regardless of frame rate.

```
function damp(current, target, lambda, dt):
    return lerp(current, target, 1 - exp(-lambda * dt))
```

Where `lambda` is the decay rate (higher = snappier).

| Lambda | Behavior | Use Case |
|---|---|---|
| 4-6 | Slow, cinematic | Cutscenes, exploration |
| 8-12 | Moderate, responsive | General gameplay |
| 12-20 | Fast, snappy | Twitchy action games |
| 30+ | Nearly instant | Effectively hard-follow |

**Recommendation for High Noon:** Lambda of 12-15. The camera should feel locked to the action but absorb the jitter from 60Hz simulation updates.

#### Critically Damped Springs (Alternative)

Springs maintain velocity state, producing more natural motion when the target moves unpredictably (e.g., player dashing or rolling). A critically damped spring converges without oscillation.

```
// omega = 2 / smoothTime (frequency parameter)
// x = current position, v = current velocity
let omega_dt = omega * dt
let exp_term = exp(-omega_dt)
new_x = target + (x - target + (v + omega * (x - target)) * dt) * exp_term
new_v = (v - omega * (v + omega * (x - target)) * dt) * exp_term
```

| Smooth Time | Behavior |
|---|---|
| 0.15-0.20s | Relaxed follow |
| 0.08-0.12s | Responsive |
| 0.04-0.06s | Very snappy |

**Recommendation:** Either approach works. Exponential decay is simpler to implement and tune. Springs feel slightly more natural during sudden direction changes (rolls, dashes). Start with exponential decay; switch to springs if the roll-to-reverse-direction camera motion feels stiff.

#### Asymmetric Smoothing

Use different smoothing rates for different situations:

- **Normal movement:** Lambda 12 (smooth follow)
- **During roll/dash:** Lambda 18-20 (keep player visible during fast movement)
- **After roll ends:** Lambda 10 briefly (gentle settle back to normal)

This prevents the player from outrunning the camera during rolls while keeping normal movement smooth.

### Common Pitfalls

1. **Frame-rate dependent smoothing** - Using `lerp(a, b, 0.1)` per frame. Camera feels different at 30fps vs 144fps.

2. **Smoothing too heavy** - Camera lags behind during fast gameplay. Player can't see what they're moving into.

3. **Smoothing too light** - Every tiny movement propagates to the camera. Feels jittery and nauseating.

4. **Smoothing applied to shake** - Screen shake should bypass smoothing entirely. Smooth the base position, then add shake offset on top.

---

## 3. Screen Shake

### Design Philosophy

Screen shake is the single most impactful "juice" element in a top-down shooter. Vlambeer (Nuclear Throne) demonstrated that screen shake alone can transform a flat-feeling game into something visceral. But poorly implemented shake is nauseating. The key is a trauma-based system that scales naturally.

### Key Design Decisions

#### Trauma System

Instead of triggering discrete shake events, maintain a continuous "trauma" value (0 to 1) that decays over time. Different events add different amounts of trauma.

```
// When an event occurs:
trauma = min(1.0, trauma + stressAmount)

// Each tick:
trauma = max(0.0, trauma - recoveryRate * dt)

// Shake intensity (squared for natural falloff):
shake = trauma * trauma
```

The squaring is critical: small trauma values produce very subtle shake, while high trauma produces dramatic shake. This makes light hits feel like taps and heavy hits feel like earthquakes without manual tuning per event.

#### Perlin Noise, Not Random

Random jitter per frame produces jarring, discontinuous motion. Perlin noise produces smooth, continuous shake that resembles a handheld camera.

```
offsetX = maxShakeX * shake * perlin(seed, time * frequency)
offsetY = maxShakeY * shake * perlin(seed + 100, time * frequency)
angle   = maxAngle  * shake * perlin(seed + 200, time * frequency)
```

Perlin noise also works naturally with slow-motion: when time slows, the shake slows proportionally.

#### Rotational Shake

Adding a small rotational component (1-3 degrees) dramatically improves shake feel in 2D. The eye is more sensitive to rotation than translation, so even tiny angles register as significant impact.

#### Trauma Values by Event

| Event | Trauma Added | Rationale |
|---|---|---|
| Player fires pistol | 0.05-0.10 | Subtle kick, felt but not distracting |
| Player fires shotgun | 0.15-0.25 | Heavier weapon, more feedback |
| Bullet hits enemy | 0.05 | Minor confirmation |
| Enemy killed | 0.10-0.15 | Satisfying pop |
| Player takes damage | 0.30-0.40 | Alarming, communicates danger |
| Explosion nearby | 0.20-0.50 | Distance-attenuated |
| Boss slam attack | 0.40-0.60 | Dramatic moment |

#### Distance Attenuation

Explosions and environmental events should shake less when farther from the player:

```
distance01 = clamp(distance / maxRange, 0, 1)
stress = baseStress * (1 - distance01 * distance01)
```

#### Recommended Parameters

| Parameter | Value | Notes |
|---|---|---|
| Recovery rate | 1.5 per second | Moderate decay |
| Trauma exponent | 2 (squared) | Natural falloff curve |
| Max translation | 6-10 pixels | X and Y offset |
| Max rotation | 2-4 degrees | Small but perceptible |
| Noise frequency | 25 | Samples per second |

### Common Pitfalls

1. **Shake on every frame with random values** - Produces stroboscopic jitter. Use Perlin noise.

2. **No trauma decay** - Shake lingers forever. Always decay toward zero.

3. **Shake too strong** - Induces motion sickness. Always provide an accessibility option to reduce or disable shake.

4. **Shake applied before smoothing** - Shake gets smoothed out and loses its punch. Apply shake offset after all smoothing.

5. **No accessibility toggle** - Some players experience motion sickness from screen shake. Hades includes a screen shake intensity slider. This is a must-have.

### Contemporary Examples

- **Nuclear Throne** - Heavy shake on everything. Defines the genre's "juicy" feel. Sometimes criticized as excessive.
- **Enter the Gungeon** - Moderate shake, well-tuned per weapon class. Heavier weapons = more shake.
- **Celeste** - Directional shake that matches impact direction. Excellent implementation even in a platformer.

---

## 4. Camera Kick (Recoil)

### Design Philosophy

Separate from screen shake, camera kick is a directional offset that pushes the camera opposite to the firing direction. This conveys weapon power and reinforces the direction of action.

### Key Design Decisions

#### Implementation

When the player fires, apply a velocity impulse to a separate `kickOffset` vector that decays rapidly:

```
// On fire:
kickOffset += normalize(-fireDirection) * kickMagnitude

// Each tick:
kickOffset *= kickDecay  // e.g., 0.80-0.85 per frame at 60Hz
```

The kick offset is added to the camera position after smoothing but before shake.

#### Kick Magnitude by Weapon

| Weapon Type | Kick (pixels) | Decay |
|---|---|---|
| Pistol | 2-4 | 0.85 |
| Revolver | 4-6 | 0.82 |
| Shotgun | 6-10 | 0.80 |
| Rifle (rapid) | 1-2 | 0.90 |

Heavier weapons kick harder and decay slower, creating a sustained "push" feeling.

### Common Pitfalls

1. **Kick applied to player position** - Kick is visual only. Never offset the actual camera target, or the aim offset calculation drifts.

2. **Kick stacks infinitely** - With rapid-fire weapons, kick can accumulate. Clamp the total kick magnitude.

3. **Kick fights aim offset** - If firing toward the cursor pushes the camera away from the cursor, it feels wrong. The kick should be subtle enough that aim offset dominates.

---

## 5. Hit Stop (Freeze Frame)

### Design Philosophy

A brief simulation pause (1-5 frames) on significant hits communicates impact. During the freeze, the screen shake continues but the world is still. This creates a "snapshot" moment that makes kills and big hits feel deliberate.

### Key Design Decisions

#### Duration

| Event | Freeze Duration | Notes |
|---|---|---|
| Kill regular enemy | 1-2 frames (16-33ms) | Brief punctuation |
| Kill elite enemy | 3-4 frames (50-67ms) | Satisfying pause |
| Player takes damage | 2-3 frames (33-50ms) | "Oh no" moment |
| Critical hit | 2-3 frames (33-50ms) | Reward feedback |
| Boss phase change | 4-6 frames (67-100ms) | Dramatic beat |

#### Implementation

Set a `timeScale` factor that the simulation delta time is multiplied by. During hit stop, `timeScale = 0`. The camera system should still update shake and kick during hit stop (they use real time, not simulation time).

```
// In game loop:
simulationDt = fixedDt * timeScale

// Hit stop timer:
if hitStopRemaining > 0:
    timeScale = 0
    hitStopRemaining -= realDt
else:
    timeScale = 1
```

### Common Pitfalls

1. **Too long** - Anything over 100ms breaks flow. Players lose their rhythm.

2. **Affects input** - Input should still be collected during hit stop. Queue it for when the simulation resumes.

3. **Affects camera smoothing** - Camera smoothing should use real dt, not simulation dt. Otherwise the camera freezes and the post-hitstop snap is jarring.

---

## 6. Room Bounds and Transitions

### Design Philosophy

The camera must never show outside the playable area. In a room-based roguelite, this means clamping to room boundaries and handling transitions between rooms.

### Key Design Decisions

#### Boundary Clamping

After computing the camera target (with aim offset and smoothing), clamp so the viewport stays within room bounds:

```
halfWidth  = viewportWidth / 2
halfHeight = viewportHeight / 2

camera.x = clamp(camera.x, roomLeft + halfWidth, roomRight - halfWidth)
camera.y = clamp(camera.y, roomTop + halfHeight, roomBottom - halfHeight)
```

If the room is smaller than the viewport on either axis, center the camera on that axis instead of clamping.

#### Room Transitions

Two approaches:

| Approach | Examples | Feel |
|---|---|---|
| Snap with scroll | Binding of Isaac | Clean room separation, brief scroll animation |
| Continuous with boundary blend | Enter the Gungeon | Smooth, camera slides between rooms |

**Recommendation for High Noon:** Start with a single arena (no transitions needed). When rooms are added, use a brief directional scroll (0.3-0.5 seconds) matching the door direction. Disable player input during the scroll for clean transitions.

### Common Pitfalls

1. **Showing void outside the map** - Always clamp. Black borders or repeating edge tiles are both acceptable fallbacks.

2. **Aim offset pulls past boundary** - Apply boundary clamping after aim offset, not before. The offset might try to push past the edge.

3. **Shake shows past boundary** - Apply boundary clamping after shake offset too, or accept minor boundary violation during shake (often looks fine).

---

## 7. Pixel-Perfect Rendering

### Design Philosophy

For pixel art, sub-pixel camera positions cause shimmer and jitter as sprites snap between pixels. The camera's final rendered position must be rounded to whole pixels.

### Implementation

```
// After all camera calculations (follow, smooth, shake, kick):
renderX = round(cameraX)
renderY = round(cameraY)
```

This introduces up to 0.5 pixels of positional error, which is imperceptible. The alternative (sub-pixel rendering) causes visible texture swimming on low-resolution pixel art.

### Common Pitfalls

1. **Rounding before smoothing** - Round only the final render position. Internal state should remain floating-point for smooth interpolation.

2. **Rounding camera but not sprites** - If the camera is pixel-snapped but entity positions aren't, sprites still shimmer relative to the background.

---

## 8. Update Pipeline

### Fixed Timestep Integration

The simulation runs at 60Hz. The renderer runs at the display refresh rate. The camera must bridge both.

#### Per Simulation Tick (60Hz)

1. Compute camera target (player position + aim offset)
2. Smooth toward target (exponential decay or spring, using fixed dt)
3. Clamp to room bounds
4. Store as `currentCameraState`
5. Copy previous frame to `prevCameraState`

#### Per Render Frame (Variable Rate)

1. Interpolate between `prevCameraState` and `currentCameraState` using render alpha
2. Add screen shake offset (computed from real time, not simulation time)
3. Add camera kick offset (computed from real time)
4. Round to pixel grid
5. Apply to PixiJS container transform

```
alpha = accumulator / fixedTimestep

baseX = lerp(prevCamera.x, currCamera.x, alpha)
baseY = lerp(prevCamera.y, currCamera.y, alpha)

finalX = round(baseX + shakeOffsetX + kickOffsetX)
finalY = round(baseY + shakeOffsetY + kickOffsetY)
```

This keeps simulation deterministic (camera target computed in fixed step) while rendering smoothly at any frame rate.

---

## Tuning Guidelines

Start with these baseline values and adjust through playtesting:

| Parameter | Starting Value | Tune Range |
|---|---|---|
| Aim weight | 0.20 | 0.10 - 0.35 |
| Max aim offset | 120px | 80 - 200px |
| Smoothing lambda | 12 | 8 - 20 |
| Shake recovery rate | 1.5/s | 1.0 - 2.5/s |
| Shake max translation | 8px | 4 - 16px |
| Shake max rotation | 3 degrees | 1 - 6 degrees |
| Shake trauma exponent | 2 | 2 - 3 |
| Shake noise frequency | 25 | 15 - 40 |
| Kick magnitude (pistol) | 3px | 1 - 6px |
| Kick decay | 0.85/frame | 0.75 - 0.92 |
| Hit stop (kill) | 2 frames | 1 - 4 frames |

---

## Accessibility

Screen shake and camera effects can cause motion sickness. Provide these options:

- **Screen shake intensity** - Slider from 0% to 100% (multiply all shake trauma values)
- **Camera kick** - Toggle on/off
- **Hit stop** - Toggle on/off
- **Aim offset intensity** - Slider from 0% to 100%
- **Reduced motion** - Master toggle that disables shake, kick, and hit stop together

These should be prominent in the settings menu, not buried in advanced options.

---

## References

### Camera Systems

- [Scroll Back: The Theory and Practice of Cameras in Side-Scrollers (Itay Keren, GDC 2015)](https://www.gamedeveloper.com/design/scroll-back-the-theory-and-practice-of-cameras-in-side-scrollers) - Definitive taxonomy of 2D camera techniques
- [Math for Game Programmers: Juicing Your Cameras With Math (Squirrel Eiserloh, GDC 2016)](https://www.gdcvault.com/play/1023557/Math-for-Game-Programmers-Juicing) - Trauma-based shake system
- [How to Make a Good 2D Camera (Mark Brown / GMTK)](https://gmtk.substack.com/p/how-to-make-a-good-2d-camera) - Accessible overview of camera design tradeoffs
- [Camera Logic in a 2D Platformer (Game Developer)](https://www.gamedeveloper.com/design/camera-logic-in-a-2d-platformer) - Asymmetric smoothing and edge cases

### Smoothing Math

- [Improved Lerp Smoothing (Game Developer)](https://www.gamedeveloper.com/programming/improved-lerp-smoothing-) - Why naive lerp is broken, exp decay solution
- [Frame Rate Independent Damping Using Lerp (Rory Driscoll)](https://www.rorydriscoll.com/2016/03/07/frame-rate-independent-damping-using-lerp/) - Mathematical foundation
- [The Art of Damping (Alexis Bacot)](https://www.alexisbacot.com/blog/the-art-of-damping) - Critically damped springs explained
- [Spring-Roll-Call (Daniel Holden)](https://theorangeduck.com/page/spring-roll-call) - Comprehensive spring math reference
- [Damped Springs (Ryan Juckett)](https://www.ryanjuckett.com/damped-springs/) - Implementation-focused spring math

### Game Feel and Juice

- [The Art of Screenshake (Jan Willem Nijman / Vlambeer)](https://theengineeringofconsciousexperience.com/jan-willem-nijman-vlambeer-the-art-of-screenshake/) - How camera effects transform game feel
- [Camera Shake Tutorial (Roystan)](https://roystan.net/articles/camera-shake/) - Practical trauma-based implementation

### Fixed Timestep

- [Fix Your Timestep! (Gaffer on Games)](https://gafferongames.com/post/fix_your_timestep/) - Definitive guide to simulation timing
