# Sprint 10: Pause Menu & Settings

**Goal**: Add a pause menu accessible via Escape that freezes the simulation, and a settings panel with audio volume controls. Players currently have no way to pause, adjust volume, or quit to the menu mid-run.

**Depends on**: Current main (Game.tsx overlay system, SoundManager, GameLoop, mode controllers)

---

## Current State

**What exists:**
- `Game.tsx` and `MultiplayerGame.tsx` manage React overlays (skill tree, camp panel) on top of the PixiJS canvas via boolean state flags (`showSkillTree`, `showCamp`)
- Overlay panels use absolute positioning with semi-transparent backdrops (`SkillTreePanel` at z-index 60, `CampPanel` at z-index 55, `GameHUD` at z-index 50)
- `SoundManager` has `setMasterVolume(v: number)` (0.0–1.0) and a `muted` getter/setter — both already functional but not exposed to players
- `GameLoop` has `start()` / `stop()` but no pause flag — stopping resets the accumulator causing a frame jump on resume
- `SingleplayerModeController.update()` already gates on death state at line 492 (`if (this.isPlayerDead()) return`) — same pattern works for pause
- `HitStop` freezes the sim for ~50ms impact feel — not suitable for indefinite pause
- `Input.ts` handles WASD/mouse/Space/Shift/R/Q/E — Escape is unbound
- `handleKeyDown` in mode controllers only handles debug hotkeys (backtick for debug overlay, P for spawn pause)
- `SceneModeController` interface defines the contract both mode controllers implement
- `DeathSequencePresentation` already handles a "GAME OVER" text overlay with fade — similar visual pattern for pause

**What doesn't exist:**
- Pause menu UI component
- Settings panel (volume slider, mute toggle)
- Escape key handler at the page level
- Simulation pause mechanism (separate from HitStop)
- Quit-to-menu flow from mid-run
- Local storage for audio preferences
- Any way for the player to adjust volume or mute

---

## Design Constraints

1. **Singleplayer only** — Pause freezes the simulation. In multiplayer, Escape opens a settings overlay but does NOT pause the server sim. The overlay is non-blocking (game continues underneath).
2. **Escape closes overlays first** — If the skill tree or camp panel is open, Escape closes that overlay instead of opening the pause menu. Escape is a universal "back" key.
3. **No pause during death** — If the player is dead, Escape does nothing (the death sequence handles its own flow).
4. **Render continues** — The PixiJS render loop keeps running while paused so the scene remains visible behind the overlay. Only simulation ticks are gated.
5. **Audio preferences persist** — Volume and mute state are saved to `localStorage` and restored on next session.
6. **Deterministic sim unaffected** — Pause does not inject any state into the shared simulation. It's purely a client-side gate on calling `simulationDriver.step()`.
7. **Minimal scope** — No keybinding remapping, no graphics settings, no accessibility options. Just pause/resume, volume, mute, and quit. Other settings can be added later.

---

## Epic Overview

| # | Epic | Package(s) | Priority | Estimate |
|---|------|-----------|----------|----------|
| 1 | Simulation pause mechanism | client | P0 | Small |
| 2 | Escape key routing | client | P0 | Small |
| 3 | PauseMenu component | client | P0 | Medium |
| 4 | Settings panel (audio) | client | P0 | Small |
| 5 | Quit-to-menu flow | client | P1 | Small |
| 6 | Persistent audio preferences | client | P1 | Small |
| 7 | Multiplayer settings overlay | client | P1 | Small |

---

## Epic 1: Simulation Pause Mechanism

Gate simulation updates behind a `paused` flag without touching the game loop or shared package.

### Ticket 1.1 — Add `setPaused()` to `SceneModeController` interface

**File**: `packages/client/src/scenes/core/SceneModeController.ts`

Add to the interface:
```typescript
setPaused(paused: boolean): void
isPaused(): boolean
```

### Ticket 1.2 — Implement pause in `SingleplayerModeController`

