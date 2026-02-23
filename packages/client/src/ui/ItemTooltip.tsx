import { memo } from 'react'

const RARITY_COLORS: Record<string, string> = {
  brass: '#d4a046',
  silver: '#b0b0c0',
  gold: '#ffc800',
  cursed: '#bb44ff',
}

interface ItemTooltipProps {
  name: string
  description: string
  rarity: string
  stacks: number
  downside?: string | undefined
}

export const ItemTooltip = memo(function ItemTooltip({ name, description, rarity, stacks, downside }: ItemTooltipProps) {
  const color = RARITY_COLORS[rarity] ?? RARITY_COLORS.brass

  return (
    <div style={{
      ...styles.container,
      borderTopColor: color,
    }}>
      <div style={{ ...styles.name, color }}>{name}</div>
      {description && <div style={styles.description}>{description}</div>}
      {downside && <div style={styles.downside}>{downside}</div>}
      {stacks > 1 && <div style={styles.stacks}>x{stacks}</div>}
    </div>
  )
})

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    marginBottom: 6,
    padding: '5px 8px',
    backgroundColor: 'rgba(12, 8, 4, 0.92)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderTop: '2px solid',
    borderRadius: 3,
    fontFamily: 'monospace',
    maxWidth: 200,
    minWidth: 100,
    pointerEvents: 'none',
    zIndex: 100,
    whiteSpace: 'normal',
  },
  name: {
    fontSize: 10,
    fontWeight: 'bold',
    lineHeight: 1.3,
    letterSpacing: '0.04em',
  },
  description: {
    fontSize: 9,
    color: '#aaaaaa',
    lineHeight: 1.3,
    marginTop: 3,
  },
  downside: {
    fontSize: 9,
    color: '#cc4466',
    lineHeight: 1.3,
    marginTop: 3,
    fontStyle: 'italic',
  },
  stacks: {
    fontSize: 8,
    color: '#888888',
    marginTop: 2,
  },
}
