import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { VERSION, ROOM_CODE_LENGTH, ROOM_CODE_CHARS } from '@high-noon/shared'
import { loadAudioPrefs, saveAudioPrefs } from '../audio/audioPrefs'
import { SettingsPanel } from '../ui/SettingsPanel'

export function Home() {
  const navigate = useNavigate()
  const [showSettings, setShowSettings] = useState(false)
  const [showMultiplayer, setShowMultiplayer] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [volume, setVolume] = useState(() => loadAudioPrefs().volume)
  const [muted, setMuted] = useState(() => loadAudioPrefs().muted)

  const handleVolumeChange = (v: number) => {
    setVolume(v)
    if (muted && v > 0) setMuted(false)
    saveAudioPrefs(v, v > 0 ? false : muted)
  }

  const handleMutedChange = (m: boolean) => {
    setMuted(m)
    saveAudioPrefs(volume, m)
  }

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <h1 style={styles.title}>HIGH NOON</h1>
        <p style={styles.version}>v{VERSION}</p>
        <p style={styles.subtitle}>A twitchy top-down roguelite</p>

        <div style={styles.menu}>
          <Link to="/play" style={styles.playButton}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255, 68, 34, 0.35)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(255, 68, 34, 0.2)' }}
          >
            PLAY
          </Link>
          <button style={styles.secondaryButton}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(140, 120, 80, 0.25)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(140, 120, 80, 0.1)' }}
            onClick={() => setShowMultiplayer(true)}
          >
            MULTIPLAYER
          </button>
          <button style={styles.secondaryButton}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(140, 120, 80, 0.25)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(140, 120, 80, 0.1)' }}
            onClick={() => setShowSettings(true)}
          >
            SETTINGS
          </button>
        </div>
      </div>

      {showMultiplayer && (
        <div style={styles.backdrop}>
          <div style={styles.panel}>
            <div style={styles.panelTitle}>MULTIPLAYER</div>
            <div style={styles.multiMenu}>
              <Link to="/play-multi?mode=quickplay" style={styles.quickPlayButton}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255, 68, 34, 0.35)' }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(255, 68, 34, 0.2)' }}
              >
                QUICK PLAY
              </Link>
              <div style={styles.quickPlayHint}>Find an open game or start a new one</div>
              <div style={styles.divider} />
              <Link to="/play-multi" style={styles.multiButton}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(140, 120, 80, 0.25)' }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(140, 120, 80, 0.1)' }}
              >
                CREATE PRIVATE GAME
              </Link>
              <div style={styles.joinRow}>
                <input
                  style={styles.codeInput}
                  type="text"
                  placeholder="ROOM CODE"
                  maxLength={ROOM_CODE_LENGTH}
                  value={joinCode}
                  onChange={e => {
                    // Strip invalid characters (only allow ROOM_CODE_CHARS)
                    const sanitized = e.target.value.toUpperCase().split('').filter(c => ROOM_CODE_CHARS.includes(c)).join('')
                    setJoinCode(sanitized.slice(0, ROOM_CODE_LENGTH))
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && joinCode.length === ROOM_CODE_LENGTH) {
                      navigate(`/play-multi?code=${joinCode}`)
                    }
                  }}
                />
                <button
                  style={joinCode.length === ROOM_CODE_LENGTH ? styles.joinButton : styles.joinButtonDisabled}
                  disabled={joinCode.length !== ROOM_CODE_LENGTH}
                  onClick={() => {
                    if (joinCode.length === ROOM_CODE_LENGTH) {
                      navigate(`/play-multi?code=${joinCode}`)
                    }
                  }}
                  onMouseEnter={e => {
                    if (joinCode.length === ROOM_CODE_LENGTH)
                      e.currentTarget.style.backgroundColor = 'rgba(140, 120, 80, 0.25)'
                  }}
                  onMouseLeave={e => {
                    if (joinCode.length === ROOM_CODE_LENGTH)
                      e.currentTarget.style.backgroundColor = 'rgba(140, 120, 80, 0.1)'
                  }}
                >
                  JOIN
                </button>
              </div>
            </div>
            <div style={styles.divider} />
            <button
              style={styles.closeButton}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255, 204, 0, 0.22)' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(255, 204, 0, 0.12)' }}
              onClick={() => setShowMultiplayer(false)}
            >
              BACK
            </button>
          </div>
        </div>
      )}
      {showSettings && (
        <div style={styles.backdrop}>
          <div style={styles.panel}>
            <div style={styles.panelTitle}>SETTINGS</div>
            <SettingsPanel
              volume={volume}
              muted={muted}
              onVolumeChange={handleVolumeChange}
              onMutedChange={handleMutedChange}
            />
            <div style={styles.divider} />
            <button
              style={styles.closeButton}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255, 204, 0, 0.22)' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(255, 204, 0, 0.12)' }}
              onClick={() => setShowSettings(false)}
            >
              CLOSE
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'radial-gradient(ellipse at 50% 60%, #2a1a0a 0%, #110a04 50%, #050208 100%)',
    color: '#ffffff',
    fontFamily: 'monospace',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    margin: 0,
    color: '#ffcc00',
    letterSpacing: '0.3em',
    textShadow: '0 0 20px rgba(255, 204, 0, 0.6), 0 0 40px rgba(255, 150, 0, 0.3)',
  },
  version: {
    fontSize: 11,
    color: '#555',
    letterSpacing: '0.1em',
    margin: '0.5rem 0',
  },
  subtitle: {
    fontSize: 14,
    color: '#d7bf8a',
    fontStyle: 'italic',
    marginBottom: '3rem',
  },
  menu: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    minWidth: 220,
  },
  playButton: {
    fontFamily: 'monospace',
    fontSize: '1rem',
    fontWeight: 'bold',
    letterSpacing: '0.15em',
    color: '#ff4422',
    backgroundColor: 'rgba(255, 68, 34, 0.2)',
    border: '1px solid rgba(255, 68, 34, 0.5)',
    borderRadius: 3,
    padding: '0.7rem 1.5rem',
    cursor: 'pointer',
    textDecoration: 'none',
    textAlign: 'center',
    textShadow: '0 0 10px rgba(255, 68, 34, 0.5)',
    transition: 'background-color 0.15s',
  },
  secondaryButton: {
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    fontWeight: 'bold',
    letterSpacing: '0.12em',
    color: '#bbaa88',
    backgroundColor: 'rgba(140, 120, 80, 0.1)',
    border: '1px solid rgba(140, 120, 80, 0.3)',
    borderRadius: 3,
    padding: '0.55rem 1.5rem',
    cursor: 'pointer',
    textDecoration: 'none',
    textAlign: 'center',
    transition: 'background-color 0.15s',
  },
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
    borderRadius: 4,
    padding: '2rem 2.5rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.25rem',
    minWidth: 320,
    boxShadow: '0 0 40px rgba(0, 0, 0, 0.6)',
  },
  panelTitle: {
    fontFamily: 'monospace',
    fontSize: '1.6rem',
    fontWeight: 'bold',
    color: '#ffcc00',
    letterSpacing: '0.25em',
    textShadow: '0 0 12px rgba(255, 204, 0, 0.4)',
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#333',
  },
  multiMenu: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    width: '100%',
  },
  quickPlayButton: {
    fontFamily: 'monospace',
    fontSize: '1rem',
    fontWeight: 'bold',
    letterSpacing: '0.15em',
    color: '#ff4422',
    backgroundColor: 'rgba(255, 68, 34, 0.2)',
    border: '1px solid rgba(255, 68, 34, 0.5)',
    borderRadius: 3,
    padding: '0.7rem 1.5rem',
    cursor: 'pointer',
    textDecoration: 'none',
    textAlign: 'center',
    textShadow: '0 0 10px rgba(255, 68, 34, 0.5)',
    transition: 'background-color 0.15s',
    width: '100%',
    display: 'block',
    boxSizing: 'border-box',
  },
  quickPlayHint: {
    fontSize: '0.7rem',
    color: '#666',
    letterSpacing: '0.05em',
    marginTop: '-0.25rem',
  },
  multiButton: {
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    fontWeight: 'bold',
    letterSpacing: '0.12em',
    color: '#bbaa88',
    backgroundColor: 'rgba(140, 120, 80, 0.1)',
    border: '1px solid rgba(140, 120, 80, 0.3)',
    borderRadius: 3,
    padding: '0.55rem 1.5rem',
    cursor: 'pointer',
    textDecoration: 'none',
    textAlign: 'center',
    transition: 'background-color 0.15s',
    width: '100%',
    display: 'block',
    boxSizing: 'border-box',
  },
  joinRow: {
    display: 'flex',
    gap: '0.5rem',
    width: '100%',
  },
  codeInput: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    letterSpacing: '0.2em',
    color: '#ffffff',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(140, 120, 80, 0.3)',
    borderRadius: 3,
    padding: '0.55rem 0.75rem',
    outline: 'none',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  joinButton: {
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    fontWeight: 'bold',
    letterSpacing: '0.12em',
    color: '#bbaa88',
    backgroundColor: 'rgba(140, 120, 80, 0.1)',
    border: '1px solid rgba(140, 120, 80, 0.3)',
    borderRadius: 3,
    padding: '0.55rem 1rem',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  joinButtonDisabled: {
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    fontWeight: 'bold',
    letterSpacing: '0.12em',
    color: '#555',
    backgroundColor: 'rgba(80, 80, 80, 0.08)',
    border: '1px solid rgba(80, 80, 80, 0.2)',
    borderRadius: 3,
    padding: '0.55rem 1rem',
    cursor: 'default',
  },
  closeButton: {
    fontFamily: 'monospace',
    fontSize: '0.9rem',
    fontWeight: 'bold',
    letterSpacing: '0.15em',
    color: '#ffcc00',
    backgroundColor: 'rgba(255, 204, 0, 0.12)',
    border: '1px solid rgba(255, 204, 0, 0.4)',
    borderRadius: 3,
    padding: '0.65rem 1.5rem',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    width: '100%',
  },
}
