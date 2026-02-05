import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { GameApp } from '../engine/GameApp'
import { GameLoop } from '../engine/GameLoop'
import { GameScene } from '../scenes/GameScene'
import { AssetLoader } from '../assets'

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
    let scene: GameScene | null = null
    let mounted = true

    async function init(gameContainer: HTMLDivElement) {
      gameApp = await GameApp.create(gameContainer)
      if (!mounted) {
        gameApp.destroy()
        return
      }

      scene = await GameScene.create({ gameApp })
      if (!mounted) {
        scene.destroy()
        gameApp.destroy()
        return
      }

      gameLoop = new GameLoop(
        (dt) => scene!.update(dt),
        (alpha) => scene!.render(alpha, gameLoop!.fps)
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
