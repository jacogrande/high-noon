# @high-noon/shared

The shared game core. Everything gameplay-critical lives here so it can run on both server (authoritative) and client (prediction/replays).

## Responsibilities

- Deterministic game simulation (ECS world, systems, fixed timestep)
- Network protocol definitions and serialization
- Game content definitions (weapons, enemies, items)
- Math utilities and vector operations
- Replay recording/playback infrastructure

## Design Principles

- **Deterministic**: Given the same inputs and seed, produce identical results
- **Pure-ish systems**: Gameplay updates are pure functions over data
- **Events for side-effects**: Systems emit events rather than causing side-effects directly
- **No rendering or I/O**: This package has no dependencies on browser/server APIs

## Commands

```bash
bun run build      # Compile TypeScript to dist/
bun run dev        # Watch mode compilation
bun run typecheck  # Type check without emitting
bun test           # Run unit tests
```

## Dependencies

- `bitecs` - Entity Component System

## Dependents

- `@high-noon/client` - Imports for client-side prediction and rendering
- `@high-noon/server` - Imports for authoritative simulation

## Modules

### `math/` - Vector Math

2D vector utilities for game math:

```typescript
import { create, add, normalize, distance } from '@high-noon/shared'

const pos = create(100, 200)
const vel = create(5, 0)
const nextPos = add(pos, vel)
```

Functions: `create`, `add`, `sub`, `scale`, `normalize`, `length`, `dot`, `lerp`, `angle`, `fromAngle`, `distance`, `distanceSq`, `rotate`, `negate`, `perpendicular`, `equals`

### `sim/` - Game Simulation

ECS world and components:

```typescript
import { createGameWorld, stepWorld, Position, Velocity } from '@high-noon/shared'

const world = createGameWorld()
stepWorld(world, input)  // Advance by one tick
```

**Components:**
- `Position` - World position with previous for interpolation
- `Velocity` - Movement speed in pixels/second
- `Player` - Player entity marker with ID and aim angle
- `PlayerState` - Current state (IDLE, MOVING, ROLLING)
- `Speed` - Movement speed values
- `Collider` - Collision radius and layer
- `Bullet` - Projectile data (owner, damage, lifetime)
- `Weapon` - Weapon stats (fire rate, bullet speed)
- `Invincible` - Tag for i-frame entities

**Constants:**
- `TICK_RATE` = 60 (ticks per second)
- `TICK_S` = 1/60 (seconds per tick)
- `TICK_MS` = 16.67 (milliseconds per tick)

### `net/` - Network Protocol

Input state definitions:

```typescript
import { createInputState, hasButton, Button } from '@high-noon/shared'

const input = createInputState()
if (hasButton(input, Button.SHOOT)) {
  // Fire weapon
}
```

**Button flags:** `MOVE_UP`, `MOVE_DOWN`, `MOVE_LEFT`, `MOVE_RIGHT`, `SHOOT`, `ROLL`

## Directory Structure

```
src/
  index.ts           # Barrel export
  math/
    vec2.ts          # 2D vector math
    vec2.test.ts     # Unit tests
    index.ts
  sim/
    components.ts    # ECS component definitions
    world.ts         # World creation
    step.ts          # Fixed timestep logic
    index.ts
  net/
    input.ts         # Input state types
    index.ts
```
