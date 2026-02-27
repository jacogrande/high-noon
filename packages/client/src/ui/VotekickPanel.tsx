import { useState, useEffect } from 'react'
import type { VotekickVoteMessage } from '@high-noon/shared'

interface Props {
  vote: VotekickVoteMessage
  localSessionId: string
  onCast: (voteId: string, approve: boolean) => void
}

export function VotekickPanel({ vote, localSessionId, onCast }: Props) {
  const [timeLeft, setTimeLeft] = useState(vote.expiresInS)
  const [voted, setVoted] = useState(false)
  const isTarget = localSessionId === vote.targetSessionId

  useEffect(() => {
    setTimeLeft(vote.expiresInS)
    setVoted(false)
    const interval = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [vote.voteId, vote.expiresInS])

  const handleVote = (approve: boolean) => {
    if (voted || isTarget) return
    setVoted(true)
    onCast(vote.voteId, approve)
  }

  return (
    <div style={styles.container}>
      <div style={styles.title}>VOTE KICK</div>
      <div style={styles.info}>
        <span style={styles.name}>{vote.initiatorName}</span>
        {' wants to kick '}
        <span style={styles.name}>{vote.targetName}</span>
      </div>
      <div style={styles.timer}>{timeLeft}s</div>
      {isTarget ? (
        <div style={styles.targetMsg}>You are the target of this vote</div>
      ) : voted ? (
        <div style={styles.votedMsg}>Vote cast</div>
      ) : (
        <div style={styles.buttons}>
          <button style={styles.yesButton} onClick={() => handleVote(true)}>KICK</button>
          <button style={styles.noButton} onClick={() => handleVote(false)}>KEEP</button>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    top: 40,
    right: 16,
    backgroundColor: 'rgba(10, 10, 18, 0.92)',
    border: '1px solid rgba(204, 150, 0, 0.5)',
    borderRadius: 4,
    padding: '0.75rem 1rem',
    fontFamily: 'monospace',
    color: '#ffffff',
    zIndex: 92,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    minWidth: 200,
    boxShadow: '0 0 20px rgba(0, 0, 0, 0.5)',
  },
  title: {
    fontSize: '0.8rem',
    fontWeight: 'bold',
    letterSpacing: '0.15em',
    color: '#ffcc00',
    textAlign: 'center',
  },
  info: {
    fontSize: '0.75rem',
    color: '#ccc',
    textAlign: 'center',
  },
  name: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  timer: {
    fontSize: '0.9rem',
    fontWeight: 'bold',
    color: '#ff8800',
    textAlign: 'center',
  },
  targetMsg: {
    fontSize: '0.7rem',
    color: '#ff6666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  votedMsg: {
    fontSize: '0.7rem',
    color: '#88aa88',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  buttons: {
    display: 'flex',
    gap: '0.5rem',
    justifyContent: 'center',
  },
  yesButton: {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    fontWeight: 'bold',
    letterSpacing: '0.1em',
    color: '#ff4422',
    backgroundColor: 'rgba(255, 68, 34, 0.15)',
    border: '1px solid rgba(255, 68, 34, 0.4)',
    borderRadius: 3,
    padding: '0.35rem 0.75rem',
    cursor: 'pointer',
  },
  noButton: {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    fontWeight: 'bold',
    letterSpacing: '0.1em',
    color: '#88cc88',
    backgroundColor: 'rgba(100, 200, 100, 0.1)',
    border: '1px solid rgba(100, 200, 100, 0.3)',
    borderRadius: 3,
    padding: '0.35rem 0.75rem',
    cursor: 'pointer',
  },
}
