import { useEffect, useRef, useState, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { CharacterId, LobbyState, CampStatusMessage, VotekickVoteMessage, RunCompleteMessage } from '@high-noon/shared'
import type { HUDState, SkillTreeUIData } from '../scenes/types'
import { GameApp } from '../engine/GameApp'
import { GameLoop } from '../engine/GameLoop'
import { CoreGameScene } from '../scenes/CoreGameScene'
import { getMultiplayerRunIntroUpdate } from '../scenes/core/runIntroPresentation'
import { AssetLoader } from '../assets'
import { loadAudioPrefs, saveAudioPrefs } from '../audio/audioPrefs'
import { getConsent, setAnalyticsEnabled } from '../analytics'
import { GameAudioContext } from '../audio/GameAudioContext'
import { GameHUD } from '../ui/GameHUD'
import { MultiplayerLobby } from '../ui/MultiplayerLobby'
import { NetworkClient, type ReconnectState } from '../net/NetworkClient'
import { ReconnectOverlay } from '../ui/ReconnectOverlay'
import { SkillTreePanel } from '../ui/SkillTreePanel'
import { CampPanel } from '../ui/CampPanel'
import { PauseMenu } from '../ui/PauseMenu'
import { VotekickPanel } from '../ui/VotekickPanel'
import { MultiplayerRunEndPanel } from '../ui/MultiplayerRunEndPanel'
import { ControlsPanel } from '../ui/ControlsPanel'
import { hasSeenControls, markControlsSeen } from '../ui/controlsPrefs'
import {
  GameplayOverlays,
  type GameplayBossIntroState,
  type GameplayRunIntroState,
} from '../ui/GameplayOverlays'

type Phase = 'loading' | 'connecting' | 'lobby' | 'starting' | 'playing' | 'error'

export function MultiplayerGame() {
  const [searchParams] = useSearchParams()
  const roomCodeParam = searchParams.get('code')?.trim().toUpperCase() || undefined
  const isQuickPlay = searchParams.get('mode') === 'quickplay'
  const containerRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [loadProgress, setLoadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterId>('sheriff')
  const [localSessionId, setLocalSessionId] = useState<string | null>(null)
  const [localPlayerEid, setLocalPlayerEid] = useState(-1)
  const [lobbyState, setLobbyState] = useState<LobbyState | null>(null)
  const [hudState, setHudState] = useState<HUDState | null>(null)
  const [showCamp, setShowCamp] = useState(false)
  const [campReadySent, setCampReadySent] = useState(false)
  const [campStatus, setCampStatus] = useState<CampStatusMessage | null>(null)
  const [showSkillTree, setShowSkillTree] = useState(false)
  const [skillTreeData, setSkillTreeData] = useState<SkillTreeUIData | null>(null)
  const [showPauseMenu, setShowPauseMenu] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const [volume, setVolume] = useState(() => loadAudioPrefs().volume)
  const [muted, setMuted] = useState(() => loadAudioPrefs().muted)
  const [analyticsEnabled, setAnalyticsEnabledState] = useState(() => getConsent() === 'granted')
  const [soundManager, setSoundManager] = useState<import('../audio/SoundManager').SoundManager | null>(null)
  const [bossIntro, setBossIntro] = useState<GameplayBossIntroState | null>(null)
  const [runIntro, setRunIntro] = useState<GameplayRunIntroState | null>(null)
  const [reconnectState, setReconnectState] = useState<ReconnectState | null>(null)
  const [shutdownCountdown, setShutdownCountdown] = useState<number | null>(null)
  const [afkWarning, setAfkWarning] = useState<number | null>(null)
  const [activeVote, setActiveVote] = useState<VotekickVoteMessage | null>(null)
  const [runComplete, setRunComplete] = useState<RunCompleteMessage | null>(null)
  const reconnectStateRef = useRef<ReconnectState | null>(null)
  const runCompleteRef = useRef<RunCompleteMessage | null>(null)
  const deathTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shutdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const showingTreeRef = useRef(false)
  const wasCampRef = useRef(false)
  const sceneRef = useRef<CoreGameScene | null>(null)
  const lastHudUpdateRef = useRef(0)
  const lastSeenRunIntroSequenceRef = useRef(0)
  const sawPrePlayingLobbyRef = useRef(false)
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
    let afkDismissTimer: ReturnType<typeof setTimeout> | null = null

    const net = new NetworkClient()
    netRef.current = net

    net.on('game-config', (config) => {
      if (netRef.current !== net) return
      setLocalSessionId(config.sessionId)
      setSelectedCharacter(config.characterId)
      setLocalPlayerEid(config.playerEid)
    })

    net.on('lobby-state', (state) => {
      if (netRef.current !== net) return
      if (state.phase !== 'playing') {
        sawPrePlayingLobbyRef.current = true
      }
      setLobbyState(state)
      if (state.phase === 'playing') {
        setPhase(current => (current === 'connecting' || current === 'lobby') ? 'starting' : current)
      }
    })

    net.on('reconnect-state', (state) => {
      if (netRef.current !== net) return
      if (state.status === 'succeeded') {
        reconnectStateRef.current = null
        setReconnectState(null)
      } else {
        reconnectStateRef.current = state
        setReconnectState(state)
      }
    })

    net.on('server-shutdown', (data) => {
      if (netRef.current !== net) return
      setShutdownCountdown(Math.ceil(data.countdownMs / 1000))
      if (shutdownIntervalRef.current) clearInterval(shutdownIntervalRef.current)
      const interval = setInterval(() => {
        setShutdownCountdown(prev => {
          if (prev === null || prev <= 1) {
            clearInterval(interval)
            shutdownIntervalRef.current = null
            return 0
          }
          return prev - 1
        })
      }, 1000)
      shutdownIntervalRef.current = interval
    })

    net.on('afk-warning', (data) => {
      if (netRef.current !== net) return
      setAfkWarning(data.secondsLeft)
      // Auto-dismiss after 5 seconds (server will re-send if still AFK)
      if (afkDismissTimer) clearTimeout(afkDismissTimer)
      afkDismissTimer = setTimeout(() => { afkDismissTimer = null; setAfkWarning(null) }, 5000)
    })

    net.on('afk-kick', () => {
      if (netRef.current !== net) return
      disconnectNetwork()
      setError('Kicked for being AFK')
      setPhase('error')
    })

    net.on('votekick-vote', (data) => {
      if (netRef.current !== net) return
      setActiveVote(data)
    })

    net.on('votekick-result', () => {
      if (netRef.current !== net) return
      setActiveVote(null)
    })

    net.on('run-complete', (data) => {
      if (netRef.current !== net) return
      runCompleteRef.current = data
      // Victory: show immediately. Defeat: delay to let death animation play.
      if (data.victory) {
        setRunComplete(data)
      } else {
        if (deathTimerRef.current) clearTimeout(deathTimerRef.current)
        deathTimerRef.current = setTimeout(() => {
          deathTimerRef.current = null
          setRunComplete(data)
        }, 1750)
      }
    })

    net.on('camp-status', (data) => {
      if (netRef.current !== net) return
      setCampStatus(data)
    })

    net.on('disconnect', () => {
      if (netRef.current !== net) return
      disconnectNetwork()
      reconnectStateRef.current = null
      setReconnectState(null)
      setError('Connection lost')
      setPhase('error')
    })

    async function connect() {
      try {
        if (isQuickPlay) {
          await net.joinQuickPlay({ characterId: selectedCharacter })
        } else {
          await net.join({
            characterId: selectedCharacter,
            ...(roomCodeParam ? { roomCode: roomCodeParam } : {}),
          })
        }
        if (cancelled) return

        const config = net.getLatestGameConfig()
        if (config) {
          setLocalSessionId(config.sessionId)
          setSelectedCharacter(config.characterId)
          setLocalPlayerEid(config.playerEid)
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
      if (afkDismissTimer) clearTimeout(afkDismissTimer)
      // Disconnect on cleanup to prevent duplicate connections in StrictMode
      if (netRef.current === net) {
        net.disconnect()
        netRef.current = null
      }
    }
  }, [phase])

  // Keep local character card selection in sync with authoritative lobby state.
  useEffect(() => {
    if (!lobbyState || !localSessionId) return
    const me = lobbyState.players.find(player => player.sessionId === localSessionId)
    if (!me) return
    setSelectedCharacter(me.characterId)
  }, [lobbyState, localSessionId])

  useEffect(() => {
    if (phase === 'lobby') {
      sawPrePlayingLobbyRef.current = true
    }
  }, [phase])

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
      setSoundManager(scene.getSoundManager())

      const gameLoop = new GameLoop(
        (dt) => scene.update(dt),
        (alpha) => {
          scene.render(alpha, gameLoop.fps)
          const pendingBossIntro = scene.consumePendingBossIntro()
          if (pendingBossIntro) {
            setBossIntro(pendingBossIntro)
          }
          // Throttled HUD polling (~10 Hz)
          const now = performance.now()
          if (now - lastHudUpdateRef.current >= 100) {
            lastHudUpdateRef.current = now
            const hud = scene.getHUDState()
            setHudState(hud)
            const runIntroUpdate = getMultiplayerRunIntroUpdate(
              hud,
              lastSeenRunIntroSequenceRef.current,
              sawPrePlayingLobbyRef.current,
            )
            lastSeenRunIntroSequenceRef.current = runIntroUpdate.nextLastSeenSequence
            sawPrePlayingLobbyRef.current = runIntroUpdate.nextSawPrePlayingLobby
            if (runIntroUpdate.runIntro) {
              setRunIntro(runIntroUpdate.runIntro)
            }
            if (scene.isDisconnected()) {
              // Don't tear down game during reconnection — the overlay handles UX
              if (reconnectStateRef.current?.status === 'attempting') {
                // Reconnect in progress — let the overlay handle it
              } else {
                destroyGame()
                setError('Connection lost')
                setPhase('error')
                setReconnectState(null)
                reconnectStateRef.current = null
              }
            }
            // Detect camp entry/exit
            const isCamp = hud.stageStatus === 'camp'
            setShowCamp(isCamp)
            if (isCamp && !wasCampRef.current) {
              // Edge: just entered camp — hide game world, force-close auto-opened tree
              scene.setWorldVisible(false)
              setCampReadySent(false)
              if (showingTreeRef.current) {
                showingTreeRef.current = false
                setShowSkillTree(false)
                setSkillTreeData(null)
              }
            }
            if (!isCamp && wasCampRef.current) {
              scene.setWorldVisible(true)
              setCampReadySent(false)
              setCampStatus(null)
              showingTreeRef.current = false
              setShowSkillTree(false)
              setSkillTreeData(null)
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
      if (deathTimerRef.current) clearTimeout(deathTimerRef.current)
      if (shutdownIntervalRef.current) clearInterval(shutdownIntervalRef.current)
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

  const handleDraftPick = useCallback((poolIndex: number) => {
    sceneRef.current?.handleDraftPick(poolIndex)
  }, [])

  const handleRideOut = useCallback(() => {
    const scene = sceneRef.current
    if (!scene) return
    if (campReadySent) return
    scene.completeCamp()
    setCampReadySent(true)
    showingTreeRef.current = false
    setShowSkillTree(false)
    setSkillTreeData(null)
  }, [campReadySent])

  const navigate = useNavigate()

  const handleReconnectRetry = useCallback(() => {
    netRef.current?.manualReconnect()
  }, [])

  const handleReconnectQuit = useCallback(() => {
    destroyGame()
    disconnectNetwork()
    reconnectStateRef.current = null
    setReconnectState(null)
    navigate('/')
  }, [navigate])

  const handleClosePauseMenu = useCallback(() => {
    setShowPauseMenu(false)
  }, [])

  const handleVolumeChange = useCallback((v: number) => {
    setVolume(v)
    sceneRef.current?.getSoundManager().setMasterVolume(v / 100)
    setMuted(currentMuted => {
      saveAudioPrefs(v, currentMuted)
      return currentMuted
    })
  }, [])

  const handleMutedChange = useCallback((m: boolean) => {
    setMuted(m)
    const sm = sceneRef.current?.getSoundManager()
    if (sm) sm.muted = m
    setVolume(currentVolume => {
      saveAudioPrefs(currentVolume, m)
      return currentVolume
    })
  }, [])

  const handleAnalyticsChange = useCallback((enabled: boolean) => {
    setAnalyticsEnabled(enabled)
    setAnalyticsEnabledState(enabled)
  }, [])

  const handleRunIntroComplete = useCallback(() => setRunIntro(null), [])

  const handleBossIntroComplete = useCallback(() => setBossIntro(null), [])

  const handleLeaveMatch = useCallback(() => {
    navigate('/')
  }, [navigate])

  const handleBackToMenu = useCallback(() => {
    destroyGame()
    disconnectNetwork()
    navigate('/')
  }, [navigate])

  // Escape key handler
  useEffect(() => {
    if (phase !== 'playing') return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      // Priority 0: close controls panel
      if (showControls) {
        setShowControls(false)
        return
      }
      // Priority 1: close skill tree
      if (showingTreeRef.current) {
        showingTreeRef.current = false
        setShowSkillTree(false)
        setSkillTreeData(null)
        return
      }
      // Priority 2: ignore during camp
      if (showCamp) return
      // Priority 3: ignore when dead
      if (hudState?.isDead) return
      // Priority 4: toggle pause menu
      if (showPauseMenu) {
        setShowPauseMenu(false)
      } else {
        setShowPauseMenu(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [phase, showCamp, showPauseMenu, showControls, hudState?.isDead])

  const handleRetry = () => {
    destroyGame()
    disconnectNetwork()
    setError(null)
    setLoadProgress(0)
    setSelectedCharacter('sheriff')
    setLocalSessionId(null)
    setLobbyState(null)
    setHudState(null)
    setBossIntro(null)
    setRunIntro(null)
    reconnectStateRef.current = null
    setReconnectState(null)
    setShutdownCountdown(null)
    lastSeenRunIntroSequenceRef.current = 0
    sawPrePlayingLobbyRef.current = false
    setCampReadySent(false)
    setCampStatus(null)
    setRunComplete(null)
    runCompleteRef.current = null
    if (deathTimerRef.current) { clearTimeout(deathTimerRef.current); deathTimerRef.current = null }
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
          roomCode={lobbyState?.roomCode ?? ''}
          onSelectCharacter={handleSelectCharacter}
          onToggleReady={handleToggleReady}
        />
      </div>
    )
  }

  if (phase === 'starting') {
    return (
      <div style={styles.container}>
        <div ref={containerRef} style={styles.gameContainer} />
        <div style={styles.startingOverlay}>
          <div style={styles.statusText}>Starting match...</div>
        </div>
      </div>
    )
  }

  return (
    <GameAudioContext.Provider value={soundManager}>
    <div style={styles.container}>
      <div ref={containerRef} style={styles.gameContainer} />
      {hudState && !showCamp && !showSkillTree && !showPauseMenu && !showControls && !hudState.isDead && !runComplete && <GameHUD state={hudState} />}
      <GameplayOverlays
        runIntro={runIntro}
        bossIntro={bossIntro}
        onRunIntroComplete={handleRunIntroComplete}
        onBossIntroComplete={handleBossIntroComplete}
      />
      {showCamp && hudState && (
        <CampPanel
          stageNumber={hudState.stageNumber}
          totalStages={hudState.totalStages}
          narrativeLine={hudState.campNarrativeLine}
          hasPendingPoints={hudState.pendingPoints > 0}
          rideOutPending={campReadySent}
          playerGold={hudState.goldCollected}
          campStatus={campStatus ? {
            readyCount: campStatus.readyCount,
            totalPlayers: campStatus.totalPlayers,
            remainingSeconds: campStatus.remainingSeconds,
          } : null}
          campVisitor={hudState.campVisitor}
          items={hudState.items}
          hasFoolsErrand={hudState.hasFoolsErrand}
          draft={hudState.draft}
          localPlayerEid={localPlayerEid}
          onOpenSkillTree={handleOpenSkillTree}
          onRideOut={handleRideOut}
          onDraftPick={handleDraftPick}
          onVisitorPurchase={(index) => {
            sceneRef.current?.handleVisitorPurchase(index)
          }}
          onTinkererModSelect={(index) => {
            sceneRef.current?.handleTinkererModSelect(index)
          }}
        />
      )}
      {showSkillTree && skillTreeData && (
        <SkillTreePanel data={skillTreeData} onSelectNode={handleNodeSelect} onClose={() => {
          showingTreeRef.current = false
          setShowSkillTree(false)
          setSkillTreeData(null)
        }} />
      )}
      {showPauseMenu && (
        <PauseMenu
          mode="multiplayer"
          volume={volume}
          muted={muted}
          onResume={handleClosePauseMenu}
          onVolumeChange={handleVolumeChange}
          onMutedChange={handleMutedChange}
          onQuitToMenu={handleLeaveMatch}
          onShowControls={() => {
            setShowPauseMenu(false)
            setShowControls(true)
          }}
          analyticsEnabled={analyticsEnabled}
          onAnalyticsChange={handleAnalyticsChange}
        />
      )}
      {showControls && (
        <ControlsPanel
          onClose={() => setShowControls(false)}
          showDontShowAgain={!hasSeenControls()}
          onDontShowAgain={() => {
            markControlsSeen()
            setShowControls(false)
          }}
        />
      )}
      {reconnectState && reconnectState.status !== 'succeeded' && (
        <ReconnectOverlay
          attempt={reconnectState.attempt}
          maxAttempts={reconnectState.maxAttempts}
          status={reconnectState.status === 'failed' ? 'failed' : 'reconnecting'}
          onRetry={reconnectState.status === 'failed' ? handleReconnectRetry : undefined}
          onQuit={handleReconnectQuit}
        />
      )}
      {shutdownCountdown !== null && (
        <div style={styles.shutdownBanner}>
          {shutdownCountdown > 0
            ? `Server shutting down in ${shutdownCountdown}s...`
            : 'Server has shut down.'}
        </div>
      )}
      {afkWarning !== null && (
        <div style={styles.afkBanner}>
          AFK WARNING — Move or shoot within {afkWarning}s or be kicked!
        </div>
      )}
      {activeVote && localSessionId && (
        <VotekickPanel
          key={activeVote.voteId}
          vote={activeVote}
          localSessionId={localSessionId}
          onCast={(voteId, approve) => {
            netRef.current?.sendVotekickCast(voteId, approve)
          }}
        />
      )}
      {runComplete && localSessionId && (
        <MultiplayerRunEndPanel
          data={runComplete}
          localSessionId={localSessionId}
          onBackToLobby={handleBackToMenu}
        />
      )}
    </div>
    </GameAudioContext.Provider>
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
  startingOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
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
  shutdownBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: '0.5rem',
    backgroundColor: 'rgba(204, 0, 0, 0.85)',
    color: '#ffffff',
    fontFamily: 'monospace',
    fontSize: '0.9rem',
    textAlign: 'center',
    zIndex: 90,
  },
  afkBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: '0.5rem',
    backgroundColor: 'rgba(204, 150, 0, 0.9)',
    color: '#ffffff',
    fontFamily: 'monospace',
    fontSize: '0.9rem',
    fontWeight: 'bold',
    textAlign: 'center',
    zIndex: 91,
  },
}
