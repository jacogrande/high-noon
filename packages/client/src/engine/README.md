# engine/

Core client engine: PixiJS setup, game loop, and input handling.

## Responsibilities

- Initialize PixiJS Application with render layers
- Manage the main game loop (fixed update + variable render)
- Collect keyboard and mouse input
- Provide interpolation alpha for smooth rendering

## Current Files

- `GameApp.ts` - PixiJS Application wrapper with layer management
- `GameLoop.ts` - Fixed timestep game loop with interpolation
- `Input.ts` - Keyboard and mouse input collection
- `Camera.ts` - Aim-offset follow camera with smoothing, bounds clamping, shake, and kick
- `ScreenShake.ts` - Trauma-based screen shake using Perlin noise
- `CameraKick.ts` - Directional recoil offset (opposite fire direction)
- `HitStop.ts` - Frame freeze effect for impact feel
- `noise.ts` - 1D Perlin noise function for shake

## Game Loop

```
requestAnimationFrame
  │
  ├─► Accumulate delta time
  │
  ├─► While (accumulator >= TICK_MS):
  │     └─► Call update(dt) at 60 Hz fixed
  │
  ├─► Calculate interpolation alpha
  │
  └─► Call render(alpha) at display refresh rate
```

## Input Handling

Input collects:
- WASD/Arrow keys for movement
- Mouse position for aim angle
- Mouse button for shooting
- Space/Shift for rolling
- K for debug enemy bullet spawn

Returns normalized `InputState` for the simulation:

```typescript
const input = new Input()
input.setReferencePosition(playerX, playerY)  // For aim calculation
const state = input.getInputState()           // Returns InputState
```

## GameApp Layers

Render layers from back to front:
- `background` - Static background
- `tiles` - Tile-based geometry
- `entities` - Game entities (players, enemies)
- `fx` - Effects and particles
- `ui` - Debug overlay, HUD

## Dependencies

- `pixi.js` - Application, Container
- `@high-noon/shared` - TICK_MS constant, InputState type
