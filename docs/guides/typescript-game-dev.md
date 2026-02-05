# TypeScript Game Development Best Practices

## Overview

TypeScript provides type safety and better tooling for game development. This guide covers patterns relevant to High Noon's architecture.

## Project Setup

### Strict Mode

Enable strict TypeScript for catching bugs early:

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### Monorepo Configuration

Each package extends the base config:

```json
// packages/shared/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

## Type Patterns for Games

### Entity IDs

Use branded types to prevent mixing up different ID types:

```typescript
// Branded type pattern
type EntityId = number & { readonly __brand: 'EntityId' }
type PlayerId = number & { readonly __brand: 'PlayerId' }

function damageEntity(target: EntityId, source: EntityId, amount: number) {
  // Can't accidentally pass a PlayerId here
}
```

### Component Data

For ECS components, define clear interfaces:

```typescript
// Component definitions for bitECS
interface PositionStore {
  x: Float32Array
  y: Float32Array
}

interface VelocityStore {
  x: Float32Array
  y: Float32Array
}

// Type-safe component access
function moveSystem(world: World) {
  for (const eid of query(world, [Position, Velocity])) {
    Position.x[eid] += Velocity.x[eid]
    Position.y[eid] += Velocity.y[eid]
  }
}
```

### Message Types

Define network messages as discriminated unions:

```typescript
// Client -> Server
type ClientMessage =
  | { type: 'input'; seq: number; buttons: number; aimAngle: number }
  | { type: 'ackSnapshot'; tick: number }

// Server -> Client
type ServerMessage =
  | { type: 'snapshot'; tick: number; players: PlayerState[] }
  | { type: 'spawnBullet'; id: number; x: number; y: number; vx: number; vy: number }
  | { type: 'damage'; targetId: number; amount: number; sourceId: number }

// Type-safe message handling
function handleServerMessage(msg: ServerMessage) {
  switch (msg.type) {
    case 'snapshot':
      applySnapshot(msg.tick, msg.players)
      break
    case 'spawnBullet':
      spawnLocalBullet(msg.id, msg.x, msg.y, msg.vx, msg.vy)
      break
    case 'damage':
      showDamageNumber(msg.targetId, msg.amount)
      break
  }
}
```

### Game State

Use const assertions for immutable data:

```typescript
const WEAPON_STATS = {
  pistol: { damage: 10, fireRate: 0.2, spread: 0.05 },
  shotgun: { damage: 5, fireRate: 0.8, spread: 0.3 },
  rifle: { damage: 25, fireRate: 0.5, spread: 0.01 },
} as const

type WeaponType = keyof typeof WEAPON_STATS
```

## Fixed Timestep Pattern

Critical for deterministic simulation:

```typescript
const TICK_RATE = 60
const TICK_MS = 1000 / TICK_RATE

class FixedTimestep {
  private accumulator = 0
  private lastTime = 0

  update(currentTime: number, stepFn: () => void): number {
    if (this.lastTime === 0) {
      this.lastTime = currentTime
      return 0
    }

    const delta = currentTime - this.lastTime
    this.lastTime = currentTime
    this.accumulator += delta

    let steps = 0
    while (this.accumulator >= TICK_MS) {
      stepFn()
      this.accumulator -= TICK_MS
      steps++
    }

    return this.accumulator / TICK_MS // Interpolation alpha
  }
}
```

## Deterministic RNG

For synchronized simulation across client/server:

```typescript
// Simple mulberry32 PRNG
function createRng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Usage
const rng = createRng(matchSeed)
const spawnX = rng() * ARENA_WIDTH
const spawnY = rng() * ARENA_HEIGHT
```

## Object Pooling

Avoid GC pauses in hot paths:

```typescript
class Pool<T> {
  private pool: T[] = []

  constructor(
    private create: () => T,
    private reset: (obj: T) => void
  ) {}

  acquire(): T {
    return this.pool.pop() ?? this.create()
  }

  release(obj: T): void {
    this.reset(obj)
    this.pool.push(obj)
  }
}

// Bullet pool
const bulletPool = new Pool(
  () => ({ x: 0, y: 0, vx: 0, vy: 0, active: false }),
  (b) => { b.active = false }
)
```

## Vector Math

Create a small, typed vector library:

```typescript
interface Vec2 {
  x: number
  y: number
}

const vec2 = {
  create: (x = 0, y = 0): Vec2 => ({ x, y }),

  add: (a: Vec2, b: Vec2, out: Vec2 = { x: 0, y: 0 }): Vec2 => {
    out.x = a.x + b.x
    out.y = a.y + b.y
    return out
  },

  scale: (v: Vec2, s: number, out: Vec2 = { x: 0, y: 0 }): Vec2 => {
    out.x = v.x * s
    out.y = v.y * s
    return out
  },

  length: (v: Vec2): number => Math.sqrt(v.x * v.x + v.y * v.y),

  normalize: (v: Vec2, out: Vec2 = { x: 0, y: 0 }): Vec2 => {
    const len = vec2.length(v)
    if (len > 0) {
      out.x = v.x / len
      out.y = v.y / len
    }
    return out
  },

  dot: (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y,
}
```

## Error Handling

Use Result types for operations that can fail:

```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E }

function parseMessage(data: ArrayBuffer): Result<ServerMessage, string> {
  try {
    const decoded = decode(data)
    if (!isValidMessage(decoded)) {
      return { ok: false, error: 'Invalid message format' }
    }
    return { ok: true, value: decoded }
  } catch {
    return { ok: false, error: 'Failed to decode message' }
  }
}
```

## Performance Considerations

### Avoid Allocations in Hot Paths

```typescript
// Bad - creates new object every frame
function update() {
  const velocity = { x: speed * Math.cos(angle), y: speed * Math.sin(angle) }
  position.x += velocity.x
}

// Good - reuse objects
const tempVec = { x: 0, y: 0 }
function update() {
  tempVec.x = speed * Math.cos(angle)
  tempVec.y = speed * Math.sin(angle)
  position.x += tempVec.x
}
```

### Use TypedArrays for Large Data

```typescript
// For storing many entity positions
const positions = {
  x: new Float32Array(MAX_ENTITIES),
  y: new Float32Array(MAX_ENTITIES),
}
```

### Profile Before Optimizing

Use Chrome DevTools Performance panel to identify actual bottlenecks before optimizing.

## Resources

- [Fix Your Timestep](https://gafferongames.com/post/fix_your_timestep/) - Essential reading
- [Client-Side Prediction](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html)
- [Snapshot Interpolation](https://gafferongames.com/post/snapshot_interpolation/)
