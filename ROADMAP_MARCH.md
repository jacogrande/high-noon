# High Noon — Early Access Roadmap (March 2026)

## Current State

4 playable stages, 5 bosses, 3 characters, working multiplayer with reconnect/revive/ping/lobby codes, 90+ ECS systems, 96 test files. SFX pipeline wired (Howler.js + spatial audio), settings menu exists but limited, analytics + crash reporting shipped. No scored music, no tutorial, no controller support. Primary blockers: music, tutorial, controller support, art polish.

---

## Phase 1: Ship-Blocking Fixes (Weeks 1–3)

### Audio

- [x] Integrate Howler.js playback with game events
  - SoundManager + GameplayEventProcessor wired for fire, hit, enemy_die, player_hit, reload, roll, explosion, showdown, footstep, boss events, gold pickup, wave/stage events, level up, UI clicks
  - Remaining: dedicated dynamite SFX, per-weapon impact variants, ability-specific sounds
- [ ] Commission or source remaining SFX: dynamite, per-weapon impact variants (flesh/wood/stone), ability activations
- [ ] Commission or source 3–4 looping Western music tracks: menu theme, combat loop, boss encounter, camp/narrative (ambient soundscapes exist, but no scored music)
- [x] Positional stereo panning for gunfire and impacts

### Controls & Settings

- [x] Settings menu: volume slider, mute toggle, analytics toggle (via SettingsPanel in PauseMenu)
  - Remaining: resolution/fullscreen controls, key rebind UI
- [ ] Controller support (twin-stick mapping: left stick move, right stick aim, triggers shoot/roll)
- [ ] Input abstraction layer so keyboard and gamepad share the same input pipeline

### Onboarding

- [ ] 60–90 second first-run tutorial: move, shoot, roll, use ability
- [ ] Contextual tooltips for first encounter with new mechanics (cover, camp, skill tree)
- [x] Death screen with clear "try again" call to action and run stats summary
  - RunEndPanel: SLAIN/VICTORY header, kills, gold, level, full item inventory, "RIDE AGAIN" / "QUIT TO MENU" buttons
  - DeathSequencePresentation handles fade-to-black animation before panel

### Critical Bugs

- [ ] Entity ID recycling (current sequential IDs exhaust at 10,000 in long runs)
- [x] Snapshot HP encoding: Uint8 → Uint16 for co-op boss HP scaling
  - Enemy HP widened to Uint16 in snapshot v11; player HP remains Uint8
- [ ] Memory leak audit: stale entity references in world Maps/Sets, add `onEntityRemoved` hook
- [ ] Config validation assertions on world creation

### Infrastructure

- [x] Client-side error boundary + crash reporting (Sentry)
  - TODO: Create Sentry account + add DSN to `.env.local` to enable remote crash reports
- [x] Basic analytics: run start → stage completion funnel, death locations, session length
  - Skipped: `trackBossEncounter` not wired in multiplayer controller
  - Skipped: `trackItemAcquired` only wired for `'visitor'` source (stash/drop/draft sources need game feature integration)
  - Skipped: multiplayer match mode hardcoded to `'private'` (quickplay flag needs threading from page level)
  - Skipped: component tests for ConsentDialog and SettingsPanel (need React Testing Library setup)
- [x] Visual debug overlay (collision radii, AI states, detection ranges) behind a dev flag
  - Hotkeys: `1` colliders, `2` AI ranges + state labels, `3` spawn zones
  - `__DEV__` build flag tree-shakes all debug overlay code from production

---

## Phase 2: Game Feel & Polish (Weeks 3–5)

### Visual Effects

