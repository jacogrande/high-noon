import { createContext, useCallback, useContext } from 'react'
import type { SoundManager } from './SoundManager'

export const GameAudioContext = createContext<SoundManager | null>(null)

export function useGameAudio() {
  const sound = useContext(GameAudioContext)
  const playClick = useCallback(() => sound?.play('ui_click'), [sound])
  const playHover = useCallback(() => sound?.play('ui_hover'), [sound])
  return { playClick, playHover }
}
