# Sprint: Crash Reporting (Sentry)

**Goal**: Integrate Sentry crash reporting across client and server so that unhandled exceptions, game loop crashes, WebGL context losses, and Colyseus network errors are captured with source-mapped stack traces in production. Developers should be alerted to new issues within minutes of a player encountering them.

**Depends on**: Current main (GameLoop, GameApp, main.tsx, vite.config.ts, NetworkClient, GameRoom, server index)

---

## Current State

**What exists:**
- `GameLoop` in `packages/client/src/engine/GameLoop.ts` runs a fixed-timestep accumulator via `requestAnimationFrame`. The `loop` method has no error boundary -- an exception in `onUpdate` or `onRender` will kill the RAF chain silently (the loop stops, the canvas freezes, the player sees nothing).
- `main.tsx` in `packages/client/src/main.tsx` calls `createRoot(rootElement).render(...)` with no `onUncaughtError`, `onCaughtError`, or `onRecoverableError` hooks. React 19 supports these on `createRoot` but they are not wired up.
- `GameApp` in `packages/client/src/engine/GameApp.ts` creates a PixiJS `Application` and appends `app.canvas` to the DOM. There is no listener for `webglcontextlost` on the canvas element.
- `vite.config.ts` in `packages/client/vite.config.ts` has `sourcemap: true` in the build config. Source maps are emitted alongside JS bundles and would be publicly accessible in production.
- `NetworkClient` in `packages/client/src/net/NetworkClient.ts` wraps Colyseus `Room` handlers. There is no `room.onError()` handler -- Colyseus room errors go unobserved.
- `GameRoom` in `packages/server/src/rooms/GameRoom.ts` is the authoritative server room. Uncaught exceptions in tick processing would crash the room; there is no Sentry integration on the server.
- Server entry point `packages/server/src/index.ts` has a top-level `.catch()` but no structured error reporting.
- `.gitignore` already excludes `.env` and `.env.local` files.

**What doesn't exist:**
- Any Sentry SDK dependency in any package
- An `instrument.ts` early-init file for Sentry
- React 19 error handler hooks on `createRoot`
- A try/catch boundary in the game loop
- A crash screen UI component
- WebGL context loss detection or reporting
- Source map upload configuration (Vite plugin, auth tokens)
- Any `room.onError()` handler on the client-side Colyseus room
- Any server-side error reporting beyond `console.error`

---

## Design Constraints

1. **Sentry free tier first** -- The free tier provides 5K errors/month with 30-day retention. This is sufficient for early development and playtesting. Design the integration so the DSN can be swapped for a Team plan ($26/mo, 50K errors) later without code changes.
2. **No Sentry in shared** -- `packages/shared` is the deterministic simulation. It must have zero side effects and zero external dependencies. Sentry calls belong in client and server packages only. If a shared system throws, the caller (client game loop or server tick) catches it and reports.
3. **Early initialization** -- `Sentry.init()` must run before any other application code so that it can hook `window.onerror` and `window.onunhandledrejection`. This means a dedicated `instrument.ts` file imported at the top of `main.tsx`.
4. **Source maps stay private** -- Production builds must use `sourcemap: "hidden"` so `.map` files are generated for upload to Sentry but not served to browsers. The `@sentry/vite-plugin` deletes `.map` files from the output directory after upload.
5. **Graceful degradation** -- If the Sentry DSN is not configured (local dev), all Sentry calls must no-op silently. The game must work identically with or without Sentry.
6. **Game loop must not silently die** -- A crash in `onUpdate` or `onRender` must (a) stop the loop cleanly, (b) report to Sentry, and (c) show a crash screen with a reload button. The player must never stare at a frozen canvas with no feedback.
7. **WebGL is non-recoverable** -- PixiJS v8 cannot recover from a WebGL context loss. The correct response is to report to Sentry and show a dialog prompting a page reload.
8. **Environment-aware** -- DSN, release version, and environment name should come from Vite environment variables (`import.meta.env.VITE_SENTRY_DSN`, etc.) for the client, and `process.env` for the server.

---

## Epic Overview

| # | Epic | Package(s) | Priority | Estimate |
|---|------|-----------|----------|----------|
| 1 | Sentry SDK setup + React 19 integration | client | P0 | Small |
| 2 | Game loop error boundary + crash screen | client | P0 | Small |
| 3 | WebGL context loss detection and reporting | client | P1 | Small |
| 4 | Source map upload pipeline | client (build) | P1 | Small |
| 5 | Colyseus / network error capture | client, server | P1 | Medium |

