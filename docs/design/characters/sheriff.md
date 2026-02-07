# The Sheriff

The default character. A lone gunslinger with a six-shooter and a knack for calling out the biggest threat in the room.

## Identity

The Sheriff is the bread-and-butter character — easy to learn, hard to master. His kit revolves around the rhythm of a 6-round cylinder (fire, reload, fire) and a single-target execute ability that rewards target prioritization. He teaches players the core game loop before they branch into more exotic characters.

**Fantasy:** You're the last lawman standing, picking off outlaws one by one. You call out the biggest threat, put them down, and move to the next.

---

## Weapon: The Peacekeeper (6-Shot Revolver)

The current pistol is infinite-ammo auto-fire. The Peacekeeper introduces a cylinder/reload loop that gives the revolver mechanical identity and creates skill expression around reload timing.

### Base Stats

| Stat | Value | Notes |
|------|-------|-------|
| Cylinder size | 6 rounds | |
| Damage | 10 per bullet | |
| Bullet speed | 600 px/s | |
| Range | 400 px | |
| Reload time | 1.2s | Full cylinder reload |
| Min shot interval | 0.08s (75ms) | Soft floor — prevents macro abuse |

### Fire Model: Click-to-Fire, Uncapped

The revolver uses **click-to-fire with no fire rate cap**. Each click = one shot = one round from the cylinder. Players fire as fast as they can click, and the cylinder is the natural rate limiter (6 shots then a 1.2s reload).

- **Click**: Fires immediately. No cooldown between clicks (beyond the 75ms soft floor that prevents macro abuse — players will never notice it).
- **Hold**: Auto-fires at 5 shots/sec for comfort. Players who don't want to click can hold.
- **Result**: Skilled players burst faster by clicking. Casual players hold the button. The cylinder (6 rounds) caps burst damage either way — you're reloading after 6 no matter how fast you fire.

This means **there is no "fire rate" stat** to upgrade. The meaningful DPS levers are damage, cylinder size (future sprint), and reload speed. The skill tree rewards aggressive accuracy and momentum instead of flat rate increases.

### Reload Mechanics

- **Manual reload**: Press R (or keybind) to reload at any time
- **Auto-reload**: Starts automatically when the cylinder is empty
- **Reload cancel**: Rolling interrupts the reload (rounds stay at whatever count they were)
- **Full cylinder reload**: Always reloads to full 6 — no partial/per-round reloading

### Last Round Bonus

The 6th (final) bullet in the cylinder deals **1.5x damage** (15 instead of 10). This creates a micro-decision every cycle: reload early for safety, or fire all 6 to land the bonus hit. Skilled players learn to save the last round for the right moment.

### Cylinder HUD

The cylinder state needs to be clearly visible — either a small revolver cylinder UI element near the crosshair or at the bottom of the screen showing filled/empty chambers. The current round should pulse or glow slightly.

---

## Special Ability: Showdown

The Sheriff calls out a single enemy for a duel. For a brief window, the marked target takes massively increased damage and your bullets pierce through anything between you and them. Kill the target to get rewarded with a cooldown refund.

### How It Works

1. **Activate** (ability key) while aiming near an enemy — the closest enemy to your crosshair within 500px gets marked
2. **Mark indicator**: A "WANTED" star/poster icon appears above the target. A visible line connects you to the mark (like a taut thread — breaks line-of-sight awareness)
3. **Duration**: 4 seconds
4. **During Showdown**:
   - Marked enemy takes **+100% damage** from your shots (20 per bullet, 30 for last round)
   - Your bullets **pierce through** all enemies on the line between you and the marked target
   - Your movement speed increases by **+10%** (closing in for the kill)
5. **On kill**: If you kill the marked target before Showdown expires, cooldown is reduced by 4 seconds
6. **Cooldown**: 12 seconds (8 effective if you land the kill)

### Why Showdown Works

- **Target prioritization**: In a swarm of fodder, choosing the right target to mark (the charger about to charge, the shooter lining up a shot) is the skill expression
- **Positioning**: Pierce rewards lining up shots through crowds to hit the mark — encourages movement and angles, not standing still
- **Risk/reward**: You want to use it on threats, but burning it on a tough fodder clump is sometimes correct
- **Tree synergy**: Almost every Marksman node enhances Showdown in a different way
- **Boss-killer**: The +100% damage window is your primary tool for burning down high-HP targets

