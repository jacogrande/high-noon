import { useEffect, useState } from 'react'

interface ReconnectOverlayProps {
  attempt: number
  maxAttempts: number
  status: 'reconnecting' | 'failed'
  onRetry?: (() => void) | undefined
  onQuit: () => void
}

export function ReconnectOverlay({ attempt, maxAttempts, status, onRetry, onQuit }: ReconnectOverlayProps) {
  const [dots, setDots] = useState('')

  useEffect(() => {
    if (status !== 'reconnecting') return
    const id = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.')
    }, 400)
    return () => clearInterval(id)
  }, [status])

  return (
    <div style={styles.backdrop}>
      <div style={styles.panel}>
        <div style={styles.title}>CONNECTION LOST</div>
        {status === 'reconnecting' ? (
          <>
            <div style={styles.message}>
              Reconnecting{dots}
            </div>
            <div style={styles.attemptText}>
              Attempt {attempt} / {maxAttempts}
            </div>
          </>
        ) : (
          <>
            <div style={styles.message}>
              Could not reconnect to server.
            </div>
            <div style={styles.buttonRow}>
              {onRetry && (
                <button style={styles.retryButton} onClick={onRetry}>
                  RETRY
                </button>
              )}
              <button style={styles.quitButton} onClick={onQuit}>
                QUIT TO MENU
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    zIndex: 80,
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
    padding: '2rem 3rem',
  },
  title: {
    fontFamily: 'monospace',
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: '#ffcc00',
    letterSpacing: '0.1em',
  },
  message: {
    fontFamily: 'monospace',
    fontSize: '1rem',
    color: '#ffffff',
    minWidth: '200px',
    textAlign: 'center',
  },
  attemptText: {
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    color: '#aaaaaa',
  },
  buttonRow: {
    display: 'flex',
    gap: '1rem',
    marginTop: '0.5rem',
  },
  retryButton: {
    padding: '0.6rem 1.5rem',
    backgroundColor: '#ffcc00',
    color: '#1a1a2e',
    border: 'none',
    borderRadius: '4px',
    fontSize: '0.9rem',
    fontFamily: 'monospace',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  quitButton: {
    padding: '0.6rem 1.5rem',
    backgroundColor: 'transparent',
    color: '#aaaaaa',
    border: '1px solid #555555',
    borderRadius: '4px',
    fontSize: '0.9rem',
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
}