**File**: `packages/client/src/scenes/core/SingleplayerModeController.ts`

- Add `private paused = false` field
- `setPaused(v)`: set flag
- `isPaused()`: return flag
- In `update()`, add early return after the death check: `if (this.paused) return`
- This gates `simulationDriver.step()`, event emission, and all per-tick logic
- Rendering continues via the separate `render()` method (unaffected)

### Ticket 1.3 — Implement pause in `MultiplayerModeController`

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

- Same `paused` field and methods
- In multiplayer, `setPaused(true)` does NOT gate simulation — the server keeps running
- Instead, it sets a flag that the page reads to show/hide the settings overlay
- Input is still sent to the server (player stands still because no keys pressed while in menu)

---

## Epic 2: Escape Key Routing

Handle Escape at the page level with a priority chain: close overlay > toggle pause > nothing.

### Ticket 2.1 — Add Escape handler to `Game.tsx`

**File**: `packages/client/src/pages/Game.tsx`

Add a `useEffect` with a `keydown` listener for `Escape`:

```
Priority chain:
1. If skill tree is open → close skill tree, done
2. If camp panel is open → ignore (camp has its own flow)
3. If player is dead → ignore
4. If pause menu is open → resume (close pause menu, unpause sim)
5. Otherwise → pause (open pause menu, pause sim)
```

New state: `const [showPauseMenu, setShowPauseMenu] = useState(false)`

When opening pause menu:
- `sceneRef.current.controller.setPaused(true)`
- `setShowPauseMenu(true)`

When closing:
- `sceneRef.current.controller.setPaused(false)`
- `setShowPauseMenu(false)`

### Ticket 2.2 — Add Escape handler to `MultiplayerGame.tsx`

**File**: `packages/client/src/pages/MultiplayerGame.tsx`

Same priority chain, except step 5 opens a settings overlay instead of pausing the sim. The overlay is non-blocking — game renders and updates continue.

---

## Epic 3: PauseMenu Component

A full-screen overlay with Resume, Settings, and Quit buttons.

### Ticket 3.1 — Create `PauseMenu.tsx`

**File**: `packages/client/src/ui/PauseMenu.tsx`

**Props:**
```typescript
interface PauseMenuProps {
  onResume: () => void
  onSettings: () => void
  onQuitToMenu: () => void
}
```

**Layout:**
- Full-screen absolute overlay (same pattern as `SkillTreePanel`)
- Semi-transparent dark backdrop: `rgba(0, 0, 0, 0.75)`
- Z-index: 70 (above all other overlays)
- Centered panel with title "PAUSED" in the existing monospace western style
- Three buttons stacked vertically:
  - **RESUME** — calls `onResume`
  - **SETTINGS** — calls `onSettings`
  - **QUIT TO MENU** — calls `onQuitToMenu`
- Button style matches existing camp/skill tree buttons (gold border, hover glow)
- `pointerEvents: 'auto'` on the panel, `'none'` passthrough elsewhere

### Ticket 3.2 — Wire into `Game.tsx` rendering

**File**: `packages/client/src/pages/Game.tsx`

Add conditional rendering alongside other overlays:
```tsx
{showPauseMenu && (
  <PauseMenu
    onResume={handleResume}
    onSettings={() => setShowSettings(true)}
    onQuitToMenu={handleQuitToMenu}
  />
)}
```

Ensure the pause menu hides the HUD (add `!showPauseMenu` guard to HUD rendering).

---

## Epic 4: Settings Panel (Audio)

A sub-panel of the pause menu with volume controls.

### Ticket 4.1 — Create `SettingsPanel.tsx`

**File**: `packages/client/src/ui/SettingsPanel.tsx`

**Props:**
```typescript
interface SettingsPanelProps {
  volume: number          // 0–100
  muted: boolean
  onVolumeChange: (v: number) => void
  onMutedChange: (m: boolean) => void
  onBack: () => void
}
```

