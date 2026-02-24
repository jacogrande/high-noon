# Future Sprint Brainstorm

What could High Noon become? This document catalogs potential work across every dimension — code, content, design, operations, polish, and business. Not a roadmap; a menu of possibilities organized by theme, reviewed for technical feasibility, strategic impact, and design quality.

---

## Identity Pillars

Every feature decision should reinforce these four pillars. If a feature doesn't serve at least one pillar, it probably isn't worth building yet.

1. **Western Gunplay Feel** — Weapon-specific recoil, hit stop, camera kick, muzzle flash. Guns should feel like guns. The Showdown slow-mo multi-kill is the signature clip.
2. **Narrative-Branching Runs** — Soft failures change the story. Boss choices alter the path. Each run tells a different tale. This is the differentiator from Vampire Survivors and its clones.
3. **Co-op as a First-Class Experience** — Authoritative server, client-side prediction, 2-8 players. Playing with friends should be the best way to play, not a bolted-on afterthought.
4. **Dueling & Showdowns** — The Western fantasy lives in the standoff. Boss entrance standoffs, quick-draw reaction tests, and the Showdown ability are the moments players will remember.

**The 30-Second Pitch:** "High Noon is a Western roguelite where every run tells a different story. Dodge bullets, duel outlaws, and fight through a branching narrative with up to 8 friends in co-op. Three gunslingers with unique skill trees, five bosses that reshape the arena, and items that break the game in the best way possible."

---

## 1. Content Expansion

### 1A. Bosses

