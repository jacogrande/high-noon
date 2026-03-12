import { useState } from 'react'

interface ConsentDialogProps {
  onDecision: (granted: boolean) => void
}

export function ConsentDialog({ onDecision }: ConsentDialogProps) {
  const [allowHover, setAllowHover] = useState(false)
  const [denyHover, setDenyHover] = useState(false)

  return (
    <div style={styles.backdrop}>
      <div style={styles.panel}>
        <div style={styles.title}>ANALYTICS</div>
        <p style={styles.body}>
          High Noon collects anonymous gameplay data (run outcomes, upgrades
          chosen, session length) to improve game balance.
        </p>
        <p style={styles.body}>
          No personal information is collected. You can change this at any time
          in Settings.
        </p>
        <div style={styles.buttonGroup}>
          <button
            style={{
              ...styles.allowButton,
              backgroundColor: allowHover
                ? 'rgba(255, 204, 0, 0.22)'
                : 'rgba(255, 204, 0, 0.12)',
            }}
            onMouseEnter={() => setAllowHover(true)}
            onMouseLeave={() => setAllowHover(false)}
            onClick={() => onDecision(true)}
          >
            ALLOW ANALYTICS
          </button>
          <button
            style={{
              ...styles.denyButton,
              backgroundColor: denyHover
                ? 'rgba(255, 255, 255, 0.15)'
                : 'rgba(255, 255, 255, 0.06)',
            }}
            onMouseEnter={() => setDenyHover(true)}
            onMouseLeave={() => setDenyHover(false)}
            onClick={() => onDecision(false)}
          >
            NO THANKS
          </button>
        </div>
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
    zIndex: 80,
  },
  panel: {
    backgroundColor: 'rgba(10, 10, 18, 0.95)',
    border: '1px solid #333',
    borderRadius: '4px',
    padding: '2rem 2.5rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
    maxWidth: '420px',
    boxShadow: '0 0 40px rgba(0, 0, 0, 0.6)',
  },
  title: {
    fontFamily: 'monospace',
    fontSize: '1.4rem',
    fontWeight: 'bold',
    color: '#ffcc00',
    letterSpacing: '0.25em',
    textShadow: '0 0 12px rgba(255, 204, 0, 0.4)',
  },
  body: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    color: '#aaa',
    lineHeight: 1.6,
    textAlign: 'center',
    margin: 0,
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
    width: '100%',
    marginTop: '0.5rem',
  },
  allowButton: {
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
  denyButton: {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    letterSpacing: '0.1em',
    color: '#888',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '3px',
    padding: '0.5rem 1.5rem',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
}
