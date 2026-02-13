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
- `hud` - HUD data derived from authoritative local player state
- `pong` - clock sync pong payload
- `incompatible-protocol` - protocol/version mismatch message; client should disconnect and reload

Lobby metadata (`phase`, `players` with name/character/ready, `serverTick`) is synced through Colyseus room schema state and surfaced client-side as `LobbyState`.

## Input Timing and Lag Compensation

`NetworkInput.clientTick` is the client's local prediction tick for that input sample. `estimatedServerTimeMs` is the client's clock-synced estimate of server time at sample time, and `viewInterpDelayMs` tells the server how far behind remote entities were rendered on that frame.

The server subtracts `viewInterpDelayMs` from `estimatedServerTimeMs`, converts that perceived-shot time into a bounded rewind tick window, and falls back to client-tick mapping when clock sync data is unavailable.

## Binary Snapshots

`snapshot.ts` implements zero-allocation binary encode/decode for full entity state. The server broadcasts snapshots at 30Hz (every 2nd tick). `encodeSnapshot` returns a `Uint8Array` view into a shared buffer, so callers must consume or copy bytes before the next encode call.

Current snapshot protocol (`SNAPSHOT_VERSION = 6`) includes:

- Player: `x/y`, jump height `z`, jump vertical velocity `zVelocity`, aim/state/hp
- Player flags: `Dead`, `Invincible`, `rollButtonWasDown`, `jumpButtonWasDown`
- Roll reconciliation payload: elapsed/duration/direction
- Bullet and enemy authoritative state

## HUD Derivation

`hud.ts` defines `HudData` plus `deriveAbilityHudState()`, a shared helper for ability labels/cooldowns/timers. Single-player HUD, multiplayer HUD fallback, and server HUD payload generation all call this helper to keep parity.

## Serialization

Binary encoding is used for bandwidth efficiency:
- Quantize floats to integers where precision allows
- Use bitfields for boolean flags
- Shared buffer reuse to avoid per-frame allocation

## Dependencies

- `../math` - Quantization helpers
- `../sim` - Component definitions for snapshot encoding

## Dependents

- `../sim` - Uses event types
- `@high-noon/client` - Message encoding/decoding
- `@high-noon/server` - Snapshot broadcast, message encoding/decoding
