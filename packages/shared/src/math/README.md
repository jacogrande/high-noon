# math/

Math utilities for game development.

## Responsibilities

- 2D vector operations
- Quantization helpers for network serialization
- Common math functions (lerp, clamp, etc.)
- Angle utilities

## Key Files

- `vec2.ts` - Vector2 operations (add, subtract, normalize, dot, etc.)
- `quantize.ts` - Float↔Int conversion for network efficiency
- `utils.ts` - General math utilities

## Quantization

For network efficiency, floats are quantized to integers:

```typescript
// Position: 2 decimal places, range -10000 to 10000
const posQ = toNetInt(position, 100) // multiply by 100, round
const pos = fromNetInt(posQ, 100)    // divide by 100

// Angle: 0-65535 maps to 0-2π
const angleQ = toNetAngle(radians)
const angle = fromNetAngle(angleQ)
```

## Design Philosophy

- Avoid allocations in hot paths (reuse objects)
- Provide both mutating and pure versions where useful
- Match conventions from common game math libraries

## Dependencies

None - pure math utilities.

## Dependents

- `../sim` - Physics calculations
- `../net` - Quantization for serialization
