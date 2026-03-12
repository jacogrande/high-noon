# Sprint: GameAnalytics Telemetry

**Goal**: Integrate the GameAnalytics JS SDK to capture roguelite run lifecycle, gameplay decisions, and multiplayer session data. All telemetry is client-side only, GDPR-compliant via an opt-in consent dialog, and gated behind environment-based credentials.

**Depends on**: Current main (SingleplayerModeController, MultiplayerModeController, GameplayEventProcessor, EncounterState, UpgradeState, RunEndPanel)

---

## Current State

**What exists:**
- `SingleplayerModeController` manages the full run lifecycle: `startRun()`, stage transitions (`run.transition`), wave progression (`encounter.currentWave`), player death, and run completion (victory/defeat). All relevant simulation state (`world.run`, `world.encounter`, `world.killCount`, `world.goldCollected`, `world.characterId`, `world.initialSeed`) is accessible within the controller.
- `MultiplayerModeController` mirrors the same lifecycle via Colyseus room messages. It tracks `this.myClientEid`, player count via the room roster, and receives HUD data from the server including stage/wave/kill information.
- `GameplayEventProcessor` dispatches all presentation events. Events like `player-death`, `stage-complete`, `wave-clear`, `boss-death`, and `boss-intro` flow through `processAll()`.
- `GameplayEvents.ts` defines the full event union type with typed payloads.
- `SettingsPanel` (React component) provides volume/mute controls. `PauseMenu` wraps it with resume/quit actions. Both are simple, stateless components with inline styles.
- `RunEndPanel` receives `outcome`, `stageNumber`, `totalStages`, `level`, `goldCollected`, `killCount`, `items`, and `resolutionText` as props.
- `MultiplayerTelemetry` already demonstrates the pattern of a dedicated telemetry class that receives callbacks from the mode controller (e.g., `onSnapshotReceived`, `onRTTSample`).
- `EncounterState` on `GameWorld` tracks `currentWave`, `completed`, `fodderAliveCount`, `threatAliveCount`, and the full wave definition.
- `UpgradeState` tracks taken nodes, pending points, and level. `takeNode()` is called from `selectNode()` in both mode controllers.
- Vite config (`packages/client/vite.config.ts`) has no `define` entries for environment variables yet.
- No analytics, telemetry, or consent infrastructure exists.

**What doesn't exist:**
- GameAnalytics SDK dependency
- GDPR consent dialog or localStorage persistence
- Any analytics initialization or event dispatch
- Environment variable plumbing for game key / secret key
- Settings menu toggle for analytics opt-in/out

---

## Design Constraints

1. **GDPR opt-in before any data collection** — `GameAnalytics.initialize()` must not be called until the player explicitly consents. Consent is persisted in `localStorage`. First-time visitors see a dialog before the main menu. Returning visitors who previously consented skip the dialog.
2. **No analytics in shared package** — Analytics is purely client-side presentation/telemetry. Zero changes to `packages/shared` or `packages/server`. The client reads simulation state but never writes analytics state back into the ECS.
3. **Environment-based credentials** — Game key and secret key are injected via Vite's `define` or `import.meta.env`. Production and development use different GA projects. Missing keys disable analytics silently (no errors, no dialogs about failed init).
4. **Minimal bundle impact** — The `gameanalytics` npm package is ~53KB minified + gzipped. It batches events every 8 seconds and queues offline. No per-frame overhead.
5. **100K unique event IDs/day limit** — Design events use a colon-separated hierarchy (up to 5 levels). Keep the hierarchy stable and bounded: no per-entity IDs, no timestamps in event names, no unbounded string interpolation.
6. **Revocable consent** — Players can disable analytics at any time from the settings/pause menu. Toggling off calls `GameAnalytics.setEnabledEventSubmission(false)` and clears the localStorage flag. Toggling on re-enables submission and sets the flag.
7. **Graceful degradation** — If the SDK fails to load, if keys are missing, or if the user declines consent, the game functions identically. All analytics call sites are guarded.
8. **Session events are automatic** — Once initialized, GameAnalytics tracks session start/end, session length, and retention (D1/D7/D30) without any manual event calls.

