import { memo } from 'react'
import type { HUDState } from '../scenes/GameScene'

export const GameHUD = memo(function GameHUD({ state }: { state: HUDState }) {
  const hpPct = state.maxHP > 0 ? (state.hp / state.maxHP) * 100 : 0
  const xpRange = state.xpForNextLevel - state.xpForCurrentLevel
  const xpPct = xpRange > 0 ? ((state.xp - state.xpForCurrentLevel) / xpRange) * 100 : 100
  const lowHP = state.hp <= 2 && state.hp > 0

  return (
    <div style={styles.root}>
      {/* Wave indicator — top-center */}
      <div style={styles.waveContainer}>
        {state.waveStatus === 'completed'
          ? 'COMPLETE'
          : state.waveStatus === 'none'
            ? ''
            : `WAVE ${state.waveNumber} / ${state.totalWaves}`}
      </div>

      {/* Cylinder — bottom-left */}
      <div style={styles.bottomLeft}>
        <div style={styles.chamberRow}>
          {Array.from({ length: state.cylinderMax }, (_, i) => {
            const loaded = i < state.cylinderRounds
            const isLastRound = state.cylinderRounds === 1 && i === 0
            return (
              <div key={i} style={{
                ...styles.chamber,
                backgroundColor: loaded
                  ? (isLastRound ? '#ff4444' : '#ffcc00')
                  : 'rgba(255, 204, 0, 0.2)',
                boxShadow: loaded
                  ? (isLastRound ? '0 0 6px rgba(255, 68, 68, 0.6)' : '0 0 4px rgba(255, 204, 0, 0.4)')
                  : 'none',
              }} />
            )
          })}
        </div>
        {state.isReloading && (
          <>
            <div style={styles.reloadBarOuter}>
              <div style={{ ...styles.reloadFill, width: `${state.reloadProgress * 100}%` }} />
            </div>
            <div style={styles.reloadLabel}>RELOADING</div>
          </>
        )}
      </div>

      {/* HP + XP stacked — bottom-right */}
      <div style={styles.bottomRight}>
        {/* XP bar (smaller, above HP) */}
        <div style={styles.xpRow}>
          <div style={styles.levelBadge}>LVL {state.level}</div>
          <div style={styles.xpBarOuter}>
            <div style={{ ...styles.xpFill, width: `${xpPct}%` }} />
          </div>
        </div>
        {/* HP bar */}
        <div style={styles.hpRow}>
          <div style={styles.hpBarOuter}>
            <div
              style={{
                ...styles.hpFill,
                width: `${hpPct}%`,
                animation: lowHP ? 'hud-pulse 0.6s ease-in-out infinite' : 'none',
              }}
            />
          </div>
          <div style={styles.hpLabel}>
            {state.hp} / {state.maxHP}
          </div>
        </div>
      </div>
    </div>
  )
})

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    fontFamily: 'monospace',
    zIndex: 50,
  },
  // Wave indicator — top-center
  waveContainer: {
    position: 'absolute',
    top: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    fontSize: 12,
    fontWeight: 'bold',
    color: '#aaaaaa',
    textShadow: '0 0 4px rgba(0,0,0,0.8)',
    letterSpacing: '0.1em',
  },
  // Cylinder — bottom-left
  bottomLeft: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
  },
  chamberRow: {
    display: 'flex',
    gap: 5,
  },
  chamber: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    transition: 'background-color 0.1s ease-out, box-shadow 0.1s ease-out',
  },
  reloadBarOuter: {
    width: 73,
    height: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  reloadFill: {
    height: '100%',
    backgroundColor: '#ffcc00',
    borderRadius: 2,
    transition: 'width 0.05s linear',
  },
  reloadLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#ffcc00',
    textShadow: '0 0 4px rgba(0,0,0,0.8)',
    letterSpacing: '0.1em',
  },
  // Bottom-right stack
  bottomRight: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
  },
  // XP row (smaller)
  xpRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  xpBarOuter: {
    width: 120,
    height: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  levelBadge: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#00ffff',
    textShadow: '0 0 6px rgba(0, 255, 255, 0.4)',
    whiteSpace: 'nowrap',
  },
  xpFill: {
    height: '100%',
    backgroundColor: '#00ffff',
    borderRadius: 2,
    transition: 'width 0.15s ease-out',
  },
  // HP row
  hpRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  hpBarOuter: {
    width: 160,
    height: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  hpFill: {
    height: '100%',
    backgroundColor: '#dd3333',
    borderRadius: 3,
    transition: 'width 0.15s ease-out',
  },
  hpLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ffffff',
    textShadow: '0 0 4px rgba(0,0,0,0.8)',
    whiteSpace: 'nowrap',
  },
}