---

## Skill Tree

The skill tree replaces the per-run random upgrade cards. Each level-up grants 1 skill point to spend on a node. The tree has 3 branches of 5 tiers each (15 nodes total). Nodes must be taken in order within a branch (tier 1 before tier 2, etc.), but you can invest across branches freely.

With ~10 level-ups per run and 15 total nodes, you'll typically max one branch and go partway into a second — or spread across all three. You can never take everything, which keeps runs feeling different.

### Meta-Gating

Most nodes are available from the start. Tier 4 and 5 nodes in each branch require meta-currency to **unlock permanently**. Once unlocked, they're available every run. This means:

- **Early runs** (nothing unlocked): 9 nodes available (tiers 1-3 of each branch). Plenty for a full run.
- **Mid progression**: 12 nodes available. Deeper builds start opening up.
- **Full unlock**: All 15 nodes. Maximum build diversity.

Meta-currency is earned from completing encounters, with bonus amounts from harder achievements (clearing without taking damage, speed clears, etc.). Exact economy TBD.

### Branch: Marksman

*Precision. Single-target. Showdown enhancement.*

The Marksman path turns the Sheriff into a deliberate, high-damage shooter who makes every bullet count. Showdown becomes devastating.

| Tier | Node | Effect |
|------|------|--------|
| 1 | **Steady Hand** | First shot after a reload deals +50% damage |
| 2 | **Piercing Rounds** | Bullets pass through 1 enemy (always, not just during Showdown) |
| 3 | **Called Shot** | Showdown duration +2s (6s total). Marked target takes +150% damage instead of +100% |
| 4 | **Dead to Rights** | Last round bonus applies at 2.5x against Showdown targets (25 damage on final round during Showdown) |
| 5 | **Judge, Jury, Executioner** | Killing a Showdown target instantly reloads your cylinder and grants max Dead Aim stacks (if Gunslinger T1 taken) or +50% damage for 3s (if not). Showdown cooldown refund increased to 6s. |

**Tier 4-5 require meta-currency to unlock.**

**Marksman fantasy**: Reload, land a +50% Steady Hand opener on the Showdown target, pierce through the fodder swarm, finish with a 2.5x last round, instant reload + chain into the next target. Every bullet is a statement.

### Branch: Gunslinger

*Momentum. Aggression. Rewarding accuracy under pressure.*

The Gunslinger path rewards staying in the fight — landing consecutive hits stacks damage, kills shave reload time, and Fan the Hammer lets you dump rounds when it counts. The fantasy isn't "fire faster" (you already fire as fast as you click), it's "get in the zone and stay there."

| Tier | Node | Effect |
|------|------|--------|
| 1 | **Dead Aim** | Consecutive hits within 0.5s stack a +10% damage bonus (max 5 stacks, +50%). Missing or reloading resets the chain. |
| 2 | **Hot Rounds** | Bullets apply a burn: 4 damage over 2s (stacks refresh duration, not damage) |
| 3 | **Fan the Hammer** | After firing 3+ rounds, hold fire to dump remaining rounds in a rapid burst (50ms interval, +15 degree spread cone). Empties the cylinder. |
| 4 | **Hair Trigger** | 15% critical hit chance. Crits deal 2x damage. Dead Aim stacks increase crit chance by +3% each (up to +15% at max stacks for 30% total). |
| 5 | **Speed Loader** | Each kill during a cylinder reduces next reload time by 0.2s (min 0.2s). Kill 5 in one cylinder? Reload is nearly instant. |

**Tier 4-5 require meta-currency to unlock.**

**Gunslinger fantasy**: Click fast, land shots, build Dead Aim stacks. At 5 stacks you're dealing +50% damage with 30% crit chance. Hot Rounds means everything is burning. Fan the Hammer dumps your remaining rounds when you need burst. Speed Loader means if you're killing efficiently, you barely have downtime — the momentum never stops.

### Branch: Lawman

*Survival. Utility. Sustain.*

