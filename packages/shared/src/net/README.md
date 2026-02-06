# net/

Network protocol definitions and serialization.

## Responsibilities

- Message type definitions (client→server, server→client)
- Binary serialization/deserialization
- Event type definitions
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

## Serialization

Binary encoding is recommended for bandwidth efficiency:
- Quantize floats to integers where precision allows
- Use bitfields for boolean flags
- Delta-encode where possible

## Dependencies

- `../math` - Quantization helpers

## Dependents

- `../sim` - Uses event types
- `@high-noon/client` - Message encoding/decoding
- `@high-noon/server` - Message encoding/decoding
