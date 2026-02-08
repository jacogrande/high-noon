# Colyseus Guide

## Overview

Colyseus is an authoritative multiplayer game server framework for Node.js/TypeScript. This guide covers both foundational APIs and advanced patterns for integrating Colyseus with a deterministic shared simulation (like High Noon's bitECS-based `packages/shared`).

**Target version:** Colyseus 0.16.x (latest stable). Notes on 0.15 differences are included where relevant.

**Key principle:** Colyseus manages rooms, connections, and matchmaking. Your game logic lives in `packages/shared`. The Colyseus room is a thin wrapper that feeds inputs to the shared simulation and broadcasts results.

## Installation

```bash
# Server
bun add colyseus @colyseus/schema @colyseus/monitor

# Client
bun add colyseus.js

# Testing
bun add -d @colyseus/testing
```

**TypeScript config requirements** (server tsconfig):
```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "useDefineForClassFields": false
  }
}
```

Both settings are mandatory. `experimentalDecorators` enables `@type()` decorators. `useDefineForClassFields: false` is required when targeting ES2022+ or the decorators silently fail.

---

# Part I: Fundamentals

## 1. Server Setup

```typescript
import { Server } from "colyseus";
import { GameRoom } from "./rooms/GameRoom";

const gameServer = new Server();
gameServer.define("game", GameRoom).filterBy(["mode"]);
gameServer.listen(2567);
```

`define()` registers a room handler class with a name. `.filterBy()` specifies which join options are used for matchmaking (clients with matching filter values are placed in the same room).

---

## 2. Room Lifecycle

A Room is the core server-side unit. Each room instance holds state, manages connected clients, and runs game logic.

### Lifecycle Hooks

```typescript
import { Room, Client, Delayed } from "colyseus";

export class GameRoom extends Room<GameRoomState> {
  maxClients = 4;

  onCreate(options: any) {
    // Called once when the room is first created.
    // Set up state, register message handlers, start simulation.
    this.setState(new GameRoomState());

    this.onMessage("input", (client, data) => {
      // Handle player input
    });

    this.setSimulationInterval((dt) => this.update(dt));
  }

  // Validate/authenticate BEFORE the WebSocket handshake completes.
  // Return value is passed as 3rd arg to onJoin. Throw to reject.
  static async onAuth(token: string, request: any) {
    return { userId: "some-id" };
  }

  onJoin(client: Client, options: any, auth: any) {
    // Called when a client successfully joins.
    console.log(`${client.sessionId} joined`);
    const player = new PlayerMeta();
    player.name = options.name || "Anonymous";
    this.state.players.set(client.sessionId, player);
  }

  async onLeave(client: Client, consented: boolean) {
    // consented=true: client called room.leave() explicitly
    // consented=false: connection dropped unexpectedly
    if (!consented) {
      try {
        await this.allowReconnection(client, 20);
        console.log(`${client.sessionId} reconnected!`);
        return;
      } catch { /* timeout expired */ }
    }
    this.state.players.delete(client.sessionId);
  }

  async onDispose() {
    // Called after all clients leave (if autoDispose is true).
    // Persist match results to database here.
  }

  // 0.16+: called during graceful shutdown
  onBeforeShutdown() {
    this.broadcast("server-shutdown", {});
  }

  // 0.16+: catches uncaught exceptions in room callbacks
  onUncaughtException(err: Error, methodName: string) {
    console.error(`Error in ${methodName}:`, err);
  }

  update(deltaTime: number) {
    // Game simulation
  }
}
```

### Key Lifecycle Notes

- All lifecycle methods support `async/await`.
- `onAuth` can be static (recommended) or an instance method.
- `autoDispose` defaults to `true`. Set to `false` if rooms should persist after all clients leave.
- `this.lock()` removes from matchmaking. `this.unlock()` re-adds it. Rooms auto-lock at `maxClients`.

---

## 3. State & Schema System

Schema is Colyseus's state synchronization system. Decorated properties are automatically delta-encoded and sent to clients.

### Primitive Types

| Type | Bytes | Range |
|------|-------|-------|
| `"int8"` | 1 | -128 to 127 |
| `"uint8"` | 1 | 0 to 255 |
| `"int16"` | 2 | -32,768 to 32,767 |
| `"uint16"` | 2 | 0 to 65,535 |
| `"int32"` | 4 | -2.1B to 2.1B |
| `"uint32"` | 4 | 0 to 4.2B |
| `"int64"` | 8 | Full 64-bit signed |
| `"uint64"` | 8 | Full 64-bit unsigned |
| `"float32"` | 4 | IEEE 754 single precision |
| `"float64"` | 8 | IEEE 754 double precision |
| `"number"` | 8 | Auto-detects int/float (variable encoding) |
| `"string"` | varies | UTF-8 encoded |
| `"boolean"` | 1 | true/false |

Use specific integer types (`uint16`, `float32`) over `"number"` when you know the range. `"number"` uses auto-detection which costs more bytes.

### Schema Definition

```typescript
import { Schema, type, MapSchema, ArraySchema, SetSchema } from "@colyseus/schema";

class Vector2 extends Schema {
  @type("float32") x: number = 0;
  @type("float32") y: number = 0;
}

class Player extends Schema {
  @type(Vector2) position: Vector2 = new Vector2();
  @type("float32") health: number = 100;
  @type("string") name: string = "";
  @type("uint8") team: number = 0;
}

class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type(["number"]) scores = new ArraySchema<number>();
  @type({ set: "string" }) tags = new SetSchema<string>();
  @type("uint16") waveNumber: number = 0;
  @type("boolean") isStarted: boolean = false;
}
```

### Collection Types

| Type | Use Case | Notes |
|------|----------|-------|
| `MapSchema<T>` | Entities tracked by ID | Recommended for players, enemies |
| `ArraySchema<T>` | Ordered collections | Index manipulation generates extra sync bytes |
| `SetSchema<T>` | Unique values | JS SDK only (not C#/C++/Lua) |
| `CollectionSchema<T>` | Like Set but not unique | JS SDK only |

### How State Sync Works

1. Each Schema instance tracks which properties changed since the last sync.
2. At every `patchRate` interval (default 50ms), the server encodes only changed properties into a binary delta.
3. Multiple mutations between patches are coalesced -- only the final value is sent.
4. On initial join, the full state is sent once. After that, only deltas.

### Critical Limitations

- Max **64 fields** per Schema class. Use nested Schemas to work around this.
- `NaN` and `Infinity` encode as `0`.
- `null` strings encode as `""`.
- Items in ArraySchema/MapSchema must be **all the same type**.
- Multi-dimensional arrays are NOT supported.
- Both encoder (server) and decoder (client) must have the **same schema definition**.

### What NOT to Put in Schema State

- Bullets and fast-moving projectiles (too frequent, use messages/events)
- Transient visual effects (particles, flashes)
- Anything that changes every tick at 60Hz -- Schema patches at 10-20Hz will bottleneck

---

## 4. Messaging System

Messages are for data that should NOT be in synchronized state: one-off events, player inputs, and transient game events.

### Server-Side

```typescript
onCreate(options: any) {
  // String message type
  this.onMessage("fire", (client, data: { angle: number }) => {
    // Validate and broadcast spawn event to all clients
    this.broadcast("bullet-spawn", {
      ownerId: client.sessionId,
      x: player.position.x,
      y: player.position.y,
      angle: data.angle,
      seed: this.world.rng.nextInt(0xFFFFFF),
    });
  });

  // Numeric message type (more efficient: 1 byte vs string length)
  this.onMessage(0, (client, data) => {
    // Input messages
  });

  // Wildcard handler (receives ALL types)
  this.onMessage("*", (client, type, message) => {
    console.log(`Received ${type} from ${client.sessionId}`);
  });
}
```

### Broadcasting

```typescript
// To all clients
this.broadcast("event", { data: "value" });

// To all except sender
this.broadcast("event", { data: "value" }, { except: client });

// After next state patch (ensures clients have latest state first)
this.broadcast("round-end", { winner: "p1" }, { afterNextPatch: true });
```

### Sending to One Client

```typescript
client.send("powerup", { kind: "ammo", amount: 30 });
client.send(1, binaryData);                // numeric type
client.sendBytes("snapshot", uint8Array);  // raw binary (bypasses MsgPack)
```

### Client-Side

```typescript
room.send("fire", { angle: 1.57 });
room.send(0, inputBuffer);

room.onMessage("bullet-spawn", (data) => {
  spawnBulletLocally(data);
});
```

### State vs Messages Decision Table

| Use State (`@type()`) | Use Messages (`send`/`broadcast`) |
|---|---|
| Player position (at low Hz) | Bullet spawn events |
| Health, scores | Damage numbers, hit effects |
| Game phase, wave number | Sound effect triggers |
| Inventory, equipment | Input commands |
| Persistent entity data | One-shot notifications |
| Anything clients need on join | Transient visual effects |

---

## 5. Clock & Timing

### setSimulationInterval

The built-in game loop. Calls your callback at the specified interval and ticks the room's `clock`.

```typescript
this.setSimulationInterval((deltaTimeMs) => {
  // deltaTimeMs is wall-clock time since last call (NOT fixed)
  // Use a fixed-timestep accumulator for deterministic sim (see Part II)
}, 1000 / 60); // Request ~60Hz
```

**Performance note**: Uses `setInterval` internally. The timer delay is applied *after* the callback finishes. If computation is heavy, the effective tick rate drops below target.

### Clock Utilities

```typescript
import { Delayed } from "colyseus";

this.clock.start();

// Repeating interval
this.clock.setInterval(() => {
  this.broadcastGameTime();
}, 1000);

// One-shot timeout
this.clock.setTimeout(() => {
  this.startRound();
}, 5000);

// Store reference for manual control
const timer: Delayed = this.clock.setTimeout(() => {
  this.endRound();
}, 120_000);

timer.pause();   // Pause timer
timer.resume();  // Resume timer
timer.clear();   // Cancel entirely
timer.active;    // boolean: is it running?
```

All clock timers are automatically cleared when the room is disposed.

---

## 6. Client SDK

### Connecting and Joining

```typescript
import { Client, getStateCallbacks } from "colyseus.js";

const client = new Client("ws://localhost:2567");

// joinOrCreate: joins matching room or creates new one
const room = await client.joinOrCreate("game", { name: "Player1", mode: "duo" });

// Other join methods:
await client.create("game", { mode: "solo" });     // always creates new room
await client.join("game", { mode: "duo" });         // only joins existing (throws if none)
await client.joinById("room-id-here", {});          // joins specific room by ID
```

### Room Properties

```typescript
room.id;                // Unique room ID (shareable for joinById)
room.sessionId;         // This client's unique session ID
room.name;              // Room handler name (e.g., "game")
room.state;             // The synchronized state object
room.reconnectionToken; // Token for reconnection (cache this!)
```

### State Change Callbacks (0.16 API)

```typescript
const $ = getStateCallbacks(room);

// Listen to a specific property
$(room.state).listen("waveNumber", (current, previous) => {
  console.log(`Wave changed: ${previous} -> ${current}`);
});

// Listen for map entries being added
$(room.state).players.onAdd((player, sessionId) => {
  createPlayerSprite(sessionId, player.x, player.y);

  // Listen for changes on this specific player
  $(player).listen("x", (x) => updatePlayerX(sessionId, x));
  $(player).listen("y", (y) => updatePlayerY(sessionId, y));

  // Or listen for ANY change on the player
  $(player).onChange(() => {
    updatePlayer(sessionId, player.x, player.y, player.health);
  });
});

// Listen for map entries being removed
$(room.state).players.onRemove((player, sessionId) => {
  destroyPlayerSprite(sessionId);
});
```

### Room Events

```typescript
room.onStateChange((state) => { /* any state change */ });
room.onLeave((code) => { /* disconnected */ });
room.onError((code, message) => { /* error */ });
```

### Leaving and Reconnection

```typescript
room.leave();       // Graceful leave (consented=true on server)
room.leave(false);  // Leave but allow reconnection

// Reconnection
const token = room.reconnectionToken;
localStorage.setItem("reconnectionToken", token);

// Later:
try {
  const room = await client.reconnect(token);
} catch (e) {
  // Reconnection failed -- join fresh
}
```

---

## 7. Matchmaking

### filterBy

Clients with matching filter values are placed in the same room:

```typescript
// Server
gameServer.define("game", GameRoom).filterBy(["mode", "region"]);

// Client -- these two join the same room:
client.joinOrCreate("game", { mode: "duo", region: "us-east", name: "P1" });
client.joinOrCreate("game", { mode: "duo", region: "us-east", name: "P2" });

// This creates a different room (mode differs):
client.joinOrCreate("game", { mode: "solo", region: "us-east", name: "P3" });
```

Non-filter options (like `name`) are passed through to `onCreate`/`onJoin` but don't affect matchmaking.

### Room Access in Handler

```typescript
class GameRoom extends Room<GameState> {
  onCreate(options: any) {
    if (options.mode === "duo") {
      this.maxClients = 2;
    } else if (options.mode === "squad") {
      this.maxClients = 4;
    }
  }
}
```

### Seat Reservation (Party System)

```typescript
// Server: reserve a seat for a friend
const reservation = await matchMaker.joinOrCreate("game", { mode: "duo" });
// Send reservation to the friend client somehow

// Friend client: consume the reservation
const room = await client.consumeSeatReservation(reservation);
```

### Locking

- `this.lock()` removes room from matchmaking pool.
- `this.unlock()` re-adds it.
- Locked rooms are invisible to `joinOrCreate`/`join` but accessible via `joinById`.
- Rooms auto-lock at `maxClients` and auto-unlock when a client leaves (unless manually locked).

---

# Part II: Advanced Patterns for High Noon

## 8. Authoritative Game Loop

### setSimulationInterval vs Custom Loop

`setSimulationInterval(callback, intervalMs)` calls `callback(deltaTimeMs)` at the specified interval and ticks the room's `clock`.

**Use `setSimulationInterval` when:** you want Colyseus to manage timing and need `this.clock` for delayed events.

**Use a custom loop when:** you need tighter control (e.g., `performance.now()`-based loops), or need to run at a rate different from the patch rate.

For most games, `setSimulationInterval` with a fixed-timestep accumulator is the correct choice.

### Fixed-Timestep Accumulator

The simulation must advance in fixed increments regardless of wall-clock jitter:

```typescript
import { Room, Client } from "colyseus";
import { createGameWorld, GameWorld } from "@high-noon/shared/sim/world";
import { stepWorld, TICK_MS, SystemRegistry } from "@high-noon/shared/sim/step";
import { InputState } from "@high-noon/shared/net/input";
import { GameRoomState } from "./schema/GameRoomState";

const MAX_CATCHUP_TICKS = 4; // prevent spiral of death

interface PlayerSlot {
  client: Client;
  eid: number;
  inputQueue: InputState[];
  lastProcessedSeq: number;
}

export class GameRoom extends Room<GameRoomState> {
  world!: GameWorld;
  systems!: SystemRegistry;
  players = new Map<string, PlayerSlot>();
  accumulator = 0;

  onCreate(options: any) {
    this.setState(new GameRoomState());

    this.world = createGameWorld(options.seed ?? Date.now());
    this.systems = createAndRegisterSystems(this.world);

    this.setPatchRate(50); // 20 Hz Schema sync
    this.setSimulationInterval((deltaMs) => {
      this.accumulator += deltaMs;
      let ticks = 0;

      while (this.accumulator >= TICK_MS && ticks < MAX_CATCHUP_TICKS) {
        this.serverTick();
        this.accumulator -= TICK_MS;
        ticks++;
      }

      // If we hit the cap, discard remaining accumulated time
      if (ticks >= MAX_CATCHUP_TICKS) {
        this.accumulator = 0;
      }
    }, TICK_MS);

    this.onMessage("input", (client, data) => {
      this.handleInput(client, data);
    });
  }

  serverTick() {
    for (const [sessionId, slot] of this.players) {
      const input = slot.inputQueue.shift();
      if (input) {
        slot.lastProcessedSeq = input.seq;
        applyInputToWorld(this.world, sessionId, input);
      }
    }

    stepWorld(this.world, this.systems);
    this.syncWorldToState();
  }

  handleInput(client: Client, data: any) {
    const slot = this.players.get(client.sessionId);
    if (!slot) return;

    if (slot.inputQueue.length < 30) {
      slot.inputQueue.push(data as InputState);
    }
  }

  syncWorldToState() {
    // Copy ECS SoA arrays -> Schema (or send binary snapshot)
  }
}
```

### Why the Accumulator Matters

Without the accumulator, `setSimulationInterval` delivers variable `deltaMs` values (15ms, 18ms, 16ms, etc.). If you pass those directly to physics, simulation becomes non-deterministic. The accumulator consumes time in fixed `TICK_MS` chunks, ensuring every `stepWorld` call gets the exact same dt.

### MAX_CATCHUP_TICKS (Spiral of Death Protection)

If the server falls behind (e.g., GC pause), the accumulator grows large. Without a cap, the server tries to run dozens of ticks in one callback, making the problem worse. Cap at 3-4 ticks and discard excess time.

---

## 9. Input Handling and Buffering

### Input Message Format

Every input should include a monotonically increasing sequence number for client-side prediction reconciliation:

```typescript
// packages/shared/src/net/input.ts
export interface InputState {
  seq: number;
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  fire: boolean;
  roll: boolean;
}
```

### Client: Sending Inputs

The client sends one input per local simulation tick and keeps a copy for reconciliation:

```typescript
class ClientInputManager {
  private seq = 0;
  private pendingInputs: InputState[] = [];
  private room: Room;

  sendInput(raw: RawInput): InputState {
    const input: InputState = {
      seq: ++this.seq,
      moveX: raw.moveX,
      moveY: raw.moveY,
      aimX: raw.aimX,
      aimY: raw.aimY,
      fire: raw.fire,
      roll: raw.roll,
    };

    this.room.send("input", input);
    this.pendingInputs.push(input);
    return input;
  }

  acknowledgeUpTo(seq: number) {
    this.pendingInputs = this.pendingInputs.filter(i => i.seq > seq);
  }

  getUnacknowledged(): InputState[] {
    return this.pendingInputs;
  }
}
```

### Server: Input Queue Per Player

Each player has a FIFO queue. The server pops one input per tick:

```typescript
// In serverTick():
const input = slot.inputQueue.shift();
if (input) {
  slot.lastProcessedSeq = input.seq;
}
```

### Handling Late / Missing Inputs

If a player's queue is empty during a tick:

1. **Repeat last input** -- suitable for continuous movement. Adds perceived latency but avoids stopping.
2. **Use neutral input** -- zero movement, no actions. Safer for action games where repeating "fire" could be wrong.

For a bullet-hell roguelite, neutral input (stop moving, stop firing) is the safer default.

### Ring Buffer (Advanced)

For high-frequency input, a fixed-size ring buffer avoids allocations:

```typescript
class InputRingBuffer {
  private buffer: (InputState | null)[];
  private head = 0;
  private tail = 0;
  private count = 0;
  readonly capacity: number;

  constructor(capacity: number = 64) {
    this.capacity = capacity;
    this.buffer = new Array(capacity).fill(null);
  }

  push(input: InputState): boolean {
    if (this.count >= this.capacity) return false;
    this.buffer[this.head] = input;
    this.head = (this.head + 1) % this.capacity;
    this.count++;
    return true;
  }

  shift(): InputState | null {
    if (this.count === 0) return null;
    const input = this.buffer[this.tail];
    this.buffer[this.tail] = null;
    this.tail = (this.tail + 1) % this.capacity;
    this.count--;
    return input;
  }

  get length(): number {
    return this.count;
  }
}
```

---

## 10. Snapshot Approach vs Schema State

### When Schema Works Fine

Schema uses delta encoding -- only changed properties are sent. Good for:
- < 50 entities changing per patch
- Moderate update frequency (10-20 Hz patches)
- Player counts under ~20

### When to Bypass Schema

For a bullet-hell with 100+ bullets and 50+ enemies all moving every frame:

1. **MapSchema overhead** -- diffing hundreds of entries per patch costs CPU.
2. **Encoding cost** -- when nearly every entity changes every tick, change-tracking overhead approaches full-state cost with none of the compression benefits.
3. **64-field limit** -- deeply nested structures add overhead.

### Hybrid Approach: Schema for Lobby, Binary for Gameplay

Recommended for High Noon:

```typescript
import { Schema, type, MapSchema } from "@colyseus/schema";

// Schema: lobby state, metadata (low-frequency, few fields)
class PlayerMeta extends Schema {
  @type("string") name = "";
  @type("string") character = "";
  @type("boolean") ready = false;
  @type("uint16") score = 0;
}

class GameRoomState extends Schema {
  @type("string") phase: string = "lobby";
  @type({ map: PlayerMeta }) players = new MapSchema<PlayerMeta>();
  @type("uint32") serverTick = 0;
}

// When phase === "playing", game state goes via custom binary messages
```

Server broadcasts binary snapshots during gameplay:

```typescript
serverTick() {
  stepWorld(this.world, this.systems);
  this.state.serverTick = this.world.tick;

  // Binary snapshot at 20Hz (every 3 ticks at 60Hz)
  if (this.world.tick % 3 === 0) {
    const snapshot = this.encodeSnapshot();
    this.broadcast("snapshot", snapshot);
  }
}
```

---

## 11. Binary Serialization

### client.sendBytes for Raw Binary

Bypasses MsgPack encoding for maximum efficiency:

```typescript
// Server: send binary to one client
client.sendBytes("snapshot", snapshotBuffer);

// Server: broadcast binary to all
for (const client of this.clients) {
  client.sendBytes("snapshot", snapshotBuffer);
}

// Client: listen for binary messages
room.onMessage("snapshot", (data: Uint8Array) => {
  decodeSnapshot(data);
});
```

### Custom Binary Snapshot Format

```typescript
// Layout:
// [4 bytes: serverTick] [2 bytes: entity count]
// Per entity:
//   [2 bytes: entityId] [1 byte: entityType]
//   [4 bytes: x (float32)] [4 bytes: y (float32)]
//   [2 bytes: health] [1 byte: flags]

const HEADER_SIZE = 4 + 2;
const ENTITY_SIZE = 2 + 1 + 4 + 4 + 2 + 1; // 14 bytes

function encodeSnapshot(
  tick: number,
  entities: SnapshotEntity[],
): Uint8Array {
  const size = HEADER_SIZE + entities.length * ENTITY_SIZE;
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  let offset = 0;

  view.setUint32(offset, tick, true); offset += 4;
  view.setUint16(offset, entities.length, true); offset += 2;

  for (const e of entities) {
    view.setUint16(offset, e.id, true); offset += 2;
    view.setUint8(offset, e.type); offset += 1;
    view.setFloat32(offset, e.x, true); offset += 4;
    view.setFloat32(offset, e.y, true); offset += 4;
    view.setUint16(offset, e.health, true); offset += 2;
    view.setUint8(offset, e.flags); offset += 1;
  }

  return new Uint8Array(buffer);
}

function decodeSnapshot(data: Uint8Array): Snapshot {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  const tick = view.getUint32(offset, true); offset += 4;
  const count = view.getUint16(offset, true); offset += 2;
  const entities: SnapshotEntity[] = [];

  for (let i = 0; i < count; i++) {
    entities.push({
      id: view.getUint16(offset, true),
      type: view.getUint8(offset + 2),
      x: view.getFloat32(offset + 3, true),
      y: view.getFloat32(offset + 7, true),
      health: view.getUint16(offset + 11, true),
      flags: view.getUint8(offset + 13),
    });
    offset += ENTITY_SIZE;
  }

  return { tick, entities };
}
```

### Quantized Positions

Halve position bandwidth by quantizing to uint16 within arena bounds:

```typescript
const ARENA_SIZE = 2048;

function quantize(value: number): number {
  return Math.round((value / ARENA_SIZE) * 65535) & 0xFFFF;
}

function dequantize(quantized: number): number {
  return (quantized / 65535) * ARENA_SIZE;
}

// 4 bytes per position (2x uint16) instead of 8 bytes (2x float32)
```

### Serialization Comparison

| Approach | Pros | Cons |
|----------|------|------|
| **MsgPack** (default) | Zero-effort, self-describing | ~2x larger, CPU cost for dynamic types |
| **Custom binary** | Minimal size, fast encode/decode | Must maintain codec both sides |
| **Protocol Buffers** | Schema evolution, good tooling | Extra build step, .proto files |

**Recommendation:** MsgPack for low-frequency messages (chat, events). Custom binary for high-frequency game state snapshots.

---

## 12. Client-Side Prediction

Colyseus does **not** provide client-side prediction out of the box. You must implement it yourself.

### Architecture

```
Client:                              Server:
  Input -> local sim (predict)         receive input
  Input -> send to server              buffer input
  ...                                  serverTick: apply input, stepWorld
  receive authoritative state    <--   broadcast snapshot + lastInputSeq
  compare predicted vs auth
  if diverged: rollback + replay
```

### Prediction Loop

```typescript
class PredictedGameClient {
  private localWorld: GameWorld;
  private localSystems: SystemRegistry;
  private inputManager: ClientInputManager;

  /** Called every local frame at 60Hz */
  localTick(rawInput: RawInput) {
    const input = this.inputManager.sendInput(rawInput);
    applyInputToWorld(this.localWorld, "local", input);
    stepWorld(this.localWorld, this.localSystems, input);
  }

  /** Called when server snapshot arrives */
  onServerSnapshot(snapshot: Snapshot) {
    const ack = snapshot.lastInputSeqForPlayer;

    // 1. Accept authoritative state
    applySnapshotToWorld(this.localWorld, snapshot);

    // 2. Discard acknowledged inputs
    this.inputManager.acknowledgeUpTo(ack);

    // 3. Re-simulate unacknowledged inputs (reconciliation)
    for (const input of this.inputManager.getUnacknowledged()) {
      applyInputToWorld(this.localWorld, "local", input);
      stepWorld(this.localWorld, this.localSystems, input);
    }
  }
}
```

### Per-Player Acknowledgment

The server sends each client the sequence number of the last input it processed for that client:

```typescript
serverTick() {
  // ... step simulation ...

  for (const [sessionId, slot] of this.players) {
    const snapshot = this.encodeSnapshotForClient(sessionId, slot.lastProcessedSeq);
    slot.client.sendBytes("snapshot", snapshot);
  }
}
```

### Smoothing vs Hard Snap

When predicted position diverges from authoritative:

```typescript
// In render loop (not simulation!)
const error = distance(predictedPos, authPos);
const SNAP_THRESHOLD = 32; // world units
const SMOOTH_RATE = 10;    // per second

if (error > SNAP_THRESHOLD) {
  renderPos = authPos; // hard snap
} else {
  const t = 1 - Math.exp(-SMOOTH_RATE * renderDt);
  renderPos.x = lerp(renderPos.x, authPos.x, t);
  renderPos.y = lerp(renderPos.y, authPos.y, t);
}
```

### Shared Simulation Is Key

Because `packages/shared` runs identically on client and server, prediction works naturally. Both sides call `stepWorld()` with the same inputs and get the same results. Divergence only happens from:
- Network latency (inputs arrive late)
- Dropped inputs
- Non-determinism bugs (avoid `Math.random()`, use `world.rng`)

---

## 13. Interest Management

### The Problem

With 200+ entities, sending every entity's state to every client wastes bandwidth. Players only need entities near their viewport.

### Colyseus 0.16: StateView

`StateView` replaces the deprecated `@filter()` from 0.15. You manually control which schema instances each client can see:

```typescript
import { StateView } from "@colyseus/schema";

onJoin(client: Client) {
  const view = new StateView();
  client.view = view;
  const player = this.state.entities.get(client.sessionId);
  if (player) view.add(player);
}

// Run periodically (e.g., every 500ms, not every tick)
updateInterestSets() {
  for (const [sessionId, slot] of this.players) {
    const playerPos = getPlayerPosition(this.world, sessionId);
    const view = slot.client.view as StateView;

    for (const [entityId, entity] of this.state.entities) {
      const dist = distance(playerPos, entity);
      if (dist < VIEW_RADIUS) {
        view.add(entity);
      } else {
        view.remove(entity);
      }
    }
  }
}
```

**Limitation:** StateView is not yet optimized for large datasets. For hundreds of entities, custom binary snapshots with server-side filtering is more practical.

### Custom Interest Management (Recommended)

Skip Schema for game entities and build filtering into binary snapshots:

```typescript
function encodeSnapshotForClient(
  world: GameWorld,
  playerEid: number,
  allEntities: number[]
): Uint8Array {
  const px = Position.x[playerEid];
  const py = Position.y[playerEid];
  const VIEW_RADIUS_SQ = 800 * 800;

  const visible = allEntities.filter(eid => {
    const dx = Position.x[eid] - px;
    const dy = Position.y[eid] - py;
    return dx * dx + dy * dy < VIEW_RADIUS_SQ;
  });

  return encodeSnapshot(world.tick, visible);
}
```

Use spatial hash (High Noon already has `SpatialHash`) to avoid O(n) distance checks:

```typescript
function getVisibleEntities(
  spatialHash: SpatialHash,
  px: number, py: number,
  viewWidth: number, viewHeight: number
): number[] {
  return spatialHash.query(
    px - viewWidth / 2,
    py - viewHeight / 2,
    viewWidth,
    viewHeight
  );
}
```

---

## 14. Reconnection Handling

### Server: allowReconnection

In 0.15+, reconnection uses opaque tokens (not sessionId):

```typescript
async onLeave(client: Client, consented: boolean) {
  if (consented) {
    this.removePlayer(client.sessionId);
    return;
  }

  try {
    // Time-limited: 20 seconds to reconnect
    await this.allowReconnection(client, 20);

    // Player reconnected! Re-send full state snapshot.
    const slot = this.players.get(client.sessionId);
    if (slot) {
      const fullSnapshot = this.encodeFullSnapshot();
      client.sendBytes("full-snapshot", fullSnapshot);
    }
  } catch {
    // Window expired
    this.removePlayer(client.sessionId);
  }
}
```

### Manual Reconnection Control

```typescript
const reconnection = this.allowReconnection(client, "manual");

this.clock.setTimeout(() => {
  reconnection.reject(); // force-expire
}, 30_000);

try {
  await reconnection;
  // Reconnected
} catch {
  this.removePlayer(client.sessionId);
}
```

### Client-Side

```typescript
let reconnectionToken: string;

room.onJoin(() => {
  reconnectionToken = room.reconnectionToken;
  localStorage.setItem("reconnectionToken", reconnectionToken);
});

room.onLeave(async (code) => {
  if (code > 1000) { // abnormal close
    try {
      const token = localStorage.getItem("reconnectionToken");
      if (token) {
        room = await client.reconnect(token);
      }
    } catch {
      // Fall back to joining a new room
    }
  }
});
```

### Mid-Game Reconnection: Full State Sync

When a player reconnects, they have stale state:

1. **Send a full snapshot** -- not a delta, but the complete current world state.
2. **Reset their prediction state** -- client discards all pending inputs and restarts prediction.
3. **Re-sync input sequence** -- server communicates the expected next sequence.

```typescript
// Server: detect reconnection in onJoin
onJoin(client: Client, options: any) {
  const existing = this.players.get(client.sessionId);
  if (existing) {
    existing.client = client;
    existing.inputQueue = [];

    const snapshot = this.encodeFullSnapshot();
    client.sendBytes("full-snapshot", snapshot);
    client.send("ack-seq", { seq: existing.lastProcessedSeq });
    return;
  }
  // New player join...
}
```

---

## 15. Performance at Scale

### Rooms Per Process

Each Colyseus process runs rooms on a single Node.js thread:

| Game Type | Rooms/Process | Entities/Room | Clients/Room |
|-----------|--------------|---------------|--------------|
| Turn-based | 100-500 | < 50 | 2-4 |
| Moderate real-time | 20-50 | 50-200 | 4-10 |
| Fast-paced action (High Noon) | 5-20 | 200-500 | 2-4 |
| MMO-lite | 1-5 | 500+ | 20-50 |

### Schema Sync Bottleneck

Schema bottlenecks when:
- **Encoding cost:** 200+ entities * 2 clients * 20Hz = 8000 encode operations/sec.
- **Patch size:** 200 entities = ~2KB per patch per client.

**Rule of thumb:** If more than ~100 entities change every patch cycle, use the hybrid approach (Section 10) with custom binary snapshots.

### setPatchRate Tuning

```typescript
this.setPatchRate(50);   // 20 Hz -- good for most games
this.setPatchRate(100);  // 10 Hz -- supplement with custom snapshots
this.setPatchRate(null); // Disable -- you control everything
```

When `setPatchRate(null)`, Colyseus stops sending automatic Schema patches.

### Horizontal Scaling

Multiple processes with Redis:

```typescript
import { Server } from "colyseus";
import { RedisPresence } from "@colyseus/redis-presence";
import { RedisDriver } from "@colyseus/redis-driver";

const gameServer = new Server({
  presence: new RedisPresence(),
  driver: new RedisDriver(),
  publicAddress: `backend.yourdomain.com/${process.env.PORT}`,
});
```

How multi-process works:
1. Each process listens on a different port.
2. Redis provides shared matchmaking state across all processes.
3. A load balancer handles initial connections.
4. Client requests are routed to the process holding the target room.
5. Each Room belongs to **exactly one** process -- rooms cannot be migrated.

**PM2 for process management:**
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: "colyseus",
    script: "dist/index.js",
    instances: 4,
    exec_mode: "fork",  // NOT cluster mode
  }]
};
```

---

## 16. Testing

### @colyseus/testing Package

Integration tests with real room instances and simulated clients:

```typescript
import { ColyseusTestServer, boot } from "@colyseus/testing";
import appConfig from "../src/app.config";

