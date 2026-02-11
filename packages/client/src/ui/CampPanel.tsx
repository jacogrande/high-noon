interface CampPanelProps {
  stageNumber: number
  totalStages: number
  hasPendingPoints: boolean
  onOpenSkillTree: () => void
  onRideOut: () => void
}

export function CampPanel({
  stageNumber,
  totalStages,
  hasPendingPoints,
  onOpenSkillTree,
  onRideOut,
}: CampPanelProps) {
  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>STAGE CLEAR</div>
        <div style={styles.info}>
          Stage {stageNumber} of {totalStages} complete
        </div>
        <div style={styles.healBadge}>HP RESTORED</div>
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
            style={styles.rideOutButton}
            onClick={onRideOut}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 68, 34, 0.35)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 68, 34, 0.2)'
            }}
          >
            RIDE OUT
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
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    padding: '32px 48px',
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
}
