# Multiplayer Implementation TODO

This document tracks changes needed to support online multiplayer. The current codebase is designed with multiplayer in mind, but some refactoring will be needed when networking is added.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Game Server                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │   Room 1    │  │   Room 2    │  │   Room 3    │   ...    │
│  │  GameWorld  │  │  GameWorld  │  │  GameWorld  │          │
│  │  Tilemap    │  │  Tilemap    │  │  Tilemap    │          │
│  │  Players[]  │  │  Players[]  │  │  Players[]  │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
        ▲                   ▲                   ▲
        │ WebSocket         │                   │
        ▼                   ▼                   ▼
   ┌─────────┐         ┌─────────┐         ┌─────────┐
   │ Client  │         │ Client  │         │ Client  │
   │ (Pred)  │         │ (Pred)  │         │ (Pred)  │
   └─────────┘         └─────────┘         └─────────┘
```

---

## Required Changes

### 1. Player Input System Refactor

**File**: `packages/shared/src/sim/systems/playerInput.ts`

**Current**: Applies single `InputState` to ALL player entities.

**Problem**: Server receives different inputs from different clients.

**Solution**: Change to per-entity input application.

```typescript
// Option A: Input map parameter
export function playerInputSystem(
  world: GameWorld,
  _dt: number,
  inputs: Map<number, InputState>  // entityId -> input
): void {
  const players = playerQuery(world)
  for (const eid of players) {
    const input = inputs.get(eid)
    if (!input) continue
    applyInputToPlayer(eid, input)
  }
}

// Option B: Inputs stored on world
interface GameWorld extends IWorld {
  tick: number
  time: number
  tilemap: Tilemap | null
  playerInputs: Map<number, InputState>  // Add this
}

export function playerInputSystem(world: GameWorld, _dt: number): void {
  const players = playerQuery(world)
  for (const eid of players) {
    const input = world.playerInputs.get(eid)
    if (!input) continue
    applyInputToPlayer(eid, input)
  }
}
```

**Recommendation**: Option B keeps system signatures consistent.

---

### 2. Player-Entity Mapping

**Need**: Track which network player owns which entity.

**Location**: New file `packages/shared/src/sim/playerRegistry.ts` or extend `world.ts`

```typescript
interface PlayerInfo {
  eid: number          // Entity ID
  sessionId: string    // Network/session ID
  slot: number         // Player slot (0-7)
}

interface GameWorld extends IWorld {
  // ... existing fields
  players: Map<string, PlayerInfo>  // sessionId -> PlayerInfo
}

// Helper functions
function getPlayerEntity(world: GameWorld, sessionId: string): number | null
function addPlayer(world: GameWorld, sessionId: string): number
function removePlayer(world: GameWorld, sessionId: string): void
```

---

### 3. Input Sequence Numbers

**Need**: Track input sequence for client prediction reconciliation.

**Location**: `packages/shared/src/net/input.ts`

```typescript
interface InputState {
  // ... existing fields
  seq: number           // Sequence number for this input
  tick: number          // Server tick this input targets
}
```

**Server**: Stores last acknowledged input per player.

**Client**: Replays unacknowledged inputs after receiving server snapshot.

---

### 4. Snapshot Serialization

**Need**: Serialize world state for network transmission.

**Location**: New file `packages/shared/src/net/snapshot.ts`

```typescript
interface PlayerSnapshot {
  eid: number
  x: number
  y: number
  aimAngle: number
  state: number           // PlayerStateType (IDLE, MOVING, ROLLING)
  isInvincible: boolean   // i-frame status for visual feedback
  rollElapsed?: number    // Optional: for client-side roll continuation
  rollDuration?: number   // Optional: for client-side roll continuation
}

interface WorldSnapshot {
  tick: number
  players: PlayerSnapshot[]
  // bullets, enemies, etc.
}

function serializeSnapshot(world: GameWorld): WorldSnapshot
function applySnapshot(world: GameWorld, snapshot: WorldSnapshot): void
```

**Optimization**: Delta compression - only send changed entities.

---

### 5. Interpolation Buffer

**Need**: Client needs to buffer snapshots for smooth remote player interpolation.

**Location**: `packages/client/src/net/InterpolationBuffer.ts`

```typescript
class InterpolationBuffer {
  private snapshots: WorldSnapshot[] = []
  private interpolationDelay = 100 // ms

