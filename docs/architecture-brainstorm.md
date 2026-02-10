## Current Implementation Status (2026-02-10)

This file contains architecture brainstorming and external references.

For the architecture currently implemented in the client runtime, use:

- `docs/core-scene-system.md` (current system design and data flow)
- `docs/core-scene-migration.md` (migration summary and API mapping)
- `packages/client/src/scenes/README.md` (code-adjacent scene overview)

Current runtime direction in short:

- One public gameplay scene API: `CoreGameScene`
- Mode-specific behavior behind `SceneModeController`
- Shared scene-core modules for feedback/simulation parity between singleplayer and multiplayer
- Fixed update + decoupled render pipeline, with multiplayer prediction/reconciliation/interpolation in the multiplayer controller

---

## 1) The architecture that tends to work best

### Authoritative server + client prediction for _your_ player

For a twitchy top-down roguelite, you usually want:

- **Authoritative server** (prevents cheating and resolves collisions consistently)
- **Client-side prediction + server reconciliation** for the local player (keeps controls snappy even with 50–150ms RTT) ([Gabriel Gambetta][1])
- **Snapshot interpolation** for _remote_ players (keeps them smooth without pretending you know the future) ([Gaffer On Games][2])

This is the classic “I predict myself, I interpolate everyone else” split, and it’s still the sweet spot.

### Fixed-timestep simulation, render as fast as you can

Run your simulation at a fixed tick (e.g. 60 Hz), regardless of render FPS. It makes networking, collision, and replays dramatically easier. ([Gaffer On Games][3])

### Don’t replicate every bullet position

Bullet-hell style games explode entity counts. The trick is:

- Replicate **authoritative outcomes** (damage, deaths, pickups)
- Replicate **spawn events** (enemy spawned, bullet pattern fired) with IDs/seeds
- Let clients simulate **transient entities** (bullets/particles) locally from spawn events

This cuts bandwidth hard and makes your server cheaper.

---

## 2) Stack recommendations (libraries + integrations)

### Client (browser)

- **PixiJS v8 + Vite** for a fast modern setup ([pixijs.com][4])
- Spritesheets/atlases via **TexturePacker** workflow (Pixi v8-focused tutorial exists) ([codeandweb.com][5])
- Audio: **howler.js** (battle-tested in web games) ([howlerjs.com][6])
- Data-oriented gameplay: **bitECS** if you expect lots of bullets/enemies and want cache-friendly iteration ([GitHub][7])

Optional:

- If you _want_ React UI surrounding the canvas, `@pixi/react` is production-oriented and supports Pixi v8 ([GitHub][8])

### Transport choices

- **WebSocket**: simplest, debuggable, works everywhere, good for authoritative servers ([MDN Web Docs][9])
- **WebRTC data channels**: useful for P2P, but adds NAT traversal + host migration + cheating concerns; still viable if you’re intentionally building P2P ([MDN Web Docs][10])
- **Socket.IO**: can help with reconnection/fallback, but it’s extra layering; for games you often prefer raw WebSocket unless you need its features ([socket.io][11])

### Server framework options (authoritative rooms)

**Option A (recommended for your situation):** Colyseus

- Room-based architecture, server authoritative positioning, built-in state sync and matchmaking concepts ([docs.colyseus.io][12])
- Schema-based state sync; only decorated fields sync; good for “small authoritative state + events” designs ([docs.colyseus.io][13])
- Practical gotcha: TypeScript decorator config matters (`useDefineForClassFields: false`) ([docs.colyseus.io][14])

**Option B:** Heroic Labs (Nakama)

- If you want **accounts, parties, matchmaking, chat, leaderboards** in one stack, Nakama is strong; it supports authoritative multiplayer matches conceptually ([Heroic Labs][15])
- More “platform” than “game room framework,” so you’ll still design your match loop and state format.

**Option C:** Cloudflare Durable Objects

- A single Durable Object instance can coordinate multiple WebSocket clients (explicitly mentioning chat rooms / multiplayer games) ([Cloudflare Docs][16])
- Great if you want “room as a stateful edge object,” but you implement more yourself than Colyseus.

**Hosting note:** for twitch games, being able to run game rooms near players matters more than almost anything else. If you don’t want to build orchestration early, start single-region, then add multi-region later.

---