---

## Epic 1: Sentry SDK Setup + React 19 Integration

Install `@sentry/react` and initialize it before React renders. Wire React 19's error handler hooks on `createRoot` so that React component errors are captured with component stack traces.

### Ticket 1.1 -- Install `@sentry/react`

**Package**: `packages/client`

```bash
cd packages/client && bun add @sentry/react
```

This pulls in `@sentry/browser` as a transitive dependency. No separate `@sentry/browser` install needed.

### Ticket 1.2 -- Create `instrument.ts`

**File**: `packages/client/src/instrument.ts`

This file must be imported before everything else in `main.tsx`. It calls `Sentry.init()` once.

```typescript
import * as Sentry from '@sentry/react'

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || '',
  environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || 'development',
  release: import.meta.env.VITE_SENTRY_RELEASE || 'dev',
  enabled: !!import.meta.env.VITE_SENTRY_DSN,

  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
  ],

  // Sample rates -- keep low to stay within free tier
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,    // no passive replay
  replaysOnErrorSampleRate: 1.0,  // capture replay on every error
})
```

**Rationale**: The `enabled: false` when DSN is empty ensures local dev has zero overhead. Session replay on error is invaluable for reproducing game bugs -- it captures the last ~60s of DOM interaction. The traces sample rate is low because game loop performance is better measured with custom instrumentation than Sentry transactions.

### Ticket 1.3 -- Wire React 19 error hooks in `main.tsx`

**File**: `packages/client/src/main.tsx`

```typescript
import './instrument'  // MUST be first import
import * as Sentry from '@sentry/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement, {
  onUncaughtError: Sentry.reactErrorHandler(),
  onCaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
}).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

**Rationale**: `@sentry/react` v8.6.0+ exports `Sentry.reactErrorHandler()` which returns a callback compatible with React 19's `createRoot` options. This replaces the old `ErrorBoundary` component approach. All three hooks are wired so that caught errors (from error boundaries), uncaught errors (unhandled throws in render/effects), and recoverable errors (hydration mismatches, etc.) all flow to Sentry.

### Ticket 1.4 -- Create `.env.example`

**File**: `packages/client/.env.example`

```env
# Sentry (optional -- leave empty to disable)
VITE_SENTRY_DSN=
VITE_SENTRY_ENVIRONMENT=development
VITE_SENTRY_RELEASE=
VITE_SENTRY_AUTH_TOKEN=
```

This documents the available environment variables. `.env` and `.env.local` are already in `.gitignore`.

---

## Epic 2: Game Loop Error Boundary + Crash Screen

Wrap the game loop's update and render callbacks in a try/catch so a thrown exception stops the loop gracefully and shows a crash screen instead of a frozen canvas.

### Ticket 2.1 -- Add try/catch and crash callback to `GameLoop`

**File**: `packages/client/src/engine/GameLoop.ts`

Add an optional `onCrash` callback to the constructor and wrap the loop body:

```typescript
export type CrashCallback = (error: unknown) => void

export class GameLoop {
  // ... existing fields ...

  constructor(
    private readonly onUpdate: UpdateCallback,
    private readonly onRender: RenderCallback,
    private readonly onCrash?: CrashCallback
  ) {}

  // ...

  private loop = (currentTime: number): void => {
    if (!this.running) return

    try {
      // ... existing accumulator + update + render logic (unchanged) ...

      // Schedule next frame
      this.rafId = requestAnimationFrame(this.loop)
    } catch (error) {
      this.running = false
      this.rafId = null

      if (this.onCrash) {
        this.onCrash(error)
      } else {
        throw error  // re-throw if no handler (preserves current behavior in tests)
      }
    }
  }
}
```

**Rationale**: The try/catch wraps the entire loop body -- update, render, and RAF scheduling. If anything throws, the loop stops immediately (no further RAF). The `onCrash` callback is optional so existing test code that constructs `GameLoop` without it continues to work (errors re-thrown).

### Ticket 2.2 -- Report crash to Sentry and surface to React

The `onCrash` callback, wired where `GameLoop` is created (in `SingleplayerModeController` and `MultiplayerModeController`), should:

1. Call `Sentry.captureException(error)` to report the crash.
2. Set a React state flag that causes the `Game` / `MultiplayerGame` page component to show the crash screen.

The simplest pattern is an event emitter or a callback threaded through the scene:

**File**: `packages/client/src/engine/GameLoop.ts` (no further changes needed -- `onCrash` already added in 2.1)

**Files**: `packages/client/src/scenes/core/SingleplayerModeController.ts`, `packages/client/src/scenes/core/MultiplayerModeController.ts`

In both controllers, where `GameLoop` is constructed, pass the crash handler:

```typescript
import * as Sentry from '@sentry/react'