---

## Epic Overview

| # | Epic | Package(s) | Priority | Estimate |
|---|------|-----------|----------|----------|
| 1 | GDPR consent dialog | client/ui | P0 | Small |
| 2 | GameAnalytics SDK initialization | client | P0 | Small |
| 3 | Run lifecycle events | client/scenes | P0 | Medium |
| 4 | Gameplay telemetry events | client/scenes | P1 | Medium |
| 5 | Multiplayer session events | client/scenes | P1 | Small |

---

## Epic 1: GDPR Consent Dialog

A first-launch consent dialog and a persistent toggle in the settings menu.

### Ticket 1.1 — Consent persistence utility

**File**: `packages/client/src/analytics/consent.ts`

Create a module that reads/writes consent state to `localStorage`:

```typescript
const CONSENT_KEY = 'hn_analytics_consent'

export type ConsentState = 'granted' | 'denied' | 'unset'

export function getConsent(): ConsentState {
  const value = localStorage.getItem(CONSENT_KEY)
  if (value === 'granted') return 'granted'
  if (value === 'denied') return 'denied'
  return 'unset'
}

export function setConsent(state: 'granted' | 'denied'): void {
  localStorage.setItem(CONSENT_KEY, state)
}
```

This is the single source of truth for consent. Every other module reads from here.

### Ticket 1.2 — Consent dialog React component

**File**: `packages/client/src/ui/ConsentDialog.tsx`

A simple modal shown when `getConsent() === 'unset'`. Two buttons: "Allow Analytics" and "No Thanks". Clicking either calls `setConsent(...)` and dismisses the dialog. Style consistent with `PauseMenu` (dark backdrop, monospace font, gold/muted tones).

```typescript
interface ConsentDialogProps {
  onDecision: (granted: boolean) => void
}
```

The dialog text should be concise:
- "High Noon collects anonymous gameplay data (run outcomes, upgrades chosen, session length) to improve game balance."
- "No personal information is collected. You can change this at any time in Settings."

### Ticket 1.3 — Analytics toggle in SettingsPanel

**File**: `packages/client/src/ui/SettingsPanel.tsx`

Add a new toggle row below the volume controls:

```typescript
interface SettingsPanelProps {
  volume: number
  muted: boolean
  onVolumeChange: (v: number) => void
  onMutedChange: (m: boolean) => void
  analyticsEnabled: boolean           // NEW
  onAnalyticsChange: (enabled: boolean) => void  // NEW
}
```

Render a labeled toggle: `ANALYTICS` with `ON/OFF` text. Toggling calls `onAnalyticsChange`, which the parent wires to `setConsent('granted'|'denied')` and to the analytics module's enable/disable API.

### Ticket 1.4 — Wire consent into app entry point

**File**: `packages/client/src/App.tsx` (or wherever the root React tree mounts)

On mount:
1. Read `getConsent()`.
2. If `'unset'`, render `ConsentDialog` before the main menu.
3. If `'granted'`, initialize analytics (Epic 2).
4. If `'denied'`, skip analytics init.
5. Pass `analyticsEnabled` and `onAnalyticsChange` down to `PauseMenu` → `SettingsPanel`.

---

## Epic 2: GameAnalytics SDK Initialization

Install the SDK and create an initialization wrapper gated on consent and environment keys.

### Ticket 2.1 — Install gameanalytics package

```bash
cd packages/client && bun add gameanalytics
```

The `gameanalytics` package exports a `GameAnalytics` class with static methods. ~53KB minified.

### Ticket 2.2 — Vite environment variables for GA keys

**File**: `packages/client/vite.config.ts`

No code change needed in vite.config.ts — Vite automatically exposes `VITE_`-prefixed env vars via `import.meta.env`. Create `.env` files:

**File**: `packages/client/.env.development`
```
VITE_GA_GAME_KEY=dev_game_key_here
VITE_GA_SECRET_KEY=dev_secret_key_here
```

**File**: `packages/client/.env.production`
```
VITE_GA_GAME_KEY=prod_game_key_here
VITE_GA_SECRET_KEY=prod_secret_key_here
```

**File**: `packages/client/.gitignore` (append)
```
.env.development
.env.production
.env.local
```

Add a `.env.example` with placeholder values so collaborators know the shape.

### Ticket 2.3 — Analytics singleton module

**File**: `packages/client/src/analytics/analytics.ts`

```typescript
import GameAnalytics from 'gameanalytics'
import { getConsent, setConsent } from './consent'

let initialized = false

export function initAnalytics(): boolean {
  if (initialized) return true

  const consent = getConsent()
  if (consent !== 'granted') return false

  const gameKey = import.meta.env.VITE_GA_GAME_KEY
  const secretKey = import.meta.env.VITE_GA_SECRET_KEY
  if (!gameKey || !secretKey) {
    console.warn('[Analytics] Missing GA keys, skipping init')
    return false
  }

  GameAnalytics.configureBuild('0.1.0') // keep in sync with package.json
  GameAnalytics.initialize(gameKey, secretKey)
  initialized = true
  return true
}

export function isAnalyticsReady(): boolean {
  return initialized
}

export function setAnalyticsEnabled(enabled: boolean): void {
  setConsent(enabled ? 'granted' : 'denied')
  if (initialized) {
    GameAnalytics.setEnabledEventSubmission(enabled)
  } else if (enabled) {
    initAnalytics()
  }
}
```

This is the only file that imports `gameanalytics`. All other modules go through this facade or `analyticsEvents.ts` (Ticket 3.1).

### Ticket 2.4 — Export from analytics index

**File**: `packages/client/src/analytics/index.ts`

```typescript
export { initAnalytics, isAnalyticsReady, setAnalyticsEnabled } from './analytics'
export { getConsent, setConsent, type ConsentState } from './consent'
```

---

## Epic 3: Run Lifecycle Events

Track the core roguelite progression loop: run start, stage completion, player death, and run completion.

### Ticket 3.1 — Analytics event dispatch module

**File**: `packages/client/src/analytics/analyticsEvents.ts`

A module of typed helper functions that wrap `GameAnalytics` calls. Each function checks `isAnalyticsReady()` before dispatching. This keeps the GameAnalytics import isolated and gives us a single place to audit all outbound events.