  push(snapshot: WorldSnapshot): void
  getInterpolatedState(renderTime: number): WorldSnapshot
}
```

---

### 6. Client Prediction

**Need**: Client predicts local player, reconciles with server.

**Location**: `packages/client/src/net/Prediction.ts`

```typescript
class PredictionManager {
  private pendingInputs: InputState[] = []
  private lastAckedSeq: number = 0

  // Store input and send to server
  recordInput(input: InputState): void

  // On server snapshot, replay unacked inputs
  reconcile(serverSnapshot: WorldSnapshot): void
}
```

**Roll Prediction Notes**:
- Roll state (duration, elapsed, direction) must be replayed during reconciliation
- If server says player is rolling but client isn't, need to sync roll component
- I-frame visual feedback should use server's `isInvincible` for remote players
- Local player uses predicted i-frame state for immediate visual feedback

---

## Performance Considerations

### Entity-Entity Collision Optimization

**Current**: O(n²) loop in `collisionSystem`.

**When needed**: 8+ players with many bullets/enemies.

**Solution**: Spatial hash grid for broad phase.

```typescript
// packages/shared/src/sim/spatialHash.ts
class SpatialHash {
  private cellSize: number
  private cells: Map<string, number[]>  // cell key -> entity IDs

  insert(eid: number, x: number, y: number, radius: number): void
  query(x: number, y: number, radius: number): number[]
  clear(): void
}
```

---

### Object Pooling for Hot Paths

**Files to optimize**:
- `tilemap.ts`: `getTilesInCircle()` allocates array every call
- `collision.ts`: Penetration vector objects

**Solution**: Pre-allocated arrays, reuse objects.

```typescript
// Pooled tile array
const tilePool: Array<{ tileX: number; tileY: number }> = []
let tilePoolSize = 0

function getTilesInCircle(...): ReadonlyArray<{ tileX: number; tileY: number }> {
  tilePoolSize = 0
  // ... fill tilePool instead of creating new array
  return tilePool.slice(0, tilePoolSize)
}
```

---

## Network Protocol

### Client → Server Messages

```typescript
type ClientMessage =
  | { type: 'input'; seq: number; input: InputState }
  | { type: 'join'; name: string }
  | { type: 'leave' }
```

### Server → Client Messages

```typescript
type ServerMessage =
  | { type: 'snapshot'; tick: number; data: WorldSnapshot; ack: number }
  | { type: 'playerJoined'; sessionId: string; eid: number }
  | { type: 'playerLeft'; sessionId: string }
  | { type: 'event'; event: GameEvent }  // Damage, death, etc.
```

---

## Server Architecture (Colyseus)

```typescript
// packages/server/src/rooms/GameRoom.ts
class GameRoom extends Room {
  world: GameWorld
  systems: SystemRegistry
  playerInputs: Map<string, InputState>

  onCreate(options: any) {
    this.world = createGameWorld()
    this.setSimulationInterval(() => this.tick(), TICK_MS)
  }

  onJoin(client: Client) {
    const eid = spawnPlayer(this.world, ...)
    this.state.players.set(client.sessionId, { eid })
  }

  onMessage(client: Client, message: ClientMessage) {
    if (message.type === 'input') {
      this.playerInputs.set(client.sessionId, message.input)
    }
  }

  tick() {
    // Apply inputs to correct entities
    for (const [sessionId, input] of this.playerInputs) {
      const player = this.state.players.get(sessionId)
      if (player) {
        this.world.playerInputs.set(player.eid, input)
      }
    }

    // Run simulation
    stepWorld(this.world, this.systems)

    // Broadcast snapshot
    this.broadcast('snapshot', serializeSnapshot(this.world))
  }
}
```

---

## Testing Checklist

Before shipping multiplayer:

- [ ] Latency simulation (100-200ms) feels acceptable
- [ ] Client prediction doesn't cause visual jitter
- [ ] Reconciliation handles packet loss gracefully
- [ ] 8 players in one room maintains 60fps server-side
- [ ] Snapshot size is reasonable (<1KB per tick)
- [ ] Player join/leave doesn't cause desync
- [ ] All game events (damage, death) replicate correctly

---

## Implementation Order

1. **Server skeleton** - Colyseus room, tick loop
2. **Snapshot serialization** - Encode/decode world state
3. **Basic networking** - Join room, receive snapshots
4. **Input system refactor** - Per-entity inputs
5. **Client prediction** - Local player prediction
6. **Reconciliation** - Replay on server correction
7. **Interpolation** - Smooth remote players
8. **Optimization** - Spatial hash, pooling, delta compression
