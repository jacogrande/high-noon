import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  createGameWorld,
  createSystemRegistry,
  stepWorld,
  spawnPlayer,
  setWorldTilemap,
  createTestArena,
  getArenaCenter,
  movementSystem,
  playerInputSystem,
  rollSystem,
  collisionSystem,
  weaponSystem,
  bulletSystem,
  type GameWorld,
  type SystemRegistry,
  type Tilemap,
} from '@high-noon/shared'
import { GameApp } from '../engine/GameApp'
import { GameLoop } from '../engine/GameLoop'
import { Input } from '../engine/Input'
import { DebugRenderer } from '../render/DebugRenderer'
import { SpriteRegistry } from '../render/SpriteRegistry'
import { PlayerRenderer } from '../render/PlayerRenderer'
import { BulletRenderer } from '../render/BulletRenderer'
import { TilemapRenderer, CollisionDebugRenderer } from '../render/TilemapRenderer'

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
    let playerRenderer: PlayerRenderer | null = null
    let bulletRenderer: BulletRenderer | null = null
    let tilemapRenderer: TilemapRenderer | null = null
    let collisionDebugRenderer: CollisionDebugRenderer | null = null
    let world: GameWorld | null = null
    let systems: SystemRegistry | null = null
    let tilemap: Tilemap | null = null
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

      // Create tilemap
      tilemap = createTestArena()

      // Create ECS world and system registry
      world = createGameWorld()
      setWorldTilemap(world, tilemap)
      systems = createSystemRegistry()

      // Register systems in execution order
      // 1. Player input - converts input to velocity, initiates rolls
      // 2. Roll - applies roll velocity, manages i-frames
      // 3. Weapon - spawns bullets at current position before movement
      // 4. Bullet - tracks distance traveled, handles despawning
      // 5. Movement - applies velocity to position
      // 6. Collision - resolves collisions after movement
      systems.register(playerInputSystem)
      systems.register(rollSystem)
      systems.register(weaponSystem)
      systems.register(bulletSystem)
      systems.register(movementSystem)
      systems.register(collisionSystem)

      // Create renderers
      // Tilemap renders on background layer
      tilemapRenderer = new TilemapRenderer(gameApp.layers.background)
      tilemapRenderer.render(tilemap)

      // Debug and entity renderers
      debugRenderer = new DebugRenderer(gameApp.layers.ui)
      spriteRegistry = new SpriteRegistry(gameApp.layers.entities)
      playerRenderer = new PlayerRenderer(spriteRegistry)
      bulletRenderer = new BulletRenderer(spriteRegistry)
      collisionDebugRenderer = new CollisionDebugRenderer(gameApp.layers.ui)

      // Add debug graphics container to entity layer
      gameApp.layers.entities.addChild(debugRenderer.getContainer())

      // Spawn the player at arena center
      const { x: centerX, y: centerY } = getArenaCenter()
      spawnPlayer(world, centerX, centerY)

      // Sync player renderer to create initial sprite
      playerRenderer.sync(world)

      // Create game loop
      gameLoop = new GameLoop(
        // Update callback - runs at fixed 60Hz
        (_dt) => {
          if (!world || !input || !systems || !playerRenderer || !bulletRenderer) return

          // Update input reference position for aim calculation
          const playerPos = playerRenderer.getPlayerScreenPosition(world, 1)
          if (playerPos) {
            input.setReferencePosition(playerPos.x, playerPos.y)
          }

          // Get input state
          const inputState = input.getInputState()

          // Step the simulation
          stepWorld(world, systems, inputState)

          // Sync renderers (create/remove sprites)
          playerRenderer.sync(world)
          bulletRenderer.sync(world)
        },
        // Render callback - runs at display refresh rate
        (alpha) => {
          if (!debugRenderer || !gameLoop || !world || !playerRenderer || !bulletRenderer) return

          // Clear debug graphics
          debugRenderer.clear()
          collisionDebugRenderer?.clear()

          // Render player with interpolation
          playerRenderer.render(world, alpha)

          // Render bullets with interpolation
          bulletRenderer.render(world, alpha)

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
          collisionDebugRenderer?.toggle()
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
      collisionDebugRenderer?.destroy()
      tilemapRenderer?.destroy()
      bulletRenderer?.destroy()
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