## 3) Proposed code architecture (monorepo + modules)

### High-level shape

**Monorepo** so client/server/shared always compile together.

```
/game
  /packages
    /shared        # deterministic sim core, protocol, content
    /client        # Pixi rendering, input, prediction, UI
    /server        # authoritative match loop + rooms + matchmaking
    /tools         # asset pipeline scripts, export validators, build steps
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
```

### `packages/shared` (the “game”)

Goal: **everything gameplay-critical lives here** (so it can run on server and, optionally, client for prediction/replays).

**Key modules**

- `sim/`
  - `world.ts` — ECS world, entity IDs, component storage
  - `systems/` — movement, collisions, weapons, AI, pickups
  - `step.ts` — fixed timestep stepping (tick accumulator)
  - `rng.ts` — seeded RNG (for deterministic spawns/patterns)
  - `content/` — weapon/enemy/item definitions (data-driven)

- `net/`
  - `protocol.ts` — message types + versioning
  - `serialize.ts` — encode/decode (binary recommended)
  - `events.ts` — “spawn bullet”, “play sfx”, “damage dealt”, etc.

- `math/`
  - `vec2.ts`, quantization helpers (`toNetInt`, `fromNetInt`)

- `replay/`
  - record inputs + seeds → deterministic replay tests

**Pattern to copy everywhere:** treat gameplay updates as **pure-ish systems over data**, with side-effects expressed as **events**.

### `packages/server` (authoritative match loop)

If you use Colyseus, each match is a Room.

**Core responsibilities**

- Accept players; assign `playerId`
- Run fixed tick loop (e.g. 60 Hz) ([Gaffer On Games][3])
- Consume inputs (per-player ring buffers)
- Step `shared/sim`
- Emit:
  - **authoritative state** (small!)
  - **events** (spawns, hits, item rolls, room transitions)

- Validate inputs (rate limits, sanity bounds)

**Server structure**

- `rooms/`
  - `MatchRoom.ts` — glue between Colyseus room + shared sim
  - `schema/RoomState.ts` — _minimal_ sync state (players HP, key enemies, run seed, etc.) ([docs.colyseus.io][13])

- `match/`
  - `matchLoop.ts` — tick scheduling + perf monitoring
  - `inputBuffer.ts` — seq/ack handling
  - `interest.ts` — optional: only send nearby entities

- `services/` (optional)
  - matchmaking, party codes, persistence

**Important design constraint:** Keep the “schema synced state” small; use explicit messages for the rest. Colyseus is great at syncing _structures_, but you don’t want “10,000 bullets in room state.”

### `packages/client` (Pixi + prediction + interpolation)

**Client responsibilities**

- Render at requestAnimationFrame
- Run local fixed-step sim for prediction (local player only), or run a “visual sim” that consumes server events
- Interpolate remote players/entities based on snapshots ([Gaffer On Games][2])
- Input collection → send `InputCmd` with `seq` numbers
- Reconciliation: on authoritative correction, rewind your player and reapply unacked inputs ([Gabriel Gambetta][1])

**Client structure**

- `engine/`
  - `GameApp.ts` — Pixi Application + root container
  - `SceneManager.ts` — boot/menu/lobby/run scenes
  - `FixedStep.ts` — timestep accumulator

- `net/`
  - `NetClient.ts` — connect/join/reconnect
  - `ClockSync.ts` — ping/estimate serverTickOffset
  - `Prediction.ts` — local player prediction & reconcile
  - `Interpolation.ts` — remote entity smoothing buffer

- `render/`
  - `SpriteRegistry.ts` — maps entity → sprite
  - `RenderSystem.ts` — reads sim state and positions sprites
  - `FxSystem.ts` — particles, screenshake, shader hooks

- `ui/`
  - `Hud.ts`, `Lobby.ts`, `DamageNumbers.ts`

- `assets/`
  - `AssetLoader.ts` — atlas, sounds, fonts

---

## 4) Concrete networking model (message design)

### Transport

Use **WebSocket** for the match connection (fast path, simplest). ([MDN Web Docs][9])

### Tick + rates (reasonable defaults)

- Simulation: **60 Hz**
- Input send: **60 Hz** (tiny packets)
- Server snapshot/state update: **10–20 Hz**
- Interpolation buffer: start around **100–150ms**, tune (Gaffer’s rule of thumb scales with send rate and packet loss) ([Gaffer On Games][2])

