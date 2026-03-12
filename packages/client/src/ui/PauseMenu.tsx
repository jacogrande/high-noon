import { useState } from 'react'
import { SettingsPanel } from './SettingsPanel'
import { useGameAudio } from '../audio/GameAudioContext'

interface PauseMenuProps {
  mode: 'singleplayer' | 'multiplayer'
  volume: number
  muted: boolean
  onResume: () => void
  onVolumeChange: (v: number) => void
  onMutedChange: (m: boolean) => void
  onQuitToMenu: () => void
  onShowControls: () => void
  analyticsEnabled: boolean
  onAnalyticsChange: (enabled: boolean) => void
}

export function PauseMenu({
  mode,
  volume,
  muted,
  onResume,
  onVolumeChange,
  onMutedChange,
  onQuitToMenu,
  onShowControls,
  analyticsEnabled,
  onAnalyticsChange,
}: PauseMenuProps) {
  const { playClick, playHover: playHoverSound } = useGameAudio()
  const [resumeHover, setResumeHover] = useState(false)
  const [quitHover, setQuitHover] = useState(false)
  const [controlsHover, setControlsHover] = useState(false)

  const isSingleplayer = mode === 'singleplayer'
  const title = isSingleplayer ? 'PAUSED' : 'SETTINGS'
  const resumeLabel = isSingleplayer ? 'RESUME' : 'CLOSE'
  const quitLabel = isSingleplayer ? 'QUIT TO MENU' : 'LEAVE MATCH'

  return (
    <div style={styles.backdrop}>
      <div style={styles.panel}>
        <div style={styles.title}>{title}</div>

        <SettingsPanel
          volume={volume}
          muted={muted}
          onVolumeChange={onVolumeChange}
          onMutedChange={onMutedChange}
          analyticsEnabled={analyticsEnabled}
          onAnalyticsChange={onAnalyticsChange}
        />

        <div style={styles.divider} />

        <div style={styles.buttonGroup}>
          <button
            style={{
              ...styles.controlsButton,
              backgroundColor: controlsHover
                ? 'rgba(255, 204, 0, 0.18)'
                : 'rgba(255, 204, 0, 0.08)',
            }}
            onMouseEnter={() => { setControlsHover(true); playHoverSound() }}
            onMouseLeave={() => setControlsHover(false)}
            onClick={() => { playClick(); onShowControls() }}
          >
            CONTROLS
          </button>
          <button
            style={{
              ...styles.resumeButton,
              backgroundColor: resumeHover
                ? 'rgba(255, 204, 0, 0.22)'
                : 'rgba(255, 204, 0, 0.12)',
            }}
            onMouseEnter={() => { setResumeHover(true); playHoverSound() }}
            onMouseLeave={() => setResumeHover(false)}
            onClick={() => { playClick(); onResume() }}
          >
            {resumeLabel}
          </button>
          <button
            style={{
              ...styles.quitButton,
              backgroundColor: quitHover
                ? 'rgba(255, 68, 34, 0.35)'
                : 'rgba(255, 68, 34, 0.2)',
            }}
            onMouseEnter={() => { setQuitHover(true); playHoverSound() }}
            onMouseLeave={() => setQuitHover(false)}
            onClick={() => { playClick(); onQuitToMenu() }}
          >
            {quitLabel}
          </button>
        </div>

        {!isSingleplayer && (
          <div style={styles.hint}>Game continues while this menu is open</div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 70,
  },
  panel: {
    backgroundColor: 'rgba(10, 10, 18, 0.95)',
    border: '1px solid #333',
    borderRadius: '4px',
    padding: '2rem 2.5rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.25rem',
    minWidth: '320px',
    boxShadow: '0 0 40px rgba(0, 0, 0, 0.6)',
  },
  title: {
    fontFamily: 'monospace',
    fontSize: '1.6rem',
    fontWeight: 'bold',
    color: '#ffcc00',
    letterSpacing: '0.25em',
    textShadow: '0 0 12px rgba(255, 204, 0, 0.4)',
  },
  divider: {
    width: '100%',
    height: '1px',
    backgroundColor: '#333',
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
    width: '100%',
  },
  controlsButton: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    fontWeight: 'bold',
    letterSpacing: '0.12em',
    color: '#ccbb88',
    border: '1px solid rgba(255, 204, 0, 0.25)',
    borderRadius: '3px',
    padding: '0.5rem 1.5rem',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  resumeButton: {
    fontFamily: 'monospace',
    fontSize: '0.9rem',
    fontWeight: 'bold',
    letterSpacing: '0.15em',
    color: '#ffcc00',
    border: '1px solid rgba(255, 204, 0, 0.4)',
    borderRadius: '3px',
    padding: '0.65rem 1.5rem',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  quitButton: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    fontWeight: 'bold',
    letterSpacing: '0.1em',
    color: '#ff4422',
    border: '1px solid rgba(255, 68, 34, 0.5)',
    borderRadius: '3px',
    padding: '0.55rem 1.5rem',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  hint: {
    fontFamily: 'monospace',
    fontSize: '0.65rem',
    color: '#666',
    fontStyle: 'italic',
  },
}