- [x] Muzzle flash rendering — emitMuzzleFlash() fires 3–5 yellow particles at barrel tip on every player-fire event
- [x] Shell casing particle emission — emitShellCasing() ejects brass-tinted particle with gravity on player-fire
- [x] Dust clouds on movement and roll — emitMovementDust() per step + emitRollDust() (6–10 particles) on dodge-roll
- [x] Enemy death animations — sprite enemies play 3-frame death over 0.375s with fade; shape enemies scale-down + fade over 0.15s
- [x] Directional blood/dust splats on bullet hits — emitDirectionalImpact() fires 3–5 particles in 90-degree cone along bullet direction
- [ ] Bullet hole decals on walls and obstacles
- [ ] Kill streak visual escalation (screen flash, camera zoom pulse)
  - Partial: trauma bonus at streak >= 3, text scale, slow-mo at streak >= 5 — still needs screen flash and camera zoom pulse

### Combat Clarity

- [x] Distinct player vs. enemy bullet visuals (color, shape, trail) — enemy bullets tinted red/orange by tier, player bullets warm white, shot tracer on player bullets
- [ ] Offscreen threat indicators (edge-of-screen arrows for snipers, chargers)
- [ ] Boss entrance standoff moment (3-second freeze + dramatic zoom)
  - Partial: BossIntroOverlay with letterbox bars, name, taunt, camera trauma — still needs sim freeze and dramatic camera zoom
- [x] Damage number popups or hit flash feedback — FloatingTextPool for damage numbers + per-entity damageFlashTimer (0.1s red flash)
- [x] Fix Drifter/Dustdevil silhouette collision — Drifter has body+hat brim T-shape, Dustdevil has hollow ring with spinning swirl arcs
- [x] Add Knife Drifter back-facing identifier — prominent blade triangle + bandana detail, shape rotates to face target

### Balance Pass

- [ ] Power curve review: each level-up should feel noticeably different
- [x] Weapon feel tuning pass (recoil, fire rate, spread per weapon) — per-character RecoilProfile with cameraKickStrength, fireTrauma, fireSlowdownMs; spread angles tuned per weapon
- [ ] Stage 1–3 difficulty curve review with fresh-eyes playtesting
- [x] Co-op scaling validation (HP, wave budget, loot distribution) — coopScaling.ts with HP multipliers, waveSpawner calls applyCoopHpScale() on every spawn, tested

---

## Phase 3: Bullet Hell Combat Refinement (Weeks 4–6)

See: [Bullet Hell Combat Research](docs/research/bullet-hell-combat.md)

### Pattern System & Content Authoring

- [x] Data-driven bullet pattern definitions in `packages/shared/src/sim/content/` — pattern shape, speed curve, density, and layering as tunable constants (not hardcoded in attack systems)
  - patterns.ts: BulletSpawnDescriptor, PatternContext, PatternGenerator; patternDefs.ts: 7 enemy + boss + composable patterns; patternExecutor.ts bridges to spawnBullet()
- [x] Pattern primitive library: aimed, radial ring, spread/wall, spiral, scatter — each enemy attack built from composable primitives
  - aimed(), ring(), wall(), spiral(), scatter() primitives + layered(), sequence(), burst() composition
- [x] Floating-point angle precision in all pattern calculations (1,500+ possible directions, no integer-degree quantization)
- [x] Minimum gap width enforcement: no generated pattern produces gaps narrower than 2x player collider radius — validate in content definitions
  - validateMinGap() + fairness.test.ts; boss/scatter patterns exempt (intentionally tight / randomized)
- [x] Tag patterns by difficulty axis (precision, reading, multitasking) so encounter designers can compose waves that escalate along specific axes
  - DifficultyAxis type on PatternDefinition, all patterns tagged
- [x] Pattern layering system: base layer (macro constraint) + pressure layer (aimed micro) + tempo layer (spiral/sweep) per boss attack
  - layered() combinator composes multiple generators; boss patterns use multi-layer definitions

### Hitbox & Fairness Tuning

- [x] Audit player collider radius vs. sprite size — target 30–50% of sprite radius for forgiving near-misses
  - fairness.test.ts validates PLAYER_RADIUS is 30–50% of visual sprite radius
