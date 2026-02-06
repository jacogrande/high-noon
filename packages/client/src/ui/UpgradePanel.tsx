import { useState } from 'react'
import { UpgradeRarity, type UpgradeDef, type UpgradeId } from '@high-noon/shared'

interface UpgradePanelProps {
  choices: UpgradeDef[]
  onSelect: (id: UpgradeId) => void
}

export function UpgradePanel({ choices, onSelect }: UpgradePanelProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  return (
    <div style={styles.overlay}>
      <div style={styles.title}>LEVEL UP!</div>
      <div style={styles.cardRow}>
        {choices.map((def, i) => {
          const isRare = def.rarity === UpgradeRarity.RARE
          const isHovered = hoveredIndex === i
          return (
            <button
              key={def.id}
              style={{
                ...styles.card,
                borderColor: isRare ? '#f0a030' : '#666666',
                transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                backgroundColor: isHovered ? '#2a2a3e' : '#1e1e2e',
              }}
              onClick={() => onSelect(def.id)}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div style={{
                ...styles.rarityBadge,
                color: isRare ? '#f0a030' : '#888888',
              }}>
                {isRare ? 'RARE' : 'COMMON'}
              </div>
              <div style={styles.cardName}>{def.name}</div>
              <div style={styles.cardDesc}>{def.description}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    zIndex: 200,
    gap: '2rem',
  },
  title: {
    fontFamily: 'monospace',
    fontSize: '2.5rem',
    fontWeight: 'bold',
    color: '#00ffff',
    letterSpacing: '0.2em',
    textShadow: '0 0 20px rgba(0, 255, 255, 0.5)',
  },
  cardRow: {
    display: 'flex',
    gap: '1.5rem',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    width: '200px',
    padding: '1.5rem 1rem',
    border: '2px solid',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'transform 0.15s ease, background-color 0.15s ease',
    outline: 'none',
    fontFamily: 'monospace',
  },
  rarityBadge: {
    fontSize: '0.7rem',
    fontWeight: 'bold',
    letterSpacing: '0.15em',
    textTransform: 'uppercase' as const,
  },
  cardName: {
    fontSize: '1.1rem',
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  cardDesc: {
    fontSize: '0.85rem',
    color: '#aaaaaa',
    textAlign: 'center',
    lineHeight: '1.4',
  },
}
