import type { CharacterId, LobbyPlayerState } from '@high-noon/shared'

interface MultiplayerLobbyProps {
  players: LobbyPlayerState[]
  localSessionId: string | null
  selectedCharacter: CharacterId
  localReady: boolean
  onSelectCharacter: (characterId: CharacterId) => void
  onToggleReady: () => void
}

interface CharacterInfo {
  id: CharacterId
  name: string
  description: string
  accent: string
  glow: string
}

const CHARACTERS: CharacterInfo[] = [
  {
    id: 'sheriff',
    name: 'THE SHERIFF',
    description: 'Reliable revolver with Showdown mark-and-execute pressure.',
    accent: '#ff6633',
    glow: 'rgba(255, 102, 51, 0.3)',
  },
  {
    id: 'undertaker',
    name: 'THE UNDERTAKER',
    description: 'Short-range burst and Last Rites zone control.',
    accent: '#33bbff',
    glow: 'rgba(51, 187, 255, 0.3)',
  },
  {
    id: 'prospector',
    name: 'THE PROSPECTOR',
    description: 'Melee cleave with dynamite for area denial.',
    accent: '#ddaa33',
    glow: 'rgba(221, 170, 51, 0.3)',
  },
]

export function MultiplayerLobby({
  players,
  localSessionId,
  selectedCharacter,
  localReady,
  onSelectCharacter,
  onToggleReady,
}: MultiplayerLobbyProps) {
  return (
    <div style={styles.root}>
      <div style={styles.title}>MULTIPLAYER LOBBY</div>
      <div style={styles.layout}>
        <div style={styles.characterPanel}>
          <div style={styles.sectionTitle}>Character Select</div>
          <div style={styles.characterGrid}>
            {CHARACTERS.map((char) => {
              const selected = selectedCharacter === char.id
              return (
                <button
                  key={char.id}
                  style={{
                    ...styles.characterCard,
                    borderColor: selected ? char.accent : 'rgba(255,255,255,0.16)',
                    boxShadow: selected
                      ? `0 0 24px ${char.glow}, inset 0 0 14px ${char.glow}`
                      : 'none',
                  }}
                  onClick={() => onSelectCharacter(char.id)}
                >
                  <div style={{ ...styles.characterName, color: char.accent }}>{char.name}</div>
                  <div style={styles.characterDescription}>{char.description}</div>
                </button>
              )
            })}
          </div>
        </div>

        <div style={styles.rosterPanel}>
          <div style={styles.sectionTitle}>Lobby Roster</div>
          <div style={styles.rosterList}>
            {players.map((player) => {
              const isLocal = player.sessionId === localSessionId
              return (
                <div key={player.sessionId} style={styles.rosterItem}>
                  <div style={styles.rosterLeft}>
                    <div style={styles.playerName}>
                      {player.name}
                      {isLocal ? ' (You)' : ''}
                    </div>
                    <div style={styles.playerCharacter}>{player.characterId.toUpperCase()}</div>
                  </div>
                  <div
                    style={{
                      ...styles.readyTag,
                      backgroundColor: player.ready ? 'rgba(70, 220, 130, 0.18)' : 'rgba(255, 255, 255, 0.1)',
                      color: player.ready ? '#46dc82' : '#aaaaaa',
                      borderColor: player.ready ? 'rgba(70, 220, 130, 0.45)' : 'rgba(255, 255, 255, 0.15)',
                    }}
                  >
                    {player.ready ? 'READY' : 'WAITING'}
                  </div>
                </div>
              )
            })}
            {players.length === 0 && (
              <div style={styles.emptyRoster}>Waiting for players...</div>
            )}
          </div>

          <button style={localReady ? styles.unreadyButton : styles.readyButton} onClick={onToggleReady}>
            {localReady ? 'UNREADY' : 'READY UP'}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    padding: '72px 20px 20px',
    boxSizing: 'border-box',
    color: '#ffffff',
    fontFamily: 'monospace',
  },
  title: {
    textAlign: 'center',
    fontSize: 30,
    letterSpacing: '0.12em',
    fontWeight: 'bold',
    textShadow: '0 0 14px rgba(255,255,255,0.25)',
  },
  layout: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 20,
    justifyContent: 'center',
    alignItems: 'stretch',
    minHeight: 0,
  },
  characterPanel: {
    flex: '2 1 640px',
    minWidth: 280,
    backgroundColor: 'rgba(11, 13, 30, 0.82)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  rosterPanel: {
    flex: '1 1 340px',
    minWidth: 280,
    backgroundColor: 'rgba(11, 13, 30, 0.82)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 14,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: '#8ec9ff',
  },
  characterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
  },
  characterCard: {
    backgroundColor: 'rgba(8, 10, 24, 0.95)',
    border: '1px solid rgba(255,255,255,0.16)',
    borderRadius: 8,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    alignItems: 'flex-start',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'box-shadow 0.15s ease-out, border-color 0.15s ease-out',
    color: '#ffffff',
    fontFamily: 'monospace',
  },
  characterName: {
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: '0.08em',
  },
  characterDescription: {
    fontSize: 11,
    color: '#b8bfd1',
    lineHeight: '1.35',
  },
  rosterList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    flex: 1,
    minHeight: 120,
  },
  rosterItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: '10px 12px',
    backgroundColor: 'rgba(6, 8, 20, 0.75)',
    gap: 8,
  },
  rosterLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  playerName: {
    fontSize: 12,
    color: '#ffffff',
  },
  playerCharacter: {
    fontSize: 10,
    color: '#9ea6bd',
    letterSpacing: '0.05em',
  },
  readyTag: {
    border: '1px solid',
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 10,
    letterSpacing: '0.08em',
    minWidth: 78,
    textAlign: 'center',
    boxSizing: 'border-box',
  },
  readyButton: {
    width: '100%',
    border: '1px solid rgba(70, 220, 130, 0.45)',
    borderRadius: 8,
    padding: '12px 16px',
    backgroundColor: 'rgba(70, 220, 130, 0.18)',
    color: '#6bf2a0',
    fontWeight: 'bold',
    letterSpacing: '0.08em',
    cursor: 'pointer',
    fontFamily: 'monospace',
  },
  unreadyButton: {
    width: '100%',
    border: '1px solid rgba(255, 171, 77, 0.45)',
    borderRadius: 8,
    padding: '12px 16px',
    backgroundColor: 'rgba(255, 171, 77, 0.18)',
    color: '#ffc47e',
    fontWeight: 'bold',
    letterSpacing: '0.08em',
    cursor: 'pointer',
    fontFamily: 'monospace',
  },
  emptyRoster: {
    color: '#8891aa',
    fontSize: 12,
    marginTop: 4,
  },
}
