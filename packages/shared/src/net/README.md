# net/

Network protocol definitions and serialization.

## Responsibilities

- Message type definitions (client→server, server→client)
- Binary serialization/deserialization
- Event type definitions
- Shared HUD derivation helpers (`hud.ts`) used by client and server
- Protocol versioning

## Runtime Message Types

### Client → Server (Colyseus room messages)

- `input` - `NetworkInput` (`seq` + `clientTick` + `clientTimeMs` + `estimatedServerTimeMs` + `viewInterpDelayMs` + `shootSeq` + buttons + aim/move/cursor)
- `ping` - clock sync ping payload
- `request-game-config` - explicit config re-sync after reconnect
- `set-character` - lobby character selection
- `set-ready` - lobby ready/unready toggle
- `set-camp-ready` - camp ready/unready toggle between stages (multiplayer stage progression)

### Server → Client

- `game-config` - room seed + authoritative player/character identity (optionally includes full roster)
- `player-roster` - authoritative player roster (`eid` + `characterId`) for remote presentation parity
- `snapshot` - authoritative world snapshot (binary)
- `bullet-spawn` / `bullet-despawn` - reliable ordered lifecycle events for server projectiles (enemy/boss)
- `shot-result` - authoritative per-shot hit confirmation for local shooter feedback
- `hud` - HUD data derived from authoritative local player state
- `interactables` - low-frequency world interactables (salesman, stashes, item pickups, HP potion pickups)
- `select-node-result` - authoritative node selection response
- `pong` - clock sync pong payload
- `incompatible-protocol` - protocol/version mismatch message; client should disconnect and reload

Lobby metadata (`phase`, `players` with name/character/ready, `serverTick`) is synced through Colyseus room schema state and surfaced client-side as `LobbyState`.

## Input Timing and Lag Compensation

`NetworkInput.clientTick` is the client's local prediction tick for that input sample. `estimatedServerTimeMs` is the client's clock-synced estimate of server time at sample time, and `viewInterpDelayMs` tells the server how far behind remote entities were rendered on that frame.

For SHOOT inputs, the server computes hitscan rewind age from:
- one-way latency estimate (`now - estimatedServerTimeMs`)

`viewInterpDelayMs` and queue depth are still reported for telemetry/debug, but are not added to rewind age (to avoid over-rewinding and double-counting queued age). Total age is converted to ticks with nearest-rounding, then clamped to the rewind window. If timing metadata is unavailable, the server falls back to client-tick mapping.

## Binary Snapshots

`snapshot.ts` implements zero-allocation binary decode plus low-allocation encode for authoritative player/enemy + ability state. The server broadcasts snapshots at 20Hz (every 3rd tick). `encodeSnapshot` returns an owned `Uint8Array`, so callers can safely reuse the encoded bytes for multiple sends.

Current snapshot protocol (`SNAPSHOT_VERSION = 12`) includes:

- Player: `x/y`, jump height `z`, jump vertical velocity `zVelocity`, aim/state/hp
- Player flags: `Dead`, `Invincible`, `rollButtonWasDown`, `jumpButtonWasDown`
- Roll reconciliation payload: elapsed/duration/direction
- Enemy authoritative state (type/hp/AI/target)
- Last Rites zones and dynamite throws

Server-owned projectiles are transported out-of-band via `bullet-spawn` / `bullet-despawn` messages to reduce snapshot payload size and improve interpolation stability.

## HUD Derivation

`hud.ts` defines `HudData` plus `deriveAbilityHudState()`, a shared helper for ability labels/cooldowns/timers. Single-player HUD, multiplayer HUD fallback, and server HUD payload generation all call this helper to keep parity.

## Serialization

Binary encoding is used for bandwidth efficiency:
- Quantize floats to integers where precision allows
- Use bitfields for boolean flags
- Reuse the scratch encode buffer internally before slicing the final packet

## Dependencies

- `../math` - Quantization helpers
- `../sim` - Component definitions for snapshot encoding

## Dependents

- `../sim` - Uses event types
- `@high-noon/client` - Message encoding/decoding
- `@high-noon/server` - Snapshot broadcast, message encoding/decoding