The Lawman path keeps the Sheriff alive. More HP, better rolls, crowd control, and a second chance. This is the "I want to see deeper waves" path.

| Tier | Node | Effect |
|------|------|--------|
| 1 | **Tin Star** | +2 max HP (7 total). Heal 1 HP on pickup. |
| 2 | **Quick Reload** | Reload time -40% (0.72s). Rolling during a reload completes it instantly. |
| 3 | **Iron Will** | i-frame duration +0.3s (0.8s total). Roll speed +25%. |
| 4 | **Intimidation Aura** | Enemies within 120px of the Sheriff move 25% slower |
| 5 | **Second Wind** | Survive a killing blow once per encounter. Drop to 1 HP, gain full i-frames, and instantly reload. 60s internal cooldown. |

**Tier 4-5 require meta-currency to unlock.**

**Lawman fantasy**: You're tanky and slippery. Quick Reload + roll-cancel means you basically never have downtime. Iron Will makes your roll a real defensive tool. Intimidation creates breathing room. Second Wind means you always get one more chance. You might not kill as fast, but you don't die.

### Sample Builds

**"The Executioner"** (Marksman 5 / Gunslinger 1 / Lawman 1):
Max Marksman, dip Gunslinger for Dead Aim stacks and Lawman for Tin Star. Every Showdown is a death sentence. Reload → Steady Hand opener → build Dead Aim stacks → Dead to Rights finisher → Judge chain into the next target at max stacks.

**"Chain Lightning"** (Gunslinger 5 / Marksman 2):
Max Gunslinger, take Steady Hand and Piercing Rounds from Marksman. Build Dead Aim stacks through the crowd, Fan the Hammer at max stacks for a burning piercing crit burst. Speed Loader means kills keep the momentum going — reload barely exists.

**"Unkillable"** (Lawman 5 / Marksman 3):
Max Lawman, take Marksman up to Called Shot for a stronger Showdown. You're slow to kill but nearly impossible to put down. Second Wind buys time for one more Showdown cycle.

**"Balanced Sheriff"** (Marksman 3 / Gunslinger 3 / Lawman 3):
Take all tier 1-3 nodes. No capstone power spikes, but no weaknesses either. Dead Aim + Piercing Rounds + Iron Will = a well-rounded gunfighter.

---

## Aspects (Meta-Progression Weapon Variants)

Aspects are permanent weapon modifications unlocked with meta-currency. Each aspect fundamentally changes how the Peacekeeper plays, altering the weapon's core stats and transforming Showdown into a different ability. You select an aspect before starting a run — it can't be changed mid-run.

Each aspect has 5 investment levels. Level 1 unlocks the aspect. Levels 2-5 scale its unique bonus. All aspects share the same skill tree — the tree nodes interact with the modified weapon/ability naturally (e.g., "last round bonus" still works with a 4-round cylinder).

### Aspect of the Peacekeeper (Default)

*The standard-issue revolver. Reliable, versatile, no frills.*

- **Cylinder**: 6 rounds
- **Ability**: Showdown (as described above)
- **Aspect bonus (per level)**: +5% base damage per level (up to +25% at max)

This is the baseline. New players start here. The scaling bonus rewards investment without changing the playstyle.

### Aspect of the Desperado

*Two guns. Twice the lead. Half the accuracy.*

- **Cylinder**: 2x5 rounds (10 total, alternating barrels)
- **Damage**: -25% per bullet (7.5 per bullet)
- **Spread**: +10 degrees (less accurate)
- **Min shot interval**: 0.06s (slightly faster soft floor — dual-wielding feels snappier)
- **Reload**: Slightly longer (1.4s — two guns)
- **Ability**: **Outlaw's Barrage** — Mark all enemies in a wide cone (90 degrees) in front of you. Marked enemies take +50% damage for 4s. Less bonus per target than Showdown, but hits everything.
- **Aspect bonus (per level)**: +1 cylinder round per level (up to 2x10 at max)

**Fantasy**: Spray and pray with two guns blazing. You're less precise but you're putting out absurd volume. 10 rounds before reloading means Dead Aim stacks are easier to build and maintain. Outlaw's Barrage turns a room into a shooting gallery. Fan the Hammer with 7 remaining rounds is wild. Speed Loader is critical with the longer reload.

