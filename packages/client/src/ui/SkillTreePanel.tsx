import { useCallback } from 'react'
import type { SkillTreeUIData, SkillNodeState } from '../scenes/types'

interface SkillTreePanelProps {
  data: SkillTreeUIData
  onSelectNode: (nodeId: string) => void
  onClose: () => void
}

const BRANCH_ACCENTS: Record<string, { color: string; glow: string; dim: string }> = {
  marksman: { color: '#ff6633', glow: 'rgba(255, 102, 51, 0.4)', dim: 'rgba(255, 102, 51, 0.12)' },
  gunslinger: { color: '#ffcc00', glow: 'rgba(255, 204, 0, 0.4)', dim: 'rgba(255, 204, 0, 0.12)' },
  lawman: { color: '#00ffcc', glow: 'rgba(0, 255, 204, 0.4)', dim: 'rgba(0, 255, 204, 0.12)' },
}

const DEFAULT_ACCENT = { color: '#888888', glow: 'rgba(136, 136, 136, 0.4)', dim: 'rgba(136, 136, 136, 0.12)' }

function getNodeStyle(
  state: SkillNodeState,
  accent: { color: string; glow: string; dim: string },
): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '6px 8px',
    borderRadius: 3,
    border: '1px solid',
    transition: 'all 0.15s ease-out',
    position: 'relative',
    minHeight: 48,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  }

  switch (state) {
    case 'taken':
      return {
        ...base,
        borderColor: accent.color,
        backgroundColor: accent.dim,
        boxShadow: `0 0 8px ${accent.glow}, inset 0 0 12px ${accent.dim}`,
      }
    case 'available':
      return {
        ...base,
        borderColor: '#ffffff',
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        cursor: 'pointer',
        boxShadow: '0 0 6px rgba(255, 255, 255, 0.15)',
      }
    case 'locked':
      return {
        ...base,
        borderColor: '#333333',
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        opacity: 0.5,
      }
    case 'unimplemented':
      return {
        ...base,
        borderColor: '#222222',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        opacity: 0.35,
      }
  }
}

function getNameColor(state: SkillNodeState, accent: { color: string }): string {
  switch (state) {
    case 'taken': return accent.color
    case 'available': return '#ffffff'
    case 'locked': return '#666666'
    case 'unimplemented': return '#444444'
  }
}

function getDescColor(state: SkillNodeState): string {
  switch (state) {
    case 'taken': return '#cccccc'
    case 'available': return '#aaaaaa'
    case 'locked': return '#555555'
    case 'unimplemented': return '#333333'
  }
}

function getTierConnectorColor(state: SkillNodeState, accent: { color: string }): string {
  switch (state) {
    case 'taken': return accent.color
    default: return '#222222'
  }
}