- **Powder Keg Nell** — Full design doc exists (493 lines), not implemented. Explosives expert with fuse-management core mechanic, arena reshaping, satchel charges. Estimated 200-300 lines of ECS code. Should be the next boss built. _[Additive — follows established boss module pattern.]_
- **The Preacher's Congregation** — Horde-phase boss. Reverend Boomstick returns with a church full of zealots. Kill the congregation while Boomstick heals from them — inversion of normal "kill adds then DPS boss" pattern. _[Moderate — reuses Boomstick module.]_
- **Miniboss System** — Mid-wave elite spawns (like Enter the Gungeon's minibosses). Named enemies with one signature attack and a guaranteed item drop. Adds variety within waves without full boss encounter overhead. Best ratio of implementation cost to gameplay impact in this entire document. _[Low — just an enemy archetype with a name tag and loot table entry.]_
- **Train Robbery Boss** — Fight atop a moving train. Scrolling arena, limited lateral space, enemies climbing from sides. Boss is the train conductor who detaches cars. Inspired by Colt Canyon's linear level segments. _[Very high difficulty — requires new spatial hash, flow field, tilemap collision, and camera bounds infrastructure. Closer to Tier 3 than Tier 2. Better as a full stage than a single boss.]_
- **Wendigo / Skinwalker** — Supernatural horror boss for a potential Stage 4. Shapeshifts into copies of previously defeated bosses for one attack cycle each. Tests player pattern memory across the whole run. _[High difficulty — every boss must be refactored to have modular, extractable single-attack-cycles. EnemyRenderer caches enemyTypes at spawn and would need mid-fight cache invalidation.]_

### 1B. Enemies

- **Lasso Bandit** — Ranged CC enemy. Throws lasso that roots the player for 1.5s unless they roll to break free. Forces defensive play and roll timing.
- **Dynamite Tosser** — Area denial fodder. Lobs dynamite with visible fuse arc and blast radius preview. Punishes standing still. Natural synergy with Prospector's dynamite theme.
- **Armored Bandit** — Directional armor. Shots from the front do reduced damage; must flank or use piercing. Teaches positioning.
- **Healer Shaman** — Support enemy that pulses heal to nearby enemies. Priority target that creates tactical decision-making (kill the healer first vs. focus the threat).
- **Ghost Rider** — Fast-moving mounted enemy that charges in straight lines. Leaves a fire trail. Inspired by charger but with environmental hazard.
- **Vulture** — Flying enemy (ignores terrain collisions). Circles overhead, periodically dive-bombs. _[Moderate difficulty — needs a `NoWallCollision` tag component, Z-height integrated into bullet-vs-entity collision check (invasive — bulletCollisionSystem is already complex from lag compensation), and client shadow rendering offset.]_

Note: `EnemyType` enum is manually numbered and every switch/lookup table must be updated per new type (ENEMY_COLORS, ENEMY_SPRITE_ID, ENEMY_SPRITE_SCALE, spawnEnemy dispatch, boss registry). At 15+ types, this is fragile. A registry pattern (like `bosses/registry.ts`) should be extended to all enemy types before adding more.

### 1C. Characters

- **The Outlaw** — Dual-wield pistols. Lower accuracy, higher fire rate. Ability: Dead or Alive (brief berserk mode — massive damage, no dodge, can't heal). Glass cannon fantasy. Straightforward to implement.
- **The Native Scout** — Bow + tomahawk. Charged bow shots pierce, tomahawk boomerangs back. Ability: Spirit Walk (brief invulnerability + speed boost, leave a decoy). Movement-focused character.
- **The Gambler** — Card-themed abilities. Draw random "cards" (buffs/debuffs) that apply for one stage. High variance. _[Deprioritize — hardest to balance, most likely to feel broken or useless. Requires more balance work than the other two combined for less predictable outcomes. Random effects in a twitchy action game is a harder design problem than in Balatro's turn-based context.]_

### 1D. Items (Wave 2-3)

Highest content-ROI investment. Each item is ~20-50 lines using existing hook system (`onBulletHit`, `onKill`, `onRollDodge`). Items are the primary replayability driver — players share builds, post "broken combo" clips, and theory-craft synergies.

- **Cursed Items** — Framework exists, no items defined. Examples: Hangman's Noose (+30% damage, -1 max HP per stage), Blood Money (gold drops doubled, take damage when picking up gold), Devil's Bargain (next boss drops 2 items, current stage has +50% enemy HP). The risk/reward decision creates stories that players discuss.
- **Consumables** — One-use items with powerful effects. Smoke Bomb (brief AoE invisibility), Whiskey Flask (heal 30% but aim wobbles for 5s), Wanted Poster (marks nearest threat for 2x gold on kill). Adds tactical depth without permanent balance complexity. Creates interesting camp visitor interactions (Trade Caravan sells consumables cheaply).
- **Build-Defining Items** — Items that fundamentally change how a character plays. "Bouncing Betty Mines" turns Prospector's dynamite into proximity mines. "Fan the Hammer" turns Sheriff's single shots into burst fire. "Soul Siphon" turns Undertaker's Last Rites into a healing zone for allies.
- **Set Bonuses** — Collecting 3 items from the same "collection" grants a bonus. The Lawman Set (Tin Star + Leather Duster + Trail Boots = +1 roll charge). _[Moderate difficulty — requires scanning inventory for set membership on every item acquisition, new stat derivation hook point.]_
- **Weapon Evolutions** — Tinkerer camp visitor upgrade path. Sheriff's revolver becomes a Peacemaker (larger cylinder, faster reload). _[Moderate-high difficulty — changes the assumption that a character has one weapon type throughout a run. The `writeStatsToECS` pipeline in upgrade.ts would need conditional stat derivation based on evolution state.]_

### 1E. Stages & Maps

- **Stage Variants** — Each stage has 2-3 map templates with different obstacle layouts. Currently each stage has one fixed map config. Adding variety prevents route memorization. High impact for low effort.
- **Stage 4: Ghost Town** — Abandoned mining settlement. Environmental hazards: collapsing buildings, mine cart rails, gas pockets. New narrative thread branch.
- **Dynamic Map Events** — Mid-wave environmental changes. Bridge collapses cutting the arena in half. Dust storm reduces visibility. Stampede of cattle crosses the arena. Inspired by Nuclear Throne's level events.
- **Vertical Arenas** — Multi-level saloon or canyon with ramps/ledges. _[Very high difficulty — the entire collision, rendering, snapshot protocol, and spatial hash system assumes 2D. No height data in tilemap, no Z-aware entity collision, snapshot protocol doesn't encode enemy Z. Requires engine rewrite. Tier 4+.]_

### 1F. Narrative

- **3-4 More Plot Threads** — Currently 2 (The Raid, The Stranger). Each thread should create a distinct run identity. Ideas: "The Gold Rush" (greed vs. cooperation), "The Hanging" (wrongful accusation, escape + revenge arc), "The Plague" (supernatural sickness, race against time).
- **Inter-Run Continuity** — Hades-style NPC relationships that persist across runs. Camp visitors remember you. Defeated bosses have different dialogue when re-encountered. **This is the single most important retention feature for narrative players.** The procedural narrative system is impressive but finite: 5 threads x 3 acts x 2 branches = 30 unique narrative stages. A dedicated player sees them all in 20-30 runs. Inter-run continuity extends the narrative shelf life indefinitely.
- **Soft Failure Consequences** — Currently soft failures modify next-stage narrative text but don't change gameplay. They should: failed protect = fewer NPCs in camp, failed intercept = harder wave composition, failed duel = boss gets a new attack in subsequent encounters.

---

## 2. Game Feel & Polish

### 2A. Audio

The game is currently silent. **A silent game is an unshippable game.** This is the single highest-impact work remaining.

- **Sound Effects** — Priority: gunshots (per-weapon distinct), bullet impacts (flesh vs. wall), enemy death cries, roll whoosh, reload click-clack, dynamite fuse + explosion, UI button clicks, XP ding, level-up fanfare.
- **Music** — For EA: 3-4 looping tracks (menu, combat, boss, camp). Commission or license Western-themed tracks. Do not build an adaptive music system yet — placeholder loops are sufficient. The adaptive system (quiet guitar during exploration, building drums during waves, full orchestra on bosses) is a Tier 2 polish item.
- **Positional Audio** — Stereo panning based on enemy position. Distant gunshots for offscreen enemies. Lower priority than basic SFX.

### 2B. Visual Effects

- **Muzzle Flash** — Brief bright sprite at weapon barrel on fire. Already have muzzle anchor data in `WeaponSpriteData`. Borderline ship-blocking — a gun with no muzzle flash feels broken. 1-2 hours of work.
- **Shell Casings** — Tiny particle ejected on each shot, bounces on ground with gravity. Cosmetic but sells the gunplay.
- **Dust Clouds** — Movement kicks up dust particles on dirt/sand tiles. Roll creates a larger puff.
- **Death Animations** — Enemies currently just disappear. Add brief dissolve. Western-themed: tumbleweeds blow through on wave clear.
- **Blood & Impact** — Directional blood splats on hit (partially implemented). Wall bullet holes. Wooden crate/barrel destruction.

### 2C. Visual Clarity (New Section)

Adding VFX without a clarity budget will make the game unreadable. With 200+ bullets, muzzle flashes, shell casings, dust clouds, and weather, combat becomes noise.

- **Player vs. Enemy Bullet Distinction** — Different colors, shapes, or trails. Fundamental bullet-hell requirement.
- **Offscreen Threat Indicators** — Edge-of-screen directional arrows for incoming threats (like Vampire Survivors' red arrows). Essential once arenas get crowded.
- **Visual Priority System** — Rules for which effects render on top and which get culled when the screen is busy. Effects budget per frame.
- **Colorblind Palette Options** — The game relies on color coding for item rarity, objective entities, and enemy telegraphs. Provide alternative palettes.
- **Screen Shake Intensity Slider** — Accessibility option. Some players get motion sick from trauma-based screen shake.

### 2D. Juice Improvements

- **Weapon-Specific Recoil Feel** — Revolver: sharp snap-back. Sawed-off: heavy kick with brief slowdown. Pickaxe: forward lunge. Different camera kick profiles per weapon.
- **Kill Streak Effects** — Visual escalation on multi-kills. Screen flash intensifies, XP numbers get larger, brief bullet-time on 5+ streak. Vampire Survivors-style dopamine ramp.
- **Impact Freeze Scaling** — Current hit stop is binary. Scale freeze duration with damage dealt. Headshot/crit = longer freeze. Boss phase transitions = dramatic 0.5s pause.
- **Slow-Mo on Last Enemy** — When the last enemy of a wave dies, brief 0.3s slow-motion with a satisfying sound cue. Sells the "wave clear" moment.
- **Boss Entrance Standoffs** — Before every boss fight, a 3-second standoff moment: camera zooms in, music drops to silence, player waits for a visual cue before drawing. First to fire gets a damage bonus. Thematic, creates tension, minimal implementation cost (camera zoom + input gate + timer).

---

## 3. Systems & Features

### 3A. Onboarding & Accessibility (New Section)

**Tutorial / onboarding is completely absent from the game.** This is ship-blocking. Without it, Steam reviews will say "confusing" and "didn't know what to do."

- **First-Run Tutorial** — 60-90 seconds of guided play. Teach: move, roll, shoot, reload, ability. Isolated scenarios before the first real wave. Enter the Gungeon and Hades both accomplish this in under 90 seconds. Can be a special "first encounter" that only appears on the very first run.
- **Contextual Tooltips** — Non-blocking callouts on first encounter with: stash, camp visitor, side objective, skill tree node, item drop.
- **Practice Range** — From the main menu, let players test weapons and abilities without run pressure. The Prospector's pickaxe+dynamite combo is non-obvious.
- **Difficulty Modes** — An Easy/Story mode that reduces enemy HP and bullet speed by 20-30%. Hades' "God Mode" (gradual damage resistance) is the gold standard. Many players find roguelites too hard; accessibility doesn't diminish the hardcore experience, it broadens the audience.
- **Controller Support** — Twin-stick shooters are native to controllers. For Steam EA launch, a significant percentage of players use gamepads. This is expected, not optional.
- **Settings Menu** — Volume sliders, resolution, fullscreen toggle, key rebinding. Steam players expect these. Missing them generates negative reviews.

### 3B. Meta-Progression & Retention

- **Bounty Board (Between Runs)** — Persistent challenges that unlock content. "Kill 100 enemies with dynamite" unlocks a new Prospector skill variant. Creates a constant drip of unlocks across the first 10-20 hours. Vampire Survivors understood this: every run should unlock something, even if it's small.
- **Bounty Hunting System** — Assign wanted levels to named enemies and minibosses that appear across runs. "Cactus Jack — Wanted Dead or Alive — Reward: 50 Gold." Display bounty targets on a Wanted Board at camp. Cross-run hunting: some bounties only appear in specific stage variants. Ties together Bestiary, named minibosses, and meta-progression in one Western-themed package.
- **Character Mastery** — Per-character unlock track. More Sheriff runs = cosmetic variants + alternative starting loadouts + unlocking new items into the drop pool. Start with Wave 1's 12 items; Bounty Board challenges unlock Wave 2-3 items.
- **Ascension System** — After first clear, unlock stackable difficulty modifiers. +1: enemies have 20% more HP. +5: bosses gain a new attack. +10: no camps. Provides infinite replay ceiling. **This is the post-first-clear retention loop.** Without it, players beat the game once and leave. Dead Cells and Hades proved this is the most important retention mechanic in the genre. (Risk of Rain 2's monsoon/eclipse system.) A basic version (3-5 modifiers + score multiplier) is relatively low-effort.
- **Bestiary** — Codex of encountered enemies with lore entries, stats, and drop tables. Western-themed "Wanted Board" aesthetic.
- **Run History** — Seeded replay system (shared sim is already deterministic). Save run seeds, share with friends.
- **Cosmetics as Progression** — Hat drops after boss kills, weapon skins for Ascension milestones, bullet trail unlocks for Bounty Board completion. Earned through play, not purchased. Most powerful retention tool in roguelites.

### 3C. Endgame Modes

- **Endless Mode** — After beating Stage 3, continue with escalating waves. No camps, no narrative — pure survival. Leaderboard ranked by wave reached. Low effort since wave/encounter system exists.
- **Daily Challenge** — Fixed seed, fixed character, modifier active. Global leaderboard. One attempt per day. The deterministic sim + seeded RNG infrastructure already exists. Primarily UI + leaderboard backend. Creates daily engagement habits and streaming content.
- **Boss Rush** — Fight all 5+ bosses back-to-back with one health bar and camp between each. Start at max level with a curated item selection.

### 3D. Multiplayer Enhancements

- **Co-op Scaling** — Enemy HP, wave size, and boss patterns should scale per player count. Currently hardcoded for single-player balance. 2-player: +50% HP, 4-player: +150% HP, 8-player: +300% HP. _[Invasive — `Health.current` is Float32 but snapshot encoding `clampHP` caps to 255 (Uint8). If co-op scaled HP exceeds 255, the snapshot format needs a breaking change (Uint8 -> Uint16). Boss attack patterns need multi-target moves.]_
- **Revive System** — Downed players can be revived by teammates holding interact. 10s bleed-out timer. _[Invasive — current `Dead` tag is binary. Needs new downed state, interaction hold mechanic, bleed-out timer, and the MultiplayerReconciler must handle downed->revived without desyncing.]_
- **Friendly Fire Policy** — Must decide before launch. Options: none (casual, accessible), optional (toggleable per room), or reduced (25% damage to allies). In a twitchy bullet-hell with 4-8 players, this is a critical design decision.
- **Disconnect / Rejoin** — What happens when a player disconnects mid-run? Can they rejoin? Does their character become AI-controlled? Do their items drop? Does difficulty scale back down? Ship-blocking for multiplayer launch.
- **Shared vs. Split Loot** — Options: personal loot per player, shared pool with draft picks, free-for-all. Recommendation: draft picks at camp (each player picks from a shared pool in rotation). Free-for-all is a grief vector.
- **Ping System** — Ping enemy (marks target), ping location (waypoint), danger ping. Essential for public matchmaking.
- **Quick Play Matchmaking** — "Quick Play" button that matches players at similar stage. Queue with character preference.
- **Private Lobby Codes** — Essential for a co-op game. Friends need to play together without public matchmaking.
- **Camp Pacing in Multiplayer** — One player browsing the skill tree while seven wait is frustrating. Needs: ready check, timer cap (90s max then auto-proceed), parallel interaction (all players interact with visitor/skill tree simultaneously).
- **Anti-Grief Measures** — Vote-kick, AFK detection, item hoarding prevention, report system.
- **Post-Run Stats** — Comparative stats screen: damage dealt, enemies killed, objectives completed, items collected.

### 3E. Camp Expansion

- **Tinkerer Visitor** — Offers weapon evolutions for gold. Specific item combinations unlock evolution options.
- **Shaman Visitor** — Offers powerful run modifiers with downsides. Risk/reward decisions.
- **Bounty Board Interaction** — Show upcoming stage preview, let players spend gold to reroll the boss.
- **Campfire Stories** — Brief procedural narrative vignettes. NPC travelers share rumors about the upcoming stage.

---

## 4. Western Theme Opportunities

The Western theme should be a design pillar, not aesthetic wallpaper. These ideas specifically leverage the setting.

- **Boss Entrance Standoffs** — (Also in 2D.) 3-second standoff before every boss. Camera zooms, music drops, wait for visual cue to draw. First-fire advantage. Zero-cost Western flavor that creates memorable moments.
- **Quick-Draw Duel Mechanic** — Expand the duel objective into a standalone mechanic and daily challenge variant. Classic Western draw: wait for the signal, first to fire wins. Reaction-time test with build-specific bonuses.
- **Bounty Hunting** — (Also in 3B.) Named enemies with bounty posters on the Wanted Board at camp. Cross-run hunting with specific spawn conditions.
- **Horse Mechanics** — Horses appear in post-boss looting phase already. Expand: mounted combat segment between stages (shoot at pursuers while riding, simpler than scrolling arena), horse-call ability for the Native Scout (brief mounted charge that knocks enemies aside).
- **Saloon Stage Variant** — Multi-level interior with balcony, stairs, chandelier. Tables as flippable cover, bar bottles as throwables. Combines jump mechanic with height advantage.
- **Lasso as Player Mechanic** — Beyond just an enemy attack. Item: "Lawman's Lasso" (on roll through enemy, briefly roots them). Stage interaction: lasso a post to swing over gaps.
- **Posse System** — In multiplayer, the group is a "posse." Posse bonuses for recurring groups (shared XP boost). Visual role indicators (Tank/DPS/Support mapped to character).

---

## 5. Game Design Ideas

### 5A. Mechanical Depth

- **Environmental Interactions** — Shoot barrels to explode them (area damage). Shoot chandeliers to drop on enemies. Kick open doors for a stun. Stage objectives doc already describes shooting water troughs. Implementing 2-3 basic interactables (explosive barrel, breakable crate, flippable table) would dramatically improve game feel.
- **Ricochet Bullets** — Bullets that bounce off walls once. Skill expression through bank shots around cover. Could be a skill node or item effect. _[Moderate difficulty — localized to bulletCollision.ts but needs correct reflection math off tilemap AABBs, including corner cases.]_
- **Graze System** — Reward near-misses with small XP/damage bonus. Encourages aggressive positioning. Inspired by Touhou. _[Low difficulty but determinism risk — "near miss" definition must be consistent between client prediction and server.]_
- **Execution Mechanic** — Staggered enemies can be "executed" with melee input for bonus damage + guaranteed drop. Risk/reward: must get close. Inspired by DOOM's glory kills.
- **Weapon Switching** — Find secondary weapons during runs. Swap between two with a keybind. _[Moderate-high difficulty — no weapon inventory concept. Weapon stats are encoded directly into Weapon component SoA arrays 1:1 with entity ID. UpgradeState derives weapon stats from skill tree — supporting two derivation paths is complex.]_

### 5B. Progression Feel

- **Power Curve Landmarks** — Design specific moments where the player feels a dramatic power spike. Level 5 should feel noticeably different from level 4. Camp 1 skill point should open up a new capability, not just +5% damage. This is a Tier 0 design concern.
- **Synergy Discovery** — Track which item+skill combinations players find. Show a "synergy journal" that fills out. Collectionist meta-goal.
- **Death Screen Design** — What the player sees when they die determines whether they click "Try Again" or close the game. Show: what killed them, distance to personal best, what they almost unlocked, teaser of a different character/build. "Try Again" should be the biggest button.
- **Chase Items** — A "Legendary" tier above Gold. One item per character, appears once every 15-20 runs, fundamentally changes the character. Example: "The Colt's Ghost" for Sheriff — revolver fires phantom bullets that pass through walls. Gives veteran players something to hunt.

### 5C. Social & Community

- **Seed Sharing** — "Try my run" feature. Share a seed + character combo, compare outcomes.
- **Build Sharing Cards** — Export a full run summary (character, skill tree, items, stages cleared, cause of death) as a shareable image suitable for Discord/Twitter. Marketing content that players create for free.
- **Discord Rich Presence** — Show "Playing High Noon — Stage 2, Sheriff, Ascension 3" in Discord status. Low effort, high visibility.
- **Clip-Worthy Moments** — The Showdown slow-mo multi-kill is inherently clip-worthy. Design for the clip. Every clip shared on social media is free marketing. Consider a "Share This Kill" button on the death screen using the deterministic replay system.
- **Weekly Leaderboards** — Per character, per Ascension level. Simple, low-effort, high-retention.
- **Community-Voted Modifiers** — Each week the community votes on a Weekly Challenge modifier. "This week: all enemies are invisible until they attack." Creates social content.

---

## 6. Technical & Code Quality

### 6A. Performance

- **Spatial Interest Management** — Currently all entities are sent to all clients. Implement view-distance culling: only replicate entities within ~1.5 screens of each player. The Colyseus room model doesn't natively support this; needs per-client snapshot filtering in `broadcastSnapshot()` and per-client bullet event filtering. **Directly gates 8-player viability.**
- **Texture Atlas Consolidation** — Many individual PNG loads. With 12+ enemy types each having multi-direction multi-state animations, potentially 500+ texture lookups. Each unique texture breaks PixiJS batching and adds a draw call. **Should be Tier 0 with 6+ distinct enemy types on screen.**
- **Replace Graphics with Sprites** — Enemy circles and health bars use Graphics objects (clear + fill path), which can't batch with sprites. Replace with tiny 1-pixel white textures scaled and tinted. Higher impact than render culling.
- **Render Culling** — Don't render sprites outside the camera viewport. Simple AABB check. At 2.75x zoom and ~700x390px viewport, offscreen entities are a minority. PixiJS v8 already culls at the GPU level. The JS-side savings (~0.1-0.2ms for 250 entities) are real but not ship-blocking.
- **Object Pooling / Entity ID Recycling** — `MAX_ENTITIES = 10000` with sequential IDs that are never recycled means a long run creating/destroying thousands of bullets will exhaust the entity space. **This is a correctness crash bug, not a performance optimization.** Needs a recycling mechanism.
- **Profiling Dashboard** — In-game overlay showing FPS, entity count, bullet count, render time, sim tick time. Toggle with F3.

### 6B. Code Architecture

- **Config Validation** — Enemy stats, weapon balance, encounter definitions are trusted at face value. Add runtime assertions on game world creation to catch config errors (negative HP, zero-speed bullets, impossible wave budgets). Small investment, prevents an entire category of bugs as content scales. **Should be Tier 0.**
- **System Dependency Graph** — Document and enforce system execution order. Currently implicit. A `SystemSchedule` with dependency declarations would catch ordering bugs at startup. A single ordering mistake (e.g., damage resolution before bullet collision) causes subtle bugs that differ between single-player and multiplayer.
- **Entity Lifecycle / Memory Leak Audit** — GameWorld has 30+ Maps/Sets keyed by entity ID. When entities are removed, cleanup depends on each system remembering to delete entries. No `onEntityRemoved` hook. Maps like `lastDamageByEntity`, `bulletPierceHits`, `rollDodgedBullets` accumulate stale entries for recycled IDs. Real leak vector that worsens over long sessions.
- **Content Registry Pattern** — Enemy definitions are spread across multiple files with no cross-reference validation. Adding a new enemy requires updating ENEMY_COLORS, ENEMY_SPRITE_ID, ENEMY_SPRITE_SCALE, spawnEnemy dispatch, and more — with no compile-time guarantee of completeness. Need a content manifest that validates referential integrity.
- **GameRoom Deduplication** — 148-line duplication in `sendHudUpdates` vs `sendHudToClient`. Real maintenance hazard but not player-facing.
- **React Anti-Pattern Fix** — Side effects in state setter in `MultiplayerGame.tsx`.
- **Shared Package API Surface** — The shared package exports everything. Define a clear public API. Internal systems shouldn't be importable by client/server directly.
- **Test Coverage for Bosses** — Bosses have complex multi-phase AI but limited test coverage. Add integration tests that simulate full boss fights.
- **Snapshot Protocol Extensibility** — Format is versioned (SNAPSHOT_VERSION = 10) but not extensible. Every new entity type or replicated state requires a format change and client/server version lock-step deployment. Boss telegraphs, trap zones, weather effects, and more are either in HUD JSON or not replicated at all.

### 6C. Networking

- **HUD JSON Optimization** — HUD updates re-send entire skill tree, items, narrative text, camp visitor data at 10Hz even when nothing changed. Delta encoding or dirty-flag gating would cut HUD bandwidth by 80%+. **Highest-impact bandwidth optimization** — HUD JSON payloads are 2-4KB each, adding 20-40KB/s per client.
- **Bandwidth Profiling** — Estimated total outbound at 8 players: ~700KB/s (snapshots ~320KB/s, bullet events ~72KB/s, HUD ~320KB/s). For a cloud VM with 100Mbps outbound, scales to ~14 simultaneous rooms before bandwidth bottleneck.
- **Dynamic Tick Rate** — Reduce server tick rate during low-action phases (camp, between waves). Saves server CPU.
- **Lag Compensation Visualization** — Debug mode showing server vs. client player positions.
- **Replay System** — Record all inputs per-tick. Allow replaying runs client-side. Foundation for spectator mode, killcams, "how did I die?" review.

### 6D. Developer Experience

- **Visual Debug Tools** — Render collision radii, AI state labels, detection ranges, attack arcs as toggleable overlays. Foundational for debugging every future feature — every new enemy, boss, item, and system will be easier to build, test, and balance. **Should be Tier 0.**
- **Client-Side Error Boundary** — No crash reporting infrastructure exists. A crash in the game loop, renderer, or scene controller silently breaks the game. Add Sentry/LogRocket or equivalent. Ship-blocking for EA — you cannot diagnose player-reported bugs without crash telemetry.
- **CI/CD Pipeline** — No automated testing on push. With 80+ test files across packages, tests should run on every commit. Add automated builds and deployment infrastructure.
- **Deterministic Simulation Verification** — The `DESYNC_CHECK` flag in GameRoom.ts suggests desync detection exists but is gated. Need automated determinism regression tests: record input sequences, verify hash reproducibility across builds.
- **Asset Loading Failure Handling** — No fallback texture or graceful degradation if an asset fails to load. CDN failures or cache misses crash the renderer. Add missing-texture placeholder and error reporting.
- **Hot Reload for Shared** — Changing shared code requires rebuild + restart. Explore HMR for balance tweaks.
- **Balance Spreadsheet Export** — Auto-generate spreadsheet of weapon/enemy/item stats from code. Makes balance review easier.
- **Bot Client for Stress Testing** — Bots that play through full runs, exercising all systems. Run overnight to catch rare crashes.
- **Encounter Editor** — Visual tool for designing wave compositions. Currently hand-edited TypeScript.

---

## 7. Operations & Business

### 7A. Launch Preparation

- **Steam Early Access** — The 3-stage campaign with 3 characters is enough for EA. Regular content updates, community feedback loop, transparent development.
- **Demo Build (Steam Next Fest)** — Highest marketing priority pre-launch. First stage only, Sheriff only, cliffhanger ending. A good Next Fest generates 10,000-50,000 wishlists.
- **Achievement System** — Steam achievements mapped to Bounty Board goals.
- **Steam Integration** — Cloud saves, store page assets, screenshots, store page copywriting.
- **Basic Analytics at Launch** — At minimum: crash reporting and basic funnel data (players who start a run, reach stage 2, reach stage 3, complete a run). Flying blind during the most critical feedback window is unacceptable.
- **Pricing** — $12.99-$14.99 for Early Access, $19.99 at 1.0. The multiplayer component and character depth justify a higher price than Vampire Survivors ($4.99) or Brotato ($4.99). Premium, not F2P — a small team can't operate a F2P game. 10-15% launch discount. Participate in every Steam sale.
- **Marketing Materials** — 15-second GIF of Showdown ability. Lead with "co-op roguelite" in the store description. Show all three characters' signature moves in the trailer. Boss encounters sell roguelites — show them.
- **Press/Influencer Strategy** — Send demo keys to 20 targeted streamers who cover: Western games, roguelites, indie co-op. This matters more than the next 3 features you build.

### 7B. Content Pipeline

- **Seasonal Content** — Themed events every 2-3 months. "Dead of Winter" (snow maps, ice enemies). "Devil's Night" (Halloween horror). Low-effort high-impact.
- **Community Challenges** — Weekly global goals. "Kill 1 million swarmers this week." Reward: cosmetic for everyone.
- **In-Game News Feed / Patch Notes** — Players who launch the game should see what changed since they last played. Communicate with players not in Discord.
- **Modding API** — Expose content definitions as data files. _[Very high difficulty — content is TypeScript constants compiled into the shared package, not runtime-loadable data. Behavioral hooks use arbitrary functions via HookRegistry. Needs sandboxed execution, schema validation, deterministic loading on client+server. A 3-6 month project. Only build once community demands it. Tier 4+.]_

### 7C. Monetization

- **DLC Expansions** — New characters with full skill trees. New stage packs (3 stages each). New narrative threads. Meaty paid content drops.
- **Cosmetic Skins** — Character skins, weapon skins, bullet trail effects (animated bullet system already built!), custom death effects. No gameplay advantage. Earned through play for retention; premium skins for revenue.
- **Battle Pass** — Only if the game goes F2P. Not appropriate for a premium title.

### 7D. Streaming & Community

- **Twitch Integration** — Audience-voted modifiers, audience-controlled enemy spawns, channel point redemptions. Table stakes for roguelites targeting the streaming audience in 2026.
- **Built-In Clip Export** — Deterministic replay enables this cheaply: save last 30s of inputs, replay with cinematic camera, render to GIF/video.
- **Spectator-Friendly UI** — Health bars, cooldowns, and item icons should be readable at streaming resolutions (1080p scaled to small window).

---

## 8. Priority Tiers

### Tier 0: Ship-Blocking (Do Before EA Launch)

- Sound effects (gunshots, impacts, deaths, UI)
- Music (3-4 looping tracks: menu, combat, boss, camp)
- Tutorial / onboarding (60-90 second first-run flow)
- Co-op scaling (multiplayer is a selling point)
- Muzzle flash (1-2 hours, guns must flash)
- Config validation (runtime assertions on world creation)
- Visual debug tools (collision radii, AI states, detection ranges)
- Client-side error boundary / crash reporting
- Settings menu (volume, resolution, fullscreen, key rebinding)
- Controller support
- Basic analytics / funnel telemetry
- Friendly fire policy decision
- Disconnect / rejoin behavior
- Entity ID recycling fix (crash bug at 10,000 entities)
- Death screen with "one more run" hooks
- Power curve landmark review

### Tier 1: First Content Update (Month 1-2 Post-EA)

- Powder Keg Nell boss
- Miniboss system (best cost-to-impact ratio)
- Wave 2 items (8-10 items including cursed + consumables)
- Environmental interactions (explosive barrels, breakable crates)
- 2 more narrative threads
- Ascension system (basic: 3-5 modifiers + score multiplier)
- Daily challenge
- Endless mode
- Boss entrance standoffs / duel mechanic
- Bounty Board + bounty hunting system
- Inter-run NPC continuity (narrative retention engine)
- Shell casings + dust clouds + death animations
- Render culling
- System dependency graph enforcement
- Entity lifecycle / memory leak audit
- HUD JSON optimization (delta encoding)
- Spatial interest management
- Texture atlas consolidation
- CI/CD pipeline

### Tier 2: Major Update (Month 3-4)

- New character (The Outlaw)
- Stage 4: Ghost Town
- Stage map variants (2-3 per existing stage)
- Weapon evolutions via Tinkerer
- Boss Rush mode
- Revive system for co-op
- Adaptive music system
- Weather system
- Ping system + quick play matchmaking
- Private lobby codes
- Character mastery + cosmetic progression
- Ricochet bullets
- Positional audio
- GameRoom code dedup + React anti-pattern fix
- Snapshot protocol extensibility review
- Content registry pattern

### Tier 3: Long-Term Vision (Month 6+)

- The Native Scout character
- Difficulty modes / Story mode
- The Preacher's Congregation boss
- Set bonuses
- Dynamic map events
- Replay / spectator system
- Seed sharing + leaderboards + ghost runs
- Community challenges + seasonal content
- Twitch integration
- Horse mechanics expansion
- Saloon stage variant
- Modding API
- Build sharing cards

### Deferred / Requires Further Design

- The Gambler character (high balance risk, deprioritize)
- Train Robbery scrolling arena (requires engine rewrite of spatial hash, flow field, collision)
- Wendigo / Skinwalker boss (requires modular boss refactor)
- Vertical arenas (requires engine rewrite of tilemap, collision, snapshot protocol)
- A/B testing framework (insufficient player volume for statistical significance)
- Weapon switching (major ECS architecture change)

---

_This document is a living brainstorm. Items are not commitments. Priority tiers reflect current thinking — informed by game design, technical feasibility, and strategic review — and will shift based on player feedback post-launch._
