# scenes/

Game scene classes that own game state, systems, and renderers.

## Current Files

- `GameScene.ts` - Main gameplay scene

## GameScene

Owns all runtime game state extracted from `Game.tsx`:

- **Input** - Keyboard/mouse collection
- **Camera** - Aim-offset follow with shake, kick, bounds
- **HitStop** - Frame freeze effect
- **ECS World** - Game world and system registry
- **Renderers** - Tilemap, player, bullet, debug, collision debug

### Lifecycle

```typescript
const scene = await GameScene.create({ gameApp })

// In GameLoop:
scene.update(dt)           // Fixed 60Hz — input, sim step, camera
scene.render(alpha, fps)   // Variable Hz — interpolation, effects, debug overlay

// On teardown:
scene.destroy()
```

### What GameScene Does NOT Own

- `GameApp` — created and destroyed by `Game.tsx` (React lifecycle)
- `GameLoop` — created by `Game.tsx`, calls scene.update/render

### Game Over

When the local player's entity has the `Dead` component, `update()` stops the simulation
and `render()` displays a "GAME OVER" text overlay.

### Debug Keys

- **Backtick** - Toggle debug overlay and collision visualization
- **K** - Spawn a test enemy bullet aimed at the player (via shared `debugSpawnSystem`)
- **P** - Pause enemy spawning and kill all active enemies (toggle)

The debug overlay shows FPS, tick, entity count, player state/HP/position/velocity, and camera position/trauma.
