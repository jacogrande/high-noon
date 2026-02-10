# Sprint 7: Character Branch Migration (Core Scene + Multiplayer)

## Context

The `new-character` branch introduces major gameplay content:

- Character select UI
- 3 playable characters (`sheriff`, `undertaker`, `prospector`)
- New shared simulation systems (Last Rites, melee, dynamite, gold rush, knockback, slow debuff)
- Expanded skill/node effect behavior
- Character-specific weapon/render/VFX work

That branch diverged before the current runtime architecture and multiplayer netcode stack. It reintroduces split scenes and older networking paths, which would regress current `main` if merged directly.

This sprint ports the feature set into the **current architecture**:

- `CoreGameScene` + mode controllers
- Shared scene-core feedback pipeline
- Snapshot v5 + input sequencing + reconciliation + interpolation + clock sync
- Current server input/rate-limit/reconnect hardening

## Goal

Port all gameplay value from `new-character` while preserving and extending current architecture for both singleplayer and multiplayer.

## Non-Negotiable Constraints

- Do not reintroduce separate public game scenes.
- Do not regress net protocol (`NetworkInput` seq, snapshot v5 fields, clock sync, reconnect behavior).
- Do not regress multiplayer prediction/reconciliation pipeline.
- New character abilities must be integrated through shared scene-core modules, not duplicated scene logic.

## Success Criteria

- [ ] Singleplayer supports character selection and all 3 characters end-to-end.
- [ ] Shared simulation contains branch character mechanics with passing tests.
- [ ] Multiplayer handshake carries character selection and validates it server-side.
- [ ] Multiplayer supports character mechanics without regressing movement/fire responsiveness.
- [ ] Existing tests continue passing; new tests cover character-specific behavior and parity.
- [ ] Docs reflect architecture and backend changes.

## Out of Scope

- Matchmaking/lobby UX beyond a minimal room join path.
- Cross-version network compatibility with pre-migration clients.
- Balancing pass beyond preserving current branch behavior.

---

## Phase 1: Port Shared Character Definitions and Stat Surface

### Branch Features Ported

- `CharacterId` expansion and character defs:
  - `undertaker`
  - `prospector`
- Character-specific base stats and skill branches
- Expanded `StatName` and upgrade stat fields

### Scope

- Port shared content only (`packages/shared/src/sim/content/characters/*`, weapon/constants updates, upgrade stat fields).
- Keep `SHERIFF` as default when no character is specified.
- No scene, networking, or backend behavior changes yet.

### Key Changes

- Add `CharacterId`/character def data model on top of current shared package.
- Extend `UpgradeState` stat surface with branch fields needed by new characters.
- Ensure `writeStatsToECS` remains safe when character components differ (bullet vs melee loadouts).

### Acceptance

- [ ] Shared typecheck passes.
- [ ] Character definition tests pass.
- [ ] Existing Sheriff systems still compile and run unchanged.

---

## Phase 2: Port Shared Systems and Hook Behavior from `new-character`

### Branch Features Ported

- Components: `MeleeWeapon`, `Knockback`, `SlowDebuff`
- Systems:
  - `lastRites`
  - `melee`
  - `dynamite`
  - `goldRush`
  - `knockback`
  - `slowDebuff`
  - helper utilities (`damageHelpers`)
- Node effect/hook expansions for Undertaker/Prospector

### Scope

- Port deterministic simulation behavior into `packages/shared`.
- Preserve current canonical system registration APIs.
- Keep multiplayer prediction/replay registration compatible; extend only where required.

### Key Changes

- Add new systems and tests.
- Add character-aware system registration without removing existing prediction/replay pathways.
- Keep branch ordering guarantees where mechanics depend on ordering.
- Preserve cleanup invariants for temporary world state collections.

### Acceptance

- [ ] New shared system tests pass.
- [ ] Existing shared system tests pass.
- [ ] Deterministic behavior preserved for same seed/input.

---

## Phase 3: Port Singleplayer Character Runtime into `CoreGameScene`

### Branch Features Ported

- Character select UI flow
- Character-specific weapon/render setup
- Ability label/HUD behavior differences
- Singleplayer VFX/audio cues for Undertaker and Prospector mechanics

### Scope

- Integrate selection and runtime via `CoreGameScene` and `SingleplayerModeController`.
- Do not reintroduce legacy `GameScene`.

### Key Changes

