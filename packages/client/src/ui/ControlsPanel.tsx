import { useEffect, useRef, useState } from 'react'

interface ControlsPanelProps {
  onClose: () => void
  showDontShowAgain?: boolean
  onDontShowAgain?: () => void
}

const CONTROLS: { keys: string[]; action: string }[] = [
  { keys: ['W', 'A', 'S', 'D'], action: 'MOVE' },
  { keys: ['MOUSE'], action: 'AIM' },
  { keys: ['LEFT CLICK'], action: 'SHOOT' },
  { keys: ['RIGHT CLICK', 'Q'], action: 'ABILITY' },
  { keys: ['SPACE'], action: 'JUMP' },
  { keys: ['SHIFT'], action: 'ROLL / DODGE' },
  { keys: ['R'], action: 'RELOAD' },
  { keys: ['E'], action: 'INTERACT' },
  { keys: ['F'], action: 'USE HP POTION' },
  { keys: ['ESC'], action: 'PAUSE' },
]

function Keycap({ label }: { label: string }) {
  return (
    <span style={styles.keycap}>{label}</span>
  )
}

export function ControlsPanel({
  onClose,
  showDontShowAgain,
  onDontShowAgain,
}: ControlsPanelProps) {
  const [active, setActive] = useState(false)
  const [dontShowHover, setDontShowHover] = useState(false)
  const [closeHover, setCloseHover] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    requestAnimationFrame(() => {
      if (mountedRef.current) setActive(true)
    })
    return () => { mountedRef.current = false }
  }, [])

  return (
    <div style={{
      ...styles.overlay,
      opacity: active ? 1 : 0,
    }}>
      <div style={styles.content}>
        <div style={styles.title}>CONTROLS</div>

        <div style={styles.grid}>
          {CONTROLS.map(({ keys, action }) => (
            <div key={action} style={styles.row}>
              <div style={styles.keysCell}>
                {keys.map((k, i) => (
                  <Keycap key={i} label={k} />
                ))}
              </div>
              <div style={styles.actionCell}>{action}</div>
            </div>
          ))}
        </div>

        <div style={styles.buttons}>
          {showDontShowAgain && (
            <button
              style={{
                ...styles.dontShowButton,
                backgroundColor: dontShowHover
                  ? 'rgba(140, 120, 80, 0.25)'
                  : 'rgba(140, 120, 80, 0.1)',
              }}
              onMouseEnter={() => setDontShowHover(true)}
              onMouseLeave={() => setDontShowHover(false)}
              onClick={onDontShowAgain}
            >
              DON'T SHOW AGAIN
            </button>
          )}
          <button
            style={{
              ...styles.closeButton,
              backgroundColor: closeHover
                ? 'rgba(255, 204, 0, 0.22)'
                : 'rgba(255, 204, 0, 0.12)',
            }}
            onMouseEnter={() => setCloseHover(true)}
            onMouseLeave={() => setCloseHover(false)}
            onClick={onClose}
          >
            {showDontShowAgain ? 'GOT IT' : 'CLOSE'}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'radial-gradient(ellipse at 50% 60%, #2a1a0a 0%, #110a04 50%, #050208 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 75,
    transition: 'opacity 300ms ease-out',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2rem',
  },
  title: {
    fontFamily: 'monospace',
    fontSize: '1.6rem',
    fontWeight: 'bold',
    color: '#ffcc00',
    letterSpacing: '0.2em',
    textShadow: '0 0 12px rgba(255, 204, 0, 0.4)',
  },
  grid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.65rem',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
  },
  keysCell: {
    display: 'flex',
    gap: '4px',
    minWidth: 180,
    justifyContent: 'flex-end',
  },
  actionCell: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#ccbbaa',
    letterSpacing: '0.08em',
  },
  keycap: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 24,
    height: 22,
    padding: '0 6px',
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    borderRadius: 3,
    color: '#00ffcc',
    border: '1px solid rgba(0, 255, 204, 0.5)',
    backgroundColor: 'rgba(0, 255, 204, 0.1)',
  },
  buttons: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    marginTop: '0.5rem',
  },
  dontShowButton: {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    fontWeight: 'bold',
    letterSpacing: '0.1em',
    color: '#bbaa88',
    border: '1px solid rgba(140, 120, 80, 0.3)',
    borderRadius: 3,
    padding: '0.45rem 1.2rem',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  closeButton: {
    fontFamily: 'monospace',
    fontSize: '0.9rem',
    fontWeight: 'bold',
    letterSpacing: '0.15em',
    color: '#ffcc00',
    border: '1px solid rgba(255, 204, 0, 0.4)',
    borderRadius: 3,
    padding: '0.65rem 2rem',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
}
