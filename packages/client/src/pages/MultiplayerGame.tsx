import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { HUDState } from '../scenes/GameScene'
import { GameApp } from '../engine/GameApp'
import { GameLoop } from '../engine/GameLoop'
import { MultiplayerGameScene } from '../scenes/MultiplayerGameScene'
import { AssetLoader } from '../assets'
import { GameHUD } from '../ui/GameHUD'

type Phase = 'loading' | 'connecting' | 'playing' | 'error'

export function MultiplayerGame() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [loadProgress, setLoadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [hudState, setHudState] = useState<HUDState | null>(null)
  const lastHudUpdateRef = useRef(0)

  // Phase 1: Load assets
  useEffect(() => {
    let mounted = true
    setError(null)
    setPhase('loading')

    async function loadAssets() {
      try {
        await AssetLoader.loadAll((progress) => {
          if (mounted) setLoadProgress(progress)
        })
        if (mounted) setPhase('connecting')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error loading assets'
        if (mounted) {
          setError(message)
          setPhase('error')
        }
      }
    }

    loadAssets()
    return () => { mounted = false }
  }, [retryCount])

  // Phase 2: Initialize game + connect
  useEffect(() => {
    if (phase !== 'connecting') return
    const container = containerRef.current
    if (!container) return

    let gameApp: GameApp | null = null
    let gameLoop: GameLoop | null = null
    let scene: MultiplayerGameScene | null = null
    let mounted = true

    async function init(gameContainer: HTMLDivElement) {
      gameApp = await GameApp.create(gameContainer)
      if (!mounted) { gameApp.destroy(); return }

      scene = await MultiplayerGameScene.create(gameApp)
      if (!mounted) { scene.destroy(); gameApp.destroy(); return }

      try {
        await scene.connect()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to connect'
        if (mounted) { setError(message); setPhase('error') }
        scene.destroy()
        gameApp.destroy()
        return
      }

      if (!mounted) { scene.destroy(); gameApp.destroy(); return }

      setPhase('playing')

      gameLoop = new GameLoop(
        (dt) => scene!.update(dt),
        (alpha) => {
          scene!.render(alpha, gameLoop!.fps)
          // Throttled HUD polling (~10 Hz)
          const now = performance.now()
          if (now - lastHudUpdateRef.current >= 100) {
            lastHudUpdateRef.current = now
            setHudState(scene!.getHUDState())
          }
        },
      )
      gameLoop.start()
    }

    init(container)

    return () => {
      mounted = false
      gameLoop?.stop()
      scene?.destroy()
      gameApp?.destroy()
    }
  }, [phase])

  const handleRetry = () => {
    setError(null)
    setLoadProgress(0)
    AssetLoader.reset()
    setRetryCount((c) => c + 1)
  }

  if (phase === 'error') {
    return (
      <div style={styles.container}>
        <div style={styles.centerBox}>
          <div style={styles.errorTitle}>Connection Failed</div>
          <div style={styles.errorMessage}>{error}</div>
          <button style={styles.retryButton} onClick={handleRetry}>
            Retry
          </button>
          <Link to="/" style={styles.backLink}>
            Back to Menu
          </Link>
        </div>
      </div>
    )
  }

  if (phase === 'loading') {
    return (
      <div style={styles.container}>
        <div style={styles.centerBox}>
          <div style={styles.statusText}>Loading...</div>
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

  if (phase === 'connecting') {
    return (
      <div style={styles.container}>
        <div style={styles.centerBox}>
          <div style={styles.statusText}>Connecting...</div>
        </div>
        {/* Hidden container so GameApp can attach canvas */}
        <div ref={containerRef} style={styles.hiddenContainer} />
      </div>
    )
  }

  // phase === 'playing'
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <Link to="/" style={styles.backButton}>
          ← Back
        </Link>
      </div>
      <div ref={containerRef} style={styles.gameContainer} />
      {hudState && !hudState.isDead && <GameHUD state={hudState} />}
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
  },
  gameContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  hiddenContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    visibility: 'hidden',
  },
  centerBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    gap: '1rem',
  },
  statusText: {
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
  errorTitle: {
    color: '#ffffff',
    fontSize: '1.5rem',
    fontFamily: 'monospace',
  },
  errorMessage: {
    color: '#aaaaaa',
    fontSize: '0.9rem',
    fontFamily: 'monospace',
    textAlign: 'center',
    maxWidth: '400px',
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
  },
  backLink: {
    marginTop: '0.5rem',
    color: '#888888',
    textDecoration: 'none',
    fontSize: '0.9rem',
    fontFamily: 'monospace',
  },
}
