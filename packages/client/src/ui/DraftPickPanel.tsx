import { useGameAudio } from '../audio/GameAudioContext'

interface DraftOffer {
  itemId: number
  name: string
  description: string
  rarity: string
  poolIndex: number
  pickedBy: number
  downside: string | undefined
}

interface DraftPickPanelProps {
  phase: 'picking' | 'complete'
  offers: DraftOffer[]
  currentPickerEid: number
  localPlayerEid: number
  pickTimer: number
  picksCompleted: number
  totalPicks: number
  pickOrder: number[]
  /** Entity ID → player name for display */
  playerNames: Record<number, string>
  onPick: (poolIndex: number) => void
}

const RARITY_COLORS: Record<string, string> = {
  brass: '#cc9944',
  silver: '#aabbcc',
  gold: '#ffcc00',
  cursed: '#bb44ff',
}

export function DraftPickPanel({
  phase,
  offers,
  currentPickerEid,
  localPlayerEid,
  pickTimer,
  picksCompleted,
  totalPicks,
  playerNames,
  onPick,
}: DraftPickPanelProps) {
  const { playClick, playHover: playHoverSound } = useGameAudio()
  const isMyTurn = currentPickerEid === localPlayerEid
  const pickerName = playerNames[currentPickerEid] ?? 'Player'

  if (phase === 'complete') {
    return (
      <div style={styles.container}>
        <div style={styles.sectionLabel}>LOOT DRAFT</div>
        <div style={styles.completeBadge}>DRAFT COMPLETE</div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.sectionLabel}>LOOT DRAFT</div>
      <div style={styles.turnInfo}>
        {isMyTurn ? (
          <span style={styles.yourTurn}>YOUR PICK</span>
        ) : (
          <span style={styles.waitingTurn}>{pickerName.toUpperCase()} IS PICKING...</span>
        )}
      </div>
      <div style={styles.timerRow}>
        <span style={{
          ...styles.timer,
          color: pickTimer <= 5 ? '#ff4422' : '#aaaaaa',
        }}>
          {Math.ceil(pickTimer)}s
        </span>
        <span style={styles.pickProgress}>
          {Math.min(picksCompleted + 1, totalPicks)} / {totalPicks}
        </span>
      </div>
      <div style={styles.offersGrid}>
        {offers.map((offer) => {
          const rarityColor = RARITY_COLORS[offer.rarity] ?? '#cc9944'
          const isPicked = offer.pickedBy !== -1
          const pickedByName = isPicked ? (playerNames[offer.pickedBy] ?? 'Player') : null
          const canPick = isMyTurn && !isPicked

          return (
            <div
              key={offer.poolIndex}
              style={{
                ...styles.offerCard,
                borderColor: isPicked
                  ? 'rgba(100, 100, 100, 0.3)'
                  : rarityColor + '66',
                opacity: isPicked ? 0.45 : 1,
              }}
            >
              <div
                style={{
                  ...styles.rarityBadge,
                  color: rarityColor,
                  borderColor: rarityColor + '44',
                  backgroundColor: rarityColor + '11',
                }}
              >
                {offer.rarity.toUpperCase()}
              </div>
              <div style={styles.itemName}>{offer.name}</div>
              <div style={styles.itemDesc}>{offer.description}</div>
              {offer.downside && (
                <div style={styles.itemDownside}>{offer.downside}</div>
              )}
              {isPicked ? (
                <div style={styles.pickedBadge}>
                  {pickedByName?.toUpperCase()}
                </div>
              ) : canPick ? (
                <button
                  style={styles.pickButton}
                  onClick={() => { playClick(); onPick(offer.poolIndex) }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 204, 0, 0.25)'
                    playHoverSound()
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 204, 0, 0.12)'
                  }}
                >
                  PICK
                </button>
              ) : (
                <div style={styles.unavailableBadge}>AVAILABLE</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ddaa66',
    letterSpacing: '0.15em',
    textShadow: '0 0 8px rgba(221, 170, 102, 0.4)',
  },
  turnInfo: {
    fontSize: 12,
    letterSpacing: '0.1em',
  },
  yourTurn: {
    color: '#ffcc00',
    fontWeight: 'bold',
    textShadow: '0 0 10px rgba(255, 204, 0, 0.6)',
  },
  waitingTurn: {
    color: '#888888',
  },
  timerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  timer: {
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: '0.05em',
  },
  pickProgress: {
    fontSize: 10,
    color: '#666666',
    letterSpacing: '0.05em',
  },
  offersGrid: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap' as const,
    justifyContent: 'center',
  },
  offerCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 6,
    padding: '12px 14px',
    border: '1px solid',
    borderRadius: 4,
    backgroundColor: 'rgba(20, 12, 8, 0.85)',
    minWidth: 130,
    maxWidth: 160,
  },
  rarityBadge: {
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: '0.15em',
    padding: '2px 8px',
    border: '1px solid',
    borderRadius: 2,
  },
  itemName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#dddddd',
    textAlign: 'center' as const,
  },
  itemDesc: {
    fontSize: 10,
    color: '#999999',
    textAlign: 'center' as const,
    lineHeight: '1.3',
  },
  itemDownside: {
    fontSize: 9,
    color: '#cc4466',
    textAlign: 'center' as const,
    lineHeight: '1.3',
    fontStyle: 'italic',
  },
  pickButton: {
    padding: '5px 20px',
    fontSize: 11,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    letterSpacing: '0.1em',
    color: '#ffcc00',
    backgroundColor: 'rgba(255, 204, 0, 0.12)',
    border: '1px solid rgba(255, 204, 0, 0.4)',
    borderRadius: 3,
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    textShadow: '0 0 6px rgba(255, 204, 0, 0.4)',
  },
  pickedBadge: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#666666',
    letterSpacing: '0.1em',
    padding: '4px 12px',
    border: '1px solid rgba(100, 100, 100, 0.3)',
    borderRadius: 3,
    backgroundColor: 'rgba(100, 100, 100, 0.1)',
  },
  unavailableBadge: {
    fontSize: 9,
    color: '#555555',
    letterSpacing: '0.1em',
  },
  completeBadge: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#44dd44',
    letterSpacing: '0.15em',
    textShadow: '0 0 8px rgba(68, 221, 68, 0.5)',
    padding: '4px 12px',
    border: '1px solid rgba(68, 221, 68, 0.3)',
    borderRadius: 3,
    backgroundColor: 'rgba(68, 221, 68, 0.08)',
  },
}
