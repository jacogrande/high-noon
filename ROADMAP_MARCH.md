# High Noon — Early Access Roadmap (March 2026)

## Current State

3 playable stages, 5 bosses, 3 characters, working multiplayer foundation, 90+ ECS systems, 68 test files. The game is silent (no audio), has no tutorial, no settings menu, and no controller support. These are the primary blockers to shipping.

---

## Phase 1: Ship-Blocking Fixes (Weeks 1–3)

### Audio

- [ ] Commission or source SFX library: gunshots (per weapon), bullet impacts (flesh/wood/stone), enemy death cries, reload, roll whoosh, dynamite, ability activations, UI clicks, XP/level-up
- [ ] Commission or source 3–4 looping Western music tracks: menu theme, combat loop, boss encounter, camp/narrative
- [ ] Integrate Howler.js playback with game events (existing infrastructure, needs content + wiring)
- [x] Positional stereo panning for gunfire and impacts

### Controls & Settings

- [ ] Settings menu: volume sliders (master/SFX/music), resolution/fullscreen toggle, key rebinds
- [ ] Controller support (twin-stick mapping: left stick move, right stick aim, triggers shoot/roll)
- [ ] Input abstraction layer so keyboard and gamepad share the same input pipeline

### Onboarding

- [ ] 60–90 second first-run tutorial: move, shoot, roll, use ability
- [ ] Contextual tooltips for first encounter with new mechanics (cover, camp, skill tree)
- [ ] Death screen with clear "try again" call to action and run stats summary

### Critical Bugs

- [ ] Entity ID recycling (current sequential IDs exhaust at 10,000 in long runs)
- [ ] Snapshot HP encoding: Uint8 → Uint16 for co-op boss HP scaling
- [ ] Memory leak audit: stale entity references in world Maps/Sets, add `onEntityRemoved` hook
- [ ] Config validation assertions on world creation

### Infrastructure

- [ ] Client-side error boundary + crash reporting (Sentry or equivalent)
- [ ] Basic analytics: run start → stage completion funnel, death locations, session length
- [ ] Visual debug overlay (collision radii, AI states, detection ranges) behind a dev flag

---

## Phase 2: Game Feel & Polish (Weeks 3–5)

### Visual Effects

- [ ] Muzzle flash rendering (anchor data already exists)
- [ ] Shell casing particle emission
- [ ] Dust clouds on movement and roll
- [ ] Enemy death animations (replace instant disappear)
- [ ] Directional blood/dust splats on bullet hits
- [ ] Bullet hole decals on walls and obstacles
- [ ] Kill streak visual escalation (screen flash, camera zoom pulse)

### Combat Clarity

- [ ] Distinct player vs. enemy bullet visuals (color, shape, trail)
- [ ] Offscreen threat indicators (edge-of-screen arrows for snipers, chargers)
- [ ] Boss entrance standoff moment (3-second freeze + dramatic zoom)
- [ ] Damage number popups or hit flash feedback
- [ ] Fix Drifter/Dustdevil silhouette collision (base shapes too similar)
- [ ] Add Knife Drifter back-facing identifier

### Balance Pass

- [ ] Power curve review: each level-up should feel noticeably different
- [ ] Weapon feel tuning pass (recoil, fire rate, spread per weapon)
- [ ] Stage 1–3 difficulty curve review with fresh-eyes playtesting
- [ ] Co-op scaling validation (HP, wave budget, loot distribution)

---

## Phase 3: Multiplayer Hardening (Weeks 4–6)

### Stability

- [ ] Disconnect/rejoin behavior (grace period, state restore)
- [ ] Friendly fire policy decision and implementation
- [ ] AFK detection and handling
- [ ] HUD delta encoding (currently re-sends full skill tree at 10Hz, ~80% bandwidth waste)
- [ ] Stress test 4-player and 8-player sessions

### Social Features

- [ ] Private lobby codes for friends
- [ ] Quick play matchmaking (basic, region-aware if possible)
- [ ] Ready check / timer cap in camp phase
- [ ] Post-run stats screen (damage dealt, kills, items collected, MVP)

### Co-op Gameplay

- [ ] Downed/revive system (bleed-out timer, proximity revive)
- [ ] Ping system (mark target, mark danger, "over here")
- [ ] Shared vs. individual loot decision and implementation

---

## Phase 4: Content Completion for EA (Weeks 5–8)

### Stage 4: Crossroads