export function SkillTreePanel({ data, onSelectNode, onClose }: SkillTreePanelProps) {
  const handleClick = useCallback((nodeId: string, state: SkillNodeState) => {
    if (state === 'available') onSelectNode(nodeId)
  }, [onSelectNode])

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.title}>LEVEL UP</div>
          <div style={styles.pointsBadge}>
            <span style={styles.pointsNumber}>{data.pendingPoints}</span>
            <span style={styles.pointsLabel}>
              {data.pendingPoints === 1 ? 'POINT' : 'POINTS'}
            </span>
          </div>
        </div>

        {/* Branches */}
        <div style={styles.branchRow}>
          {data.branches.map(branch => {
            const accent = BRANCH_ACCENTS[branch.id] ?? DEFAULT_ACCENT
            return (
              <div key={branch.id} style={styles.branch}>
                {/* Branch header */}
                <div style={styles.branchHeader}>
                  <div style={{
                    ...styles.branchName,
                    color: accent.color,
                    textShadow: `0 0 8px ${accent.glow}`,
                  }}>
                    {branch.name.toUpperCase()}
                  </div>
                  <div style={styles.branchDesc}>{branch.description}</div>
                </div>

                {/* Nodes */}
                <div style={styles.nodeColumn}>
                  {branch.nodes.map((node, idx) => {
                    const nodeStyle = getNodeStyle(node.state, accent)
                    const nameColor = getNameColor(node.state, accent)
                    const descColor = getDescColor(node.state)
                    const connColor = getTierConnectorColor(node.state, accent)
                    return (
                      <div key={node.id}>
                        {/* Connector line between tiers */}
                        {idx > 0 && (
                          <div style={{
                            ...styles.connector,
                            backgroundColor: connColor,
                          }} />
                        )}
                        <div
                          style={nodeStyle}
                          onClick={() => handleClick(node.id, node.state)}
                          onMouseEnter={(e) => {
                            if (node.state === 'available') {
                              e.currentTarget.style.borderColor = accent.color
                              e.currentTarget.style.boxShadow = `0 0 10px ${accent.glow}`
                              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (node.state === 'available') {
                              e.currentTarget.style.borderColor = '#ffffff'
                              e.currentTarget.style.boxShadow = '0 0 6px rgba(255, 255, 255, 0.15)'
                              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)'
                            }
                          }}
                        >
                          {/* Tier pip */}
                          <div style={styles.tierRow}>
                            <div style={{
                              ...styles.tierPip,
                              backgroundColor: node.state === 'taken' ? accent.color : '#333',
                              boxShadow: node.state === 'taken' ? `0 0 4px ${accent.glow}` : 'none',
                            }} />
                            <div style={{
                              ...styles.nodeName,
                              color: nameColor,
                            }}>
                              {node.name}
                            </div>
                            {node.state === 'unimplemented' && (
                              <div style={styles.lockTag}>SOON</div>
                            )}
                          </div>
                          <div style={{
                            ...styles.nodeDesc,
                            color: descColor,
                          }}>
                            {node.description}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button
            style={styles.closeButton}
            onClick={onClose}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            BACK
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
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 60,
    fontFamily: 'monospace',
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    maxWidth: 720,
    width: '95%',
    maxHeight: '90vh',
    overflowY: 'auto',
    padding: '20px 24px',
    border: '1px solid #333',
    borderRadius: 4,
    backgroundColor: 'rgba(10, 10, 18, 0.95)',
    boxShadow: '0 0 40px rgba(0, 0, 0, 0.6), inset 0 0 60px rgba(0, 0, 0, 0.3)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffcc00',
    letterSpacing: '0.15em',
    textShadow: '0 0 12px rgba(255, 204, 0, 0.5)',
  },
  pointsBadge: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 5,
  },
  pointsNumber: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ffcc00',
    textShadow: '0 0 10px rgba(255, 204, 0, 0.6)',
  },
  pointsLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#998800',
    letterSpacing: '0.1em',
  },
  branchRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 12,
  },
  branch: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  branchHeader: {
    textAlign: 'center',
    paddingBottom: 6,
    borderBottom: '1px solid #222',
    marginBottom: 2,
  },
  branchName: {
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: '0.15em',
  },
  branchDesc: {
    fontSize: 8,
    color: '#666',
    marginTop: 2,
    lineHeight: 1.3,
  },
  nodeColumn: {
    display: 'flex',
    flexDirection: 'column',
  },
  connector: {
    width: 1,
    height: 6,
    marginLeft: 12,
  },
  tierRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
  },
  tierPip: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    flexShrink: 0,
  },
  nodeName: {
    fontSize: 10,
    fontWeight: 'bold',
    lineHeight: 1.2,
  },
  lockTag: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#444',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid #333',
    borderRadius: 2,
    padding: '0 3px',
    marginLeft: 'auto',
    letterSpacing: '0.05em',
    lineHeight: '12px',
  },
  nodeDesc: {
    fontSize: 8,
    lineHeight: 1.3,
    marginTop: 2,
  },
  footer: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: 4,
  },
  closeButton: {
    padding: '6px 24px',
    fontSize: 11,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    letterSpacing: '0.1em',
    color: '#888888',
    backgroundColor: 'transparent',
    border: '1px solid #444',
    borderRadius: 3,
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
}