```typescript
import GameAnalytics from 'gameanalytics'
import { isAnalyticsReady } from './analytics'

// --- Progression events ---

export function trackRunStart(params: {
  character: string
  seed: number
  mode: 'singleplayer' | 'multiplayer'
}): void {
  if (!isAnalyticsReady()) return
  // Design event for metadata that progression events can't carry
  GameAnalytics.addDesignEvent(
    `run:start:${params.mode}:${params.character}`,
    params.seed,
  )
  GameAnalytics.addProgressionEvent(
    GameAnalytics.EGAProgressionStatus.Start,
    'run',
    params.character,
    params.mode,
  )
}

export function trackStageComplete(params: {
  character: string
  stageNumber: number
  waveReached: number
  timeSec: number
  upgradesTaken: number
  killCount: number
  goldCollected: number
}): void {
  if (!isAnalyticsReady()) return
  GameAnalytics.addProgressionEvent(
    GameAnalytics.EGAProgressionStatus.Complete,
    'run',
    params.character,
    `stage_${params.stageNumber}`,
    params.killCount,
  )
  GameAnalytics.addDesignEvent(
    `stage:complete:${params.stageNumber}:time`,
    params.timeSec,
  )
  GameAnalytics.addDesignEvent(
    `stage:complete:${params.stageNumber}:upgrades`,
    params.upgradesTaken,
  )
  GameAnalytics.addDesignEvent(
    `stage:complete:${params.stageNumber}:gold`,
    params.goldCollected,
  )
}

export function trackPlayerDeath(params: {
  character: string
  stageNumber: number
  waveNumber: number
  timeSurvivedSec: number
  killCount: number
}): void {
  if (!isAnalyticsReady()) return
  GameAnalytics.addProgressionEvent(
    GameAnalytics.EGAProgressionStatus.Fail,
    'run',
    params.character,
    `stage_${params.stageNumber}`,
    params.killCount,
  )
  GameAnalytics.addDesignEvent(
    `death:stage_${params.stageNumber}:wave_${params.waveNumber}:time`,
    params.timeSurvivedSec,
  )
}

export function trackRunComplete(params: {
  character: string
  totalTimeSec: number
  stagesCleared: number
  killCount: number
  goldCollected: number
  outcome: 'victory' | 'defeat' | 'mutual_kill'
}): void {
  if (!isAnalyticsReady()) return
  const status = params.outcome === 'victory'
    ? GameAnalytics.EGAProgressionStatus.Complete
    : GameAnalytics.EGAProgressionStatus.Fail
  GameAnalytics.addProgressionEvent(
    status,
    'run',
    params.character,
    'complete',
    params.killCount,
  )
  GameAnalytics.addDesignEvent(
    `run:${params.outcome}:time`,
    params.totalTimeSec,
  )
  GameAnalytics.addDesignEvent(
    `run:${params.outcome}:gold`,
    params.goldCollected,
  )
  GameAnalytics.addDesignEvent(
    `run:${params.outcome}:stages`,
    params.stagesCleared,
  )
}
```

The hierarchy is stable and bounded:
- Progression: `run` / `{character}` / `stage_{n}` or `complete`
- Design: `run:start:{mode}:{character}`, `stage:complete:{n}:{metric}`, `death:stage_{n}:wave_{m}:time`, `run:{outcome}:{metric}`

### Ticket 3.2 — Track run_start in SingleplayerModeController

**File**: `packages/client/src/scenes/core/SingleplayerModeController.ts`

In `initialize()`, after `startRun(this.world, ...)` is called and the world is set up:

```typescript
import { trackRunStart } from '../../analytics/analyticsEvents'

// Inside initialize(), after startRun:
trackRunStart({
  character: this.world.characterId,
  seed: this.world.initialSeed,
  mode: 'singleplayer',
})
```

Also store `this.runStartTime = performance.now()` as a class field for computing `timeSec` on death/completion.

### Ticket 3.3 — Track stage_complete in SingleplayerModeController

**File**: `packages/client/src/scenes/core/SingleplayerModeController.ts`

The controller already detects stage completion through `world.stageCleared` or `world.run.transition === 'clearing'`. At the point where stage-clear presentation is triggered (when `stageCleared` transitions), call:

```typescript
import { trackStageComplete } from '../../analytics/analyticsEvents'

trackStageComplete({
  character: this.world.characterId,
  stageNumber: (this.world.run?.currentStage ?? 0) + 1,
  waveReached: this.world.encounter?.currentWave ?? 0,
  timeSec: (performance.now() - this.runStartTime) / 1000,
  upgradesTaken: this.world.upgradeState.takenNodes.size,
  killCount: this.world.killCount,
  goldCollected: this.world.goldCollected,
})
```

### Ticket 3.4 — Track player_death in SingleplayerModeController

**File**: `packages/client/src/scenes/core/SingleplayerModeController.ts`

When the death sequence begins (player enters `Dead` state and `DeathSequencePresentation` activates):

```typescript
import { trackPlayerDeath } from '../../analytics/analyticsEvents'

trackPlayerDeath({
  character: this.world.characterId,
  stageNumber: (this.world.run?.currentStage ?? 0) + 1,
  waveNumber: (this.world.encounter?.currentWave ?? 0) + 1,
  timeSurvivedSec: (performance.now() - this.runStartTime) / 1000,
  killCount: this.world.killCount,
})
```