describe("GameRoom", () => {
  let colyseus: ColyseusTestServer;

  before(async () => { colyseus = await boot(appConfig); });
  after(async () => { colyseus.shutdown(); });

  it("should allow two players to join", async () => {
    const room = await colyseus.createRoom<GameRoomState>("game", {});
    const client1 = await colyseus.connectTo(room);
    const client2 = await colyseus.connectTo(room);

    assert.strictEqual(room.state.players.size, 2);

    await client1.waitForNextPatch();
    assert.strictEqual(client1.state.players.size, 2);
  });

  it("should process player input", async () => {
    const room = await colyseus.createRoom<GameRoomState>("game", {});
    const client1 = await colyseus.connectTo(room);

    client1.send("input", {
      seq: 1, moveX: 1, moveY: 0,
      aimX: 100, aimY: 100, fire: false, roll: false,
    });

    await room.waitForNextSimulationTick();

    const gameRoom = room as any as GameRoom;
    const playerSlot = gameRoom.players.get(client1.sessionId);
    assert.strictEqual(playerSlot.lastProcessedSeq, 1);
  });

  it("should handle reconnection", async () => {
    const room = await colyseus.createRoom<GameRoomState>("game", {});
    const client1 = await colyseus.connectTo(room);
    const token = client1.reconnectionToken;

    client1.leave();
    await new Promise(r => setTimeout(r, 100));

    const reconnected = await colyseus.sdk.reconnect(token);
    assert.strictEqual(reconnected.sessionId, client1.sessionId);
  });
});
```

### Test the Shared Simulation Separately

Because all game logic lives in `packages/shared`, test the simulation without Colyseus:

```typescript
import { createGameWorld } from "@high-noon/shared/sim/world";
import { spawnPlayer } from "@high-noon/shared/sim/prefabs";
import { Position } from "@high-noon/shared/sim/components";

