import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import type { CharacterId } from '@high-noon/shared'
import type { HUDState, SkillTreeUIData } from '../scenes/types'
import { GameApp } from '../engine/GameApp'
import { GameLoop } from '../engine/GameLoop'
import { CoreGameScene } from '../scenes/CoreGameScene'
import { AssetLoader } from '../assets'
import { GameHUD } from '../ui/GameHUD'
import { SkillTreePanel } from '../ui/SkillTreePanel'
import { CampPanel } from '../ui/CampPanel'
import { CharacterSelect } from '../ui/CharacterSelect'

export function Game() {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<CoreGameScene | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadProgress, setLoadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterId | null>(null)
  const [hudState, setHudState] = useState<HUDState | null>(null)
  const [showCamp, setShowCamp] = useState(false)
  const [showSkillTree, setShowSkillTree] = useState(false)
  const [skillTreeData, setSkillTreeData] = useState<SkillTreeUIData | null>(null)
  const showingTreeRef = useRef(false)
  const wasCampRef = useRef(false)
  const lastHudUpdateRef = useRef(0)

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
    // Wait for assets to load, character selection, and container
    if (loading || error || !selectedCharacter) return
    const container = containerRef.current
    if (!container) return
    const characterId = selectedCharacter

    console.log(`[Game] Initializing singleplayer as ${characterId}...`)

    let gameApp: GameApp | null = null
    let gameLoop: GameLoop | null = null
    let scene: CoreGameScene | null = null
    let mounted = true

    async function init(gameContainer: HTMLDivElement) {
      gameApp = await GameApp.create(gameContainer)
      if (!mounted) {
        gameApp.destroy()
        return
      }

      scene = await CoreGameScene.create({
        gameApp,
        mode: 'singleplayer',
        characterId,
      })
      sceneRef.current = scene
      if (!mounted) {
        scene.destroy()
        gameApp.destroy()
        return
      }

      gameLoop = new GameLoop(
        (dt) => scene!.update(dt),
        (alpha) => {
          scene!.render(alpha, gameLoop!.fps)
          // Throttled HUD polling (~10 Hz)
          const now = performance.now()
          if (now - lastHudUpdateRef.current >= 100) {
            lastHudUpdateRef.current = now
            const hud = scene!.getHUDState()
            setHudState(hud)
            // Detect camp entry/exit
            const isCamp = hud.stageStatus === 'camp'
            setShowCamp(isCamp)
            if (isCamp && !wasCampRef.current) {
              // Edge: just entered camp — hide game world, force-close auto-opened tree
              scene!.setWorldVisible(false)
              if (showingTreeRef.current) {
                showingTreeRef.current = false
                setShowSkillTree(false)
                setSkillTreeData(null)
              }
            }
            wasCampRef.current = isCamp
          }
        }
      )
      gameLoop.start()
    }

    init(container)

    return () => {
      mounted = false
      gameLoop?.stop()
      scene?.destroy()
      sceneRef.current = null
      gameApp?.destroy()
    }
  }, [loading, error, selectedCharacter])

  const handleNodeSelect = useCallback((nodeId: string) => {
    const scene = sceneRef.current
    if (!scene) return
    scene.selectNode(nodeId)
    // Re-check: still have points? Update tree data. Otherwise close.
    if (scene.hasPendingPoints()) {
      const data = scene.getSkillTreeData()
      if (data) setSkillTreeData(data)
    } else {
      showingTreeRef.current = false
      setShowSkillTree(false)
      setSkillTreeData(null)
    }
  }, [])

  const handleOpenSkillTree = useCallback(() => {
    const scene = sceneRef.current
    if (!scene) return
    const data = scene.getSkillTreeData()
    if (data) {
      setSkillTreeData(data)
      showingTreeRef.current = true
      setShowSkillTree(true)
    }
  }, [])

  const handleRideOut = useCallback(() => {
    const scene = sceneRef.current
    if (!scene) return
    scene.setWorldVisible(true)
    scene.completeCamp()
    setShowCamp(false)
    showingTreeRef.current = false
    setShowSkillTree(false)
    setSkillTreeData(null)
  }, [])

  const handleRetry = () => {
    setLoading(true)
    setLoadProgress(0)
    setSelectedCharacter(null)
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

  if (!selectedCharacter) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <Link to="/" style={styles.backButton}>
            ← Back
          </Link>
        </div>
        <CharacterSelect onSelect={setSelectedCharacter} />
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
      {hudState && !showCamp && !showSkillTree && !hudState.isDead && <GameHUD state={hudState} />}
      {showCamp && hudState && (
        <CampPanel
          stageNumber={hudState.stageNumber}
          totalStages={hudState.totalStages}
          hasPendingPoints={hudState.pendingPoints > 0}
          onOpenSkillTree={handleOpenSkillTree}
          onRideOut={handleRideOut}
        />
      )}
      {showSkillTree && skillTreeData && (
        <SkillTreePanel data={skillTreeData} onSelectNode={handleNodeSelect} onClose={() => {
          showingTreeRef.current = false
          setShowSkillTree(false)
          setSkillTreeData(null)
        }} />
      )}
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
