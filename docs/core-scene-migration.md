# Core Scene Migration (2026-02-09)

## Summary

Client scene architecture was migrated from two public scene classes to one public `CoreGameScene` with mode-specific controllers.

For the full runtime architecture and data-flow reference, see `docs/core-scene-system.md`.

- Old public classes removed from runtime path:
  - `GameScene`
  - `MultiplayerGameScene`
- New public entrypoint:
  - `CoreGameScene`
- Shared scene UI types moved to:
  - `packages/client/src/scenes/types.ts`

## New Structure

- `packages/client/src/scenes/CoreGameScene.ts`
  - Public scene API used by both `/play` and `/play-multi`
  - Selects mode controller based on config
- `packages/client/src/scenes/core/SceneModeController.ts`
  - Common controller contract
- `packages/client/src/scenes/core/SingleplayerModeController.ts`
  - Single-player mode behavior
- `packages/client/src/scenes/core/MultiplayerModeController.ts`
  - Multiplayer mode behavior

## API Mapping

- `GameScene.create({ gameApp })` -> `CoreGameScene.create({ gameApp, mode: 'singleplayer' })`
- `MultiplayerGameScene.create(gameApp)` + `scene.connect()` -> `CoreGameScene.create({ gameApp, mode: 'multiplayer' })`
- `scene.isDisconnected` (property) -> `scene.isDisconnected()` (method)

## Page Wiring

- `/play` now uses `CoreGameScene` in singleplayer mode.
- `/play-multi` now uses `CoreGameScene` in multiplayer mode.
- Routes remain unchanged.

## Type Import Changes

- `HUDState`, `SkillTreeUIData`, `SkillNodeState` are now imported from:
  - `packages/client/src/scenes/types.ts`

Updated UI modules:
- `packages/client/src/ui/GameHUD.tsx`
- `packages/client/src/ui/SkillTreePanel.tsx`
