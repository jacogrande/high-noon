# lighting/

Half-resolution lightmap rendering for world-space lights.

## Responsibilities

- Maintain a pooled set of point-light sprites.
- Render additive lights into a half-res render texture.
- Composite the resulting lightmap over gameplay with multiply blending.
- Support permanent lights (lava) and TTL lights (muzzle flashes).

## Files

- `LightingSystem.ts` - core lightmap renderer/pool manager
- `LightSource.ts` - light source type + light factories
- `textures.ts` - shared soft-circle texture cache
- `config.ts` - lighting tuning constants
- `index.ts` - module exports