### Ticket 3.5 — Track run_complete in SingleplayerModeController

**File**: `packages/client/src/scenes/core/SingleplayerModeController.ts`

When the run ends (either all stages cleared or death — at the point where `RunEndPanel` props are computed):

```typescript
import { trackRunComplete } from '../../analytics/analyticsEvents'

trackRunComplete({
  character: this.world.characterId,
  totalTimeSec: (performance.now() - this.runStartTime) / 1000,
  stagesCleared: this.world.run?.currentStage ?? 0,
  killCount: this.world.killCount,
  goldCollected: this.world.goldCollected,
  outcome: isDead ? 'defeat' : 'victory',
})
```

### Ticket 3.6 — Mirror lifecycle events in MultiplayerModeController

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

Same pattern as tickets 3.2–3.5 but reading from the multiplayer-specific state:
- `trackRunStart` in `initialize()` after the room is joined, with `mode: 'multiplayer'`
- `trackStageComplete` when stage-clear HUD state transitions
- `trackPlayerDeath` when the local player enters Dead state
- `trackRunComplete` when the run-end panel is triggered

The multiplayer controller gets HUD data from the server (`hudState.stageNumber`, `hudState.waveNumber`, `hudState.killCount`, `hudState.goldCollected`). Use these instead of direct world reads.

---

## Epic 4: Gameplay Telemetry Events

Track granular gameplay decisions that inform balance tuning.

### Ticket 4.1 — Upgrade/node chosen event

**File**: `packages/client/src/analytics/analyticsEvents.ts`

```typescript
export function trackUpgradeChosen(params: {
  nodeId: string
  character: string
  stageNumber: number
  level: number
}): void {
  if (!isAnalyticsReady()) return
  GameAnalytics.addDesignEvent(
    `upgrade:${params.character}:${params.nodeId}`,
    params.level,
  )
}
```

**File**: `packages/client/src/scenes/core/SingleplayerModeController.ts`

In `selectNode()`, after `takeNode()` succeeds:

```typescript
trackUpgradeChosen({
  nodeId,
  character: this.world.characterId,
  stageNumber: (this.world.run?.currentStage ?? 0) + 1,
  level: this.world.upgradeState.level,
})
```

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

In `selectNode()`, after the server confirms the node selection:

```typescript
trackUpgradeChosen({
  nodeId,
  character: hudState.characterId,
  stageNumber: hudState.stageNumber,
  level: hudState.level,
})
```

### Ticket 4.2 — Boss encounter event

**File**: `packages/client/src/analytics/analyticsEvents.ts`

```typescript
export function trackBossEncounter(params: {
  bossName: string
  stageNumber: number
  result: 'victory' | 'defeat'
  timeSec: number
}): void {
  if (!isAnalyticsReady()) return
  GameAnalytics.addDesignEvent(
    `boss:${params.bossName}:${params.result}`,
    params.timeSec,
  )
}
```

**File**: `packages/client/src/scenes/core/SingleplayerModeController.ts`

Track `boss-intro` event time via a class field `this.bossEncounterStartTime`. On `boss-death` or player death while boss is alive, call `trackBossEncounter()` with the elapsed time and outcome.

The `boss-intro` event from `GameplayEvents` carries `bossName`. Store it alongside the start timestamp.

### Ticket 4.3 — Item/weapon picked event

**File**: `packages/client/src/analytics/analyticsEvents.ts`

```typescript
export function trackItemAcquired(params: {
  itemId: number
  itemName: string
  source: 'visitor' | 'stash' | 'drop' | 'draft'
  stageNumber: number
}): void {
  if (!isAnalyticsReady()) return
  GameAnalytics.addDesignEvent(
    `item:${params.source}:${params.itemName}`,
    params.stageNumber,
  )
}
```

