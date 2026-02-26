import { useEffect, useState } from 'react'
import type { RunCompleteMessage } from '@high-noon/shared'
import { useGameAudio } from '../audio/GameAudioContext'

interface MultiplayerRunEndPanelProps {
  data: RunCompleteMessage
  localSessionId: string
  onBackToLobby: () => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatAccuracy(fired: number, hit: number): string {
  if (fired === 0) return '-'
  return `${Math.round((hit / fired) * 100)}%`
}

const CHARACTER_COLORS: Record<string, string> = {
  sheriff: '#ffcc00',
  undertaker: '#aa88ff',
  prospector: '#ff8844',
}

export function MultiplayerRunEndPanel({
  data,
  localSessionId,
  onBackToLobby,
}: MultiplayerRunEndPanelProps) {
  const { playClick, playHover: playHoverSound } = useGameAudio()
  const [active, setActive] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setActive(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  const headerText = data.victory ? 'VICTORY' : 'SLAIN'
  const headerStyle = data.victory ? styles.headerVictory : styles.headerDefeat

  // Sort players: most kills first, then damage dealt
  const sorted = [...data.playerStats].sort((a, b) => {
    const killDiff = b.stats.enemiesKilled - a.stats.enemiesKilled
    if (killDiff !== 0) return killDiff
    return b.stats.damageDealt - a.stats.damageDealt
  })

  return (
    <div style={{ ...styles.overlay, opacity: active ? 1 : 0 }}>
      <div style={styles.panel}>
        <div style={headerStyle}>{headerText}</div>
        <div style={styles.subtitle}>
          {data.victory
            ? `All ${data.totalStages} Stages Cleared`
            : `Fell on Stage ${data.stagesCleared + 1} of ${data.totalStages}`}
          {' \u2022 '}
          {formatDuration(data.duration)}
        </div>

        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, textAlign: 'left' }}>PLAYER</th>
                <th style={styles.th}>KILLS</th>
                <th style={styles.th}>DMG</th>
                <th style={styles.th}>ACC</th>
                <th style={styles.th}>TAKEN</th>
                <th style={styles.th}>GOLD</th>
                <th style={styles.th}>DOWNS</th>
                <th style={styles.th}>REVIVES</th>
                <th style={styles.th}>DODGES</th>
                <th style={styles.th}>STREAK</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry) => {
                const isLocal = entry.sessionId === localSessionId
                const charColor = CHARACTER_COLORS[entry.characterId] ?? '#cccccc'
                return (
                  <tr key={entry.sessionId} style={isLocal ? styles.localRow : undefined}>
                    <td style={{ ...styles.td, textAlign: 'left' }}>
                      <span style={{ color: charColor, fontWeight: 'bold' }}>
                        {entry.name}
                      </span>
                      {isLocal && <span style={styles.youTag}> (you)</span>}
                    </td>
                    <td style={styles.td}>{entry.stats.enemiesKilled}</td>
                    <td style={styles.td}>{Math.round(entry.stats.damageDealt)}</td>
                    <td style={styles.td}>
                      {formatAccuracy(entry.stats.shotsFired, entry.stats.shotsHit)}
                    </td>
                    <td style={styles.td}>{Math.round(entry.stats.damageReceived)}</td>
                    <td style={styles.td}>{entry.stats.goldCollected}</td>
                    <td style={styles.td}>{entry.stats.timesDown}</td>
                    <td style={styles.td}>{entry.stats.revivesGiven}</td>
                    <td style={styles.td}>{entry.stats.rollDodges}</td>
                    <td style={styles.td}>{entry.stats.longestKillStreak}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={styles.actions}>
          <button
            style={styles.lobbyButton}
            onClick={() => { playClick(); onBackToLobby() }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 68, 34, 0.35)'
              playHoverSound()
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 68, 34, 0.2)'
            }}
          >
            BACK TO MENU
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(ellipse at 50% 60%, #2a1a0a 0%, #110a04 50%, #050208 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 72,
    fontFamily: 'monospace',
    overflow: 'auto',
    transition: 'opacity 400ms ease-out',
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    padding: '32px 48px',
    maxHeight: '90vh',
  },
  headerVictory: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#ffcc00',
    letterSpacing: '0.25em',
    textShadow: '0 0 20px rgba(255, 204, 0, 0.6), 0 0 40px rgba(255, 150, 0, 0.3)',
  },
  headerDefeat: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#cc0000',
    letterSpacing: '0.25em',
    textShadow: '0 0 20px rgba(204, 0, 0, 0.6), 0 0 40px rgba(204, 0, 0, 0.3)',
  },
  subtitle: {
    fontSize: 13,
    color: '#aaaaaa',
    letterSpacing: '0.05em',
  },
  tableWrapper: {
    marginTop: 8,
    overflowX: 'auto',
    maxWidth: '90vw',
  },
  table: {
    borderCollapse: 'collapse',
    minWidth: 600,
  },
  th: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#a08850',
    letterSpacing: '0.15em',
    padding: '4px 10px',
    textAlign: 'center',
    borderBottom: '1px solid rgba(160, 136, 80, 0.25)',
    whiteSpace: 'nowrap',
  },
  td: {
    fontSize: 13,
    color: '#e8d5a8',
    padding: '6px 10px',
    textAlign: 'center',
    borderBottom: '1px solid rgba(160, 136, 80, 0.1)',
  },
  localRow: {
    backgroundColor: 'rgba(255, 204, 0, 0.06)',
  },
  youTag: {
    fontSize: 9,
    color: '#888888',
    fontWeight: 'normal',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  lobbyButton: {
    padding: '10px 36px',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    letterSpacing: '0.15em',
    color: '#ff4422',
    backgroundColor: 'rgba(255, 68, 34, 0.2)',
    border: '1px solid rgba(255, 68, 34, 0.5)',
    borderRadius: 3,
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    textShadow: '0 0 8px rgba(255, 68, 34, 0.5)',
    pointerEvents: 'auto',
  },
}
