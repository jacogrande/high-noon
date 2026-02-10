# net/

Network protocol definitions and serialization.

## Responsibilities

- Message type definitions (client→server, server→client)
- Binary serialization/deserialization
- Event type definitions
- Shared HUD derivation helpers (`hud.ts`) used by client and server
- Protocol versioning

## Message Types

### Client → Server

- `InputCmd` - Player input (buttons, aim angle, movement vector, debug flags)
- `AckSnapshot` - Acknowledge received server state

### Server → Client

- `Snapshot` - Authoritative game state (players, key enemies)
- `Events[]` - Game events (spawns, damage, pickups)

## Event Types

Events represent things that happened:

- `SpawnBullet` - Bullet created (id, position, velocity, seed)
- `SpawnEnemy` - Enemy created (id, archetype, position, seed)
- `Damage` - Entity took damage (target, amount, source)
- `Pickup` - Item collected (entity, item key)
- `Death` - Entity died (entity, killer)

## Binary Snapshots

`snapshot.ts` implements zero-allocation binary encode/decode for full entity state. The server broadcasts snapshots at 20Hz (every 3rd tick). `encodeSnapshot` returns a `Uint8Array` view into a shared buffer — callers must consume or copy the data before the next encode call.

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
