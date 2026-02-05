# Roguelike Upgrade Systems Research

This document examines upgrade and synergy systems across contemporary roguelikes, analyzing what works, what fails, and extracting design principles for High Noon.

## Table of Contents

1. [Core Design Philosophy](#core-design-philosophy)
2. [Case Studies](#case-studies)
3. [Synergy Design Patterns](#synergy-design-patterns)
4. [What Feels Fun](#what-feels-fun)
5. [Common Pitfalls](#common-pitfalls)
6. [Creative Systems](#creative-systems)
7. [Design Recommendations for High Noon](#design-recommendations-for-high-noon)

---

## Core Design Philosophy

### The Agency-Randomness Tension

The fundamental challenge in roguelike upgrade design is balancing two opposing forces:

**Player Agency**: Players crave the ability to sculpt their character and forge their destiny. They want meaningful choices that let them express skill and strategy.

**Unpredictability**: Pure player control creates monotony—every run becomes a checklist. The excitement of discovery requires uncertainty.

The sweet spot: **Randomness determines your options; skill determines how you use them.**

### Pre-Action vs. Post-Action Luck

This distinction is critical for perceived fairness:

| Luck Type       | Description                                                 | Player Feeling                        |
| --------------- | ----------------------------------------------------------- | ------------------------------------- |
| **Pre-action**  | Randomness before decisions (seeing items before choosing)  | Fair—"I played the hand I was dealt"  |
| **Post-action** | Randomness after decisions (mystery boxes, hidden outcomes) | Frustrating—"My choice didn't matter" |

**Design principle**: Maximize pre-action luck. Let players see what they're choosing between. Avoid mystery mechanics where outcomes can't be evaluated beforehand.

### The Mastery Loop

The core draw of roguelikes: **the feeling that YOU are improving, not just your character.**

This is why heavy meta-progression (permanent upgrades between runs) can undermine the genre. When success depends on grinding unlocks rather than skill, the mastery loop breaks.

---

## Case Studies

### Hades (Supergiant Games)

**System**: Boons from Olympian gods modify abilities

**Key Design Elements**:

- Each god has a distinct identity (Zeus = lightning/chain, Poseidon = knockback, Ares = DoT)
- Boons modify existing abilities rather than adding new buttons
- Duo Boons reward combining specific god pairs
- The same base attack feels completely different with different boons

**Synergy Philosophy**:

> "The player should always be struggling to achieve victory, but occasionally stumble upon such overwhelmingly powerful abilities that they feel nearly invincible."

Hades intentionally allows "broken" builds because:

1. They're exciting to discover
2. They're rare enough to feel special
3. Even without them, skilled play can win

**What Works**:

- Clear god identities make build planning intuitive
- Boons enhance—not replace—core mechanics
- Duo Boons create "aha!" moments of discovery
- Rerolls (Fated Authority) add agency without removing randomness

---

### Vampire Survivors (poncle)

**System**: Weapons auto-attack; passive items modify stats; evolutions combine weapons + passives

**Key Design Elements**:

- **Evolution system**: Weapon + specific passive = evolved weapon
  - Magic Wand + Empty Tome = Holy Wand
  - Requires max level weapon + passive in inventory + boss chest after 10 minutes
- **Union system**: Two weapons merge into one (frees a slot)
- **Gift system**: Meeting conditions grants bonus items without removing originals

**Synergy Philosophy**:
The game front-loads complexity into the evolution chart. Players learn combinations, then the fun becomes executing the "build path" while surviving chaos.

**What Works**:

- Evolution creates clear goals within runs
- Passive items have obvious value even before evolution
- The chart is discoverable through play
- "Slot efficiency" adds strategic depth (unions free weapon slots)

**Limitations**:

- Once you know the chart, runs feel similar
- Limited emergent discovery—synergies are designed, not emergent

---

### Risk of Rain 2 (Hopoo Games)

**System**: Items stack infinitely with various scaling formulas

**Key Design Elements**:

- **Linear stacking**: Each stack adds flat value (simple, predictable)
- **Hyperbolic stacking**: Diminishing returns (prevents 100% chance caps)
- **Proc chains**: On-hit items can trigger other on-hit items
- **Proc coefficients**: Different attacks have different trigger chances

**Synergy Philosophy**:
Let math create emergent power. When systems interact multiplicatively, players discover combinations designers never explicitly created.

**What Works**:

- Infinite stacking creates "how far can I push this?" gameplay
- Proc chains reward system mastery
- Items feel incrementally powerful (each stack matters)
- Late-game power fantasy is enormous

**Limitations**:

- Can become incomprehensible (too many particles, unclear what's happening)
- Some items are mathematically dominant
- Difficulty scaling must be aggressive to match player scaling

---

### Slay the Spire (Mega Crit)

**System**: Deck-building with cards and relics

**Key Design Elements**:

- **Deck dilution**: Adding bad cards weakens your deck
- **Relics**: Permanent passive effects that shape strategy
- **Card removal**: Actively trimming your deck is often correct
- **Energy system**: Limits cards per turn, creating tough choices

**Synergy Philosophy**:

> "The developers had no issue when players discovered card synergies that created powerful combinations... it was a single-player game and there would be no opponent that would feel overwhelmed."

The lesson: **In single-player, broken combos are features, not bugs.**

**What Works**:

- Deck size creates natural tension (more isn't always better)
- Relics create "build-around" moments
- Card rewards force immediate decisions (take it or leave it)
- Synergies emerge from card interactions, not explicit rules

---

### Enter the Gungeon (Dodge Roll)

**System**: Guns + items with explicit synergy combinations

**Key Design Elements**:

- **300+ items and guns**: Ensures variety across runs
- **Synergy system**: Specific item pairs trigger special effects (blue arrow indicator)
- **~350 synergies**: Explicitly designed combinations
- **Synergies modify guns**: Stats only apply to synergized weapons

**Synergy Philosophy**:
Quantity creates discovery. With hundreds of items and synergies, players constantly encounter new combinations even after many hours.

**What Works**:

- Visual indicator (blue arrow) signals when synergy is active
- Synergies can salvage "bad" items
- Discovering synergies feels rewarding
- Guns have distinct identities

**Limitations**:

- Requires massive content investment
- Synergies are hand-designed, not emergent
- Some synergies are clearly superior

---

### The Binding of Isaac (Edmund McMillen)

**System**: Items modify "tears" (projectiles) with stacking visual/mechanical effects

**Key Design Elements**:

- **Tear modifiers stack visually**: You can see your build on your projectiles
- **Transformations**: Collecting themed items grants bonus forms
- **Item pools**: Different sources (shops, bosses, etc.) have different item pools
- **Curse rooms / devil deals**: Risk-reward item acquisition

**Synergy Philosophy**:
Let everything combine. Isaac's genius is that most items work together, creating emergent combinations from simple rules.

**What Works**:

- Visual feedback (seeing your tears transform)
- Simple item effects that combine in complex ways
- Risk-reward acquisition (devil deals cost health)
- Transformations reward thematic collecting

---

### Balatro (LocalThunk)

**System**: Joker cards modify poker hand scoring

**Key Design Elements**:

- **150 Jokers**: Each with unique scoring modifications
- **15 Decks**: Starting conditions that shape strategy
- **Hand types matter**: Jokers often boost specific hands (flushes, pairs, etc.)
- **Multiplicative scoring**: Chips × Mult creates exponential scaling

**Synergy Philosophy**:
The magic happens when Jokers interact with hand types AND each other. A Joker that gives +Mult for flushes combines with a Joker that gives +Chips for each suit, creating emergent strategy around flush hands.

**What Works**:

- Clear scoring breakdown shows exactly what's happening
- Jokers have distinct identities
- Limited Joker slots force difficult cuts
- Deck manipulation (adding/removing cards) adds depth

---

## Synergy Design Patterns

### Pattern 1: Modifier Stacking

Items modify a base action, and modifications stack.

**Example**: Hades boons on dash

- Base dash: short invincible movement
- Zeus boon: dash deals lightning damage
- Poseidon boon: dash knocks enemies back
- Stacked: dash that damages AND knocks back

**Design notes**:

- Requires a strong base action to modify
- Each modifier should be valuable alone
- Combinations should feel multiplicative, not additive

### Pattern 2: Trigger Chains

One effect triggers another, creating cascades.

**Example**: Risk of Rain 2 proc chains

- Attack hits enemy
- On-hit item A procs, dealing damage
- That damage triggers on-hit item B
- Chain continues

**Design notes**:

- Needs proc coefficient system to prevent infinite loops
- Creates exciting "explosion" moments
- Can become visually chaotic

### Pattern 3: Build-Around Anchors

Certain items demand you build around them.

**Example**: Slay the Spire's Snecko Eye

- Randomizes card costs (0-3)
- Suddenly, high-cost cards become valuable
- Entire deck strategy shifts

**Design notes**:

- Anchor items should be rare
- They should invalidate "normal" strategy
- Creates memorable runs

### Pattern 4: Evolution/Fusion

Combining specific items creates new, powerful items.

**Example**: Vampire Survivors evolution

- Weapon A (max level) + Passive B = Evolved Weapon C
- Replaces original weapon with superior version

**Design notes**:

- Creates clear goals within runs
- Requires players to learn combinations
- Can feel formulaic once mastered

### Pattern 5: Threshold Bonuses

Collecting enough of a category grants bonuses.

**Example**: Binding of Isaac transformations

- Collect 3 fly items = Beelzebub transformation
- Grants flight + bonus effects

**Design notes**:

- Rewards thematic collecting
- Creates sub-goals during runs
- Items have value beyond their direct effect

### Pattern 6: Slot Efficiency

Limited slots create meaningful trade-offs.

**Example**: Balatro Joker slots

- Maximum 5 Jokers
- Finding a 6th means cutting something
- "Is this new Joker better than my worst current one?"

**Design notes**:

- Prevents "take everything" gameplay
- Forces difficult decisions
- Makes every slot feel precious

---

## What Feels Fun

### The "Aha!" Moment

The single most rewarding experience in roguelike upgrades: **discovering a synergy yourself**.

This requires:

- Synergies that aren't immediately obvious
- Systems that reward experimentation
- Enough complexity for emergent combinations

### Power Fantasy Peaks

Occasional runs where everything comes together and you feel unstoppable.

**Hades' philosophy**: "Occasionally stumble upon such overwhelmingly powerful abilities that they feel nearly invincible."

This works because:

- It's rare (most runs require struggle)
- It validates player knowledge/skill
- It creates memorable stories

### Meaningful Choices Under Pressure

The tension of choosing between two good options, knowing you can't have both.

**Slay the Spire excels here**: Every card reward is a decision. Adding a card might dilute your deck.

### Visible Progress

Seeing your build come together over a run.

**Binding of Isaac's visual tear changes**: Your projectiles literally show your build.

### Risk-Reward Acquisition

Dangerous paths that offer better rewards.

**Examples**:

- Isaac's devil deals (powerful items cost health)
- Hades' Chaos boons (temporary debuff, permanent power)
- Optional hard encounters for better loot

---

## Common Pitfalls

### Pitfall 1: The Optimal Path

When one build/strategy is clearly superior, all runs feel the same.

**Symptoms**:

- Players always take the same items
- "Tier lists" dominate discussion
- Runs feel like checklists

**Solutions**:

- Balance outliers (nerf dominant options)
- Create situational value (some items counter specific enemies)
- Randomize availability (can't always get your preferred items)

### Pitfall 2: Decision Paralysis

Too many stats, synergies, and interactions overwhelm players.

**Symptoms**:

- Players don't understand what items do
- Choices feel arbitrary
- New players bounce off

**Solutions**:

- Simpler individual items with emergent complexity
- Clear visual/audio feedback for effects
- Gradual complexity introduction

### Pitfall 3: Trap Options

Items that are strictly bad with no situational value.

**Symptoms**:

- "Never take X" becomes common knowledge
- Item pools feel diluted
- Finding bad items feels punishing

**Solutions**:

- Every item should have SOME use case
- If an item is bad, make it obviously bad (player can skip it)
- Consider removing truly useless items

### Pitfall 4: Frontloaded Meta-Progression

Permanent upgrades that make early runs feel incomplete.

**Symptoms**:

- New players hit walls they can't skill past
- "Grind X hours before the game is fun"
- Success feels like progression, not skill

**Solutions**:

- Meta-progression unlocks variety, not power
- Early runs should be winnable
- Permanent upgrades have diminishing returns

### Pitfall 5: Post-Action Randomness

Outcomes that can't be evaluated before choosing.

**Symptoms**:

- "I died because RNG screwed me"
- Players feel helpless
- Choices feel meaningless

**Solutions**:

- Show information before decisions
- Avoid mystery boxes/chests
- Let players see item pools

### Pitfall 6: Snowball Imbalance

Early advantages compound uncontrollably.

**Symptoms**:

- Strong starts guarantee wins
- Weak starts guarantee losses
- Middle of runs feels predetermined

**Solutions**:

- Catchup mechanics (better rewards when struggling)
- Scaling challenges (difficulty matches power)
- Multiple paths to power (different builds viable)

### Pitfall 7: The Solved Game

When optimal play is fully mapped, discovery dies.

**Symptoms**:

- Wikis contain "correct" builds
- Experimentation feels wasteful
- Community stops discussing strategy

**Solutions**:

- Regular content updates
- Randomization that prevents optimal paths
- Deep enough systems for continued discovery

---

## Creative Systems

### Procedural Archetypes (Crimson Descent approach)

Instead of pure random or fixed loot, generate item pools tailored to emerging playstyles:

- Tag items with attributes (Fire, Speed, Defense, etc.)
- Track player's build direction
- Bias drops toward relevant items while including wildcards

**Why it works**: Supports build identity while maintaining surprise.

### Curse Systems (Various games)

Negative effects that grant compensating benefits:

- Hades: Chaos boons (temporary debuff → permanent power)
- Slay the Spire: Curses from events (bad cards for rewards)
- Risk of Rain 2: Lunar items (powerful but double-edged)

**Why it works**: Creates risk-reward decisions; makes players weigh costs.

### Shop Manipulation (Slay the Spire)

Relics that modify shop behavior:

- Membership Card: 50% shop discount
- Courier: Shop always has specific items

**Why it works**: Players can spec into "economy builds."

### Aspect Systems (Hades)

Weapon variants that fundamentally change playstyle:

- Same base weapon, different special moves
- Aspects unlock over time
- Each aspect suggests different boon synergies

**Why it works**: Multiplies variety without multiplying content proportionally.

### Pact of Punishment (Hades)

Player-selected difficulty modifiers for bonus rewards:

- Choose your challenge (enemy speed, damage, etc.)
- Higher heat = more unlocks
- Mix-and-match modifiers

**Why it works**: Difficulty scales to player skill; replayability extends indefinitely.

---

## Design Recommendations for High Noon

Based on this research, here are recommendations for High Noon's upgrade system:

### Core Philosophy

1. **Upgrades should modify existing mechanics, not add new buttons**
   - Modify shooting (bullet patterns, effects)
   - Modify rolling (damage, distance, effects)
   - Modify movement (speed, trails, auras)

2. **Allow broken combinations—they're features**
   - Single-player means no "unfair" opponents
   - Broken runs create memorable stories
   - Keep them rare enough to feel special

3. **Pre-action luck over post-action luck**
   - Show upgrade choices before selecting
   - Let players see what's in chests/rooms
   - Avoid mystery mechanics

### Synergy Structure

1. **Use modifier stacking on core abilities**
   - Each character has base abilities (shoot, roll, special)
   - Upgrades add effects to these abilities
   - Effects should stack visually and mechanically

2. **Create build-around anchors**
   - Rare upgrades that demand strategy shifts
   - "If I get X, I should prioritize Y and Z"
   - Makes each run feel distinct

3. **Design for emergence**
   - Simple upgrade effects that combine in complex ways
   - Not every synergy needs to be hand-designed
   - Let math create unexpected power

### Practical Implementation

1. **Tag system for upgrades**
   - Categories: Offensive, Defensive, Mobility, Utility
   - Sub-tags: Fire, Ice, Speed, Area, etc.
   - Enables procedural synergy discovery

2. **Limited upgrade slots**
   - Forces meaningful choices
   - Cutting upgrades is part of the game
   - Slot efficiency becomes a factor

3. **Clear visual feedback**
   - Players should see their build on their character
   - Bullet effects, auras, trails
   - Satisfying confirmation of power

4. **Rarity tiers with purpose**
   - Common: Incremental improvements
   - Rare: Build-defining options
   - Legendary: Run-warping effects

### Character Differentiation

1. **Each character should want different upgrades**
   - Base abilities determine synergy value
   - A speed character values speed upgrades more
   - Creates natural build diversity

2. **Special abilities as synergy anchors**
   - Character specials should synergize with upgrade pools
   - "This character's special works great with fire upgrades"

### What to Avoid

1. **Don't gate fun behind meta-progression**
   - Unlocks should add variety, not power
   - First runs should be winnable

2. **Don't create trap upgrades**
   - Every upgrade should have some value
   - If situational, make the situation clear

3. **Don't over-complicate early**
   - Simple upgrades at start of run
   - Complexity emerges through combinations
   - New players shouldn't be overwhelmed

---

## References

### Synergy Systems

- [Hades Wiki: Boons](https://hades.fandom.com/wiki/Boons)
- [Vampire Survivors Wiki: Evolution](https://vampire-survivors.fandom.com/wiki/Evolution)
- [Enter the Gungeon Wiki: Synergies](https://enterthegungeon.fandom.com/wiki/Synergies)
- [Risk of Rain 2 Wiki: Item Stacking](https://riskofrain2.fandom.com/wiki/Item_Stacking)

### Design Philosophy

- [Roguelike Itemization: Balancing Randomness and Player Agency](https://www.wayline.io/blog/roguelike-itemization-balancing-randomness-player-agency)
- [What Makes or Breaks Agency in Roguelikes](https://thom.ee/blog/what-makes-or-breaks-agency-in-roguelikes/)
- [The Chop Shop: Hades' Boon System](https://www.thegamer.com/hades-boon-replay-escape/)

### Balance and Data

- [How Slay the Spire's Devs Use Data to Balance](https://www.gamedeveloper.com/design/how-i-slay-the-spire-i-s-devs-use-data-to-balance-their-roguelike-deck-builder)

### Game-Specific

- [Balatro Wiki: Jokers](https://balatrowiki.org/w/Jokers)
- [Binding of Isaac: Rebirth Wiki](https://bindingofisaacrebirth.fandom.com/)