Wire into:
- `handleVisitorPurchase()` in both mode controllers (source: `'visitor'`)
- Stash reward processing (source: `'stash'`)
- Item pickup collection (source: `'drop'`)
- Draft pick handler in `MultiplayerModeController` (source: `'draft'`)

### Ticket 4.4 — Error event for unhandled exceptions

**File**: `packages/client/src/analytics/analyticsEvents.ts`

```typescript
export function trackError(severity: 'warning' | 'error' | 'critical', message: string): void {
  if (!isAnalyticsReady()) return
  const gaSeverity = {
    warning: GameAnalytics.EGAErrorSeverity.Warning,
    error: GameAnalytics.EGAErrorSeverity.Error,
    critical: GameAnalytics.EGAErrorSeverity.Critical,
  }[severity]
  GameAnalytics.addErrorEvent(gaSeverity, message.slice(0, 256))
}
```

**File**: `packages/client/src/main.tsx` (or app entry)

Add a global error handler:

```typescript
window.addEventListener('error', (e) => {
  trackError('error', `${e.message} at ${e.filename}:${e.lineno}`)
})

window.addEventListener('unhandledrejection', (e) => {
  trackError('error', `Unhandled rejection: ${String(e.reason).slice(0, 200)}`)
})
```

---

## Epic 5: Multiplayer Session Events

Track multiplayer-specific session context for matchmaking and latency analysis.

### Ticket 5.1 — Multiplayer match event

**File**: `packages/client/src/analytics/analyticsEvents.ts`

```typescript
export function trackMultiplayerMatch(params: {
  playerCount: number
  mode: 'quickplay' | 'private'
  roomCode: string
}): void {
  if (!isAnalyticsReady()) return
  GameAnalytics.addDesignEvent(
    `multiplayer:match:${params.mode}:players_${params.playerCount}`,
  )
}
```

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

In `initialize()`, once the room is joined and the player count is known:

```typescript
trackMultiplayerMatch({
  playerCount: room.state.players.size,
  mode: isQuickPlay ? 'quickplay' : 'private',
  roomCode: room.roomId,
})
```

The `roomCode` is not sent in the event name (would blow up the 100K unique ID limit). It's available locally for correlation if we ever add a server-side log.

### Ticket 5.2 — Latency summary at match end

**File**: `packages/client/src/analytics/analyticsEvents.ts`

```typescript
export function trackMatchLatency(params: {
  rttMedianMs: number
  rttP95Ms: number
  desyncCount: number
  rubberBandEvents: number
}): void {
  if (!isAnalyticsReady()) return
  GameAnalytics.addDesignEvent('multiplayer:latency:rtt_median', params.rttMedianMs)
  GameAnalytics.addDesignEvent('multiplayer:latency:rtt_p95', params.rttP95Ms)
  if (params.desyncCount > 0) {
    GameAnalytics.addDesignEvent('multiplayer:latency:desyncs', params.desyncCount)
  }
  if (params.rubberBandEvents > 0) {
    GameAnalytics.addDesignEvent('multiplayer:latency:rubber_band', params.rubberBandEvents)
  }
}
```

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

At run end (when `trackRunComplete` is called), also pull summary stats from the existing `MultiplayerTelemetry` instance:

```typescript
trackMatchLatency({
  rttMedianMs: this.telemetry.rttHistory.percentile(0.5),
  rttP95Ms: this.telemetry.rttHistory.percentile(0.95),
  desyncCount: this.telemetry.desyncCount,
  rubberBandEvents: this.telemetry.rubberBandEvents,
})
```

This reuses the histograms that `MultiplayerTelemetry` already collects, adding zero new runtime overhead.

### Ticket 5.3 — Player disconnect/reconnect tracking

**File**: `packages/client/src/analytics/analyticsEvents.ts`

```typescript
export function trackDisconnect(params: {
  reason: string
  timeSinceMatchStartSec: number
}): void {
  if (!isAnalyticsReady()) return
  GameAnalytics.addDesignEvent(
    `multiplayer:disconnect:${params.reason}`,
    params.timeSinceMatchStartSec,
  )
}
```

