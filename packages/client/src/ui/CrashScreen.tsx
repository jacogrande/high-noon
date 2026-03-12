export function CrashScreen({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Unknown error'

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      color: '#fff', fontFamily: 'monospace', zIndex: 9999,
    }}>
      <h1>Something went wrong</h1>
      <p style={{ color: '#ff6b6b', maxWidth: 600, textAlign: 'center' }}>{message}</p>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: 24, padding: '12px 32px',
          fontSize: 16, cursor: 'pointer',
          background: '#c9a96e', border: 'none', color: '#1a1a2e',
        }}
      >
        Reload Game
      </button>
    </div>
  )
}
