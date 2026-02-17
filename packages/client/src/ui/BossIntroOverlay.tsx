import { useEffect, useState } from 'react'

interface BossIntroOverlayProps {
  bossName: string
  taunt: string
  onComplete: () => void
}

const DURATION_MS = 3000
const EXIT_MS = 300

export function BossIntroOverlay({ bossName, taunt, onComplete }: BossIntroOverlayProps) {
  const [active, setActive] = useState(false)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setActive(true))
    const holdTimer = window.setTimeout(() => setExiting(true), DURATION_MS - EXIT_MS)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(holdTimer)
    }
  }, [])

  useEffect(() => {
    if (!exiting) return
    const exitTimer = window.setTimeout(onComplete, EXIT_MS)
    return () => clearTimeout(exitTimer)
  }, [exiting, onComplete])

  return (
    <div style={styles.root}>
      <div style={{ ...styles.letterboxTop, transform: active && !exiting ? 'translateY(0)' : 'translateY(-100%)' }} />
      <div style={{ ...styles.letterboxBottom, transform: active && !exiting ? 'translateY(0)' : 'translateY(100%)' }} />
      <div style={{ ...styles.content, opacity: active && !exiting ? 1 : 0 }}>
        <div style={styles.bossName}>{bossName}</div>
        {taunt.length > 0 && <div style={styles.taunt}>"{taunt}"</div>}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'absolute',
    inset: 0,
    zIndex: 65,
    pointerEvents: 'none',
    overflow: 'hidden',
  },
  letterboxTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '14%',
    background: 'linear-gradient(180deg, rgba(0,0,0,0.98), rgba(0,0,0,0.88))',
    transition: 'transform 220ms ease-out',
  },
  letterboxBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: '100%',
    height: '14%',
    background: 'linear-gradient(0deg, rgba(0,0,0,0.98), rgba(0,0,0,0.88))',
    transition: 'transform 220ms ease-out',
  },
  content: {
    position: 'absolute',
    top: '44%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    textAlign: 'center',
    color: '#f2dfb3',
    transition: 'opacity 300ms ease-out',
    width: 'min(88vw, 980px)',
  },
  bossName: {
    fontFamily: 'Georgia, serif',
    fontSize: 'clamp(32px, 6vw, 72px)',
    letterSpacing: '0.14em',
    fontWeight: 700,
    textTransform: 'uppercase',
    textShadow: '0 0 14px rgba(0, 0, 0, 0.95), 0 0 40px rgba(109, 66, 17, 0.35)',
  },
  taunt: {
    marginTop: 12,
    fontFamily: 'Courier New, monospace',
    fontSize: 'clamp(14px, 2vw, 24px)',
    color: '#d7bf88',
    fontStyle: 'italic',
    letterSpacing: '0.04em',
    textShadow: '0 0 10px rgba(0, 0, 0, 0.85)',
  },
}
