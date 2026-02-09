# scenes/

Game scene classes that own game state, systems, and renderers.

## Current Files

- `GameScene.ts` - Single-player gameplay scene (runs local simulation)
- `MultiplayerGameScene.ts` - Multiplayer scene with client-side prediction and server reconciliation

## GameScene

Single-player scene. Owns all runtime game state extracted from `Game.tsx`:

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

## MultiplayerGameScene

Multiplayer scene with **client-side prediction** and **server reconciliation**. The server is authoritative; the client predicts locally for responsiveness and corrects on mismatch.

```typescript
const scene = await MultiplayerGameScene.create(gameApp)
await scene.connect()           // Join server, receive game-config (with timeout)
scene.update(dt)                // Predict locally + send input to server
scene.render(alpha, fps)        // Interpolate remote entities + render
scene.destroy()                 // Disconnect + cleanup
```

### How It Works

1. A **shadow ECS world** holds entity data — local player is predicted, remote entities populated from snapshots
2. **Prediction systems** (playerInput, roll, cylinder, weapon, spatialHash, movement, collision) run locally for the player entity at 60Hz
3. **Replay systems** (movement-only, no weapon/cylinder) are used during reconciliation to prevent double-spawning bullets
4. On each server **snapshot** (~20Hz), the local player is rewound to server state and unacknowledged inputs are replayed
5. **Misprediction smoothing** applies an exponential-decay visual offset instead of snapping
6. **Predicted bullets** are tracked and matched to server-confirmed bullets by proximity
7. **Cylinder/weapon state** is managed purely by prediction — not reconciled from server HUD
8. **Visual feedback** (camera shake, kick, weapon recoil, muzzle flash) fires immediately on predicted fire via cylinder round counting
9. **SnapshotBuffer** handles interpolation of remote entities between 20Hz server updates
10. **Camera** follows the local player with sub-frame interpolation via game loop alpha
