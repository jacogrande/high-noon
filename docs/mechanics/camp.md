# Camp System

Between-stage rest stop where players heal, spend skill points, and interact with random visitors. Camp is the primary pacing tool — a brief, atmospheric moment of calm that makes the next combat stage hit harder.

## Design Principles

1. **Camp is a scene, not a level.** Single screen, no walking. 30-60 seconds total.
2. **Three layers: heal/skills (mandatory), visitor (optional), narrative (brief).**
3. **Every choice is transparent.** Full info before commitment, no mystery boxes.
4. **The campfire is the emotional anchor.** Warm light, acoustic guitar, crackling fire.
5. **Camp gets shorter as tension builds.** Camp 1 is leisurely. Camp 2 is brisk.
6. **Recovery is free.** The price of progress is the next stage's difficulty, not a camp tax.

---

## When Camp Occurs

Camp triggers during the stage transition clearing phase (currently `STAGE_CLEAR_DELAY = 3.0s` in `stageProgression.ts`). The flow is:

```
Stage N final wave cleared
  -> enemies/bullets despawn
  -> screen fades to camp scene
  -> player heals, spends points, interacts with visitor
  -> player clicks "Ride Out" (or all players ready in multiplayer)
  -> camp fades out, Stage N+1 begins
```

- **Camp 1**: After Stage 1 (3 waves). Full experience — visitor, narrative, bounty board.
- **Camp 2**: After Stage 2 (3 waves). Abbreviated — quick visitor, urgent foreshadowing.
- **No camp after Stage 3** — the run ends with a resolution screen.

The clearing delay in `stageProgressionSystem` will be replaced by the camp scene duration. The system waits for a `campComplete` signal instead of a fixed timer.

---

## Camp Actions

### 1. Heal (Automatic)

On camp entry, every player is healed to full HP. This is free and instant — no decision, no resource cost. Rationale: the difficulty curve is already handled by stage encounter definitions. Charging for healing between stages just punishes players who had a rough fight without adding meaningful choice.

Implementation: In `stageProgressionSystem`, when transition enters `'camp'` state, set `Health.current[playerEid] = Health.max[playerEid]` for all players.

### 2. Skill Tree (Always Available)

The existing skill tree UI (`SkillTreeOverlay`) opens at camp. Players spend pending points earned from XP/leveling during the previous stage.

- Skill tree is the primary interactive element. It appears front-and-center.
- A pulsing indicator shows when unspent points are available.
- Players who have no points can skip this instantly.

No changes needed to the skill tree system itself — just surface it in the camp scene.

### 3. Random Visitor (One Per Camp)

A randomly selected NPC appears at camp with a specific offer. The player can engage or ignore them. Visitor selection is weighted by run state (gold amount, HP before heal, build choices) and eventually by narrative thread.

#### Visitor Types

| Visitor | Role | Offer |
|---------|------|-------|
| **Trade Caravan** | Traveling peddler | Sells 3 items for gold. Items are consumables or temporary buffs for the next stage. |
| **Tinkerer** | Gunsmith | Offers one weapon modification: increased fire rate, larger cylinder, reduced reload, or bonus damage type. Costs gold. |
| **Shaman** | Mystic | Offers a powerful boon with an explicit downside. "Double damage, but half HP next stage." Full transparency. |
| **Bounty Hunter** | Rival | Proposes a challenge constraint for the next stage (e.g., "no reloading for 30 seconds at wave start") in exchange for bonus XP or gold. |
| **Mercenary** | Hired gun | Joins as a temporary AI companion for the next stage. Takes a percentage of gold earned. Has a personality quirk (aggressive, cautious, greedy). |
| **Gambler** | Card sharp | Offers a wager: pay gold, draw from a known pool of outcomes with visible odds. Never a blind gamble. |

**Selection rules:**
- Camp 1: Any visitor type with equal weight.
- Camp 2: Bias toward combat-relevant visitors (Tinkerer, Shaman, Mercenary).
- No visitor repeats within a single run.
- If the player has 0 gold, visitors with gold-only offers don't appear (or offer a free lesser version).

#### Offer Design Rules

- All consequences visible before accepting. No hidden costs.
- Maximum 3 items/options per visitor. Two is ideal.
- Offers are scoped to the next stage only (temporary buffs, not permanent). Permanent upgrades come from the skill tree.
- Declining a visitor has no penalty.

### 4. Bounty Board (Info Panel)

A static element at camp that shows intel about the next stage:

- **Stage name and theme** (e.g., "Badlands", "Devil's Canyon")
- **Enemy type icons** — previews which enemy types appear heavily
- **Wave count** — "3 WAVES"
- **Optional side objective hint** (when side objectives are implemented)

This gives the player actionable information that might influence their skill point allocation or visitor purchases. The bounty board is non-interactive — just a display panel.

### 5. Narrative Beat (Brief, Contextual)

A 1-2 line text overlay acknowledging the previous stage and foreshadowing the next:

- After Stage 1: *"One down. The trail gets rougher from here."*
- After Stage 2: *"Almost there. Whatever's waiting in that canyon, it ends tonight."*

Text auto-advances after 3 seconds or dismisses on click. Skippable. Eventually, narrative beats will be driven by the procedural narrative system (see `procedural-narrative.md`), reacting to plot threads, player character, and run events.

---

## Visual Design

### Layout (Single Screen, Top-Down View)

```
  [Night sky with stars, distant mesa silhouette]

  [Bounty Board]            [Visitor Station]

            [  Campfire  ]
            [ Player(s)  ]

  [Skill Tree icon]        ["Ride Out" button]

  [Narrative text bar at bottom]
```

