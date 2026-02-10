# Multiplayer Jump + Hazard Migration Notes

Date: 2026-02-10

## Goal

Port jump/terrain hazards from the `high-noon-3` feature set into the shared simulation and ensure singleplayer + multiplayer parity through the Core Scene architecture.

## Implemented

- Added shared jump content/constants (`jump.ts`) and hazard content/constants (`hazards.ts`).
- Added jump state/components (`Jump`, `ZPosition`) and player state extensions (`JUMPING`, `LANDING`).
- Added shared `jumpSystem` (arc, landing lockout, stomp, half-wall landing pushout).
- Added shared `hazardTileSystem` (lava DPS for grounded entities).
- Updated collision rules for jump-aware traversal:
  - airborne entities pass half-walls
  - grounded entities still collide with half-walls
  - airborne entities skip entity pushout
- Updated map content to include lava and half-wall tiles.
- Upgraded flow field from unweighted BFS to weighted Dijkstra with lava traversal costs.
- Extended net input protocol with `Button.JUMP`.
- Updated binary snapshot protocol (`v6`) to include:
  - `z`
  - `zVelocity`
  - `jumpButtonWasDown` flag bit
- Wired multiplayer client pipeline for jump state:
  - snapshot ingest
  - remote interpolation
  - reconciliation
  - local render barrel-tip math
- Added tile renderer fallbacks + tinting for lava/half-wall tiles.
- Added server queue-trim transient action support for jump (`TRANSIENT_ACTION_BUTTONS`).
- Updated prediction/replay subsets to include hazard damage simulation.

## Tests Added

- `packages/shared/src/sim/systems/jump.test.ts`
- `packages/shared/src/sim/systems/hazardTile.test.ts`
- `packages/shared/src/sim/systems/flowField.test.ts`
- Updated `packages/shared/src/net/snapshot.test.ts` for snapshot v6 payload.

## Architectural Notes

- Gameplay behavior remains shared-first (`packages/shared`), with mode-specific differences isolated to transport/authority concerns.
- Multiplayer presentation consumes authoritative state through scene-core modules instead of introducing a new scene split.