- [x] Bullet hitbox scaling — BULLET_RADIUS=4, ENEMY_BULLET_SIZE_THREAT=1.5, ENEMY_BULLET_SIZE_FODDER=1.2 scale collider by tier
- [x] Use debug overlay collider visualization for playtesting hitbox fairness (toggle `1` to see all radii)
- [x] Verify jump (Z-axis) dodges ground-level patterns — JUMP_AIRBORNE_THRESHOLD skips collision/hazard checks when airborne
- [ ] Every attack pattern must be dodgeable with a single well-timed roll (multi-roll = skill ceiling, not floor)
- [ ] Each pattern should have both a "roll solution" and a "threading solution" for players who conserve the roll

### Readability & Visual Clarity

- [x] Bullet z-ordering: enemy bullets always rendered on top of all other game objects
  - Dedicated enemyBullets layer in GameApp; BulletRenderer uses separate registry for enemy bullets
- [x] Smaller/faster bullets drawn over bigger/slower bullets in render order
  - Z-ordering in BulletRenderer: smaller/faster enemy bullets render on top
- [x] Color-code bullets by threat type; enemy bullets visually distinct from player bullets — red/orange enemy tints by tier, warm white player bullets, shot tracers
- [x] Add trails to any bullet with non-linear trajectory (homing, curved, accelerating)
  - Trail afterimages (3-position ring buffer) for bullets with accel/drag in BulletRenderer
- [x] Telegraph system for heavy attacks — all enemies/bosses use telegraphDuration (0.35–0.5s), world.bossTelegraphs array, visual indicators
- [ ] Background audit: ensure mid-tone backgrounds don't compete with bullet visibility — reserve extreme values for gameplay elements
- [x] Group bullets into lines/arcs/formations — eliminate single stray bullets from all enemy attack definitions
  - All enemy attacks now use pattern system (ring, wall, aimed, scatter primitives); no single-stray bullets

### Difficulty Pacing & Encounter Design

- [ ] Intensity curve within encounters: wave 1 moderate → wave 2 intense → 1–3s valley → wave 3 peak (use waveSpawner budget system)
- [ ] Separate spatial density (bullets per area) from temporal density (spawn rate) as independent tuning knobs
- [ ] Macro/micro dodge alternation: alternate between large-formation dodging and tight-gap threading within encounters
- [ ] New patterns introduced at low density first, then scaled up in subsequent waves/stages
- [ ] Constrain seeded-random scatter patterns to prevent undodgeable clusters (min-separation between random bullets)

### Boss Pattern Overhaul

- [ ] Audit all 5 boss attack cycles: each attack 5–10s, each phase introduces genuinely new patterns (not just faster Phase 1)
- [ ] Each boss attack tests a different player skill axis — no two attacks requiring the same dodge approach
- [x] Anti-safespot: at least one aimed layer per boss pattern; detect stationary players and alter patterns if camping
  - SafespotDetector in bossPatterns.ts tracks player position, triggers after 2.5s camping; wired into all 6 bosses
- [x] Boss phase transition: cancel on-screen bullets, brief breathing room, visual transformation to signal "this is different"
  - cancelEnemyBullets() in helpers.ts called on phase transitions; 0.5s cooldown for breathing room
- [x] Health gates to prevent overpowered builds from skipping phases — all bosses use HP threshold ratios (P2_THRESHOLD, P3_THRESHOLD, etc.)
- [x] Soft enrage timer: gradually increasing density/speed if fight exceeds target duration (5–10 minutes for major bosses)
  - EnrageState in bossPatterns.ts: getEnrageDensityMul (1.0→1.5x), getEnrageSpeedMul (1.0→1.3x); wired into all 6 bosses with 120s target (180s for Old Scratch)
- [x] Boss vulnerability windows: telegraphed recovery/stationary phases where DPS is highest — reward aggressive play
  - VulnerabilityState: VULNERABILITY_DAMAGE_MUL=1.5x, VULNERABILITY_DURATION=1.0s; Boomstick opens window after ring attacks