The player character sits beside the campfire. In multiplayer, all players are seated around it. Interactive elements highlight on hover with a subtle glow.

### Campfire (Visual Anchor)

- 4-6 frame pixel animation for the fire sprite
- Warm radial point light using the existing `LightingSystem` — amber/orange, slight intensity oscillation (flicker)
- Fire sparks: small orange particles drifting upward, fading out (reuse `ParticlePool`)
- Smoke wisps: subtle gray particles drifting right

### Background

- Night sky — dark blue/black gradient with small star sprites (some twinkling)
- Distant mesa/mountain silhouettes in dark purple/brown
- Desert ground with sparse scrub, rocks, a bedroll, saddlebags
- A horse at the camp edge (idle animation: head bob, tail swish)

### Lighting

- The campfire is the only light source. Everything fades to darkness at the edges.
- Player and visitor sprites lit warmly from the fire side, dark on the far side.
- Contrast with combat stages (bright, harsh, high-energy) to create the safe-room effect.

### UI Elements

- **Skill tree access**: A glowing badge/icon near the player. Pulses when points are available.
- **Visitor interaction**: Click on the visitor NPC to open their offer panel.
- **Bounty board**: Always visible, non-interactive display panel.
- **"Ride Out" button**: Bottom-right. Prominent when the player has finished their business.
- **Narrative text**: Bottom bar, western-style serif font, fades in/out.

---

## Audio Design

### Camp Theme

- **Instruments**: Fingerpicked acoustic guitar, distant harmonica, subtle bass drone
- **Tempo**: 60-70 BPM (half of combat tempo)
- **Key**: Mixolydian mode for bittersweet western feel
- **Duration**: 60-90 second loop with natural variation

### Ambient Layer (Under Theme)

- Campfire crackle (constant, warm)
- Crickets (subtle, rhythmic)
- Distant coyote howl (occasional, every 20-30 seconds)
- Wind (very low, constant)

### Transitions

- **Combat -> Camp**: Combat music fades over 2 seconds. 1 second of silence (just fire crackle). Camp theme enters softly.
- **Camp -> Combat**: Camp theme fades on "Ride Out" click. A rising guitar strum or dramatic sting plays. Brief silence. Next stage combat music begins.

---

## Multiplayer Camp

All players see the same camp scene. Each player independently:
- Is healed to full (automatic)
- Manages their own skill tree
- Can interact with the shared visitor (offers are per-player — one player buying doesn't deplete stock for others)

### Ready System

- Each player has a "Ready" button (replaces "Ride Out" in multiplayer).
- A 45-second auto-advance timer starts when the **first** player readies up.
- Timer is visible to all players: *"Riding out in 32s..."*
- When all players ready (or timer expires), camp ends and the next stage begins.
- Players who haven't spent their skill points see a warning: *"You have unspent points!"*

---

## Implementation Plan

### Phase 1: Core Camp (Minimum Viable)

Scope: Heal + skill tree + "Ride Out" button. No visitors, no bounty board, no narrative.

1. **Add `'camp'` transition state** to `RunState.transition` (currently `'none' | 'clearing'`).
2. **CampScene** (new client scene or overlay) — campfire background image, skill tree button, ride out button.
3. **stageProgressionSystem** — instead of a fixed timer, transition to `'camp'` state and wait for `world.campComplete` flag.
4. **Heal on camp entry** — set all player HP to max when entering camp state.
5. **Signal camp complete** — "Ride Out" click sets `world.campComplete = true`, system advances to next stage.

### Phase 2: Visuals and Audio

1. **Campfire scene art** — pixel art background, campfire animation, player idle sprite.
2. **Lighting** — campfire point light using existing `LightingSystem`.
3. **Particles** — fire sparks and smoke using existing `ParticlePool`.
4. **Camp music theme** — composed and integrated with crossfade transitions.
5. **Ambient SFX** — fire crackle, crickets, wind, coyote.

### Phase 3: Random Visitors

1. **Visitor data definitions** in `packages/shared/src/sim/content/visitors.ts`.
2. **Visitor selection logic** — weighted random from pool, filtered by run state.
3. **Visitor UI panels** — item shop, upgrade panel, challenge accept/decline.
4. **Gold system integration** — spend gold at camp (gold system from `goldRush` already exists).

### Phase 4: Bounty Board and Narrative

1. **Bounty board display** — next stage preview panel.
2. **Narrative text system** — contextual dialogue lines driven by run state.
3. **Procedural narrative hooks** — connect to narrative thread system from `procedural-narrative.md`.

### Phase 5: Multiplayer Camp

1. **Server-side camp state** — broadcast camp entry, visitor offers, ready status.
2. **Ready-up system** — per-player ready flags, auto-advance timer.
3. **Synchronized camp exit** — all clients transition together.

---

## Existing Systems to Reuse

| System | Camp Usage |
|--------|-----------|
| `stageProgressionSystem` | Drives camp entry/exit timing |
| `SkillTreeOverlay` | Skill point spending UI |
| `LightingSystem` | Campfire point light |
| `ParticlePool` | Fire sparks, smoke |
| `SoundManager` | Camp theme, ambient SFX |
| `goldRushSystem` / `goldCollected` | Currency for visitor purchases |
| `HookRegistry` | Camp-related hooks (onCampEnter, onCampExit) |
| `HudData` / `HUDState` | Camp status for UI rendering |