- [ ] Map generation: +-shaped arena with dynamic tile modification
- [ ] Old Scratch boss: 4-phase supernatural encounter with quickdraw finale
- [ ] Ghost Rider add spawns during boss fight
- [ ] Brimstone cracks, dust storm, and arena collapse hazards
- [ ] Stage 4 encounter waves (new enemy compositions)

### New Enemies (pick 3–4 for EA)

- [ ] Lasso Bandit (rooting CC)
- [ ] Dynamite Tosser (area denial)
- [ ] Armored Bandit (directional armor)
- [ ] Rattlesnake (poison DOT)

### Meta-Progression

- [ ] Ascension system: stackable difficulty modifiers unlocked after first clear
- [ ] Run history with seed display (deterministic sim supports replay)
- [ ] Character unlock progression (start with Sheriff, unlock Prospector/Undertaker through play)

---

## Phase 5: Playtesting & QA (Weeks 7–10)

### Internal Testing

- [ ] Full 3-stage run completion testing (solo + co-op) on every build
- [ ] Controller-only playthroughs to verify gamepad experience
- [ ] Memory and performance profiling on target min-spec hardware
- [ ] Network condition testing (simulated packet loss, high latency)

### External Playtesting

- [ ] Closed alpha: 10–20 testers, focus on first-time experience and tutorial clarity
- [ ] Closed beta: 50–100 testers, focus on balance, multiplayer stability, and fun factor
- [ ] Collect structured feedback: fun ratings per stage, confusion points, crash reports
- [ ] Iterate on tutorial and difficulty curve based on playtest data

### QA Checklist

- [ ] All 5 bosses completable solo and in 2/4-player co-op
- [ ] No softlocks or progression blockers
- [ ] Settings persist across sessions
- [ ] Graceful handling of network disconnects
- [ ] No memory leaks in 30+ minute sessions

---

## Phase 6: Art & Identity (Parallel Track, Weeks 1–10)

### Sprite Art

- [ ] Audit existing sprites: identify placeholder vs. final quality
- [ ] Player character sprite sheets: idle, walk, roll, shoot, death (all 3 characters)
- [ ] Enemy sprite sheets: ensure each enemy has distinct silhouette and attack telegraph
- [ ] Boss sprite sheets: entrance animations, phase transitions, death sequences
- [ ] Tilemap art: town, badlands, canyon, crossroads tilesets
- [ ] Item/pickup icons for HUD and loot drops
- [ ] Destructible obstacle states (intact → damaged → destroyed)

### UI Art

- [ ] HUD design: health, ammo, ability cooldown, XP bar, minimap
- [ ] Menu screens: main menu, settings, lobby, character select, pause
- [ ] Skill tree visual design
- [ ] Camp/narrative scene UI
- [ ] Loading screens with Western flavor

### Visual Identity

- [ ] Logo design (wordmark + icon)
- [ ] Color palette guide (dusty Western tones)
- [ ] Key art for store page (hero image, capsule art)
- [ ] Animated GIFs showcasing gameplay moments (for store page and marketing)

---

## Phase 7: Business & Platform (Weeks 6–10)

### Steam Setup

- [ ] Steamworks account and app ID registration
- [ ] Store page: description, screenshots (minimum 5), tags, system requirements
- [ ] Steam cloud save integration
- [ ] Achievement system (10–15 achievements for EA launch)
- [ ] Trading cards and profile features (optional, can defer)
- [ ] Age rating / content descriptors
- [ ] Set EA pricing ($12–18 range — research comparable roguelite pricing)

### Legal & Business

- [ ] EULA / Terms of Service for multiplayer
- [ ] Privacy policy (analytics, account data)
- [ ] Music/SFX licensing verification (ensure commercial rights)
- [ ] Form business entity if not already done (for Steam payments)
- [ ] Decide on EA pricing strategy and any launch discount

### Build & Distribution

- [ ] Production build pipeline (minified, optimized, versioned)
- [ ] Steam build upload and branch management (default, beta, internal)
- [ ] Auto-update flow testing
- [ ] Minimum system requirements benchmarking

---

## Phase 8: Documentation & Community (Weeks 8–12)

### Player-Facing Documentation

- [ ] Steam store page copy (short description, long description, EA disclaimer)
- [ ] EA roadmap blurb for store page ("what's coming")
- [ ] Patch notes template and process
- [ ] Known issues page
- [ ] FAQ: what is EA, when is 1.0, multiplayer details, platform plans

### Community Setup

- [ ] Discord server with channels: announcements, feedback, bug-reports, builds, general
- [ ] Discord bot for patch notes and build notifications
- [ ] Bug report template (reproduction steps, system info, logs)
- [ ] Feedback collection system (Discord threads, Google Forms, or in-game)