this.gameLoop = new GameLoop(
  (dt) => this.update(dt),
  (alpha) => this.render(alpha, this.gameLoop.fps),
  (error) => {
    console.error('[GameLoop] Fatal crash:', error)
    Sentry.captureException(error, {
      tags: { source: 'game-loop', mode: 'singleplayer' },
    })
    this.onCrashCallback?.(error)
  }
)
```

The `onCrashCallback` is a function set by the page component (via the scene/controller interface) that triggers React state to show the crash screen.

### Ticket 2.3 -- Create CrashScreen component

**File**: `packages/client/src/ui/CrashScreen.tsx`

A simple full-screen overlay that appears when the game loop crashes:

```tsx
export function CrashScreen({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Unknown error'

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      color: '#fff', fontFamily: 'monospace', zIndex: 9999,
    }}>
      <h1>Something went wrong</h1>
      <p style={{ color: '#ff6b6b', maxWidth: 600, textAlign: 'center' }}>{message}</p>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: 24, padding: '12px 32px',
          fontSize: 16, cursor: 'pointer',
          background: '#c9a96e', border: 'none', color: '#1a1a2e',
        }}
      >
        Reload Game
      </button>
    </div>
  )
}
```

### Ticket 2.4 -- Wire CrashScreen into Game pages

**Files**: `packages/client/src/pages/Game.tsx`, `packages/client/src/pages/MultiplayerGame.tsx`

Add state to track a crash and render `<CrashScreen>` over the canvas when set:

```tsx
const [crashError, setCrashError] = useState<unknown>(null)

// Pass setCrashError through to the scene/controller as the onCrashCallback
// ...

return (
  <>
    <div ref={containerRef} />
    {/* ... existing HUD/UI ... */}
    {crashError && <CrashScreen error={crashError} />}
  </>
)
```

---

## Epic 3: WebGL Context Loss Detection and Reporting

PixiJS v8 cannot recover from a `webglcontextlost` event. Detect it, report to Sentry, stop the game loop, and show a reload dialog.

### Ticket 3.1 -- Listen for `webglcontextlost` on the canvas

**File**: `packages/client/src/engine/GameApp.ts`

After `app.canvas` is appended to the DOM in `GameApp.create()`, attach a context loss listener:

```typescript
import * as Sentry from '@sentry/react'

// Inside GameApp.create(), after container.appendChild(app.canvas):
const gameApp = new GameApp(app)

app.canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault()  // prevent default browser behavior
  Sentry.captureException(new Error('WebGL context lost'), {
    tags: { source: 'webgl' },
    extra: {
      renderer: app.renderer.type,
      resolution: app.renderer.resolution,
    },
  })
  gameApp.contextLost = true
})

return gameApp
```

Add a public `contextLost` flag:

```typescript
export class GameApp {
  contextLost = false
  // ...
}
```

### Ticket 3.2 -- Surface context loss to the crash screen

The mode controllers should check `gameApp.contextLost` and trigger the same crash screen mechanism from Epic 2. Alternatively, `GameApp` can accept an `onContextLost` callback set by the page component.

The simplest approach: make the `webglcontextlost` handler call the same `onCrashCallback` used by `GameLoop`:

```typescript
// In GameApp, add a settable callback:
onContextLost?: () => void

