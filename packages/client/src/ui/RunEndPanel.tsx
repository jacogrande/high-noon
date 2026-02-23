import { useEffect, useState } from 'react'
import { ItemTooltip } from './ItemTooltip'

interface RunEndPanelProps {
  outcome: 'victory' | 'defeat' | 'mutual_kill'
  stageNumber: number
  totalStages: number
  level: number
  goldCollected: number
  killCount: number
  items: Array<{ itemId: number; key: string; name: string; description: string; rarity: string; stacks: number; downside?: string | undefined }>
  resolutionText: string | null
  onPlayAgain: () => void
  onQuitToMenu: () => void
}

const RARITY_COLORS: Record<string, string> = {
  brass: '#cc9944',
  silver: '#aabbcc',
  gold: '#ffcc00',
  cursed: '#bb44ff',
}

export function RunEndPanel({
  outcome,
  stageNumber,
  totalStages,
  level,
  goldCollected,
  killCount,
  items,
  resolutionText,
  onPlayAgain,
  onQuitToMenu,
}: RunEndPanelProps) {
  const [active, setActive] = useState(false)
  const [hoveredItemId, setHoveredItemId] = useState<number | null>(null)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setActive(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  const headerStyle = outcome === 'victory'
    ? styles.headerVictory
    : outcome === 'mutual_kill'
      ? styles.headerMutualKill
      : styles.headerDefeat

  const headerText = outcome === 'victory'
    ? 'VICTORY'
    : outcome === 'mutual_kill'
      ? 'MUTUAL KILL'
      : 'SLAIN'

  return (
    <div style={{ ...styles.overlay, opacity: active ? 1 : 0 }}>
      <div style={styles.panel}>
        <div style={headerStyle}>{headerText}</div>
        <div style={styles.subtitle}>
          Stage {stageNumber} of {totalStages}
        </div>

        {resolutionText && (
          <div style={styles.resolutionText}>{resolutionText}</div>
        )}

        <div style={styles.statsRow}>
          <div style={styles.stat}>
            <div style={styles.statLabel}>KILLS</div>
            <div style={styles.statValue}>{killCount}</div>
          </div>
          <div style={styles.statDivider} />
          <div style={styles.stat}>
            <div style={styles.statLabel}>GOLD</div>
            <div style={styles.statValue}>{goldCollected}</div>
          </div>
          <div style={styles.statDivider} />
          <div style={styles.stat}>
            <div style={styles.statLabel}>LEVEL</div>
            <div style={styles.statValue}>{level}</div>
          </div>
        </div>

        {items.length > 0 && (
          <div style={styles.inventorySection}>
            <div style={styles.sectionLabel}>INVENTORY</div>
            <div style={styles.inventoryGrid}>
              {items.map(item => (
                <div
                  key={item.itemId}
                  style={{
                    ...styles.inventoryItem,
                    borderColor: (RARITY_COLORS[item.rarity] ?? '#cc9944') + '44',
                  }}
                  onMouseEnter={() => setHoveredItemId(item.itemId)}
                  onMouseLeave={() => setHoveredItemId(null)}
                >
                  <span style={{ color: RARITY_COLORS[item.rarity] ?? '#cc9944', fontSize: 10 }}>
                    {item.name}
                  </span>
                  {item.stacks > 1 && (
                    <span style={styles.stackCount}>x{item.stacks}</span>
                  )}
                  {hoveredItemId === item.itemId && (
                    <ItemTooltip
                      name={item.name}
                      description={item.description}
                      rarity={item.rarity}
                      stacks={item.stacks}
                      downside={item.downside}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={styles.actions}>
          <button
            style={styles.playAgainButton}
            onClick={onPlayAgain}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 68, 34, 0.35)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 68, 34, 0.2)'
            }}
          >
            RIDE AGAIN
          </button>
          <button
            style={styles.quitButton}
            onClick={onQuitToMenu}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(120, 100, 80, 0.25)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(120, 100, 80, 0.1)'
            }}
          >
            QUIT TO MENU
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
  headerMutualKill: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#cc7700',
    letterSpacing: '0.25em',
    textShadow: '0 0 20px rgba(204, 119, 0, 0.6), 0 0 40px rgba(204, 80, 0, 0.3)',
  },
  subtitle: {
    fontSize: 13,
    color: '#aaaaaa',
    letterSpacing: '0.05em',
  },
  resolutionText: {
    fontSize: 13,
    color: '#d7bf8a',
    textAlign: 'center',
    maxWidth: 600,
    fontStyle: 'italic',
    letterSpacing: '0.03em',
    textShadow: '0 0 8px rgba(0, 0, 0, 0.8)',
  },
  statsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    marginTop: 8,
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#a08850',
    letterSpacing: '0.15em',
  },
  statValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#e8d5a8',
    letterSpacing: '0.05em',
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(160, 136, 80, 0.25)',
  },
  inventorySection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#777777',
    letterSpacing: '0.15em',
  },
  inventoryGrid: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: 400,
  },
  inventoryItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    border: '1px solid',
    borderRadius: 3,
    backgroundColor: 'rgba(20, 12, 8, 0.6)',
    position: 'relative',
  },
  stackCount: {
    fontSize: 9,
    color: '#888888',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  playAgainButton: {
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
  quitButton: {
    padding: '8px 24px',
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    letterSpacing: '0.1em',
    color: '#887766',
    backgroundColor: 'rgba(120, 100, 80, 0.1)',
    border: '1px solid rgba(120, 100, 80, 0.3)',
    borderRadius: 3,
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    pointerEvents: 'auto',
  },
}