Wire into the Colyseus room `onLeave` handler or the existing reconnect logic in `MultiplayerModeController`.

---

## Implementation Order

```
1.1  Consent persistence utility (no dependencies)
1.2  Consent dialog component (depends on 1.1)
2.1  Install gameanalytics package
2.2  Environment variable setup (.env files, .gitignore)
2.3  Analytics singleton module (depends on 1.1, 2.1)
2.4  Export from analytics index
1.3  Analytics toggle in SettingsPanel (depends on 2.3)
1.4  Wire consent into app entry point (depends on 1.2, 1.3, 2.3)
3.1  Analytics event dispatch module (depends on 2.3)
3.2  Track run_start in SingleplayerModeController (depends on 3.1)
3.3  Track stage_complete (depends on 3.1)
3.4  Track player_death (depends on 3.1)
3.5  Track run_complete (depends on 3.1)
3.6  Mirror lifecycle events in MultiplayerModeController (depends on 3.1)
4.1  Upgrade/node chosen event (depends on 3.1)
4.2  Boss encounter event (depends on 3.1)
4.3  Item acquired event (depends on 3.1)
4.4  Error event + global handler (depends on 3.1)
5.1  Multiplayer match event (depends on 3.1)
5.2  Latency summary at match end (depends on 5.1)
5.3  Disconnect tracking (depends on 5.1)
```

Epics 1–2 form the foundation and can be shipped as a standalone PR. Epic 3 is the core value — run lifecycle events answer "how far do players get?" and "where do they die?". Epics 4–5 are incremental and can be split into follow-up PRs.

---

## Files Changed

| File | Change |
|------|--------|
| `packages/client/package.json` | Add `gameanalytics` dependency |
| `packages/client/.env.example` | **New** — placeholder GA keys |
| `packages/client/.env.development` | **New** — dev GA keys (gitignored) |
| `packages/client/.env.production` | **New** — prod GA keys (gitignored) |
| `packages/client/.gitignore` | Add `.env.development`, `.env.production`, `.env.local` |
| `packages/client/src/analytics/consent.ts` | **New** — localStorage consent read/write |
| `packages/client/src/analytics/analytics.ts` | **New** — GA init singleton, enable/disable |
| `packages/client/src/analytics/analyticsEvents.ts` | **New** — typed event dispatch helpers |
| `packages/client/src/analytics/index.ts` | **New** — barrel export |
| `packages/client/src/ui/ConsentDialog.tsx` | **New** — GDPR opt-in dialog |
| `packages/client/src/ui/SettingsPanel.tsx` | Add analytics toggle row + new props |
| `packages/client/src/ui/PauseMenu.tsx` | Thread analytics props to SettingsPanel |
| `packages/client/src/App.tsx` | Wire consent check, dialog, analytics init |
| `packages/client/src/main.tsx` | Add global error handlers for trackError |
| `packages/client/src/scenes/core/SingleplayerModeController.ts` | Add analytics calls at run start, stage clear, death, run end, node select, boss encounter, item acquire |
| `packages/client/src/scenes/core/MultiplayerModeController.ts` | Mirror analytics calls + multiplayer-specific events (match, latency, disconnect) |

**No changes to `packages/shared`** — analytics is entirely client-side.
**No changes to `packages/server`** — all telemetry is collected client-side via the GA SDK.

---

## Testing

### Unit test: consent.ts

- `getConsent()` returns `'unset'` when localStorage is empty
- `setConsent('granted')` → `getConsent()` returns `'granted'`
- `setConsent('denied')` → `getConsent()` returns `'denied'`
- Invalid/corrupted localStorage values return `'unset'`

### Unit test: analytics.ts

