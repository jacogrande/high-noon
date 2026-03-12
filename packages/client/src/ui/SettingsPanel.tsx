import { useState } from 'react'

interface SettingsPanelProps {
  volume: number
  muted: boolean
  onVolumeChange: (v: number) => void
  onMutedChange: (m: boolean) => void
  analyticsEnabled: boolean
  onAnalyticsChange: (enabled: boolean) => void
}

export function SettingsPanel({
  volume,
  muted,
  onVolumeChange,
  onMutedChange,
  analyticsEnabled,
  onAnalyticsChange,
}: SettingsPanelProps) {
  const [muteHover, setMuteHover] = useState(false)
  const [analyticsHover, setAnalyticsHover] = useState(false)

  return (
    <div style={styles.section}>
      <div style={styles.sliderRow}>
        <span style={styles.sliderLabel}>VOLUME</span>
        <input
          type="range"
          min={0}
          max={100}
          value={muted ? 0 : volume}
          onChange={(e) => {
            const v = Number(e.target.value)
            onVolumeChange(v)
            if (muted && v > 0) onMutedChange(false)
          }}
          style={styles.slider}
        />
        <span style={styles.sliderValue}>{muted ? '0' : Math.round(volume)}%</span>
      </div>

      <button
        style={{
          ...styles.muteButton,
          backgroundColor: muteHover
            ? 'rgba(255, 255, 255, 0.15)'
            : 'rgba(255, 255, 255, 0.06)',
          color: muted ? '#ff6644' : '#aaaaaa',
        }}
        onMouseEnter={() => setMuteHover(true)}
        onMouseLeave={() => setMuteHover(false)}
        onClick={() => onMutedChange(!muted)}
      >
        {muted ? 'UNMUTE' : 'MUTE'}
      </button>

      <div style={styles.toggleRow}>
        <span style={styles.sliderLabel}>ANALYTICS</span>
        <button
          style={{
            ...styles.toggleButton,
            backgroundColor: analyticsHover
              ? 'rgba(255, 255, 255, 0.15)'
              : 'rgba(255, 255, 255, 0.06)',
            color: analyticsEnabled ? '#88cc66' : '#888',
          }}
          onMouseEnter={() => setAnalyticsHover(true)}
          onMouseLeave={() => setAnalyticsHover(false)}
          onClick={() => onAnalyticsChange(!analyticsEnabled)}
        >
          {analyticsEnabled ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    width: '100%',
  },
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    width: '100%',
  },
  sliderLabel: {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    color: '#888',
    letterSpacing: '0.1em',
    minWidth: '55px',
  },
  slider: {
    flex: 1,
    height: '4px',
    cursor: 'pointer',
    accentColor: '#ffcc00',
  },
  sliderValue: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    color: '#ccc',
    minWidth: '38px',
    textAlign: 'right',
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    width: '100%',
  },
  toggleButton: {
    fontFamily: 'monospace',
    fontSize: '0.7rem',
    letterSpacing: '0.1em',
    padding: '0.35rem 1rem',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '3px',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    flex: 1,
  },
  muteButton: {
    fontFamily: 'monospace',
    fontSize: '0.7rem',
    letterSpacing: '0.1em',
    padding: '0.35rem 1rem',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '3px',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
}
