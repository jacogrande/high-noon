interface ModOffer {
  modId: number
  modName: string
  modDescription: string
  taken: boolean
  flavor?: string | undefined
}

interface TinkererModPanelProps {
  visitorName: string
  greeting: string
  modOffers: ModOffer[]
  onModSelect: (index: number) => void
}

export function TinkererModPanel({
  visitorName,
  greeting,
  modOffers,
  onModSelect,
}: TinkererModPanelProps) {
  const anyTaken = modOffers.some(o => o.taken)

  return (
    <div style={styles.container}>
      <div style={styles.visitorName}>{visitorName.toUpperCase()}</div>
      <div style={styles.greeting}>"{greeting}"</div>
      <div style={styles.label}>CHOOSE A MODIFICATION</div>
      <div style={styles.offersGrid}>
        {modOffers.map((offer, i) => {
          const dimmed = anyTaken && !offer.taken

          return (
            <div
              key={offer.modId}
              style={{
                ...styles.modCard,
                borderColor: offer.taken
                  ? 'rgba(68, 221, 68, 0.5)'
                  : dimmed
                    ? 'rgba(100, 100, 100, 0.3)'
                    : 'rgba(255, 170, 50, 0.4)',
                opacity: dimmed ? 0.45 : 1,
              }}
            >
              <div style={styles.modName}>{offer.modName}</div>
              <div style={styles.modDesc}>{offer.modDescription}</div>
              {offer.flavor && (
                <div style={styles.flavor}>{offer.flavor}</div>
              )}
              {offer.taken ? (
                <div style={styles.installedBadge}>INSTALLED</div>
              ) : (
                <button
                  style={anyTaken ? styles.modifyButtonDisabled : styles.modifyButton}
                  disabled={anyTaken}
                  onClick={() => onModSelect(i)}
                  onMouseEnter={(e) => {
                    if (!anyTaken) {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 170, 50, 0.25)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!anyTaken) {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 170, 50, 0.12)'
                    }
                  }}
                >
                  MODIFY
                </button>
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
  visitorName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ddaa66',
    letterSpacing: '0.15em',
    textShadow: '0 0 8px rgba(221, 170, 102, 0.4)',
  },
  greeting: {
    fontSize: 11,
    color: '#999999',
    fontStyle: 'italic',
    maxWidth: 300,
    textAlign: 'center' as const,
  },
  label: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#ffaa32',
    letterSpacing: '0.15em',
    textShadow: '0 0 6px rgba(255, 170, 50, 0.3)',
    marginTop: 4,
  },
  offersGrid: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap' as const,
    justifyContent: 'center',
  },
  modCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 6,
    padding: '12px 14px',
    border: '1px solid',
    borderRadius: 4,
    backgroundColor: 'rgba(20, 12, 8, 0.85)',
    minWidth: 140,
    maxWidth: 170,
  },
  modName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ffaa32',
    textAlign: 'center' as const,
    textShadow: '0 0 4px rgba(255, 170, 50, 0.3)',
  },
  modDesc: {
    fontSize: 10,
    color: '#cccccc',
    textAlign: 'center' as const,
    lineHeight: '1.3',
  },
  flavor: {
    fontSize: 9,
    color: '#887755',
    textAlign: 'center' as const,
    lineHeight: '1.3',
    fontStyle: 'italic',
  },
  modifyButton: {
    padding: '5px 20px',
    fontSize: 11,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    letterSpacing: '0.1em',
    color: '#ffaa32',
    backgroundColor: 'rgba(255, 170, 50, 0.12)',
    border: '1px solid rgba(255, 170, 50, 0.4)',
    borderRadius: 3,
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    textShadow: '0 0 6px rgba(255, 170, 50, 0.4)',
    marginTop: 4,
  },
  modifyButtonDisabled: {
    padding: '5px 20px',
    fontSize: 11,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    letterSpacing: '0.1em',
    color: '#7a524b',
    backgroundColor: 'rgba(120, 82, 75, 0.12)',
    border: '1px solid rgba(122, 82, 75, 0.3)',
    borderRadius: 3,
    cursor: 'default',
    textShadow: 'none',
    marginTop: 4,
  },
  installedBadge: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#44dd44',
    letterSpacing: '0.15em',
    padding: '4px 16px',
    border: '1px solid rgba(68, 221, 68, 0.4)',
    borderRadius: 3,
    backgroundColor: 'rgba(68, 221, 68, 0.1)',
    textShadow: '0 0 6px rgba(68, 221, 68, 0.4)',
    marginTop: 4,
  },
}