- `initAnalytics()` returns `false` when consent is `'unset'` or `'denied'`
- `initAnalytics()` returns `false` when env vars are missing
- `initAnalytics()` returns `true` and calls `GameAnalytics.initialize()` when consent is `'granted'` and keys exist
- `setAnalyticsEnabled(false)` calls `GameAnalytics.setEnabledEventSubmission(false)`
- Double-init is a no-op (idempotent)

### Unit test: analyticsEvents.ts

- Each `track*()` function is a no-op when `isAnalyticsReady()` returns `false`
- When analytics is ready, verify the correct GA method is called with the expected event hierarchy string
- Design event values are numeric (not strings)
- Progression event statuses map correctly (Start/Complete/Fail)

### Component test: ConsentDialog

- Renders two buttons
- Clicking "Allow" calls `onDecision(true)`
- Clicking "No Thanks" calls `onDecision(false)`

### Component test: SettingsPanel with analytics toggle

- Toggle renders current state (ON/OFF)
- Clicking toggle calls `onAnalyticsChange` with the opposite value

### Integration: manual playtest checklist

- [ ] Fresh browser (no localStorage) — consent dialog appears before main menu
- [ ] Click "Allow Analytics" — dialog dismisses, analytics initializes (check console for GA init log)
- [ ] Click "No Thanks" — dialog dismisses, no GA init, game loads normally
- [ ] Start singleplayer run — `run:start` event fires (verify via GA debugger or network tab)
- [ ] Clear a stage — `stage:complete` progression event fires
- [ ] Die — `death` design event fires with stage/wave/time
- [ ] Complete a run — `run:victory` or `run:defeat` event fires
- [ ] Select an upgrade node — `upgrade` design event fires
- [ ] Boss intro → boss death — `boss` design event fires with time
- [ ] Open pause menu → toggle analytics OFF → resume → die — no events fire after toggle
- [ ] Toggle analytics back ON in settings — events resume on next run
- [ ] Multiplayer: join a match — `multiplayer:match` event fires with player count
- [ ] Multiplayer: end match — `multiplayer:latency` events fire with RTT stats
- [ ] Remove `.env` files → reload — no errors, analytics silently disabled
- [ ] Throw an unhandled error via console — `trackError` fires (if analytics enabled)

---

## Event ID Budget

Estimated unique design event IDs per day (must stay under 100K):

| Pattern | Max unique IDs | Notes |
|---------|---------------|-------|
| `run:start:{mode}:{character}` | 6 | 2 modes x 3 characters |
| `stage:complete:{n}:{metric}` | 24 | 8 stages x 3 metrics |
| `death:stage_{n}:wave_{m}:time` | ~40 | 8 stages x ~5 waves |
| `run:{outcome}:{metric}` | 9 | 3 outcomes x 3 metrics |
| `upgrade:{character}:{nodeId}` | ~45 | 3 characters x ~15 nodes |
| `boss:{name}:{result}` | ~10 | ~5 bosses x 2 results |
| `item:{source}:{name}` | ~80 | 4 sources x ~20 items |
| `multiplayer:*` | ~15 | match, latency, disconnect |
| **Total** | **~230** | Well under 100K limit |

---

## Future Work (Not In This Sprint)

- **A/B test framework**: Use GA custom dimensions to tag experiment variants (e.g., different wave densities, weapon balance changes). Requires GA business tier for custom funnels.
- **Heatmap data**: Track player death positions (`death:heatmap:x_y` bucketed to grid cells) for spatial analysis. Needs careful bucketing to stay under the event ID limit.
- **Server-side events**: If server-side analytics is needed later (e.g., authoritative match outcomes), use a separate GA project initialized on the server. This sprint is client-only.
- **Funnel analysis**: GA supports custom funnels in the dashboard. Define funnels like "run_start → stage_1_complete → stage_2_complete → victory" using the progression events from this sprint.
- **Real-time dashboard**: GA Live feature shows events within 1 minute. Useful for playtesting sessions. No code changes needed — it's a dashboard configuration.
