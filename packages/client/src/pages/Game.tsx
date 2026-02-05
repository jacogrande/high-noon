import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  createGameWorld,
  createSystemRegistry,
  stepWorld,
  spawnPlayer,
  setWorldTilemap,
  createTestArena,
  getArenaCenter,
  getPlayableBounds,
  movementSystem,
  playerInputSystem,
  rollSystem,
  collisionSystem,
  weaponSystem,
  bulletSystem,
  bulletCollisionSystem,
  Player,
  Position,
  type GameWorld,
  type SystemRegistry,
  type Tilemap,
} from '@high-noon/shared'
import { GameApp } from '../engine/GameApp'
import { GameLoop } from '../engine/GameLoop'
import { Input } from '../engine/Input'
import { Camera } from '../engine/Camera'
import { HitStop } from '../engine/HitStop'
import { DebugRenderer } from '../render/DebugRenderer'
import { SpriteRegistry } from '../render/SpriteRegistry'
import { PlayerRenderer } from '../render/PlayerRenderer'
import { BulletRenderer } from '../render/BulletRenderer'
import { TilemapRenderer, CollisionDebugRenderer } from '../render/TilemapRenderer'
import { AssetLoader } from '../assets'

const GAME_ZOOM = 2

export function Game() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [loadProgress, setLoadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  // First effect: Load assets (doesn't need container)
  useEffect(() => {
    let mounted = true
    setError(null)

    async function loadAssets() {
      console.log('[Game] Starting asset loading...')
      try {
        await AssetLoader.loadAll((progress) => {
          if (mounted) {
            setLoadProgress(progress)
          }
        })
        console.log('[Game] Assets loaded successfully')
        if (mounted) {
          setLoading(false)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error loading assets'
        console.error('[Game] Asset loading failed:', err)
        if (mounted) {
          setError(message)
          setLoading(false)
        }
      }
    }

    loadAssets()

    return () => {
      mounted = false
    }
  }, [retryCount])

  // Second effect: Initialize game (needs container and assets)
  useEffect(() => {
    // Wait for assets to load and container to be available
    if (loading || error) return
    const container = containerRef.current
    if (!container) return

    console.log('[Game] Assets loaded and container ready, initializing game...')

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
    let camera: Camera | null = null
    let hitStop: HitStop | null = null
    let lastRenderTime = 0
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
      // 4. Bullet - tracks distance traveled, handles range/lifetime despawning
      // 5. Movement - applies velocity to position
      // 6. Bullet collision - despawns bullets that hit walls
      // 7. Collision - resolves entity collisions (pushout)
      systems.register(playerInputSystem)
      systems.register(rollSystem)
      systems.register(weaponSystem)
      systems.register(bulletSystem)
      systems.register(movementSystem)
      systems.register(bulletCollisionSystem)
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

      // Apply zoom to world container
      gameApp.world.scale.set(GAME_ZOOM)

      // Create camera and snap to arena center (viewport in world coords)
      camera = new Camera()
      camera.setViewport(gameApp.width / GAME_ZOOM, gameApp.height / GAME_ZOOM)
      const bounds = getPlayableBounds()
      camera.setBounds(bounds)
      camera.snapTo(centerX, centerY)

      // Create hit stop
      hitStop = new HitStop()
      lastRenderTime = performance.now()

      // Create game loop
      gameLoop = new GameLoop(
        // Update callback - runs at fixed 60Hz
        (dt) => {
          if (!world || !input || !systems || !playerRenderer || !bulletRenderer || !camera) return

          // Skip sim tick if hit-stopped (intentionally also freezes aim)
          if (hitStop?.isFrozen) return

          // Get player entity for position lookups
          const playerEid = playerRenderer.getPlayerEntity()

          // Set player world position as aim reference
          if (playerEid !== null) {
            input.setReferencePosition(Position.x[playerEid]!, Position.y[playerEid]!)
          }

          // Set camera state for screen→world conversion
          const camPos = camera.getPosition()
          input.setCamera(camPos.x, camPos.y, gameApp!.width, gameApp!.height, GAME_ZOOM)

          // Get input state (now with correct world-space aim)
          const inputState = input.getInputState()

          // Step the simulation
          stepWorld(world, systems, inputState)

          // Sync renderers (create/remove sprites)
          playerRenderer.sync(world)

          // Detect new bullets for camera effects
          const prevBulletCount = bulletRenderer.count
          bulletRenderer.sync(world)
          if (bulletRenderer.count > prevBulletCount && playerEid !== null) {
            const angle = Player.aimAngle[playerEid]!
            camera.addTrauma(0.08)
            camera.applyKick(Math.cos(angle), Math.sin(angle), 3)
          }

          // Update camera target
          if (playerEid !== null) {
            const worldMouse = input.getWorldMousePosition()
            camera.update(
              Position.x[playerEid]!,
              Position.y[playerEid]!,
              worldMouse.x,
              worldMouse.y,
              dt
            )
          }
        },
        // Render callback - runs at display refresh rate
        (alpha) => {
          if (!debugRenderer || !gameLoop || !world || !playerRenderer || !bulletRenderer || !camera || !gameApp) return

          // Compute real delta time for effects
          const now = performance.now()
          const realDt = Math.min((now - lastRenderTime) / 1000, 0.25) // cap at 250ms
          lastRenderTime = now

          // Update hit stop
          hitStop?.update(realDt)

          // Update camera viewport in world coords (handles resize)
          camera.setViewport(gameApp.width / GAME_ZOOM, gameApp.height / GAME_ZOOM)

          // Get interpolated camera state with shake + kick
          const camState = camera.getRenderState(alpha, realDt)

          // Apply camera transform to world container
          const halfW = gameApp.width / 2
          const halfH = gameApp.height / 2
          gameApp.world.pivot.set(camState.x, camState.y)
          gameApp.world.position.set(halfW, halfH)
          gameApp.world.rotation = camState.angle

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
  }, [loading, error])

  const handleRetry = () => {
    setLoading(true)
    setLoadProgress(0)
    AssetLoader.reset()
    setRetryCount((c) => c + 1)
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.errorContainer}>
          <div style={styles.errorIcon}>!</div>
          <div style={styles.errorTitle}>Failed to Load Game</div>
          <div style={styles.errorMessage}>{error}</div>
          <button style={styles.retryButton} onClick={handleRetry}>
            Retry
          </button>
          <Link to="/" style={styles.errorBackLink}>
            ← Back to Menu
          </Link>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingContainer}>
          <div style={styles.loadingText}>Loading...</div>
          <div style={styles.progressBarOuter}>
            <div
              style={{
                ...styles.progressBarInner,
                width: `${loadProgress * 100}%`,
              }}
            />
          </div>
        </div>
      </div>
    )
  }

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
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    gap: '1rem',
  },
  loadingText: {
    color: '#ffffff',
    fontSize: '1.5rem',
    fontFamily: 'monospace',
  },
  progressBarOuter: {
    width: '300px',
    height: '8px',
    backgroundColor: '#333',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressBarInner: {
    height: '100%',
    backgroundColor: '#00ffff',
    transition: 'width 0.1s ease-out',
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    gap: '1rem',
    padding: '2rem',
  },
  errorIcon: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    backgroundColor: '#ff4444',
    color: '#ffffff',
    fontSize: '2.5rem',
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'monospace',
  },
  errorTitle: {
    color: '#ffffff',
    fontSize: '1.5rem',
    fontFamily: 'monospace',
    marginTop: '0.5rem',
  },
  errorMessage: {
    color: '#aaaaaa',
    fontSize: '0.9rem',
    fontFamily: 'monospace',
    textAlign: 'center',
    maxWidth: '400px',
    wordBreak: 'break-word',
  },
  retryButton: {
    marginTop: '1rem',
    padding: '0.75rem 2rem',
    backgroundColor: '#00ffff',
    color: '#1a1a2e',
    border: 'none',
    borderRadius: '4px',
    fontSize: '1rem',
    fontFamily: 'monospace',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  errorBackLink: {
    marginTop: '0.5rem',
    color: '#888888',
    textDecoration: 'none',
    fontSize: '0.9rem',
    fontFamily: 'monospace',
    transition: 'color 0.2s',
  },
}