describe("movementSystem", () => {
  it("should move player based on input", () => {
    const world = createGameWorld(42);
    const eid = spawnPlayer(world, 100, 100);
    // ... apply input and step ...
    expect(Position.x[eid]).toBeGreaterThan(100);
  });
});
```

Shared-package tests are faster and more reliable. Colyseus integration tests verify the room-as-wrapper works. Both are needed.

---

## 17. Full Integration Example

### The Room as Thin Wrapper

The Colyseus room does **not** contain game logic. It is a bridge:

```
Colyseus Room
  |-- Receives client inputs via onMessage
  |-- Feeds inputs to shared simulation
  |-- Calls stepWorld() each server tick
  |-- Reads ECS state and sends to clients
  |-- Manages connections, matchmaking, reconnection
  v
packages/shared (GameWorld, Systems, stepWorld)
  |-- All physics, movement, collision, AI, weapons
  |-- Deterministic: same inputs = same outputs
  |-- No Colyseus dependency
  |-- Runs on server AND client (for prediction)
```

### Complete Room Implementation

```typescript
import { Room, Client } from "colyseus";
import {
  createGameWorld, GameWorld,
  stepWorld, TICK_MS, SystemRegistry,
} from "@high-noon/shared";
import { GameRoomState, PlayerMeta } from "./schema/GameRoomState";
import { registerAllSystems } from "@high-noon/shared/sim/systems";

