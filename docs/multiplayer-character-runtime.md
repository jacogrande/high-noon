# Multiplayer Character Runtime (Core Scene Architecture)

Date: 2026-02-10

## Summary

Character selection is now wired end-to-end through the current architecture (not legacy split scenes):

- UI chooses character (`sheriff`, `undertaker`, `prospector`)
- Client sends character preference on join
- Server validates and applies authoritative character per player
- Server returns authoritative character in `game-config`
- Client prediction/HUD bootstraps from that authoritative character

## End-to-End Flow

1. Player selects character in:
   - `packages/client/src/ui/CharacterSelect.tsx`
2. Page passes selection to scene creation:
   - `packages/client/src/pages/Game.tsx`
   - `packages/client/src/pages/MultiplayerGame.tsx`
3. Scene forwards character:
   - `packages/client/src/scenes/CoreGameScene.ts`
4. Multiplayer join sends selected character:
   - `packages/client/src/net/NetworkClient.ts`
5. Server validates `characterId` and creates per-player runtime state:
   - `packages/server/src/rooms/GameRoom.ts`
6. Server sends authoritative `game-config.characterId` and character-aware HUD payload.
7. Multiplayer client applies authoritative local character setup during snapshot ingestion:
   - `packages/client/src/scenes/core/SnapshotIngestor.ts`
   - `packages/client/src/scenes/core/MultiplayerModeController.ts`

## Authority Rules

- Client selection is a request.
- Server decides authoritative `characterId`.
- Reconnect keeps the same server slot + character.
- Multiplayer HUD and local prediction should always read authoritative local character/runtime state.

## HUD Model

`HudData`/`HUDState` now include character-aware ability fields:

- `characterId`
- `showCylinder`
- `abilityName`
- `abilityActive`
- `abilityCooldown`
- `abilityCooldownMax`
- `abilityTimeLeft`
- `abilityDurationMax`

Legacy showdown fields are still populated as aliases during migration to avoid breakage in older call sites.

## Runtime Mapping

- Sheriff:
  - cylinder visible
  - ability: Showdown
- Undertaker:
  - cylinder visible
  - ability: Last Rites (reuses Showdown component state)
- Prospector:
  - no cylinder
  - ability: Dynamite (cooldown in Showdown component + cook state in upgrade runtime)

## Key Implementation Notes

- Shared sim runtime is per-player for character state:
  - `world.playerUpgradeStates`
  - `world.playerCharacters`
- Snapshot ingestion now initializes local predicted components by authoritative character:
  - bullet/cylinder path for Sheriff/Undertaker
  - melee path for Prospector
- Multiplayer controller avoids Sheriff-only cylinder presentation logic when local character has no cylinder.

## Validation Run

- `bun run typecheck` passed.
- `bun test` passed (605 pass, 0 fail).
- `bun run build` passed.
