# Weapon Sprite & Animation Systems Research

This document examines how top-down pixel art action games handle weapon rendering, aiming, and animation. It analyzes the trade-offs between different approaches and recommends a system for High Noon.

## Table of Contents

1. [The Core Problem](#the-core-problem)
2. [Approach Taxonomy](#approach-taxonomy)
3. [Case Studies](#case-studies)
4. [Implementation Patterns](#implementation-patterns)
5. [Hand & Arm Rendering](#hand--arm-rendering)
6. [PixiJS-Specific Techniques](#pixijs-specific-techniques)
7. [Design Recommendations for High Noon](#design-recommendations-for-high-noon)

---

## The Core Problem

Top-down pixel art games face a fundamental tension: characters are drawn as pre-rendered directional sprites (typically 4 or 8 facings), but weapons need to aim in a continuous 360-degree arc toward the mouse cursor. The character can only face N/E/S/W, but the gun needs to point at any angle.

This creates several interconnected sub-problems:

1. **Sprite integration** — Should the weapon be drawn into the character sprite, or exist as a separate object?
2. **Rotation** — How does a pixel-art weapon rotate smoothly without looking terrible?
3. **Layering** — Should the weapon render in front of or behind the body? It depends on aim direction.
4. **Hands/arms** — How do you connect the weapon to the character visually?
5. **Recoil & animation** — How do you sell the feel of firing?
6. **Scalability** — How many weapons can you add without exponential art cost?

---

## Approach Taxonomy

### A. Baked-In Weapons (Weapons in Character Sprite Sheet)

Every animation frame of the character includes the weapon drawn directly into the sprite. If the game has 4 directions, 5 animation states, and 6 frames each, every combination needs the weapon drawn in.

**Used by:** Vampire Survivors, Binding of Isaac, older retro games, Hotline Miami (partially)

**Strengths:**
- Pixel-perfect hand/weapon alignment every frame — no floating or disconnection artifacts
- No runtime compositing or layering logic needed
- Simpler rendering code (one sprite per entity)
- Excellent visual cohesion at very small sprite sizes (8x8, 16x16)

**Weaknesses:**
- Exponential art cost: `N weapons * M directions * K states * F frames`
- Adding one new weapon means drawing dozens to hundreds of new frames
- Cannot aim freely in 360 degrees — locked to the directional sprite set
- Completely impractical for games with many weapons

**Best for:** Games with very few weapons (1-3), auto-aim/auto-attack games (Vampire Survivors), or games where the weapon is integral to character identity.

### B. Separate Weapon Sprites (Decoupled Body + Weapon)

The character body is one sprite. The weapon is a separate sprite that is positioned, rotated, and layered relative to the character at runtime.

**Used by:** Enter the Gungeon, Nuclear Throne, Soul Knight, Brotato, Archvale

**Strengths:**
- Adding a new weapon = one new sprite (or a small animation sheet)
- Scales to hundreds of weapons trivially (Enter the Gungeon has 300+ guns)
- 360-degree aiming with a single weapon sprite via rotation
- Recoil/kick animation is trivial (offset the sprite backward along aim axis)
- Muzzle flash position is computed from weapon tip

**Weaknesses:**
- Requires runtime layering logic (weapon depth relative to body)
- Hand/grip positioning needs per-weapon data
- Can look "floaty" or disconnected if not carefully tuned
- Flipping logic needed when aiming left vs. right

**Best for:** Any game with weapon variety, 360-degree aiming, or roguelite weapon diversity.

### C. Full Body Rotation

The entire character sprite rotates to face the aim direction. There are no fixed directional facings.

**Used by:** Hotline Miami

**Strengths:**
- Weapon and body always face the same direction — simple compositing
- Natural-looking for true overhead perspectives

**Weaknesses:**
- Looks bad for 3/4 perspective (the style High Noon uses)
- Character detail is lost when rotated to odd angles
- Pixel art doesn't rotate cleanly — sub-pixel artifacts

**Best for:** True top-down (90-degree overhead) games only.

---

## Case Studies

### Enter the Gungeon

The gold standard for top-down weapon rendering with massive weapon variety.

**Body:** 4-directional character sprites (~30x30px). Each character has extensive sprite sheets — the Marine alone has 500+ frames across costumes and states.

**Weapon:** Completely separate sprite per gun. Each gun is a single image that rotates freely to the aim angle. The game has 300+ guns, each requiring only one sprite (plus optional firing animation frames).

**Hands:** Two separate floating hand sprites positioned at weapon-defined attachment points. Each gun defines `hand1` and `hand2` coordinate offsets in its data. When creating gun mods, modders use a Gun Animation Editor tool to position hands with arrow keys (hand1) and WASD (hand2). Hands rotate with the weapon automatically since they're children of the weapon transform.

**Layering:** Gun and hands render in front of or behind the character based on aim quadrant. When aiming up/away, the weapon moves behind the body sprite.

**Key takeaway:** Per-weapon hand position data is essential for polish. The hand positions are not computed — they're authored per weapon.

### Nuclear Throne

The template that most indie top-down shooters follow. Vlambeer's "Art of Screenshake" talk codified many of these techniques.

**Body:** Simple character sprites with minimal directional variation. Characters are small (~16x16).

**Weapon:** Single separate gun sprite per weapon. Rotated via `atan2(mouseY - playerY, mouseX - playerX)`. Only one image needed per weapon; vertical flipping handles left-vs-right aim.

**Hands:** Armless design. The character body has no visible arms at all. At 16x16 scale, arms would be 1-2 pixels wide — not worth drawing. Any hand detail is part of the weapon sprite itself or omitted entirely.

**Weapon offset:** Gun position alternates between left-hand offset (`x: -1`) and right-hand offset (`x: +7`) depending on aim direction, placing it on the correct side of the body.

**Recoil system (from Vlambeer's talk):**
- Weapon kick: 2px backward offset along aim axis on fire, exponential decay back to 0
- Reverse kick: negative offset (weapon pushes forward) on reload/shell eject
- Camera kick: 6px in the firing direction
- Screenshake: trauma value of 4 added per shot

**Key takeaway:** At small sprite scales, armless characters with floating weapons look completely natural. The "feel" comes from recoil, screenshake, and muzzle flash — not from arm articulation.

### Hotline Miami

An outlier that uses full body rotation.

**Body:** Top-down characters rotate their entire body to face the aim direction. This works because the game uses a near-true-overhead perspective.

**Weapon:** Separate weapon sprites stored in dedicated sprite sheets. The weapon rotates with the body since the whole character rotates. Melee weapons use swing arcs.

**Key takeaway:** Full body rotation only works for true overhead perspectives. High Noon uses a 3/4 view with directional facings, so this approach doesn't apply.

### Vampire Survivors

An extreme simplification that sidesteps the problem entirely.

**Body:** Characters use only 1 animation direction (forward-facing) with axis flip for the opposite. About 4 real animation sets total.

**Weapon:** Weapons are baked into character animations OR are separate projectile/effect sprites that orbit or emanate from the character. Weapons fire automatically — there is no aiming.

**Key takeaway:** Auto-attack games don't need decoupled weapon aiming. But any game with manual aim needs the decoupled approach.

### Binding of Isaac

Another approach that sidesteps the problem by design.

**Body:** Simple oval body shape with a separate directional head sprite. No visible arms.

**Weapon:** Isaac doesn't hold weapons — he fires tears from his face. The "weapon" is the projectile system itself. Items modify tear appearance and behavior but are never rendered as held objects.

**Key takeaway:** Some games design around the weapon rendering problem entirely. Not applicable to a game where the player character holds a revolver.

### Soul Knight

**Body:** Small pixel art characters in Unity. Directional sprites.

**Weapon:** Separate weapon sprites — over 477 weapons. Weapons are held and aim toward touch/joystick direction. Characters have small hand sprites as part of the weapon attachment system.

**Key takeaway:** Mobile games use the same separate-weapon-sprite pattern. Touch input makes the decoupled body/weapon approach even more essential since aim direction is independent of movement.

### Brotato

**Body:** Potato-shaped characters, deliberately armless by design (they're potatoes).

**Weapon:** Separate weapon sprites that orbit around the character. Characters can hold up to 6 weapons simultaneously, each with independent attack timers and orbiting positions.

**Key takeaway:** The armless design is not just a technical shortcut — it can be a deliberate aesthetic choice that players accept completely. Nobody questions why the potato has no arms.

### Death Must Die

**Body:** Characters use only 1 animation direction (forward-facing) with a y-axis flip. "Blown-up pixel art" style. Only ~4 real animation sets.

**Weapon:** Integrated into character sprite system. The community has actively discussed the challenge of adding visible item/weapon rendering to characters.

**Key takeaway:** Even successful games ship without separate weapon rendering and add it later. It's a polish feature, not a launch requirement.

---

## Implementation Patterns

### Pattern 1: Weapon as Rotated Child Sprite

The most common pattern across all the games studied. The weapon sprite is a child of the character's container, with its anchor set at the grip point.

```
CharacterContainer
  +-- BodySprite (anchor: center)
  +-- WeaponPivot (position: shoulder offset from body center)
       +-- WeaponSprite (anchor: {x: 0, y: 0.5} = grip point)
```

The WeaponPivot's rotation is set to the aim angle. Because the WeaponSprite's anchor is at `(0, 0.5)` (left-center), it rotates around the grip point and the barrel sweeps correctly.

### Pattern 2: Weapon Flipping on Aim Direction

When aiming left (aim angle > 90 degrees from horizontal), the weapon sprite must be flipped vertically to avoid appearing upside-down. Simultaneously, the character body is mirrored to face left.

```
if (aimAngle > PI/2 || aimAngle < -PI/2):
    weapon.scaleY = -1    // flip weapon vertically
    body.scaleX = -1      // mirror character to face left
else:
    weapon.scaleY = 1
    body.scaleX = 1
```

This is the exact approach Nuclear Throne uses, documented in multiple tutorials recreating its weapon system.

### Pattern 3: Depth Swapping Based on Aim Quadrant

The weapon needs to render behind the body when aiming up/away and in front when aiming down/toward the camera. The simplest approach:

| Aim Direction | Weapon Layer |
|---|---|
| Aiming down (toward camera) | In front of body |
| Aiming up (away from camera) | Behind body |
| Aiming sideways | In front of body (default) |

Implementation is a simple `zIndex` toggle based on the aim angle's vertical component.

### Pattern 4: Recoil as Offset Along Aim Axis

On fire, the weapon sprite is pushed backward (toward the player) along the aim axis by a small distance (2-4px), then decays exponentially back to zero. This is purely visual — it doesn't affect the ECS weapon position.

```
onFire:
    kickOffset = -KICK_DISTANCE   // e.g., -3px

eachFrame:
    kickOffset *= KICK_DECAY      // e.g., 0.85
    weapon.x = gripX + cos(aimAngle) * kickOffset
    weapon.y = gripY + sin(aimAngle) * kickOffset
```

Some games also apply a "reverse kick" on reload (weapon pushes forward briefly), making it look like the character is manually racking the slide or opening the cylinder.

### Pattern 5: Per-Weapon Data for Hand Positions

Each weapon defines attachment points as pixel offsets from its sprite origin. Enter the Gungeon's modding system exposes this clearly:

```
weapon_data = {
    sprite: 'revolver.png',
    hand1: { x: 3, y: 0 },         // primary hand (near grip)
    hand2: null,                     // no secondary hand for pistols
    barrelTip: { x: 16, y: -1 },   // muzzle flash spawn point
    kickDistance: 2,
}
```

Two-handed weapons (shotguns, rifles) define a `hand2` offset further along the barrel. Hand sprites are children of the weapon, so they rotate and flip automatically.

### Pattern 6: Muzzle Flash as Weapon Child

The muzzle flash is a child sprite of the weapon, positioned at the barrel tip. Because it's a child, it inherits the weapon's position and rotation automatically. On fire, it's set visible for 1-2 render frames, then hidden.

Some games randomize the flash sprite rotation or pick from 2-3 flash variants for visual variety.

---

## Hand & Arm Rendering

Three distinct patterns exist, each suited to different sprite scales and art styles:

### Armless (Hands on Weapon Only)

**Used by:** Nuclear Throne, Brotato

The character body has no visible arms. Small hand/fist sprites (2-4px circles) are either part of the weapon sprite or positioned at grip points on the weapon. When the weapon rotates, hands rotate with it.

**Best for:** Small sprites (16x16 to 32x32) where arms would be 1-2 pixels wide. Also works as a deliberate style choice (Brotato's potatoes, Nuclear Throne's mutants).

### Separate Floating Hands

**Used by:** Enter the Gungeon

Two separate hand sprites positioned at weapon-defined coordinate offsets. Each gun specifies where hands go. Hands are children of the weapon transform, so they follow rotation automatically.

**Best for:** Medium sprites (24x24 to 48x48) where hands are visible but arms would look stiff. Requires per-weapon hand position authoring.

### Arms Baked Into Body

**Used by:** Hotline Miami, classic RPGs

Arms are drawn directly into the character's directional body sprites. The weapon overlaps where the drawn hand is.

**Best for:** Games with very few weapons, games with full body rotation, or games where arms are a key part of character design. Not viable for 360-degree weapon rotation since the arms are locked to the directional sprite.

---

## PixiJS-Specific Techniques

### Container Hierarchy

PixiJS v8 containers form a scene graph where children inherit their parent's transform. This is perfect for weapon attachment:

```typescript
const playerContainer = new Container()
playerContainer.sortableChildren = true  // enable zIndex sorting

const bodySprite = new Sprite(bodyTexture)
bodySprite.anchor.set(0.5)  // center
bodySprite.zIndex = 0

const weaponPivot = new Container()
weaponPivot.position.set(2, 0)  // offset from body center to grip position

const weaponSprite = new Sprite(gunTexture)
weaponSprite.anchor.set(0, 0.5)  // grip at left-center edge
weaponSprite.texture.source.scaleMode = 'nearest'

weaponPivot.addChild(weaponSprite)
playerContainer.addChild(bodySprite)
playerContainer.addChild(weaponPivot)
```

Setting `weaponSprite.anchor.set(0, 0.5)` means the sprite rotates around its left edge (vertically centered) — exactly where the character's hand grips the weapon. The barrel sweeps in an arc around this point.

### Anchor vs. Pivot

PixiJS offers two ways to set the rotation origin:

| Property | Scope | Units | Best for |
|---|---|---|---|
| `anchor` | Sprite only | Percentage (0-1) | Weapon sprites — resolution-agnostic, stays correct if texture size changes |
| `pivot` | Any Container | Pixels | Containers that need an offset rotation center |

For weapon sprites, prefer `anchor` because it remains correct even if you swap the texture for a different weapon with different dimensions.

### zIndex for Depth Swapping

Rather than PixiJS v8's `RenderLayer` system (which decouples rendering order from the scene graph), the simpler approach is `zIndex` toggling with `sortableChildren = true`:

```typescript
// In render loop, based on aim angle
const aimingUp = aimAngle < -Math.PI * 0.25 && aimAngle > -Math.PI * 0.75
weaponPivot.zIndex = aimingUp ? -1 : 1
```

### Pixel-Perfect Rotation

At low resolutions with nearest-neighbor scaling, rotating sprites produces visible sub-pixel artifacts. Two mitigation strategies:

1. **Round position to integers** after computing the weapon tip position — prevents shimmer
2. **Pre-render rotated frames** for common angles (45-degree increments) and only use runtime rotation for in-between angles. This is more work but produces cleaner pixel art.

Most games (Nuclear Throne, Enter the Gungeon) accept the minor rotation artifacts since the weapon is small and moving constantly. At 2x scale (High Noon's zoom level), artifacts are even less noticeable.

---

## Design Recommendations for High Noon

### Recommended Approach: Separate Weapon Sprites, Armless Style

High Noon should use **separate weapon sprites** with an **armless character design** (Nuclear Throne / Brotato model). Here's why:

1. **Weapon variety** — A roguelite needs many weapons. Baking weapons into character sprites would require `N weapons * 4 directions * 5+ states * 4-8 frames` = thousands of hand-drawn frames. Separate sprites make each new weapon cost one sprite.

2. **Sprite scale** — At 79px cell size rendered at 2x zoom, the character is moderately sized. Arms would be ~4-6px wide in the sprite sheet. This is the borderline zone — arms are possible but awkward to articulate. The armless approach is cleaner at this scale.

3. **Existing architecture** — The current system already decouples aim angle from body direction (`Player.aimAngle` vs `PlayerState`). The body faces a 4-way direction based on aim, and the weapon can rotate freely to the exact angle.

4. **Camera system compatibility** — The existing camera kick and screenshake systems already fire on shots. Adding weapon recoil (a visual offset on the weapon sprite) layers on top of this naturally.

### Proposed Rendering Architecture

```
PlayerContainer (sortableChildren: true)
  +-- BodySprite (existing PlayerRenderer sprite, zIndex: 0)
  +-- WeaponPivot (Container, positioned at shoulder offset)
       +-- WeaponSprite (anchor: 0, 0.5 — grip point rotation)
       +-- HandSprite (optional: small circle at grip, child of weapon)
       +-- MuzzleFlashSprite (positioned at barrel tip, child of weapon)
```

### Proposed Weapon Data Schema

```typescript
interface WeaponSpriteData {
  sprite: string              // texture key, e.g. 'revolver'
  gripOffset: { x: number; y: number }  // offset from body center to grip point
  barrelTip: { x: number; y: number }   // muzzle flash / bullet spawn offset from grip
  handOffset: { x: number; y: number }  // hand sprite position on weapon (if using hands)
  kickDistance: number         // recoil offset in pixels on fire
  scale: number               // weapon sprite scale (default 1)
}
```

This data lives alongside the existing weapon stats in the shared content definitions (e.g. `content/weapons.ts`). The ECS stores the weapon type ID; the renderer looks up visual data from the content definition.

### Rendering Logic (Per Frame)

1. Read `Player.aimAngle[eid]` for continuous aim direction
2. Set `weaponPivot.rotation = aimAngle`
3. Determine if aiming left: `const aimingLeft = Math.abs(aimAngle) > Math.PI / 2`
4. Flip weapon vertically when aiming left: `weaponSprite.scale.y = aimingLeft ? -1 : 1`
5. Mirror body sprite when aiming left (already handled by `angleToDirection` returning 'W' which flips `scale.x`)
6. Swap weapon depth: `weaponPivot.zIndex = aimAngle < -PI/4 && aimAngle > -3*PI/4 ? -1 : 1`
7. Apply recoil offset: decay `kickOffset` exponentially, offset weapon along aim axis
8. Position muzzle flash at barrel tip (automatic since it's a child of the weapon sprite)

### What NOT to Do

- **Don't bake weapons into character sprites** — kills scalability for weapon variety
- **Don't use full body rotation** — the game uses 3/4 perspective with directional sprites
- **Don't make the weapon a separate ECS entity** — it's purely visual. The ECS already tracks weapon stats on the player entity. The weapon sprite is a rendering concern managed by PlayerRenderer, not a simulation entity.
- **Don't pre-render weapon rotations** — at 2x zoom, runtime rotation with nearest-neighbor is fine. Pre-rendering would balloon texture memory for minimal visual gain.

### Implementation Phases

**Phase 1: Basic weapon sprite**
- Add `WeaponSprite` as child of player container in `PlayerRenderer`
- Rotate to `Player.aimAngle` each frame
- Flip vertically when aiming left
- Depth swap based on aim quadrant

**Phase 2: Recoil & muzzle flash**
- Add kick offset on fire (detect via cylinder round decrease, already tracked in GameScene)
- Move muzzle flash emission from particle pool to weapon-tip position
- Optional: small hand circle sprites at grip point

**Phase 3: Weapon variety**
- Define `WeaponSpriteData` per weapon type in content definitions
- Swap weapon texture when weapon type changes
- Different weapons get different barrel lengths, kick distances, flash sizes