### Message types (minimal + scalable)

**Client → Server**

- `InputCmd { seq, clientTick, buttonsBitset, aimAngleQ, moveVecQ }`
- `AckSnapshot { lastSnapshotTick }` (optional)

**Server → Client**

- `Snapshot { serverTick, players[], keyEnemies[], runMeta }` (small, quantized)
- `Events[]` (variable length)
  - `SpawnBullet { id, kind, posQ, velQ, seed }`
  - `SpawnEnemy { id, archetype, posQ, seed }`
  - `Damage { targetId, amount, sourceId, serverTick }`
  - `Pickup { id, itemKey }`

### Why this split works

- Players and a few “important” enemies stay authoritative and smooth.
- Bullets/patterns are driven by spawn events, not replicated transforms.
- Outcomes are authoritative (damage/death), so clients can’t lie.

---

## 5) Development sequence that avoids rewrites

1. **Single-player run** using the _shared sim core_ + Pixi renderer.
2. Add deterministic seeds + data-driven content.
3. Add server and make client a thin renderer of server state (no prediction yet).
4. Add **client prediction + reconciliation** for local player movement. ([Gabriel Gambetta][1])
5. Move bullets to event-driven spawn simulation (bandwidth win).
6. Add matchmaking/lobbies (either Colyseus matchmaker patterns or Nakama if you want a full platform). ([colyseus.io][17])

---

## If you want one “default pick” stack

- Pixi v8 + Vite ([pixijs.com][4])
- bitECS for gameplay entities ([GitHub][7])
- howler.js for audio ([howlerjs.com][6])
- Colyseus authoritative rooms + WebSocket transport ([docs.colyseus.io][12])
- Fixed timestep loop ([Gaffer On Games][3])
- Client prediction/reconciliation + snapshot interpolation ([Gabriel Gambetta][1])

---

[1]: https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html?utm_source=chatgpt.com "Client-Side Prediction and Server Reconciliation"
[2]: https://gafferongames.com/post/snapshot_interpolation/?utm_source=chatgpt.com "Snapshot Interpolation"
[3]: https://gafferongames.com/post/fix_your_timestep/?utm_source=chatgpt.com "Fix Your Timestep!"
[4]: https://pixijs.com/8.x/guides/getting-started/quick-start?utm_source=chatgpt.com "Quick Start"
[5]: https://www.codeandweb.com/texturepacker/tutorials/how-to-create-sprite-sheets-and-animations-with-pixijs?utm_source=chatgpt.com "How to create sprite sheets & animations for PixiJS 8"
[6]: https://howlerjs.com/?utm_source=chatgpt.com "howler.js - JavaScript audio library for the modern web"
[7]: https://github.com/NateTheGreatt/bitECS?utm_source=chatgpt.com "NateTheGreatt/bitECS: Flexible, minimal, data-oriented ..."
[8]: https://github.com/pixijs/pixi-react?utm_source=chatgpt.com "pixijs/pixi-react: Write PIXI apps using React declarative style"
[9]: https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API?utm_source=chatgpt.com "The WebSocket API (WebSockets) - Web APIs - MDN Web Docs"
[10]: https://developer.mozilla.org/en-US/docs/Games/Techniques/WebRTC_data_channels?utm_source=chatgpt.com "WebRTC data channels - Game development - MDN Web Docs"
[11]: https://socket.io/docs/v4/?utm_source=chatgpt.com "Introduction | Socket.IO"
[12]: https://docs.colyseus.io/?utm_source=chatgpt.com "Introduction – Colyseus"
[13]: https://docs.colyseus.io/state?utm_source=chatgpt.com "State Synchronization"
[14]: https://docs.colyseus.io/faq?utm_source=chatgpt.com "FAQ"
[15]: https://heroiclabs.com/docs/nakama/client-libraries/javascript/?utm_source=chatgpt.com "Nakama JavaScript Client Guide"
[16]: https://developers.cloudflare.com/durable-objects/best-practices/websockets/?utm_source=chatgpt.com "Use WebSockets · Cloudflare Durable Objects docs"
[17]: https://colyseus.io/framework/?utm_source=chatgpt.com "Open-source Multiplayer Framework for Games"