### Game Feel Integration

- [x] Hit stop audit — HitStop.ts implements freeze(duration) with timeScale gating; wired to event processor for kills, boss transitions, player damage
- [x] Hit stop duration by intensity: light (2–3 frames) for standard hits, medium (3–6) for elite kills, heavy (6–12) for boss transitions
  - hitStopConfig.ts: light=0.05s, medium=0.083s, heavy=0.15s, boss_kill=0.217s; wired into GameplayEventProcessor replacing magic numbers
- [x] Camera trauma proportional to damage: bullet impacts on player contribute trauma scaled to damage dealt
  - lastPlayerDamageFraction on GameWorld; proportional trauma (damageFraction * 0.8, capped 0.5) in SP + MP paths
- [x] Stack multiple light hit stops for rapid-fire weapons rather than one long freeze
  - HitStop.ts uses additive stacking with HIT_STOP_MAX_STACK=0.1s cap
- [ ] Permanence pass: bullet hole decals, corpse persistence, debris — lasting evidence of combat

### Multiplayer Combat Scaling

- [x] Bullet density per player: 1.5x total for 2 players, not 2x — increase enemy count instead of per-enemy density
  - getPatternDensityScale() in coopScaling.ts: sub-linear log2-based scaling (1.5x at 2P, <2x at 4P)
- [x] Boss multiplayer variants: distribute aimed attacks across players (threat assignment) rather than screen-filling radials for all
  - getBossAimedTarget() in bossTargeting.ts: round-robin target selection across alive players
- [x] Arena sizing for player count: expand camera bounds for 4-player sessions to maintain dodge space per player
  - getArenaScale() in coopScaling.ts: 15% per additional player
- [x] Reduce per-enemy pattern density in co-op but increase enemy count — maintains total threat while keeping individual patterns readable
  - Pattern density scaling uses sub-linear curve; wave budget multiplier in coopScaling.ts increases enemy count
- [ ] Distinct per-player visual indicators for readability in co-op chaos

### Performance Validation

- [ ] Audit `spawnBullet`/`removeBullet` hot path for per-bullet allocations — verify bullet entity pooling has zero runtime allocations
- [ ] Stress-test at 2,000+ simultaneous bullets: verify ECS batch update + PixiJS sprite batching holds 60fps
- [ ] Spatial hash cell size tuned to largest bullet collider radius in use
- [ ] Target 200–800 active bullets as comfortable operating range; 4,000 hard ceiling
- [ ] Profile browser GC pauses during intense combat — no GC-induced frame drops

---

## Phase 4: Multiplayer Hardening (Weeks 6–8)

### Stability

- [x] Disconnect/rejoin behavior (grace period, state restore) — 30s allowReconnection window, re-sends config/bullets/snapshot, disconnectedPlayerAI drives entity during window
- [x] Friendly fire policy decision and implementation — FriendlyFireMode ('none'|'reduced'|'full'), FRIENDLY_FIRE_DAMAGE_SCALE=0.25, gated in bulletCollision + dynamite
- [x] AFK detection and handling — 60s warning, 90s kick, per-slot lastActiveInputTick tracking
- [ ] HUD delta encoding (currently re-sends full skill tree at 10Hz, ~80% bandwidth waste)
- [ ] Stress test 4-player and 8-player sessions

### Social Features

- [x] Private lobby codes for friends — generateRoomCode() with ROOM_CODE_CHARS/LENGTH, filterBy in matchmaking
- [x] Quick play matchmaking (basic, region-aware if possible) — QUICK_PLAY_CODE sentinel routes to open sessions
- [x] Ready check / timer cap in camp phase — ReadyMessage + parseReadyMessage, ready-state tracking in GameRoomState
- [x] Post-run stats screen (damage dealt, kills, items collected, MVP) — RunCompleteMessage with victory/duration/stagesCleared/playerStats, MultiplayerRunEndPanel scoreboard

