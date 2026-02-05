# PixiJS React Guide

## Overview

`@pixi/react` allows writing PixiJS applications using React's declarative style. This is optional for High Noon - use it if you want React-based UI surrounding the game canvas.

**Requirements:** React 19+, PixiJS v8

## Installation

```bash
bun add @pixi/react pixi.js react react-dom
```

## Core Concepts

### The Extend API

PixiJS React uses tree-shaking. You must explicitly import the components you need:

```typescript
import { Application, extend } from '@pixi/react'
import { Container, Sprite, Graphics, Text } from 'pixi.js'

// Register components you'll use
extend({ Container, Sprite, Graphics, Text })
```

This keeps bundle sizes small - only imported PixiJS classes are included.

### Application Component

The `<Application>` component wraps your PixiJS app and accepts all `PIXI.Application` options:

```tsx
import { Application } from '@pixi/react'

function Game() {
  return (
    <Application
      width={1280}
      height={720}
      backgroundColor={0x1a1a2e}
    >
      <pixiContainer>
        <pixiSprite texture={playerTexture} x={400} y={300} />
      </pixiContainer>
    </Application>
  )
}
```

### Component Naming

All PixiJS components use the `pixi` prefix in JSX:

```tsx
<pixiContainer>      {/* Container */}
<pixiSprite>         {/* Sprite */}
<pixiGraphics>       {/* Graphics */}
<pixiText>           {/* Text */}
```

### Graphics with Draw Callback

For the Graphics component, use a draw callback:

```tsx
<pixiGraphics
  draw={(g) => {
    g.clear()
    g.circle(0, 0, 50)
    g.fill(0xff0000)
  }}
/>
```

### Event Handling

React-style event handlers work on PixiJS components:

```tsx
<pixiSprite
  texture={buttonTexture}
  eventMode="static"
  cursor="pointer"
  onPointerDown={() => console.log('clicked')}
  onPointerOver={() => setHovered(true)}
  onPointerOut={() => setHovered(false)}
/>
```

## High Noon Integration

### When to Use PixiJS React

**Good for:**
- Menu screens and UI overlays
- Lobby/matchmaking interfaces
- HUD elements that benefit from React state management
- Rapid prototyping

**Not ideal for:**
- The core game renderer (60Hz ECS updates don't fit React's render model)
- Performance-critical bullet/enemy rendering

### Hybrid Approach

Use React for UI, vanilla PixiJS for game rendering:

```tsx
function GameScreen() {
  const gameRef = useRef<GameEngine>(null)

  return (
    <div className="game-screen">
      {/* Vanilla PixiJS canvas for game */}
      <canvas ref={canvasRef} />

      {/* React UI overlay */}
      <div className="hud-overlay">
        <HealthBar health={playerHealth} />
        <AmmoCounter ammo={ammoCount} />
      </div>
    </div>
  )
}
```

### Accessing the Application Instance

Use the `useApp` hook to access the PixiJS Application:

```tsx
import { useApp } from '@pixi/react'

function GameWorld() {
  const app = useApp()

  useEffect(() => {
    // Access app.ticker, app.renderer, etc.
    app.ticker.add(gameLoop)
    return () => app.ticker.remove(gameLoop)
  }, [app])

  return <pixiContainer />
}
```

### Ticker Hook

For animation updates:

```tsx
import { useTick } from '@pixi/react'

function MovingSprite() {
  const [x, setX] = useState(0)

  useTick((ticker) => {
    setX((prev) => prev + ticker.deltaTime)
  })

  return <pixiSprite texture={texture} x={x} y={100} />
}
```

**Caution:** Calling `setState` every frame can cause performance issues. For the main game loop, prefer vanilla PixiJS.

## Recommended Pattern for High Noon

```
packages/client/
  src/
    engine/           # Vanilla PixiJS game engine
      GameApp.ts
      RenderSystem.ts
    ui/               # React components
      App.tsx         # Root React app
      screens/
        MainMenu.tsx
        Lobby.tsx
        GameScreen.tsx  # Hosts canvas + HUD overlay
      components/
        HealthBar.tsx
        DamageNumbers.tsx
```

The game engine manages its own PixiJS Application. React manages UI state and renders overlays.

## Resources

- [PixiJS React Docs](https://react.pixijs.io/)
- [GitHub: pixijs/pixi-react](https://github.com/pixijs/pixi-react)
- [PixiJS React v8 Announcement](https://pixijs.com/blog/pixi-react-v8-live)
