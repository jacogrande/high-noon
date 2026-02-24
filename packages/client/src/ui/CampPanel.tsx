import { useState } from 'react'
import { VisitorShopPanel } from './VisitorShopPanel'
import { TinkererModPanel } from './TinkererModPanel'
import { ItemTooltip } from './ItemTooltip'

interface CampPanelProps {
  stageNumber: number
  totalStages: number
  narrativeLine?: string | null
  hasPendingPoints: boolean
  rideOutPending?: boolean
  playerGold: number
  campVisitor: {
    visitorName: string
    greeting: string
    offers: Array<{
      itemId: number
      itemName: string
      itemDescription: string
      rarity: string
      price: number
      sold: boolean
      downside?: string | undefined
    }>
    modOffers: Array<{
      modId: number
      modName: string
      modDescription: string
      taken: boolean
      flavor?: string | undefined
    }>
  } | null
  items: Array<{ itemId: number; key: string; name: string; description: string; rarity: string; stacks: number; downside?: string | undefined }>
  hasFoolsErrand: boolean
  onOpenSkillTree: () => void
  onRideOut: () => void
  onVisitorPurchase: (index: number) => void
  onTinkererModSelect: (index: number) => void
}

const RARITY_COLORS: Record<string, string> = {
  brass: '#cc9944',
  silver: '#aabbcc',
  gold: '#ffcc00',
  cursed: '#bb44ff',
}

export function CampPanel({
  stageNumber,
  totalStages,
  narrativeLine = null,
  hasPendingPoints,
  rideOutPending = false,
  playerGold,
  campVisitor,
  items,
  hasFoolsErrand,
  onOpenSkillTree,
  onRideOut,
  onVisitorPurchase,
  onTinkererModSelect,
}: CampPanelProps) {
  const [hoveredItemId, setHoveredItemId] = useState<number | null>(null)

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>STAGE CLEAR</div>
        <div style={styles.info}>
          Stage {stageNumber} of {totalStages} complete
        </div>
        {narrativeLine && <div style={styles.narrativeLine}>{narrativeLine}</div>}
        <div style={styles.healBadge}>HP RESTORED</div>

        {/* Inventory display */}
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
                    position: 'relative' as const,
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

        {/* Visitor shop or Tinkerer mod panel */}
        {campVisitor && (
          campVisitor.modOffers.length > 0
            ? <TinkererModPanel
                visitorName={campVisitor.visitorName}
                greeting={campVisitor.greeting}
                modOffers={campVisitor.modOffers}
                onModSelect={onTinkererModSelect}
              />
            : hasFoolsErrand
              ? <div style={styles.foolsErrandBlock}>CURSED: Cannot trade with visitors</div>
              : <VisitorShopPanel
                  visitorName={campVisitor.visitorName}
                  greeting={campVisitor.greeting}
                  offers={campVisitor.offers}
                  playerGold={playerGold}
                  onPurchase={onVisitorPurchase}
                />
        )}

        <div style={styles.actions}>
          {hasPendingPoints && (
            <button
              style={styles.skillButton}
              onClick={onOpenSkillTree}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 204, 0, 0.25)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 204, 0, 0.12)'
              }}
            >
              SPEND SKILL POINTS
            </button>
          )}
          <button
            style={rideOutPending ? styles.rideOutButtonDisabled : styles.rideOutButton}
            disabled={rideOutPending}
            onClick={() => {
              if (rideOutPending) return
              onRideOut()
            }}
            onMouseEnter={(e) => {
              if (rideOutPending) return
              e.currentTarget.style.backgroundColor = 'rgba(255, 68, 34, 0.35)'
            }}
            onMouseLeave={(e) => {
              if (rideOutPending) return
              e.currentTarget.style.backgroundColor = 'rgba(255, 68, 34, 0.2)'
            }}
          >
            {rideOutPending ? 'WAITING FOR POSSE...' : 'RIDE OUT'}
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
    zIndex: 55,
    fontFamily: 'monospace',
    overflow: 'auto',
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    padding: '32px 48px',
    maxHeight: '90vh',
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffcc00',
    letterSpacing: '0.2em',
    textShadow: '0 0 20px rgba(255, 204, 0, 0.6), 0 0 40px rgba(255, 150, 0, 0.3)',
  },
  info: {
    fontSize: 13,
    color: '#aaaaaa',
    letterSpacing: '0.05em',
  },
  narrativeLine: {
    fontSize: 13,
    color: '#d7bf8a',
    textAlign: 'center',
    maxWidth: 600,
    fontStyle: 'italic',
    letterSpacing: '0.03em',
    textShadow: '0 0 8px rgba(0, 0, 0, 0.8)',
  },
  healBadge: {
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
  inventorySection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
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
  },
  stackCount: {
    fontSize: 9,
    color: '#888888',
  },
  foolsErrandBlock: {
    fontSize: 11,
    color: '#bb44ff',
    fontStyle: 'italic',
    letterSpacing: '0.05em',
    textShadow: '0 0 8px rgba(187, 68, 255, 0.4)',
    padding: '8px 16px',
    border: '1px solid rgba(187, 68, 255, 0.3)',
    borderRadius: 3,
    backgroundColor: 'rgba(187, 68, 255, 0.08)',
    marginTop: 12,
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  skillButton: {
    padding: '8px 24px',
    fontSize: 12,
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
  rideOutButton: {
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
  },
  rideOutButtonDisabled: {
    padding: '10px 36px',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    letterSpacing: '0.15em',
    color: '#7a524b',
    backgroundColor: 'rgba(120, 82, 75, 0.16)',
    border: '1px solid rgba(122, 82, 75, 0.35)',
    borderRadius: 3,
    cursor: 'default',
    textShadow: 'none',
  },
}