### Co-op Gameplay

- [x] Downed/revive system (bleed-out timer, proximity revive) — reviveSystem.ts: 10s bleed, 3s revive, 48px range, 30% HP restore, hold-INTERACT, all-downed game-over
- [x] Ping system (mark target, mark danger, "over here") — PlayerPingEvent with PingType (location/enemy/danger), 1s cooldown, 3 max active, 5s lifetime, PingRenderer client-side
- [x] Shared vs. individual loot decision and implementation — snake-draft pick system for multiplayer camp (shared pool, picks sorted by kill contribution)

---

## Phase 5: Content Completion for EA (Weeks 7–10)

### Stage 4: Crossroads

- [x] Map generation: +-shaped arena — crossroadsGenerator.ts with CENTER_SIZE, ROAD_WIDTH, ROAD_LENGTH, tested
- [x] Old Scratch boss: 4-phase supernatural encounter — The Wager → The Cheat → The Devil Unleashed → The Final Draw, character-adaptive attacks, Infernal Counter, arena shrink
- [x] Ghost Rider add spawns during boss fight — spawnGhostRider() in prefabs, EnemyType.GHOST_RIDER, spawned in Old Scratch Phase 2
- [x] Brimstone cracks, dust storm, and arena collapse hazards — hellfirePillar.ts, hazardTile.ts, groundCrackSystem.ts, DustStormEffect.ts
- [ ] Stage 4 encounter waves (new enemy compositions)

### New Enemies (pick 3–4 for EA)

- [x] Lasso Bandit (rooting CC) — LASSO_ROOT_DURATION=1.5s, custom attack in enemyAttack.ts
- [x] Dynamite Tosser (area denial) — DYNAMITE_TOSSER_FUSE_TIME=1.5s, BLAST_RADIUS=60, full physics in dynamite.ts
- [x] Armored Bandit (directional armor) — FRONT_REDUCTION=0.4, ARC_HALF_ANGLE=π/2, FrontArmor component
- [x] Rattlesnake (poison DOT) — POISON_DPS=2, POISON_DURATION=3.0s, poison-on-melee-hit

### Meta-Progression

- [ ] Ascension system: stackable difficulty modifiers unlocked after first clear
- [ ] Run history with seed display (deterministic sim supports replay)
- [ ] Character unlock progression (start with Sheriff, unlock Prospector/Undertaker through play)

---

## Phase 6: Playtesting & QA (Weeks 9–12)

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

## Phase 7: Art & Identity (Parallel Track, Weeks 1–10)

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

## Phase 8: Business & Platform (Weeks 8–12)

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

## Phase 9: Documentation & Community (Weeks 10–14)

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

## Phase 10: Marketing & Launch (Weeks 12–16)

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

## Phase 11: Post-EA Content Roadmap (Months 2–6)

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
3. **Friendly fire:** ~~On, off, or toggle? Affects co-op balance significantly~~ **Decided: configurable** ('none'|'reduced'|'full'), reduced mode at 25% damage
4. **Loot sharing:** ~~Individual drops, shared pool, or "need/greed" system?~~ **Decided: snake-draft** (shared pool, individual picks sorted by kill contribution)
5. **Player count target:** Ship with 2–4 co-op, or push for 8-player at EA?
6. **Audio sourcing:** Commission original, license packs, or mix?
7. **Art sourcing:** Current sprites sufficient for EA, or commission polished set?
8. **Steam Next Fest:** Target a specific Next Fest date, or skip for faster launch?
9. **EA duration estimate:** Communicate 6 months? 12 months? "When it's ready"?
10. **Analytics provider:** ~~Sentry + custom? Steam analytics only? Third-party like GameAnalytics?~~ **Decided: GameAnalytics** (shipped in analytics sprint)
