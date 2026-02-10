import { useState } from 'react'
import type { CharacterId } from '@high-noon/shared'

interface CharacterSelectProps {
  onSelect: (characterId: CharacterId) => void
}

interface CharacterInfo {
  id: CharacterId
  name: string
  description: string
  weapon: string
  stats: string[]
  accent: string
  glow: string
}

const CHARACTERS: CharacterInfo[] = [
  {
    id: 'sheriff',
    name: 'THE SHERIFF',
    description: 'Reliable six-shooter with a deadly Showdown ability that marks a single target.',
    weapon: 'Revolver (6 rounds)',
    stats: ['Balanced damage & range', 'Showdown: Mark & execute', '3 skill branches'],
    accent: '#ff6633',
    glow: 'rgba(255, 102, 51, 0.3)',
  },
  {
    id: 'undertaker',
    name: 'THE UNDERTAKER',
    description: 'Close-range sawed-off with Last Rites — a cursed zone that chains death pulses.',
    weapon: 'Sawed-Off (2 rounds)',
    stats: ['High damage, short range', 'Last Rites: Death zone', '3 skill branches'],
    accent: '#8833cc',
    glow: 'rgba(136, 51, 204, 0.3)',
  },
  {
    id: 'prospector',
    name: 'THE PROSPECTOR',
    description: 'Melee brawler with a pickaxe and dynamite.',
    weapon: 'Pickaxe + Dynamite',
    stats: ['Melee cleave + charged swing', 'Dynamite: Throwable AoE', 'Gold Rush scaling'],
    accent: '#ddaa33',
    glow: 'rgba(221, 170, 51, 0.3)',
  },
]

export function CharacterSelect({ onSelect }: CharacterSelectProps) {
  const [hoveredId, setHoveredId] = useState<CharacterId | null>(null)

  return (
    <div style={styles.root}>
      <div style={styles.title}>CHOOSE YOUR CHARACTER</div>
      <div style={styles.cardRow}>
        {CHARACTERS.map((char) => {
          const isHovered = hoveredId === char.id
          return (
            <button
              key={char.id}
              style={{
                ...styles.card,
                borderColor: char.accent,
                boxShadow: isHovered
                  ? `0 0 30px ${char.glow}, inset 0 0 20px ${char.glow}`
                  : `0 0 20px ${char.glow}`,
                transform: isHovered ? 'scale(1.03)' : 'scale(1)',
              }}
              onClick={() => onSelect(char.id)}
              onMouseEnter={() => setHoveredId(char.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div style={{ ...styles.charName, color: char.accent }}>{char.name}</div>
              <div style={styles.charDesc}>{char.description}</div>
              <div style={styles.divider} />
              <div style={{ ...styles.weaponLabel, color: char.accent }}>{char.weapon}</div>
              <ul style={styles.statList}>
                {char.stats.map((s, i) => (
                  <li key={i} style={styles.statItem}>{s}</li>
                ))}
              </ul>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    fontFamily: 'monospace',
    zIndex: 60,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    letterSpacing: '0.15em',
    textShadow: '0 0 10px rgba(255,255,255,0.3)',
  },
  cardRow: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 24,
    maxWidth: 980,
  },
  card: {
    width: 260,
    padding: '20px 16px',
    backgroundColor: 'rgba(10, 10, 20, 0.9)',
    border: '1px solid',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'all 0.2s ease-out',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-start',
    gap: 8,
    textAlign: 'left' as const,
    fontFamily: 'monospace',
  },
  charName: {
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: '0.1em',
  },
  charDesc: {
    fontSize: 11,
    color: '#aaaaaa',
    lineHeight: '1.4',
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    margin: '4px 0',
  },
  weaponLabel: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  statList: {
    margin: 0,
    padding: '0 0 0 16px',
    listStyle: 'disc',
  },
  statItem: {
    fontSize: 10,
    color: '#888888',
    lineHeight: '1.6',
  },
}
