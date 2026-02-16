import { useEffect, useState } from 'react'

interface RunIntroCrawlOverlayProps {
  title: string
  text: string
  onComplete: () => void
}

const DURATION_MS = 7000

export function RunIntroCrawlOverlay({ title, text, onComplete }: RunIntroCrawlOverlayProps) {
  const [active, setActive] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setActive(true))
    const done = window.setTimeout(onComplete, DURATION_MS)
    const skip = () => onComplete()

    window.addEventListener('keydown', skip)
    window.addEventListener('pointerdown', skip)

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(done)
      window.removeEventListener('keydown', skip)
      window.removeEventListener('pointerdown', skip)
    }
  }, [onComplete])

  return (
    <div style={styles.root}>
      <div style={styles.scrim} />
      <div style={styles.horizonGlow} />
      <div style={styles.viewport}>
        <div
          style={{
            ...styles.crawl,
            transform: active
              ? 'translate(-50%, -210%) rotateX(24deg)'
              : 'translate(-50%, 30%) rotateX(24deg)',
          }}
        >
          <div style={styles.title}>{title}</div>
          <div style={styles.body}>{text}</div>
        </div>
      </div>
      <div style={styles.skipHint}>PRESS ANY KEY TO SKIP</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'absolute',
    inset: 0,
    zIndex: 66,
    overflow: 'hidden',
    background: '#05070c',
    color: '#f2d58a',
    pointerEvents: 'auto',
  },
  scrim: {
    position: 'absolute',
    inset: 0,
    background:
      'radial-gradient(circle at 50% 65%, rgba(92,63,22,0.28) 0%, rgba(13,10,10,0.88) 42%, rgba(2,3,6,0.98) 100%)',
  },
  horizonGlow: {
    position: 'absolute',
    top: '42%',
    left: '50%',
    width: '66vw',
    height: '22vh',
    transform: 'translate(-50%, -50%)',
    background: 'radial-gradient(ellipse at center, rgba(196,140,64,0.2), rgba(0,0,0,0))',
    filter: 'blur(16px)',
  },
  viewport: {
    position: 'absolute',
    inset: 0,
    perspective: '500px',
    overflow: 'hidden',
  },
  crawl: {
    position: 'absolute',
    left: '50%',
    top: '72%',
    width: 'min(82vw, 980px)',
    textAlign: 'center',
    transformOrigin: '50% 100%',
    transition: `transform ${DURATION_MS}ms linear`,
  },
  title: {
    fontFamily: 'Georgia, serif',
    textTransform: 'uppercase',
    letterSpacing: '0.2em',
    fontSize: 'clamp(20px, 3.3vw, 44px)',
    fontWeight: 700,
    marginBottom: 20,
    textShadow: '0 0 16px rgba(0,0,0,0.9)',
  },
  body: {
    fontFamily: 'Courier New, monospace',
    fontSize: 'clamp(16px, 2.2vw, 28px)',
    lineHeight: 1.45,
    letterSpacing: '0.05em',
    textShadow: '0 0 14px rgba(0,0,0,0.95)',
    whiteSpace: 'pre-wrap',
  },
  skipHint: {
    position: 'absolute',
    bottom: 18,
    left: '50%',
    transform: 'translateX(-50%)',
    fontFamily: 'Courier New, monospace',
    fontSize: 11,
    letterSpacing: '0.12em',
    color: 'rgba(222, 196, 147, 0.8)',
  },
}
