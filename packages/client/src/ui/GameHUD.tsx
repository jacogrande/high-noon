import { memo } from 'react'
import type { HUDState } from '../scenes/types'

function getStageDisplay(state: HUDState): string {
  if (state.stageStatus === 'completed') return 'RUN COMPLETE'
  if (state.stageStatus === 'clearing') return 'STAGE CLEAR'
  if (state.stageStatus === 'camp') return ''
  if (state.stageStatus === 'none') return ''
  return `STAGE ${state.stageNumber} / ${state.totalStages} — WAVE ${state.waveNumber} / ${state.totalWaves}`
}

export const GameHUD = memo(function GameHUD({ state }: { state: HUDState }) {
  const hpPct = state.maxHP > 0 ? (state.hp / state.maxHP) * 100 : 0
  const xpRange = state.xpForNextLevel - state.xpForCurrentLevel
  const xpPct = xpRange > 0 ? ((state.xp - state.xpForCurrentLevel) / xpRange) * 100 : 100
  const lowHP = state.hp <= 2 && state.hp > 0
  const abilityActive = state.abilityActive ?? state.showdownActive
  const abilityCooldown = state.abilityCooldown ?? state.showdownCooldown
  const abilityCooldownMax = state.abilityCooldownMax ?? state.showdownCooldownMax
  const abilityTimeLeft = state.abilityTimeLeft ?? state.showdownTimeLeft
  const abilityDurationMax = state.abilityDurationMax ?? state.showdownDurationMax
  const abilityName = state.abilityName ?? 'ABILITY'
  const showCylinder = state.showCylinder && state.cylinderMax > 0

  return (
    <div style={styles.root}>
      {/* Stage + Wave indicator — top-center */}
      <div style={styles.waveContainer}>{getStageDisplay(state)}</div>

      {/* Weapon + Ability — bottom-left */}
      <div style={styles.bottomLeft}>
        {/* Character ability indicator */}
        <div style={styles.abilityRow}>
          {abilityActive ? (
            <>
              <div style={{ ...styles.abilityKey, ...styles.abilityActive }}>Q</div>
              <div style={styles.abilityBarOuter}>
                <div style={{
                  ...styles.abilityBarFill,
                  ...styles.abilityBarActive,
                  width: `${abilityDurationMax > 0 ? (abilityTimeLeft / abilityDurationMax) * 100 : 0}%`,
                }} />
              </div>
              <div style={{ ...styles.abilityLabel, color: '#ff6633' }}>
                {abilityName} {abilityTimeLeft.toFixed(1)}s
              </div>
            </>
          ) : abilityCooldown > 0 ? (
            <>
              <div style={{ ...styles.abilityKey, ...styles.abilityOnCooldown }}>Q</div>
              <div style={styles.abilityBarOuter}>
                <div style={{
                  ...styles.abilityBarFill,
                  ...styles.abilityBarCooldown,
                  width: `${abilityCooldownMax > 0 ? (1 - abilityCooldown / abilityCooldownMax) * 100 : 0}%`,
                }} />
              </div>
              <div style={{ ...styles.abilityLabel, color: '#666666' }}>
                {abilityName} {abilityCooldown.toFixed(1)}s
              </div>
            </>
          ) : (
            <>
              <div style={{ ...styles.abilityKey, ...styles.abilityReady }}>Q</div>
              <div style={{ ...styles.abilityLabel, color: '#00ffcc' }}>{abilityName} READY</div>
            </>
          )}
        </div>
        {showCylinder && (
          <>
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
          </>
        )}
      </div>

      {/* HP + XP stacked — bottom-right */}
      <div style={styles.bottomRight}>
        {/* XP bar (smaller, above HP) */}
        <div style={styles.xpRow}>
          <div style={styles.goldBadge}>$ {state.goldCollected}</div>
          <div style={styles.levelBadge}>
            LVL {state.level}
            {state.pendingPoints > 0 && (
              <span style={styles.pendingBadge}>+{state.pendingPoints}</span>
            )}
          </div>
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
  // Showdown ability indicator
  abilityRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  abilityKey: {
    width: 16,
    height: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 9,
    fontWeight: 'bold',
    borderRadius: 2,
    border: '1px solid',
    lineHeight: 1,
  },
  abilityReady: {
    color: '#00ffcc',
    borderColor: '#00ffcc',
    backgroundColor: 'rgba(0, 255, 204, 0.15)',
    textShadow: '0 0 6px rgba(0, 255, 204, 0.6)',
    boxShadow: '0 0 6px rgba(0, 255, 204, 0.3)',
  },
  abilityActive: {
    color: '#ff6633',
    borderColor: '#ff6633',
    backgroundColor: 'rgba(255, 102, 51, 0.2)',
    textShadow: '0 0 6px rgba(255, 102, 51, 0.6)',
    boxShadow: '0 0 6px rgba(255, 102, 51, 0.3)',
  },
  abilityOnCooldown: {
    color: '#666666',
    borderColor: '#444444',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  abilityBarOuter: {
    width: 40,
    height: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  abilityBarFill: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.05s linear',
  },
  abilityBarActive: {
    backgroundColor: '#ff6633',
  },
  abilityBarCooldown: {
    backgroundColor: '#555555',
  },
  abilityLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    textShadow: '0 0 4px rgba(0,0,0,0.8)',
    whiteSpace: 'nowrap' as const,
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
  goldBadge: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#ffd24a',
    textShadow: '0 0 6px rgba(255, 210, 74, 0.45)',
    whiteSpace: 'nowrap',
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
    display: 'flex',
    alignItems: 'center',
    gap: 3,
  },
  pendingBadge: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#ffcc00',
    textShadow: '0 0 6px rgba(255, 204, 0, 0.6)',
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