interface PlayerSlot {
  client: Client;
  eid: number;
  inputQueue: InputState[];
  lastProcessedSeq: number;
}

export class GameRoom extends Room<GameRoomState> {
  world!: GameWorld;
  systems!: SystemRegistry;
  players = new Map<string, PlayerSlot>();
  accumulator = 0;

  onCreate(options: any) {
    this.setState(new GameRoomState());
    this.maxClients = 4;

    const seed = options.seed ?? Date.now();
    this.world = createGameWorld(seed);
    this.systems = createSystemRegistry();
    registerAllSystems(this.systems, this.world);

    this.setPatchRate(100); // 10 Hz for Schema (lobby metadata)

    this.setSimulationInterval((deltaMs) => {
      if (this.state.phase !== "playing") return;

      this.accumulator += deltaMs;
      while (this.accumulator >= TICK_MS) {
        this.serverTick();
        this.accumulator -= TICK_MS;
      }
    }, TICK_MS);

    this.onMessage("input", (client, data) => {
      const slot = this.players.get(client.sessionId);
      if (!slot) return;
      if (slot.inputQueue.length < 30) {
        slot.inputQueue.push(data);
      }
    });

    this.onMessage("ready", (client) => {
      const meta = this.state.players.get(client.sessionId);
      if (meta) meta.ready = true;
      if (this.allReady()) this.startGame();
    });
  }

