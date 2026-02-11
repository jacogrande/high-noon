import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import type { CharacterId, LobbyState } from '@high-noon/shared'
import type { HUDState, SkillTreeUIData } from '../scenes/types'
import { GameApp } from '../engine/GameApp'
import { GameLoop } from '../engine/GameLoop'
import { CoreGameScene } from '../scenes/CoreGameScene'
import { AssetLoader } from '../assets'
import { GameHUD } from '../ui/GameHUD'
import { MultiplayerLobby } from '../ui/MultiplayerLobby'
import { NetworkClient } from '../net/NetworkClient'
import { SkillTreePanel } from '../ui/SkillTreePanel'
import { CampPanel } from '../ui/CampPanel'

type Phase = 'loading' | 'connecting' | 'lobby' | 'starting' | 'playing' | 'error'

export function MultiplayerGame() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [loadProgress, setLoadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterId>('sheriff')
  const [localSessionId, setLocalSessionId] = useState<string | null>(null)
  const [lobbyState, setLobbyState] = useState<LobbyState | null>(null)
  const [hudState, setHudState] = useState<HUDState | null>(null)
  const [showCamp, setShowCamp] = useState(false)
  const [showSkillTree, setShowSkillTree] = useState(false)
  const [skillTreeData, setSkillTreeData] = useState<SkillTreeUIData | null>(null)
  const showingTreeRef = useRef(false)
  const wasCampRef = useRef(false)
  const sceneRef = useRef<CoreGameScene | null>(null)
  const lastHudUpdateRef = useRef(0)
  const netRef = useRef<NetworkClient | null>(null)
  const gameRef = useRef<{
    gameApp: GameApp
    gameLoop: GameLoop
    scene: CoreGameScene
  } | null>(null)

  const destroyGame = () => {
    if (!gameRef.current) return
    gameRef.current.gameLoop.stop()
    gameRef.current.scene.destroy()
    gameRef.current.gameApp.destroy()
    gameRef.current = null
  }

  const disconnectNetwork = () => {
    if (!netRef.current) return
    netRef.current.disconnect()
    netRef.current = null
  }

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

  // Phase 2: Connect to room and wait in lobby
  useEffect(() => {
    if (phase !== 'connecting') return
    let cancelled = false

    const net = new NetworkClient()
    netRef.current = net

    net.on('game-config', (config) => {
      if (netRef.current !== net) return
      setLocalSessionId(config.sessionId)
      setSelectedCharacter(config.characterId)
    })

    net.on('lobby-state', (state) => {
      if (netRef.current !== net) return
      setLobbyState(state)
      if (state.phase === 'playing') {
        setPhase(current => (current === 'connecting' || current === 'lobby') ? 'starting' : current)
      }
    })

    net.on('disconnect', () => {
      if (netRef.current !== net) return
      disconnectNetwork()
      setError('Connection lost')
      setPhase('error')
    })

    async function connect() {
      try {
        await net.join({ characterId: 'sheriff' })
        if (cancelled) return

        const config = net.getLatestGameConfig()
        if (config) {
          setLocalSessionId(config.sessionId)
          setSelectedCharacter(config.characterId)
        }
        setPhase(current => current === 'connecting' ? 'lobby' : current)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to connect'
        if (!cancelled) {
          setError(message)
          setPhase('error')
        }
        if (netRef.current === net) {
          netRef.current.disconnect()
          netRef.current = null
        }
      }
    }

    connect()
    return () => {
      cancelled = true
    }
  }, [phase])

  // Keep local character card selection in sync with authoritative lobby state.
  useEffect(() => {
    if (!lobbyState || !localSessionId) return
    const me = lobbyState.players.find(player => player.sessionId === localSessionId)
    if (!me) return
    setSelectedCharacter(me.characterId)
  }, [lobbyState, localSessionId])

  // Phase 3: Start gameplay scene after lobby phase flips to playing.
  useEffect(() => {
    if (phase !== 'starting') return
    const container = containerRef.current
    if (!container) return
    const net = netRef.current
    if (!net) return

    let cancelled = false
    const characterId = net.getLatestGameConfig()?.characterId ?? selectedCharacter

    async function init(gameContainer: HTMLDivElement) {
      const gameApp = await GameApp.create(gameContainer)
      if (cancelled) { gameApp.destroy(); return }

      let scene: CoreGameScene
      try {
        scene = await CoreGameScene.create({
          gameApp,
          mode: 'multiplayer',
          characterId,
          networkOptions: {
            net,
            preconnected: true,
          },
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start multiplayer scene'
        if (!cancelled) {
          disconnectNetwork()
          setError(message)
          setPhase('error')
        }
        gameApp.destroy()
        return
      }

      if (cancelled) { scene.destroy(); gameApp.destroy(); return }
      sceneRef.current = scene

      const gameLoop = new GameLoop(
        (dt) => scene.update(dt),
        (alpha) => {
          scene.render(alpha, gameLoop.fps)
          // Throttled HUD polling (~10 Hz)
          const now = performance.now()
          if (now - lastHudUpdateRef.current >= 100) {
            lastHudUpdateRef.current = now
            const hud = scene.getHUDState()
            setHudState(hud)
            if (scene.isDisconnected()) {
              destroyGame()
              setError('Connection lost')
              setPhase('error')
            }
            // Detect camp entry/exit
            const isCamp = hud.stageStatus === 'camp'
            setShowCamp(isCamp)
            if (isCamp && !wasCampRef.current) {
              // Edge: just entered camp — hide game world, force-close auto-opened tree
              scene.setWorldVisible(false)
              if (showingTreeRef.current) {
                showingTreeRef.current = false
                setShowSkillTree(false)
                setSkillTreeData(null)
              }
            }
            wasCampRef.current = isCamp
          }
        },
      )
      gameLoop.start()
      gameRef.current = { gameApp, gameLoop, scene }
      setPhase('playing')
    }

    init(container)

    return () => {
      cancelled = true
    }
  }, [phase])

  // Unmount-only cleanup: destroy game resources and network connection.
  useEffect(() => {
    return () => {
      destroyGame()
      disconnectNetwork()
    }
  }, [])

  const handleSelectCharacter = (characterId: CharacterId) => {
    setSelectedCharacter(characterId)
    netRef.current?.sendCharacter(characterId)
  }

  const localPlayer = localSessionId
    ? lobbyState?.players.find(player => player.sessionId === localSessionId) ?? null
    : null
  const localReady = localPlayer?.ready === true

  const handleToggleReady = () => {
    if (!localSessionId) return
    const nextReady = !localReady
    netRef.current?.sendReady(nextReady)
  }

  const handleNodeSelect = useCallback((nodeId: string) => {
    const scene = sceneRef.current
    if (!scene) return
    scene.selectNode(nodeId)
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
    destroyGame()
    disconnectNetwork()
    setError(null)
    setLoadProgress(0)
    setSelectedCharacter('sheriff')
    setLocalSessionId(null)
    setLobbyState(null)
    setHudState(null)
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
          <div style={styles.statusText}>Joining lobby...</div>
        </div>
      </div>
    )
  }

  if (phase === 'lobby') {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <Link to="/" style={styles.backButton}>
            ← Back
          </Link>
        </div>
        <MultiplayerLobby
          players={lobbyState?.players ?? []}
          localSessionId={localSessionId}
          selectedCharacter={selectedCharacter}
          localReady={localReady}
          onSelectCharacter={handleSelectCharacter}
          onToggleReady={handleToggleReady}
        />
      </div>
    )
  }

  if (phase === 'starting') {
    return (
      <div style={styles.container}>
        <div style={styles.centerBox}>
          <div style={styles.statusText}>Starting match...</div>
        </div>
        <div ref={containerRef} style={styles.hiddenContainer} />
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
        <SkillTreePanel data={skillTreeData} onSelectNode={handleNodeSelect} />
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