// In the event listener:
app.canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault()
  Sentry.captureException(new Error('WebGL context lost'), {
    tags: { source: 'webgl' },
  })
  gameApp.onContextLost?.()
})
```

The page component wires this to show `<CrashScreen error={new Error('WebGL context lost. Please reload.')} />`.

### Ticket 3.3 -- Stop the game loop on context loss

The `onContextLost` callback in the page component should also call `gameLoop.stop()` so the loop does not continue trying to render into a dead WebGL context (which would generate a stream of errors).

---

## Epic 4: Source Map Upload Pipeline

Configure `@sentry/vite-plugin` to upload source maps during production builds. Source maps must not be served to browsers.

### Ticket 4.1 -- Install `@sentry/vite-plugin`

**Package**: `packages/client`

```bash
cd packages/client && bun add -d @sentry/vite-plugin
```

### Ticket 4.2 -- Configure the Vite plugin

**File**: `packages/client/vite.config.ts`

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { resolve } from 'path'

export default defineConfig({
  root: __dirname,
  publicDir: 'public',
  plugins: [
    react(),
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: process.env.VITE_SENTRY_RELEASE },
      sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
      disable: !process.env.SENTRY_AUTH_TOKEN,  // skip in local builds
    }),
  ],
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: 'hidden',  // changed from true -- generates .map files but does not reference them in bundles
  },
  resolve: {
    alias: {
      '@high-noon/shared': resolve(__dirname, '../shared/src'),
    },
  },
})
```

**Rationale**: `sourcemap: "hidden"` generates `.map` files without embedding `//# sourceMappingURL` comments in the JS bundles. The Sentry plugin uploads them, then `filesToDeleteAfterUpload` removes them from `dist/` so they are never deployed. The `disable` flag ensures local `bun run build` works without credentials.

### Ticket 4.3 -- Document CI environment variables

The following environment variables must be set in CI for source map upload:

| Variable | Purpose | Where |
|----------|---------|-------|
| `SENTRY_ORG` | Sentry organization slug | CI secret |
| `SENTRY_PROJECT` | Sentry project slug | CI secret |
| `SENTRY_AUTH_TOKEN` | API token with `project:releases` + `org:ci` scopes | CI secret |
| `VITE_SENTRY_DSN` | Client-side DSN (embedded in bundle) | CI secret or `.env.production` |
| `VITE_SENTRY_RELEASE` | Release identifier (e.g., git SHA) | CI, set dynamically |
| `VITE_SENTRY_ENVIRONMENT` | `production` / `staging` | CI variable |

For the auth token, create one at `https://sentry.io/settings/auth-tokens/` with the scopes `project:releases` and `org:ci`.

No CI config file changes are included in this sprint -- the variables just need to be set in whatever CI system is used. The Vite plugin reads them at build time.

---

## Epic 5: Colyseus / Network Error Capture

Capture Colyseus room errors and WebSocket failures on both client and server.

### Ticket 5.1 -- Add `room.onError()` to `NetworkClient`

**File**: `packages/client/src/net/NetworkClient.ts`

Inside `registerRoomHandlers()`, add an error handler alongside the existing message and leave handlers:

```typescript
import * as Sentry from '@sentry/react'

// Inside registerRoomHandlers(), alongside existing cleanup.push() calls:
const onError = room.onError((code: number, message?: string) => {
  console.error(`[NetworkClient] Room error ${code}: ${message}`)
  Sentry.captureException(new Error(`Colyseus room error: ${code} ${message ?? ''}`), {
    tags: { source: 'colyseus-room', errorCode: code },
  })
})
cleanup.push(onError)
```