  onJoin(client: Client, options: any) {
    const meta = new PlayerMeta();
    meta.name = options.name ?? "Stranger";
    meta.character = options.character ?? "sheriff";
    this.state.players.set(client.sessionId, meta);

    const eid = spawnPlayer(this.world, /* spawn position */);

    this.players.set(client.sessionId, {
      client, eid,
      inputQueue: [],
      lastProcessedSeq: 0,
    });

    // Send seed so client can create matching local world
    client.send("game-config", { seed: this.world.initialSeed });
  }

  async onLeave(client: Client, consented: boolean) {
    if (!consented) {
      try {
        await this.allowReconnection(client, 20);
        const slot = this.players.get(client.sessionId);
        if (slot) slot.client = client;
        return;
      } catch { /* timeout */ }
    }

    const slot = this.players.get(client.sessionId);
    if (slot) {
      removeEntity(this.world, slot.eid);
      this.players.delete(client.sessionId);
    }
    this.state.players.delete(client.sessionId);
  }

  serverTick() {
    for (const [sessionId, slot] of this.players) {
      const input = slot.inputQueue.shift();
      if (input) {
        slot.lastProcessedSeq = input.seq;
        setPlayerInput(this.world, slot.eid, input);
      }
    }

    stepWorld(this.world, this.systems);
    this.state.serverTick = this.world.tick;

    if (this.world.tick % 3 === 0) {
      this.broadcastSnapshots();
    }
  }