### Developer Documentation

- [ ] Content authoring guide: how to add enemies, bosses, items, narrative
- [ ] Architecture overview for future contributors
- [ ] Deployment runbook: how to push builds, manage servers, handle incidents

---

## Phase 9: Marketing & Launch (Weeks 10–14)

### Marketing Assets

- [ ] Gameplay trailer (60–90 seconds, show combat + co-op + bosses + narrative choice)
- [ ] Store page screenshots (5+ high-quality, annotated if needed)
- [ ] Animated key art or short loop for social media
- [ ] Press kit: logo files, screenshots, description, developer bio, contact

### Pre-Launch

- [ ] Steam "Coming Soon" page live (as early as possible for wishlists)
- [ ] Announce EA launch date 2–4 weeks in advance
- [ ] Send press kit to roguelite/indie game press and YouTubers/streamers
- [ ] Post in relevant communities: r/roguelites, r/indiegaming, roguelite Discords
- [ ] Consider Steam Next Fest demo build (high-impact for wishlists)

### Launch Week

- [ ] Launch day: monitor crash reports, server load, matchmaking
- [ ] Day-1 hotfix budget (have a patch ready to go if critical issues surface)
- [ ] Community engagement: respond to feedback, acknowledge bugs, share roadmap
- [ ] Post-launch announcement in Discord and social media

### Ongoing

- [ ] Bi-weekly or monthly update cadence (set expectations in EA description)
- [ ] Patch notes for every update
- [ ] Community feedback triage process (what goes into next update vs. backlog)

---

## Phase 10: Post-EA Content Roadmap (Months 2–6)

### Month 2: First Major Update

- Powder Keg Nell boss + miniboss system
- 8–10 new items (cursed items, consumables, build-defining uniques)
- 2 additional narrative threads (4 total)
- Bounty Board persistent challenge system
- Daily challenge mode (fixed seed, leaderboard)

### Month 3–4: Second Major Update

- New character: The Outlaw (dual-wield pistols, berserk ability)
- Stage map variants (2–3 layouts per stage to prevent memorization)
- Weapon evolution system (Tinkerer NPC visitor)
- Endless mode (post-Stage 3 escalating waves)
- Boss Rush mode
- Adaptive music system (intensity layers based on combat state)

### Month 5–6: Third Major Update

- New character: The Native Scout (bow/tomahawk, Spirit Walk)
- The Preacher's Congregation boss (horde-phase encounter)
- Set bonus items (3-piece collections)
- Weather system (gameplay-affecting dust storms, rain)
- Character mastery tracks with cosmetic rewards
- Community challenges (weekly global goals)

### Long-Term (6+ Months)

- Story mode / accessibility difficulty options
- Seed sharing + ghost runs + spectator mode
- Seasonal themed events
- Train Robbery scrolling arena boss (requires engine work)
- Wendigo/Skinwalker shape-shifter boss
- Twitch integration (chat-votes-for-modifiers)
- Evaluate 1.0 launch readiness

---

## Out of Scope / Deferred

Items identified during implementation that were intentionally deferred:

### Positional Audio Sprint

- Remote player gunfire events lack spatial data from server — needs server-side event enrichment
- Bullet-removed wall impact sounds have no spatial audio (no sound wired yet)
- `player-hit` and `roll` events lack x/y for multiplayer spatial positioning
- Centroid vs closest-death for multi-kill spatial positioning — revisit during playtesting
- Per-sound maxDistance overrides (explosions carry further than footsteps)
- Environmental occlusion (walls muffling sound via tilemap raycasting)

---

## Key Decisions Needed

These are open questions that should be resolved before or during Phase 1–2:

1. **Pricing:** $12? $15? $18? Research Nuclear Throne, Brotato, Vampire Survivors, Enter the Gungeon EA pricing
2. **Platform scope:** Steam only for EA, or also itch.io? Web demo?
3. **Friendly fire:** On, off, or toggle? Affects co-op balance significantly
4. **Loot sharing:** Individual drops, shared pool, or "need/greed" system?
5. **Player count target:** Ship with 2–4 co-op, or push for 8-player at EA?
6. **Audio sourcing:** Commission original, license packs, or mix?
7. **Art sourcing:** Current sprites sufficient for EA, or commission polished set?
8. **Steam Next Fest:** Target a specific Next Fest date, or skip for faster launch?
9. **EA duration estimate:** Communicate 6 months? 12 months? "When it's ready"?
10. **Analytics provider:** Sentry + custom? Steam analytics only? Third-party like GameAnalytics?