**Rationale**: Colyseus fires `room.onError()` for server-side room errors (e.g., the room's `onMessage` handler threw, or the room process crashed). Without this handler, these errors are silently lost on the client.

### Ticket 5.2 -- Capture connection failures in `NetworkClient.join()`

**File**: `packages/client/src/net/NetworkClient.ts`

The existing `join()`, `createPrivateRoom()`, and `joinQuickPlay()` methods catch connection errors and re-throw. Add Sentry capture before re-throwing:

```typescript
import * as Sentry from '@sentry/react'

// In join():
} catch (err) {
  Sentry.captureException(err, {
    tags: { source: 'colyseus-connect', action: 'join' },
  })
  throw new Error(`Failed to connect: ${err instanceof Error ? err.message : 'Unknown error'}`)
}
```

Same pattern in `createPrivateRoom()` and `joinQuickPlay()`.

### Ticket 5.3 -- Capture reconnection failures

**File**: `packages/client/src/net/NetworkClient.ts`

In `attemptReconnect()`, the inner catch block currently logs and continues to the next attempt. After all attempts are exhausted (just before emitting `disconnect`), capture a single Sentry event:

```typescript
// After the for-loop, before emitting 'disconnect':
Sentry.captureMessage('Colyseus reconnection failed after all attempts', {
  level: 'warning',
  tags: { source: 'colyseus-reconnect' },
  extra: { maxAttempts: RECONNECT_MAX_ATTEMPTS },
})
```

This avoids spamming Sentry with one event per failed attempt. Only the final failure is reported.

### Ticket 5.4 -- Install `@sentry/node` on the server

**Package**: `packages/server`

```bash
cd packages/server && bun add @sentry/node
```

### Ticket 5.5 -- Initialize Sentry in the server entry point

**File**: `packages/server/src/index.ts`

Add Sentry initialization at the top of the file, before the Colyseus server is created:

```typescript
import * as Sentry from '@sentry/node'

Sentry.init({
  dsn: process.env.SENTRY_DSN || '',
  environment: process.env.SENTRY_ENVIRONMENT || 'development',
  release: process.env.SENTRY_RELEASE || 'dev',
  enabled: !!process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
})
```

Update the top-level catch:

```typescript
main().catch((err) => {
  Sentry.captureException(err)
  console.error('[Server] Fatal error:', err)
  process.exit(1)
})
```

### Ticket 5.6 -- Capture errors in `GameRoom`

**File**: `packages/server/src/rooms/GameRoom.ts`

In the room's tick processing (the interval that calls `stepWorld`), wrap the tick body in a try/catch:

```typescript
import * as Sentry from '@sentry/node'

// In the tick interval:
try {
  // ... existing stepWorld + snapshot + broadcast logic ...
} catch (error) {
  Sentry.captureException(error, {
    tags: { source: 'game-room-tick', roomId: this.roomId },
    extra: { tick: this.world.tick, playerCount: this.clients.length },
  })
  // Optionally: disconnect all clients and dispose the room
  // For now, log and let Colyseus handle the room error
  console.error('[GameRoom] Tick error:', error)
  this.disconnect()
}
```

Also add a catch in `onMessage` handlers for non-critical messages (input, ping, etc.) so a malformed message does not crash the room:

```typescript
// The existing onMessage handlers should have defensive try/catch with Sentry capture.
// Example for input handling:
this.onMessage('input', (client, data) => {
  try {
    // ... existing input processing ...
  } catch (error) {
    Sentry.captureException(error, {
      tags: { source: 'game-room-message', messageType: 'input' },
    })
  }
})
```

### Ticket 5.7 -- Add server environment variables to `.env.example`

**File**: `packages/server/.env.example` (new file)

```env
# Sentry (optional -- leave empty to disable)
SENTRY_DSN=
SENTRY_ENVIRONMENT=development
SENTRY_RELEASE=
```

---

## Implementation Order

```
1.1  Install @sentry/react
1.2  Create instrument.ts
1.3  Wire React 19 error hooks in main.tsx
1.4  Create .env.example
2.1  Add try/catch + onCrash to GameLoop
2.2  Wire crash handler in mode controllers
2.3  Create CrashScreen component
2.4  Wire CrashScreen into Game pages
3.1  Listen for webglcontextlost
3.2  Surface context loss to crash screen
3.3  Stop game loop on context loss
4.1  Install @sentry/vite-plugin
4.2  Configure Vite plugin (sourcemap: "hidden", upload, delete)
4.3  Document CI environment variables
5.1  Add room.onError() to NetworkClient
5.2  Capture connection failures
5.3  Capture reconnection failures
5.4  Install @sentry/node on server
5.5  Initialize Sentry in server entry
5.6  Capture errors in GameRoom
5.7  Add server .env.example
```

Epics 1 and 2 are the critical path -- they ensure the SDK is initialized and the most common failure mode (game loop crash) is handled. Epic 3 is a quick follow-up since it reuses the crash screen from Epic 2. Epic 4 can be done in parallel with Epic 2/3 since it only touches build config. Epic 5 is independent and can be parallelized.

---

## Files Changed

| File | Change |
|------|--------|
| `packages/client/package.json` | Add `@sentry/react` dependency |
| `packages/client/src/instrument.ts` | **New** -- Sentry.init() early initialization |
| `packages/client/src/main.tsx` | Import instrument.ts first, add React 19 error hooks to createRoot |
| `packages/client/src/engine/GameLoop.ts` | Add optional `onCrash` callback, wrap loop body in try/catch |
| `packages/client/src/engine/GameApp.ts` | Add `webglcontextlost` listener, `contextLost` flag, `onContextLost` callback |
| `packages/client/src/ui/CrashScreen.tsx` | **New** -- crash overlay with reload button |
| `packages/client/src/pages/Game.tsx` | Add crash state, wire onCrashCallback, render CrashScreen |
| `packages/client/src/pages/MultiplayerGame.tsx` | Same as Game.tsx |
| `packages/client/src/scenes/core/SingleplayerModeController.ts` | Pass onCrash to GameLoop, import Sentry |
| `packages/client/src/scenes/core/MultiplayerModeController.ts` | Pass onCrash to GameLoop, import Sentry |
| `packages/client/vite.config.ts` | Add @sentry/vite-plugin, change sourcemap to "hidden" |
| `packages/client/.env.example` | **New** -- document Sentry env vars |
| `packages/client/src/net/NetworkClient.ts` | Add room.onError(), capture connect/reconnect failures |
| `packages/server/package.json` | Add `@sentry/node` dependency |
| `packages/server/src/index.ts` | Add Sentry.init(), capture fatal errors |
| `packages/server/src/rooms/GameRoom.ts` | Wrap tick + onMessage in try/catch with Sentry capture |
| `packages/server/.env.example` | **New** -- document server Sentry env vars |

**No changes to `packages/shared`** -- crash reporting is purely infrastructure. The deterministic simulation remains untouched.

---

## Testing

### Automated tests

- **GameLoop crash handling**: Construct a `GameLoop` with an `onUpdate` that throws after N ticks. Verify: (a) `onCrash` is called with the error, (b) `isRunning()` returns false, (c) no further frames are scheduled.
- **GameLoop without onCrash**: Construct a `GameLoop` without `onCrash`, throw in `onUpdate`. Verify the error propagates (is re-thrown).
- **instrument.ts with no DSN**: Import `instrument.ts` in a test with `VITE_SENTRY_DSN` unset. Verify `Sentry.init` is called with `enabled: false` and no network requests are made.

### Integration verification

- **Sentry test event**: After wiring up Epic 1, add a temporary `Sentry.captureMessage('Test from High Noon client')` call and verify it appears in the Sentry dashboard.
- **Source map verification**: After Epic 4, trigger an error in production build. Verify the Sentry stack trace shows original TypeScript file names and line numbers, not minified bundle references.
- **Server integration**: After Epic 5, add a temporary `Sentry.captureMessage('Test from High Noon server')` in `main()` and verify it appears in the Sentry dashboard under the server project.

### Manual playtest checklist

- [ ] Local dev with no DSN -- game loads normally, no console errors about Sentry
- [ ] Simulate game loop crash (throw in a system) -- canvas freezes, crash screen appears, reload button works
- [ ] Simulate WebGL context loss (via DevTools WebGL extension or `WEBGL_lose_context`) -- crash screen appears with reload prompt
- [ ] Trigger a React render error (e.g., throw in a component) -- error is captured by Sentry via reactErrorHandler
- [ ] Disconnect the WebSocket mid-game -- reconnection attempts proceed, final failure is reported to Sentry
- [ ] Production build with Sentry credentials -- source maps are uploaded, `.map` files are deleted from `dist/`
- [ ] Production build without credentials -- build succeeds, plugin is disabled
- [ ] Kill the server while a client is connected -- `room.onError` fires, error appears in Sentry

---

## Future Work (Not In This Sprint)

- **Performance monitoring**: Use Sentry's performance SDK to trace game loop frame times, network round-trip latency, and asset loading durations. Requires custom spans since RAF loops do not map to HTTP transactions.
- **User context**: Attach the player's session ID, character selection, and current stage/wave to Sentry scope so crash reports include gameplay context. Useful for reproducing bugs.
- **Breadcrumbs for game events**: Log key gameplay events (wave start, boss spawn, player death, upgrade selection) as Sentry breadcrumbs so the events leading up to a crash are visible in the report.
- **Server source maps**: The server runs unminified TypeScript via `bun --watch`, so source maps are not critical. If the server is compiled/minified for production deployment, add `@sentry/esbuild-plugin` or equivalent.
- **Release tracking and deploy notifications**: Integrate `sentry-cli` into CI to create releases, associate commits, and notify Sentry of deployments. Enables "introduced in release" and regression detection.
- **Alert rules**: Configure Sentry alert rules to notify via Discord/Slack when new issues are created or error volume spikes. Not a code change -- done in the Sentry dashboard.
