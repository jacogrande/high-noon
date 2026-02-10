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

- `input` - `NetworkInput` (seq + buttons + aim/move/cursor)
- `ping` - clock sync ping payload
- `request-game-config` - explicit config re-sync after reconnect

### Server → Client

- `game-config` - room seed + authoritative player/character identity (optionally includes full roster)
- `player-roster` - authoritative player roster (`eid` + `characterId`) for remote presentation parity
- `snapshot` - authoritative world snapshot (binary)
- `hud` - HUD data derived from authoritative local player state
- `pong` - clock sync pong payload

## Binary Snapshots

`snapshot.ts` implements zero-allocation binary encode/decode for full entity state. The server broadcasts snapshots at 20Hz (every 3rd tick). `encodeSnapshot` returns a `Uint8Array` view into a shared buffer, so callers must consume or copy bytes before the next encode call.

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