### Aspect of the Longarm

*Slow, deliberate, devastating. Every shot is a statement.*

- **Cylinder**: 4 rounds
- **Damage**: +60% per bullet (16 per bullet)
- **Range**: +50% (600px)
- **Min shot interval**: 0.15s (heavier gun, more deliberate — players still control the pace but it feels weighty)
- **Reload**: Faster (0.9s — fewer rounds to load)
- **Ability**: **Deadeye** — Time slows to 30% for 3 seconds. Marked target takes 3x damage. You can still move and aim at full speed during the slow. Cooldown: 15s (no kill refund — it's too powerful to chain).
- **Aspect bonus (per level)**: +10% Deadeye damage bonus per level (up to 3.5x at max)

**Fantasy**: The patient sniper. Each shot is a cannonball. The longer min interval means you're naturally more deliberate, but you control the rhythm. Deadeye is your "delete this" button — time slows, you line up the perfect shot, and the target evaporates. Last round bonus on a 4-round cylinder comes up more often (every 4th shot). Dead Aim stacks are harder to build (only 4 shots per cylinder) but each stacked shot hits like a truck. Marksman tree turns this into a surgical instrument.

### Aspect of the Ricochet

*Trick shooter. Geometry is your friend.*

- **Cylinder**: 6 rounds (standard)
- **Damage**: -10% per bullet (9 per bullet)
- **Special**: Bullets bounce off walls once, dealing 70% damage on the ricochet
- **Ability**: **Trick Shot** — Mark a target. For 5 seconds, ricocheted bullets that hit the marked target deal **full damage** instead of 70%, and bounced bullets home slightly toward the mark (gentle curve, not full tracking). Cooldown: 10s.
- **Aspect bonus (per level)**: +1 max bounces per 2 levels (up to 3 bounces at max)

**Fantasy**: The show-off. You're banking shots around corners, bouncing bullets off walls into crowds. Trick Shot rewards creative positioning — stand at an angle to a wall and your ricochets home in on the mark. The arena layout matters more to you than any other aspect. Piercing Rounds + ricochets = bullets that pass through an enemy, bounce off a wall, and hit the marked target. Satisfying and skill-expressive.

---

## Interactions: Tree + Aspects

The skill tree is designed to work with all aspects, but certain combinations are stronger:

| Node | Peacekeeper | Desperado | Longarm | Ricochet |
|------|-------------|-----------|---------|----------|
| Steady Hand | Good — 1 strong opener | Good — first shot of 10 | Great — huge single hit | Good — bank the opener |
| Dead Aim | Core DPS — 6 shots to build stacks | Even better — 10 shots to build and sustain | Harder — only 4 shots per cylinder, stacks drop on reload | Good — ricochets can extend chains |
| Piercing Rounds | Strong — line up shots | Very strong — spraying through crowds | Strong — fewer shots but each pierces | Great — pierce + bounce |
| Fan the Hammer | 3 round dump | 7 round dump (!!) | Only 1 round dump (weak) | 3 round dump with bounces |
| Speed Loader | Good — consistent value | Critical — 1.4s base reload hurts | Less needed — 0.9s base, fewer kills per cylinder | Good — standard value |
| Quick Reload | Important at 1.2s base | Critical at 1.4s base | Less needed at 0.9s | Standard value |
| Second Wind | Always good | Always good | Always good | Always good |

The tree doesn't need aspect-specific nodes — the interactions emerge naturally from the stat changes.

---

## Base Stats Summary (for implementation reference)

### Player (unchanged)

| Stat | Value |
|------|-------|
| Move speed | 250 px/s |
| HP | 5 |
| Radius | 16 px |
| i-frame duration | 0.5s |
| Roll duration | 0.3s |
| Roll i-frame ratio | 0.5 |
| Roll speed multiplier | 2.0x |

### Peacekeeper (replacing infinite-ammo pistol)

| Stat | Value |
|------|-------|
| Cylinder size | 6 |
| Bullet damage | 10 |
| Bullet speed | 600 px/s |
| Range | 400 px |
| Reload time | 1.2s |
| Min shot interval | 0.08s (75ms) |
| Hold-to-fire rate | 5 shots/sec |
| Last round bonus | 1.5x damage |

### Showdown

| Stat | Value |
|------|-------|
| Mark range | 500 px (from crosshair) |
| Duration | 4s |
| Damage bonus | +100% |
| Pierce | All enemies in line to target |
| Move speed bonus | +10% |
| Cooldown | 12s |
| Kill refund | -4s cooldown |

---

## Migration from Upgrade Cards

The sprint-3 upgrade card system (15 random cards, rarity-weighted) gets replaced by the skill tree. Here's how the old upgrades map:

| Old Upgrade | Disposition | New Home |
|-------------|------------|----------|
| Quick Draw (+20% fire rate) | Reworked | Gunslinger T1: Dead Aim (consecutive hit stacking — replaces flat fire rate with skill-expressive mechanic) |
| Heavy Rounds (+30% damage) | Folded | Marksman T1: Steady Hand (conditional +50% on first shot after reload) |
| Long Barrel (+25% range) | Cut | Range is less interesting as a tree node. Longarm aspect covers the sniper fantasy. |
| Fast Feet (+15% speed) | Cut | Movement speed mods are generic. The tree focuses on character-defining mechanics. |
| Thick Skin (+1 HP) | Folded | Lawman T1: Tin Star (+2 HP) |
| Quick Reload (+15% fire rate) | Reworked | Lawman T2: Quick Reload (-40% reload time + roll-cancel instant reload) |
| Hollow Point (+20% damage) | Cut | Replaced by more interesting conditional damage (Steady Hand, Called Shot, Dead Aim) |
| Fleet-Footed (+10% speed, +15% roll) | Partial | Lawman T3: Iron Will (+roll speed, +i-frames) |
| Iron Will (+0.2s i-frames) | Folded | Lawman T3: Iron Will (+0.3s) |
| Steady Aim (+20% bullet speed) | Cut | Bullet speed is a hidden stat — not interesting to pick. |
| Bullet Storm (+40% fire rate, -15% damage) | Reworked | Gunslinger T5: Speed Loader (kill-based reload reduction — momentum reward instead of flat rate) |
| Juggernaut (+2 HP, -10% speed) | Partial | Lawman T1: Tin Star (HP without the downside — trade-offs are in opportunity cost now) |
| Gunslinger (+25% fire rate, +25% bullet speed) | Reworked | Gunslinger T4: Hair Trigger (crit chance + Dead Aim synergy — replaces flat stats with scaling mechanic) |
| Ghost Roll (+50% roll speed, +30% i-frame ratio) | Folded | Lawman T3: Iron Will |
| Vampiric Rounds (heal per 15 kills) | Cut | Sustain is handled by Tin Star's heal-on-pickup and Second Wind. Kill-counting is fiddly. |

**Net result**: Fire rate upgrades are gone — the click-to-fire model makes them irrelevant. In their place, the Gunslinger branch rewards accuracy and momentum (Dead Aim stacking, Speed Loader kill chains). The tree is smaller but every node changes how you play, not just how big your numbers are.

---

## Implementation Notes

### New ECS Components Needed (shared)

- `Cylinder` — `size`, `current`, `reloadTime`, `reloadTimer`, `isReloading`
- `Showdown` — `targetEid`, `timer`, `cooldownTimer`, `damageBonus`, `active`
- `SkillTree` — could live on `GameWorld` (like `UpgradeState` does now) rather than as an ECS component

### New Systems Needed (shared)

- `reloadSystem` — manages cylinder state, auto-reload, reload timer
- `showdownSystem` — manages mark, duration, cooldown, kill detection
- `skillTreeSystem` — or just pure functions like the current upgrade system

### What Changes

- `Weapon` component gains cylinder fields (or new `Cylinder` component)
- `bulletSpawnSystem` checks cylinder > 0 before firing, decrements on fire
- `playerInput` system triggers reload on key press
- Upgrade card UI replaced with skill tree UI
- `UpgradeState` refactored into character-specific `SkillTreeState`

### What Stays the Same

- All existing combat (movement, rolling, collision, enemy AI)
- XP and level-up detection (`awardXP`, `getLevelForXP`)
- Wave spawner and encounter system
- All client rendering, particles, audio
