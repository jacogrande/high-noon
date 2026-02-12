# Reverend Boomstick (Stage 1 Test Boss)

## Summary

Reverend Boomstick is a campy, theatrical outlaw-preacher boss for the end of Stage 1.  
He appears during the **final wave** and turns the fight into a “revival gone violent” spectacle with taunts, radial bullet patterns, and pressure spikes that test core skills: dodge timing, target focus, and positioning.

## Encounter Trigger

- Stage: `Stage 1`
- Timing: `Last wave` (Wave 3)
- Current prototype mapping: implemented via `EnemyType.BOOMSTICK` in simulation code

## Boss Fantasy and Lore

Reverend Boomstick is a failed frontier preacher who discovered he could make more money selling fear than salvation. He tours dust towns with a fake revival tent, “blesses” his followers with snake oil, and extorts communities under threat of holy gunfire.

Tone goals:

- Campy and memorable, not grimdark
- Loud, theatrical, and slightly ridiculous
- Dangerous enough to feel like a true stage punctuation moment

Sample bark lines:

- “Step right up, sinners. Redemption comes in buckshot!”
- “Kneel now and save me the ammunition!”
- “The collection plate is full, and so is this chamber!”

## Combat Design

### Core Combat Loop

The player dodges layered projectile patterns while trying to maintain enough DPS to finish the boss before getting boxed in by pressure from fodder and threat adds.

### Baseline Moveset (Prototype-Ready)

1. **Fire-and-Brimstone Fan**

- Telegraph: big arm raise + bright muzzle flash wind-up
- Pattern: aimed spread fan (mid-range cone)
- Intent: punish linear retreat and reward lateral movement

2. **Hallelujah Halo**

- Telegraph: short vocal cue + circular flash at feet
- Pattern: radial ring volley around boss (rotating offset each cast)
- Intent: force fast gap-reading and repositioning

3. **Showman Footwork**

- Behavior: keeps preferred distance, kites, and re-angles attacks
- Intent: prevent static corner camping

### Planned Phase Structure

1. **Phase 1: The Sermon (100% to 70%)**

- Uses fan + halo at moderate cadence
- Goal: teach readability and dodge rhythm

2. **Phase 2: The Revival (70% to 35%)**

- Faster cadence and tighter downtime
- Periodic fodder support (“converted zealots”)
- Goal: split player attention without becoming unreadable

3. **Phase 3: Last Rites (35% to 0%)**

- Slight enrage: more overlap between fan and halo timing
- More aggressive spacing control
- Goal: emotional climax and high-pressure finish

## Why This Boss Is Fun

- **Readable threat language:** clear telegraphs before dangerous patterns
- **Skill expression:** strong players thread halo gaps and punish recoveries
- **Movement puzzle:** fan + ring combination creates dynamic safe-path decisions
- **Strong identity:** campy preacher theme makes the fight memorable, not generic
- **Stage punctuation:** final-wave reveal creates a strong “act end” beat

## Potential Variations

1. **Arena variant:** revival wagons/pews as partial cover that can be destroyed mid-fight.
2. **Objective variant:** protect civilians from “conversion fire” to avoid soft-failure branch.
3. **Boss variant pool:** alternate sermons (fire-focused, summon-focused, mobility-focused) to reduce repetition.
4. **Co-op scaling:** in multiplayer, split halo into staggered double-rings with wider safe gaps.

## Best-Practice Alignment

This design intentionally follows principles documented in:

- `docs/research/boss-design.md`
- `docs/research/narrative-boss-design.md`
- `docs/mechanics/stage-objectives.md`

Applied practices:

- **Designed around player moveset:** tests dodge, aim, and positioning rather than new one-off mechanics.
- **Telegraph -> attack -> recovery:** preserves fairness and punish windows.
- **Additive phase escalation:** same readable foundation, increasing complexity over time.
- **Narrative punctuation:** boss serves as a clear story beat, not just a stats spike.
- **Soft-failure potential:** can branch future stage context based on side-objective outcomes.

## Narrative Effects and Branch Hooks

1. **Success path (kill + protect town)**

- Town morale rises; sheriff reputation increases.
- Stage 2 can begin with ally aid, discounted shop, or intel on a secondary villain.

2. **Soft-failure path (kill boss, but collateral loss)**

- Chapel/town district burns during revival chaos.
- Stage 2 shifts to resource scarcity or rescue-focused objectives.

3. **Hard-failure path (player dies)**

- Boomstick’s cult narrative advances.
- Next run dialogue references “the night of fire and gospel.”

## Implementation Notes

- The current test implementation already hooks Stage 1 final wave to a boss-style threat (`BOOMSTICK`) with fan + radial volleys.
- This document defines the intended full identity and expansion plan so art, audio, and narrative systems can converge on Reverend Boomstick specifically.
