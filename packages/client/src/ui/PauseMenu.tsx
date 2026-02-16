import { useState } from 'react'

interface PauseMenuProps {
  mode: 'singleplayer' | 'multiplayer'
  volume: number
  muted: boolean
  onResume: () => void
  onVolumeChange: (v: number) => void
  onMutedChange: (m: boolean) => void
  onQuitToMenu: () => void
}

export function PauseMenu({
  mode,
  volume,
  muted,
  onResume,
  onVolumeChange,
  onMutedChange,
  onQuitToMenu,
}: PauseMenuProps) {
  const [resumeHover, setResumeHover] = useState(false)
  const [quitHover, setQuitHover] = useState(false)
  const [muteHover, setMuteHover] = useState(false)

  const isSingleplayer = mode === 'singleplayer'
  const title = isSingleplayer ? 'PAUSED' : 'SETTINGS'
  const resumeLabel = isSingleplayer ? 'RESUME' : 'CLOSE'
  const quitLabel = isSingleplayer ? 'QUIT TO MENU' : 'LEAVE MATCH'

  return (
    <div style={styles.backdrop}>
      <div style={styles.panel}>
        <div style={styles.title}>{title}</div>

        <div style={styles.section}>
          <div style={styles.sliderRow}>
            <span style={styles.sliderLabel}>VOLUME</span>
            <input
              type="range"
              min={0}
              max={100}
              value={muted ? 0 : volume}
              onChange={(e) => {
                const v = Number(e.target.value)
                onVolumeChange(v)
                if (muted && v > 0) onMutedChange(false)
              }}
              style={styles.slider}
            />
            <span style={styles.sliderValue}>{muted ? '0' : Math.round(volume)}%</span>
          </div>

          <button
            style={{
              ...styles.muteButton,
              backgroundColor: muteHover
                ? 'rgba(255, 255, 255, 0.15)'
                : 'rgba(255, 255, 255, 0.06)',
              color: muted ? '#ff6644' : '#aaaaaa',
            }}
            onMouseEnter={() => setMuteHover(true)}
            onMouseLeave={() => setMuteHover(false)}
            onClick={() => onMutedChange(!muted)}
          >
            {muted ? 'UNMUTE' : 'MUTE'}
          </button>
        </div>

        <div style={styles.divider} />

        <div style={styles.buttonGroup}>
          <button
            style={{
              ...styles.resumeButton,
              backgroundColor: resumeHover
                ? 'rgba(255, 204, 0, 0.22)'
                : 'rgba(255, 204, 0, 0.12)',
            }}
            onMouseEnter={() => setResumeHover(true)}
            onMouseLeave={() => setResumeHover(false)}
            onClick={onResume}
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
            onMouseEnter={() => setQuitHover(true)}
            onMouseLeave={() => setQuitHover(false)}
            onClick={onQuitToMenu}
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
  section: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    width: '100%',
  },
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    width: '100%',
  },
  sliderLabel: {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    color: '#888',
    letterSpacing: '0.1em',
    minWidth: '55px',
  },
  slider: {
    flex: 1,
    height: '4px',
    cursor: 'pointer',
    accentColor: '#ffcc00',
  },
  sliderValue: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    color: '#ccc',
    minWidth: '38px',
    textAlign: 'right',
  },
  muteButton: {
    fontFamily: 'monospace',
    fontSize: '0.7rem',
    letterSpacing: '0.1em',
    padding: '0.35rem 1rem',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '3px',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
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
