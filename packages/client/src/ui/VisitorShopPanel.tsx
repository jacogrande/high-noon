interface VisitorOffer {
  itemId: number
  itemName: string
  itemDescription: string
  rarity: string
  price: number
  sold: boolean
}

interface VisitorShopPanelProps {
  visitorName: string
  greeting: string
  offers: VisitorOffer[]
  playerGold: number
  onPurchase: (index: number) => void
}

const RARITY_COLORS: Record<string, string> = {
  brass: '#cc9944',
  silver: '#aabbcc',
  gold: '#ffcc00',
  cursed: '#bb44ff',
}

export function VisitorShopPanel({
  visitorName,
  greeting,
  offers,
  playerGold,
  onPurchase,
}: VisitorShopPanelProps) {
  return (
    <div style={styles.container}>
      <div style={styles.visitorName}>{visitorName.toUpperCase()}</div>
      <div style={styles.greeting}>"{greeting}"</div>
      <div style={styles.offersGrid}>
        {offers.map((offer, i) => {
          const rarityColor = RARITY_COLORS[offer.rarity] ?? '#cc9944'
          const canAfford = playerGold >= offer.price
          const disabled = offer.sold || !canAfford

          return (
            <div
              key={offer.itemId}
              style={{
                ...styles.offerCard,
                borderColor: offer.sold
                  ? 'rgba(100, 100, 100, 0.3)'
                  : rarityColor + '66',
                opacity: offer.sold ? 0.5 : 1,
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
              <div style={styles.itemName}>{offer.itemName}</div>
              <div style={styles.itemDesc}>{offer.itemDescription}</div>
              <div style={styles.priceRow}>
                <span style={{
                  ...styles.price,
                  color: canAfford && !offer.sold ? '#ffcc00' : '#7a524b',
                }}>
                  {offer.price}g
                </span>
              </div>
              {offer.sold ? (
                <div style={styles.soldBadge}>SOLD</div>
              ) : (
                <button
                  style={disabled ? styles.buyButtonDisabled : styles.buyButton}
                  disabled={disabled}
                  onClick={() => onPurchase(i)}
                  onMouseEnter={(e) => {
                    if (!disabled) {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 204, 0, 0.25)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!disabled) {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 204, 0, 0.12)'
                    }
                  }}
                >
                  BUY
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
  priceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  price: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  buyButton: {
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
  buyButtonDisabled: {
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
  },
  soldBadge: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#666666',
    letterSpacing: '0.15em',
    padding: '4px 16px',
    border: '1px solid rgba(100, 100, 100, 0.3)',
    borderRadius: 3,
    backgroundColor: 'rgba(100, 100, 100, 0.1)',
  },
}
