# Colyseus Framework: Architecture and Best Practices

Research document for High Noon's server implementation using Colyseus 0.16.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Room Lifecycle](#2-room-lifecycle)
3. [State Synchronization: Schema vs Raw Messages](#3-state-synchronization-schema-vs-raw-messages)
4. [Message Handling](#4-message-handling)
5. [Performance Tuning](#5-performance-tuning)
6. [Reconnection](#6-reconnection)
7. [Scaling](#7-scaling)
8. [Limitations](#8-limitations)
9. [What Colyseus Does NOT Handle](#9-what-colyseus-does-not-handle)
10. [Colyseus 0.16 Features](#10-colyseus-016-features)
11. [High Noon Usage Patterns](#11-high-noon-usage-patterns)
12. [Sources](#12-sources)

---

## 1. Architecture Overview

Colyseus is an open-source Node.js framework for building authoritative game servers with real-time state synchronization, matchmaking, and room-based multiplayer.

### Core Concepts

- **Server**: A Colyseus server hosts multiple **rooms**. Each room is an independent game session.
- **Rooms**: On-demand, stateful game instances spawned per client request. A single Room class definition can spawn many instances through matchmaking. Rooms serve as isolated game sessions where players connect, interact, and disconnect.
- **State**: Each room owns a `Schema`-based state object. Mutations to this state are automatically delta-encoded and broadcast to connected clients at a configurable `patchRate`.
- **Messages**: For data that doesn't fit Schema (binary snapshots, one-shot events), rooms can send/receive arbitrary messages via `send()`, `sendBytes()`, and `broadcast()`.
- **Matchmaking**: Built-in room discovery, join-or-create semantics, seat reservation, and filtering by room properties.

### Client SDKs

Colyseus provides official SDKs for JavaScript/TypeScript, Unity (C#), Defold (Lua), and Haxe. All SDKs share a consistent API for joining rooms and listening to state changes.

---

## 2. Room Lifecycle

### Lifecycle Hooks

```typescript
export class GameRoom extends Room<GameRoomState> {
  override maxClients = 8

  override onCreate(options) {
    // Room created. Initialize game state, register message handlers,
    // set simulation interval.
    this.setState(new GameRoomState())
    this.setPatchRate(100)  // Schema sync at 10 Hz
    this.setSimulationInterval((dt) => this.update(dt), 16.67)  // 60 Hz
  }

  override onJoin(client, options) {
    // Client connected. Create player entity, send initial config.
  }

  override onLeave(client, consented) {
    // Client disconnected. Clean up player entity.
    // `consented` is true if the client intentionally left.
  }

  override onDispose() {
    // Room is being destroyed (no clients left, or manually disposed).
    // Clean up intervals, external connections, etc.
  }
}
```

### Room Lifecycle Flow

```
Client calls joinOrCreate("game")
  → Matchmaker finds or creates a GameRoom instance
  → onCreate() runs (if new room)
  → onJoin() runs for the client
  → Client receives full Schema state + any "game-config" messages
  → ...game plays...
  → Client disconnects → onLeave()
  → Last client leaves → onDispose()
```

### Key Properties

| Property | Purpose |
|----------|---------|
| `maxClients` | Maximum connections per room |
| `patchRate` | Schema delta broadcast interval (ms). Default: 50ms (20 Hz) |
| `autoDispose` | Auto-destroy room when empty. Default: true |
| `clock` | Room-scoped timer for intervals |

---

## 3. State Synchronization: Schema vs Raw Messages

Colyseus provides two distinct data channels. Understanding when to use each is critical for performance.

### Schema State (Automatic Delta Sync)

Schema is Colyseus's built-in binary state serializer with incremental delta encoding. Only changed fields are transmitted.

```typescript
import { Schema, type, MapSchema } from "@colyseus/schema"

class Player extends Schema {
  @type("number") x: number = 0
  @type("number") y: number = 0
  @type("string") name: string = ""
}

class GameRoomState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>()
  @type("string") phase: string = "lobby"
  @type("uint32") serverTick: number = 0
}
```

**How it works internally:**
1. On client join, the full state is serialized and sent.
2. Each Schema instance holds a `ChangeTree` object that tracks which fields have been mutated since the last sync.
3. At each `patchRate` interval, Colyseus encodes only the changed fields and broadcasts the delta.
4. On the client, state callbacks (`onChange`, `onAdd`, `onRemove`, `listen`) fire when changes arrive.

**Constraints:**
- Max 64 fields per Schema class (use nested Schemas to exceed this).
- `NaN` and `Infinity` are encoded as `0`.
- Multi-dimensional arrays are not supported.
- Array index manipulation (shift/splice) is expensive (2 extra bytes per index change).

**Best for:** Lobby metadata, game phase, player names, scores, slowly-changing state. Anything where automatic delta sync is valuable and the data structure is simple.

### Raw Messages (`send` / `sendBytes` / `broadcast`)

For data that changes every tick or needs custom binary encoding, bypass Schema entirely.

```typescript
// Server: send raw binary snapshot
const snapshot: Uint8Array = encodeSnapshot(this.world)
client.sendBytes("snapshot", snapshot)

// Server: broadcast to all clients
this.broadcast("event", { type: "explosion", x: 100, y: 200 })

// Server: broadcast to all except one
this.broadcast("event", data, { except: triggeringClient })
```

**How messages work:**
- `send(type, data)` — Sends to one client, encoded via MessagePack.
- `sendBytes(type, bytes)` — Sends raw binary to one client (no MsgPack overhead).
- `broadcast(type, data)` — Sends to all clients in the room.

**Best for:** High-frequency game state (entity positions every tick), binary-encoded snapshots, one-shot events (spawn, death, score).

### When to Use Which

| Use Case | Schema | Raw Messages |
|----------|--------|-------------|
| Lobby state (phase, player names, ready status) | Yes | No |
| Entity positions at 20 Hz | No | Yes (`sendBytes`) |
| Game phase transitions | Yes | No |
| Bullet spawn events | No | Yes (`broadcast`) |
| Score / HP (slow-changing) | Either | Either |
| Full world snapshots | No | Yes (`sendBytes`) |

### High Noon's Hybrid Approach

High Noon uses both channels simultaneously:

- **Schema (10 Hz):** Game phase (`lobby`/`playing`), player metadata (name, ready status), server tick counter. This is the `GameRoomState` class with `setPatchRate(100)`.
- **Binary snapshots (20 Hz):** Full entity state (positions, velocities, HP, AI state) encoded via custom `encodeSnapshot()` function, sent via `client.sendBytes("snapshot", bytes)`.

This is the recommended pattern for action games: use Schema for lobby/meta state and raw binary for the game simulation.

---

## 4. Message Handling

### Server-Side Message Registration

Message handlers are registered in `onCreate()`:

```typescript
// String type (default, uses MessagePack)
this.onMessage("input", (client, data) => {
  // data is deserialized from MessagePack
})

// Number type (slightly more efficient, avoids string comparison)
this.onMessage(0, (client, data) => {
  // Handle message type 0
})

// Wildcard (catch-all for unhandled types)
this.onMessage("*", (client, type, data) => {
  console.log(`Unknown message type: ${type}`)
})
```

**Performance tip:** Use numeric message types for high-frequency messages (like input at 60 Hz). String message types are fine for infrequent messages.

### Client-Side Message Handling

```typescript
// Typed messages (MessagePack)
room.onMessage("game-config", (data) => { /* ... */ })

// Binary messages (from sendBytes)
room.onMessage("snapshot", (data: ArrayBuffer | Uint8Array) => {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const snapshot = decodeSnapshot(bytes)
})
```

---

## 5. Performance Tuning

### Patch Rate

`setPatchRate(ms)` controls how often Schema state deltas are broadcast. Lower values = more responsive but more bandwidth.

| Patch Rate | Frequency | Use Case |
|------------|-----------|----------|
| 50ms | 20 Hz | Fast-paced games (default) |
| 100ms | 10 Hz | Lobby metadata, slow-updating state |
| 200ms | 5 Hz | Turn-based games, chat |

For High Noon: `setPatchRate(100)` (10 Hz) for Schema, with binary snapshots at 20 Hz via manual `sendBytes` calls.

### Simulation Interval

`setSimulationInterval(callback, ms)` runs a game loop inside the room:

```typescript
this.setSimulationInterval((deltaMs) => this.update(deltaMs), 16.67)
// → 60 Hz simulation tick
```

This is **not** a fixed-timestep loop by itself. The callback receives the actual elapsed time. For a proper fixed-timestep simulation, implement an accumulator:

```typescript
private accumulator = 0

private update(deltaMs: number) {
  this.accumulator += deltaMs
  let ticks = 0
  while (this.accumulator >= TICK_MS && ticks < MAX_CATCHUP_TICKS) {
    this.serverTick()
    ticks++
    this.accumulator -= TICK_MS
  }
  if (ticks >= MAX_CATCHUP_TICKS) this.accumulator = 0  // spiral-of-death protection
}
```

### Schema Overhead

Each Schema instance creates a `ChangeTree` for mutation tracking. For small state objects (lobby, metadata), this is negligible. But creating hundreds of Schema instances per tick (one per entity) would be wasteful. For entity-heavy games, use raw binary snapshots instead.

**Guideline:** If you have more than ~50 entities that update every tick, Schema state sync is not the right tool. Use `sendBytes` with custom binary encoding.

### MessagePack vs sendBytes

| Method | Encoding | Overhead | Use When |
|--------|----------|----------|----------|
| `send(type, data)` | MessagePack | ~10-20 bytes overhead, CPU for encode/decode | Structured messages, events, config |
| `sendBytes(type, bytes)` | None (raw binary) | ~4 bytes header only | High-frequency state, custom binary protocols |

For the game simulation hot path (snapshots at 20 Hz), always use `sendBytes`.

---

## 6. Reconnection

Colyseus supports reconnection with seat reservation:

```typescript
override async onLeave(client: Client, consented: boolean) {
  if (consented) {
    // Client intentionally left (e.g., clicked "Leave Game")
    this.removePlayer(client)
    return
  }

  // Connection dropped — allow reconnection for 30 seconds
  try {
    const reconnection = this.allowReconnection(client, 30)
    // Optionally flag the player as inactive for other clients
    this.flagPlayerInactive(client.sessionId)

    const reconnectedClient = await reconnection
    // Player reconnected! Restore their state
    this.flagPlayerActive(reconnectedClient.sessionId)
  } catch {
    // Timed out — player didn't reconnect
    this.removePlayer(client)
  }
}
```

**Client-side:**

```typescript
const room = await client.reconnect(roomId, sessionId)
```

The client must store the `roomId` and `sessionId` from the original join to reconnect.

---

## 7. Scaling

### Single Process

A single Node.js process can host many rooms. Rooms are independent — they don't share state. The limit is CPU time per tick across all rooms.

### Multi-Process (Single Machine)

Use Colyseus's built-in `RedisPresence` and `RedisDriver` to coordinate multiple Node.js processes:

```typescript
import { Server } from "colyseus"
import { RedisPresence } from "@colyseus/redis-presence"
import { RedisDriver } from "@colyseus/redis-driver"

const server = new Server({
  presence: new RedisPresence(),
  driver: new RedisDriver(),
})
```

With Redis, room discovery and seat reservation work across processes. The matchmaker queries Redis to find available rooms on any process, then directs the WebSocket connection to the correct process.

### Multi-Machine (Horizontal)

Same Redis-based coordination, but processes run on different machines behind a load balancer:

1. **Load balancer** (NGINX/HAProxy) routes initial HTTP upgrade to any game server.
2. **Redis** stores room metadata (which process hosts which room, available seats).
3. **Sticky sessions** ensure WebSocket connections route to the correct process after initial matchmaking.

### Capacity Estimates

Colyseus documentation claims scaling from 10 to 10,000+ CCU. Actual capacity depends on simulation complexity:

- **Simple rooms** (chat, turn-based): Hundreds per process.
- **Complex rooms** (60 Hz physics, many entities): 5-15 per process.
- **High Noon estimate:** ~12 rooms per core (60 Hz tick, ~5ms per tick, 40% headroom). An 8-core machine handles ~96 rooms / ~384 players.

---

## 8. Limitations

### Schema Limitations

- **64 field limit per Schema class.** Use nested Schemas to work around this.
- **No multi-dimensional arrays.** Use flat arrays or MapSchema.
- **NaN and Infinity encode as 0.** Validate data before writing to Schema.
- **Array manipulation is expensive.** `shift()` on a 20-element array costs 38 extra bytes. Prefer MapSchema for dynamic collections.
- **Requires TypeScript decorators.** `experimentalDecorators: true` and `useDefineForClassFields: false` in tsconfig.

### Transport Limitations

- **WebSocket only (TCP).** No built-in UDP support. Head-of-line blocking can cause bursty delivery during packet loss.
- **No unreliable channel** (unless using WebTransport, experimental in 0.16).
- **No built-in input redundancy.** TCP guarantees delivery, but latency spikes can queue inputs.

### Architecture Limitations

- **No built-in client-side prediction.** You must implement prediction, reconciliation, and interpolation yourself.
- **No built-in lag compensation.** Server-side rewind for hit detection is your responsibility.
- **No built-in clock synchronization.** Estimating server time on the client is up to you.
- **Schema is not suitable for high-frequency entity state.** For action games, you need custom binary encoding via `sendBytes`.

---

## 9. What Colyseus Does NOT Handle

These are the networking features you must build yourself for an action game:

| Feature | Description | Colyseus Provides? |
|---------|-------------|-------------------|
| Client-side prediction | Run simulation locally for the local player | No |
| Server reconciliation | Rewind + replay unacknowledged inputs | No |
| Entity interpolation | Smooth rendering of remote entities between snapshots | No |
| Lag compensation | Server-side rewind for hit detection | No |
| Clock synchronization | Estimate server time on the client | No |
| Binary snapshot encoding | Custom compact encoding for entity state | No (you encode/decode) |
| Snapshot interpolation buffer | Buffer + interpolate between snapshots | No |
| Input sequence numbers | Track which inputs the server has processed | No |
| Dead reckoning / extrapolation | Predict entity positions during packet loss | No |

Colyseus handles the **transport layer** (WebSocket connections, room management, matchmaking, Schema state sync). Everything above the transport — prediction, interpolation, lag compensation — is game-specific and must be implemented in your codebase.

---

## 10. Colyseus 0.16 Features

### WebTransport (Experimental)

Colyseus 0.16 introduces experimental WebTransport support via `@colyseus/h3-transport`. WebTransport uses HTTP/3 and QUIC (built on UDP), enabling:

- **Unreliable delivery:** `client.sendUnreliable()` for data that doesn't need guaranteed delivery (position updates, cosmetic effects).
- **Lower latency:** No head-of-line blocking from TCP.
- **Multiplexed streams:** Independent data channels within a single connection.

**Current status:** Experimental, not battle-tested. WebTransport browser support is growing but not universal. Not recommended for production use yet.

### StateView API

New in 0.16, StateView allows per-client state filtering — each client can see a different subset of the room state. Useful for fog-of-war, team-specific visibility, or area-of-interest filtering.

---

## 11. High Noon Usage Patterns

### Current Architecture (Sprint 6)

```
┌──────────────┐          ┌──────────────────────────────┐
│   Client     │          │     GameRoom (Server)        │
│              │          │                              │
│  Input (60Hz)│──input──▶│  Input queue (per player)    │
│              │          │  stepWorld() at 60 Hz        │
│              │◀─schema──│  Schema state (10 Hz)        │
│              │          │    - phase, player meta      │
│              │◀─binary──│  Binary snapshots (20 Hz)    │
│              │          │    - positions, HP, AI state  │
└──────────────┘          └──────────────────────────────┘
```

### Key Design Decisions

1. **Schema for lobby, binary for gameplay.** Schema handles phase transitions and player metadata. Binary `sendBytes` handles the 20 Hz entity snapshots.
2. **Server-side input validation.** `isValidInput()` rejects malformed data. `clampInput()` enforces safe ranges.
3. **Input queue with cap.** Each player has a capped input queue (MAX_INPUT_QUEUE = 30). When empty, neutral input is used.
4. **Frozen neutral input.** `Object.freeze(createInputState())` prevents accidental mutation of the default.
5. **Fixed-timestep with spiral-of-death protection.** Accumulator pattern with MAX_CATCHUP_TICKS = 4.

### Future Improvements

- **Client-side prediction:** Run `stepWorld()` locally for the local player, reconcile against server snapshots.
- **Clock synchronization:** Ping/pong messages to estimate server time for proper interpolation render time.
- **Delta snapshots:** Only send entities that changed since the last acknowledged snapshot.
- **Event-driven bullets:** Replicate bullet spawn events instead of snapshotting every bullet position.
- **Reconnection support:** Use `allowReconnection()` to handle dropped connections gracefully.
- **WebTransport:** When stable, switch to unreliable delivery for snapshots (eliminates TCP head-of-line blocking).

---

## 12. Sources

### Official Documentation

- [Colyseus Documentation](https://docs.colyseus.io/) -- Official docs, room API, state sync, matchmaking
- [Schema Definition](https://docs.colyseus.io/state/schema) -- Schema types, decorators, limitations
- [Best Practices](https://docs.colyseus.io/state/best-practices) -- State design, performance tips
- [Room API (0.15)](https://0-15-x.docs.colyseus.io/server/room/) -- Room lifecycle, message handling, broadcasting

### Colyseus Internals

- [Colyseus Schema GitHub](https://github.com/colyseus/schema) -- Incremental binary delta serializer source
- [Colyseus 0.10 State Serialization](https://medium.com/@endel/colyseus-0-10-introducing-the-new-state-serialization-algorithm-88409ce5a660) -- How delta encoding replaced full snapshots
- [Colyseus 0.16 Release](https://colyseus.io/blog/colyseus-016-is-here/) -- WebTransport, StateView, new features

### Best Practices

- [Colyseus Best Practices (0.14)](https://0-14-x.docs.colyseus.io/colyseus/best-practices/overview/) -- Room design, state structure, delegation
- [Server Configuration](https://docs.colyseus.io/server) -- Transport, presence, driver configuration

### Community

- [Colyseus Discussion Forum](https://discuss.colyseus.io/) -- Community Q&A, patterns, troubleshooting
- [Colyseus GitHub Issues](https://github.com/colyseus/colyseus/issues) -- Bug reports, feature requests