**Layout:**
- Same full-screen overlay style as PauseMenu (z-index 70)
- Title: "SETTINGS"
- **Master Volume** label + range slider (0–100) + percentage text
  - HTML `<input type="range">` styled to match western aesthetic
  - `onChange` calls `onVolumeChange` which calls `soundManager.setMasterVolume(v / 100)`
- **Mute** toggle button: "MUTED" / "UNMUTED"
  - Calls `onMutedChange` which calls `soundManager.muted = v`
- **BACK** button returns to pause menu

### Ticket 4.2 — Expose SoundManager to pages

**File**: `packages/client/src/pages/Game.tsx`

The SoundManager is created inside the mode controller and not accessible from React. Options:

**Approach**: Store a ref to the SoundManager at scene creation time:
- `CoreGameScene` already has access to the mode controller
- Add `getSoundManager(): SoundManager` to `SceneModeController` interface
- Pages call `sceneRef.current.controller.getSoundManager()` to read/write volume

### Ticket 4.3 — Wire settings state

**File**: `packages/client/src/pages/Game.tsx`

```typescript
const [showSettings, setShowSettings] = useState(false)
const [volume, setVolume] = useState(100)
const [muted, setMuted] = useState(false)

function handleVolumeChange(v: number) {
  setVolume(v)
  sceneRef.current?.controller.getSoundManager().setMasterVolume(v / 100)
}
```

When settings panel is open, pause menu is hidden. Back button returns to pause menu.

---

## Epic 5: Quit-to-Menu Flow

### Ticket 5.1 — Implement quit handler in `Game.tsx`

**File**: `packages/client/src/pages/Game.tsx`

On "QUIT TO MENU":
1. Unpause the simulation
2. Call cleanup on the scene (stop game loop, destroy renderers)
3. Navigate back to menu/character select

Check existing cleanup: `SingleplayerModeController.destroy()` (line 783) already cleans up event listeners and renderers. The page just needs to trigger it and navigate.

### Ticket 5.2 — Implement quit handler in `MultiplayerGame.tsx`

**File**: `packages/client/src/pages/MultiplayerGame.tsx`

On "QUIT TO MENU":
1. Close settings overlay
2. Disconnect from Colyseus room (`room.leave()`)
3. Navigate to lobby

---

## Epic 6: Persistent Audio Preferences

### Ticket 6.1 — Save/restore volume from localStorage

**File**: `packages/client/src/audio/SoundManager.ts` or new `packages/client/src/audio/audioPrefs.ts`

```typescript
const STORAGE_KEY = 'high-noon-audio'

export function loadAudioPrefs(): { volume: number; muted: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { volume: 100, muted: false }
}

export function saveAudioPrefs(volume: number, muted: boolean): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume, muted }))
}
```

Apply saved prefs when SoundManager is first created. Save on every change from the settings panel.

---

## Epic 7: Multiplayer Settings Overlay

### Ticket 7.1 — Non-blocking settings overlay for multiplayer

**File**: `packages/client/src/pages/MultiplayerGame.tsx`

In multiplayer, Escape opens a settings-only overlay (no "PAUSED" state, no sim freeze). Buttons:
- **SETTINGS** — same audio controls
- **LEAVE MATCH** — disconnects from room
- **CLOSE** — dismiss overlay

The overlay is semi-transparent so the player can see the game continuing underneath. A large "PRESS ESC TO CLOSE" hint at the bottom.

---

## Verification

1. `bun run typecheck` — no type errors
2. `bun run build` — builds cleanly
3. Manual test (singleplayer):
   - Press Escape → pause menu appears, simulation freezes, rendering continues
   - Click Resume → simulation resumes
   - Open settings → volume slider works, mute toggles audio
   - Quit to menu → returns to character select
   - Open skill tree → press Escape → skill tree closes (not pause menu)
   - Die → press Escape → nothing happens
4. Manual test (multiplayer):
   - Press Escape → settings overlay appears, game continues
   - Adjust volume → audio changes
   - Leave match → returns to lobby
5. Audio prefs persist across page refresh