  broadcastSnapshots() {
    for (const [sessionId, slot] of this.players) {
      const snapshot = encodeSnapshotForClient(
        this.world, slot.eid, slot.lastProcessedSeq
      );
      slot.client.sendBytes("snapshot", snapshot);
    }
  }

  startGame() {
    this.state.phase = "playing";
    this.lock();
  }

  allReady(): boolean {
    for (const [, meta] of this.state.players) {
      if (!meta.ready) return false;
    }
    return this.state.players.size >= 2;
  }
}
```

### Key Integration Patterns

1. **No game logic in the room** -- the room calls `stepWorld()`, `spawnPlayer()`, `setPlayerInput()`. All defined in shared.
2. **Seed sharing** -- send the RNG seed to clients so they can create a matching `GameWorld` for prediction.
3. **ECS is the source of truth** -- Schema holds only lobby metadata. Game entity positions come from ECS SoA arrays and go out as binary snapshots.
4. **Input is write-once** -- the room writes input into ECS components; systems read it. The room never interprets what the input means.

---

## 18. Common Gotchas

### TypeScript Config
- MUST have `"experimentalDecorators": true` and `"useDefineForClassFields": false` in tsconfig. Forgetting causes silent `@type()` failures.

### Schema Pitfalls
- Only the **server** mutates state directly. Clients send messages to request changes.
- Use `MapSchema` for entities (track by ID). Avoid `ArraySchema` for entities (reordering is expensive).
- Large MapSchema operations (adding/removing many items in one tick) create large patches.
- `"string"` type fields are expensive to sync compared to numeric types.
- All `@colyseus/*` packages must be the **same major.minor version**. Mixing causes silent serialization failures.

### Simulation Pitfalls
- `setSimulationInterval` adds delay AFTER callback completes. If your tick takes 20ms and your interval is 16ms, effective tick rate drops below 60Hz.
- State patches are sent every `patchRate` ms regardless of whether state changed. Empty rooms still have overhead.
- Never use `Math.random()` in shared simulation code -- use `world.rng` (SeededRng).

### Memory
- Cap input queue lengths per player (e.g., 30) to prevent memory issues from burst sends.
- Clean up MapSchema/ArraySchema entries in `onLeave` to prevent stale state.
- `removeAllListeners()` on client-side room reference when done.

---

## 19. Version Notes

### Colyseus 0.15

- `@filter()` / `@filterChildren()` available but not recommended for real-time games.
- `allowReconnection()` requires reconnection token (not sessionId).
- `@colyseus/schema` 2.x with delta encoding.
- `client.sendBytes()` available for raw binary.

### Colyseus 0.16 (Latest Stable)

- `@filter()` / `@filterChildren()` **removed**. Replaced by `StateView`.
- `@colyseus/schema` 3.0 is now a `peerDependency`.
- `matchMaker.find()` renamed to `matchMaker.query()`.
- Room properties (`patchRate`, `autoDispose`, `maxClients`) settable at class level.
- `Room.onBeforeShutdown()` and `Room.onUncaughtException()` added.
- Client SDK uses `getStateCallbacks(room)` for the `$()` callback pattern.
- `getAvailableRooms()` removed from client SDKs.
- Sending Schema instances as messages is deprecated.
- Experimental WebTransport support via `@colyseus/h3-transport`.

For High Noon, start with 0.16 and skip Schema for game state entirely (recommended). The version differences barely matter when using the hybrid approach.

---

## Sources

- [Colyseus Getting Started](https://docs.colyseus.io/getting-started)
- [Colyseus Server Setup](https://docs.colyseus.io/server)
- [Room Lifecycle](https://0-15-x.docs.colyseus.io/server/room/)
- [Schema Definition](https://docs.colyseus.io/state/schema)
- [State Overview](https://docs.colyseus.io/state)
- [State Callbacks](https://docs.colyseus.io/state/callbacks)
- [StateView (0.16)](https://docs.colyseus.io/state/view)
- [Best Practices](https://docs.colyseus.io/state/best-practices)
- [Client-Side SDK](https://docs.colyseus.io/client)
- [Match-maker API](https://docs.colyseus.io/server/matchmaker)
- [Timing Events](https://docs.colyseus.io/server/room/timing-events)
- [Unit Testing](https://docs.colyseus.io/tools/unit-testing)
- [Scalability](https://docs.colyseus.io/deployment/scalability)
- [Presence API](https://docs.colyseus.io/server/presence)
- [Graceful Shutdown](https://docs.colyseus.io/server/graceful-shutdown)
- [Exception Handling](https://docs.colyseus.io/server/room/exception-handling)
- [Upgrading to 0.16](https://docs.colyseus.io/upgrading/0.16)
- [FAQ](https://docs.colyseus.io/faq)
- [@colyseus/schema GitHub](https://github.com/colyseus/schema)
- [@colyseus/testing npm](https://www.npmjs.com/package/@colyseus/testing)
- [Fixed Tickrate Tutorial](https://docs.colyseus.io/tutorial/phaser/fixed-tickrate)
- [Client Predicted Input Tutorial](https://learn.colyseus.io/phaser/3-client-predicted-input)
- [Client-Side Prediction (Gabriel Gambetta)](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html)
- [Fix Your Timestep! (Gaffer On Games)](https://gafferongames.com/post/fix_your_timestep/)
- [ArraySchema Performance Discussion](https://discuss.colyseus.io/topic/420/arrayschema-is-very-slow)