- Extend `CoreGameSceneConfig` / controller init options with `characterId`.
- Add `CharacterSelect` UI and hook it into `packages/client/src/pages/Game.tsx`.
- Update `SingleplayerModeController` to initialize world/systems by selected character.
- Route new ability cues through shared scene-core event/presentation modules.
- Add ability-display fields to scene `HUDState` and adapt UI.

### Acceptance

- [ ] Player can start singleplayer as each of the 3 characters.
- [ ] Skill tree and HUD are character-correct.
- [ ] No duplicate feedback code introduced across mode controllers.

---

## Phase 4: Backend Character Negotiation and Authority (Room Contract)

### Branch Features Ported

- Character choice at session start

### Scope

- Add explicit server-authoritative character selection in join/config flow.
- Preserve current hardened room behavior (rate limiting, queue trim, reconnection window).

### Key Changes

- Extend room join options with `characterId`.
- Validate incoming character server-side (allowlist).
- Include authoritative character in `game-config`.
- Persist character choice across reconnect for the same slot/session.
- Update protocol types and client `NetworkClient` handlers accordingly.

### Acceptance

- [ ] Server rejects invalid character IDs.
- [ ] Client receives authoritative character in `game-config`.
- [ ] Reconnect resumes with same character.

---

## Phase 5: Multiplayer Character Support on Current Prediction/Reconciliation Stack

### Branch Features Ported

- Multiplayer playability for non-Sheriff characters

### Scope

- Integrate characters into existing `MultiplayerModeController`, `SnapshotIngestor`, `MultiplayerReconciler`, and shared presentation pipeline.
- Keep snapshot apply on fixed update and render decoupling intact.

### Key Changes

- Add character-aware local world initialization in multiplayer controller.
- Adapt prediction/replay system registration for character-specific mechanics.
- Ensure ownership/matching/interpolation paths handle new spawned entity patterns.
- Extend HUD composition for character-specific ability state.

### Acceptance

- [ ] Multiplayer local character plays responsively for each supported character.
- [ ] No regression to shot/roll reconciliation quality.
- [ ] Existing multiplayer tests still pass; add per-character smoke coverage.

---

## Phase 6: Mixed-Character Multiplayer Refactor (Per-Player Runtime State)

### Branch Features Ported

- True multi-character support in the same room (not room-locked character)

### Scope

- Remove remaining world-global assumptions for character/ability runtime state.
- Move mutable character ability state to per-player runtime containers.

### Key Changes

- Introduce per-player runtime state model (character ID + ability timers/stacks/state).
- Refactor shared systems to resolve state by acting player/entity instead of global `world.upgradeState` for character-local mutable data.
- Update server player registry + room lifecycle to bind each player entity to its character runtime state.
- Extend snapshots/HUD payloads only where remote presentation requires it.

### Acceptance

- [ ] Two or more players can join with different characters in one room.
- [ ] Ability state is isolated per player.
- [ ] No cross-player state leakage (timers/buffs/cooldowns).

---

## Phase 7: Presentation Parity, QA Hardening, and Documentation

### Branch Features Ported

- Final visual polish and parity expectations from branch feature set

### Scope

- Ensure all new mechanics emit effects through shared scene-core pathways.
- Add regression coverage and docs updates.

### Key Changes

- Add/expand parity harness tests (singleplayer vs predicted-local event parity for character-specific actions).
- Add multiplayer telemetry lines for new mechanic reconciliation edge cases.
- Update architecture docs and multiplayer docs with character flow and protocol updates.
- Add manual test checklist for 3-character multiplayer scenarios.

### Acceptance

- [ ] `bun run typecheck`, `bun test`, and `bun run build` pass.
- [ ] Character-specific parity tests pass.
- [ ] Docs are current and implementation-aligned.

---

## Dependency and Execution Order

```text
Phase 1 -> Phase 2 -> Phase 3
Phase 2 -> Phase 4 -> Phase 5
Phase 5 -> Phase 6 -> Phase 7
```

`Phase 6` is the largest risk and should not start until `Phase 5` is stable.

## Risk Register

- **Risk:** Reintroducing old scene/netcode architecture during port.
  - **Mitigation:** Port shared content first; forbid legacy scene file restores.
- **Risk:** Character mechanics coupled to global world state.
  - **Mitigation:** Dedicated Phase 6 per-player runtime refactor with explicit acceptance checks.
- **Risk:** Multiplayer feel regressions from new systems.
  - **Mitigation:** Keep prediction/reconciliation modules intact; add per-character parity and telemetry checks before merge.

## Done Definition

Sprint is done when all phases are complete, all success criteria are checked, and no architecture regressions are introduced relative to current `main`.
