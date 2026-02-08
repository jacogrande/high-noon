import { Link } from 'react-router-dom'
import { VERSION } from '@high-noon/shared'

export function Home() {
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>High Noon</h1>
      <p style={styles.version}>v{VERSION}</p>
      <p style={styles.subtitle}>A twitchy top-down roguelite</p>

      <div style={styles.menu}>
        <Link to="/play" style={styles.button}>
          Play
        </Link>
        <Link to="/play-multi" style={styles.button}>
          Multiplayer
        </Link>
      </div>

      <div style={styles.footer}>
        <p style={styles.footerText}>More options coming soon...</p>
      </div>
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
    backgroundColor: '#1a1a2e',
    color: '#ffffff',
    fontFamily: 'Arial, sans-serif',
  },
  title: {
    fontSize: '4rem',
    margin: 0,
    textTransform: 'uppercase',
    letterSpacing: '0.2em',
  },
  version: {
    fontSize: '0.875rem',
    color: '#888',
    margin: '0.5rem 0',
  },
  subtitle: {
    fontSize: '1.25rem',
    color: '#aaa',
    marginBottom: '3rem',
  },
  menu: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  button: {
    padding: '1rem 3rem',
    fontSize: '1.25rem',
    backgroundColor: '#e94560',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    textDecoration: 'none',
    textAlign: 'center',
    transition: 'background-color 0.2s',
  },
  footer: {
    position: 'absolute',
    bottom: '2rem',
  },
  footerText: {
    color: '#666',
    fontSize: '0.875rem',
  },
}
