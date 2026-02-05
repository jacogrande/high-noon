# engine/

Core client engine: PixiJS setup, game loop, and scene management.

## Responsibilities

- Initialize PixiJS Application
- Manage the main game loop (render + fixed step)
- Scene transitions (menu, lobby, gameplay)
- Fixed timestep accumulator for simulation

## Key Files

- `GameApp.ts` - PixiJS Application wrapper, root container
- `SceneManager.ts` - Scene lifecycle (boot, menu, lobby, run)
- `FixedStep.ts` - Timestep accumulator for deterministic updates

## Game Loop

```
requestAnimationFrame
  │
  ├─► Accumulate delta time
  │
  ├─► While (accumulator >= TICK_MS):
  │     └─► Step simulation (60 Hz fixed)
  │
  ├─► Calculate interpolation alpha
  │
  └─► Render (variable FPS)
```

## Scene Lifecycle

Each scene implements:
- `enter()` - Setup when scene becomes active
- `update(dt)` - Called each fixed tick
- `render(alpha)` - Called each frame with interpolation alpha
- `exit()` - Cleanup when leaving scene

## Dependencies

- `pixi.js` - Rendering
- `../net` - Network client for multiplayer scenes
- `../render` - Sprite and effects systems
- `@high-noon/shared` - Simulation for single-player/prediction
