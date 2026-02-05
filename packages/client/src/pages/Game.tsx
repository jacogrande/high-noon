import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  createGameWorld,
  createSystemRegistry,
  stepWorld,
  type GameWorld,
  type SystemRegistry,
} from '@high-noon/shared'
import { GameApp } from '../engine/GameApp'
import { GameLoop } from '../engine/GameLoop'
import { Input } from '../engine/Input'
import { DebugRenderer } from '../render/DebugRenderer'
import { SpriteRegistry } from '../render/SpriteRegistry'

export function Game() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let gameApp: GameApp | null = null
    let gameLoop: GameLoop | null = null
    let input: Input | null = null
    let debugRenderer: DebugRenderer | null = null
    let spriteRegistry: SpriteRegistry | null = null
    let world: GameWorld | null = null
    let systems: SystemRegistry | null = null
    let mounted = true

    async function init(gameContainer: HTMLDivElement) {
      // Create PixiJS application
      gameApp = await GameApp.create(gameContainer)
      if (!mounted) {
        gameApp.destroy()
        return
      }

      // Create input handler
      input = new Input()

      // Create ECS world and system registry
      world = createGameWorld()
      systems = createSystemRegistry()

      // Create renderers
      debugRenderer = new DebugRenderer(gameApp.layers.ui)
      spriteRegistry = new SpriteRegistry(gameApp.layers.entities)

      // Add debug graphics container to entity layer for testing
      gameApp.layers.entities.addChild(debugRenderer.getContainer())

      // Draw a test circle in the center to verify rendering works
      const centerX = gameApp.width / 2
      const centerY = gameApp.height / 2
      debugRenderer.circle(centerX, centerY, 20, 0x00ffff)

      // Capture gameApp reference for callbacks
      const app = gameApp

      // Create game loop
      gameLoop = new GameLoop(
        // Update callback - runs at fixed 60Hz
        (_dt) => {
          if (!world || !input || !systems) return

          // Get input state
          const inputState = input.getInputState()

          // Step the simulation
          stepWorld(world, systems, inputState)
        },
        // Render callback - runs at display refresh rate
        (_alpha) => {
          if (!debugRenderer || !gameLoop || !world) return

          // Clear debug graphics
          debugRenderer.clear()

          // Draw test circle (will be replaced by entity rendering)
          const cx = app.width / 2
          const cy = app.height / 2
          debugRenderer.circle(cx, cy, 20, 0x00ffff)

          // Update debug overlay
          debugRenderer.updateStats({
            fps: gameLoop.fps,
            tick: world.tick,
            entityCount: spriteRegistry?.count ?? 0,
          })
        }
      )

      // Start the game loop
      gameLoop.start()

      // Toggle debug overlay with backtick
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === 'Backquote') {
          debugRenderer?.toggle()
        }
      }
      window.addEventListener('keydown', handleKeyDown)

      // Return cleanup for key listener
      return () => {
        window.removeEventListener('keydown', handleKeyDown)
      }
    }

    const cleanupPromise = init(container)

    return () => {
      mounted = false

      cleanupPromise.then((cleanup) => cleanup?.())

      gameLoop?.stop()
      input?.destroy()
      debugRenderer?.destroy()
      spriteRegistry?.destroy()
      gameApp?.destroy()
    }
  }, [])

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <Link to="/" style={styles.backButton}>
          ← Back
        </Link>
      </div>
      <div ref={containerRef} style={styles.gameContainer} />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    width: '100vw',
    height: '100vh',
    backgroundColor: '#1a1a2e',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    padding: '1rem',
    zIndex: 100,
  },
  backButton: {
    color: '#ffffff',
    textDecoration: 'none',
    fontSize: '1rem',
    opacity: 0.7,
    transition: 'opacity 0.2s',
  },
  gameContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
}
