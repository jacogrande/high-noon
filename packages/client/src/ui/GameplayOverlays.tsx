import { BossIntroOverlay } from './BossIntroOverlay'
import { RunIntroCrawlOverlay } from './RunIntroCrawlOverlay'

export interface GameplayRunIntroState {
  title: string
  text: string
}

export interface GameplayBossIntroState {
  bossName: string
  taunt: string
}

interface GameplayOverlaysProps {
  runIntro: GameplayRunIntroState | null
  bossIntro: GameplayBossIntroState | null
  onRunIntroComplete: () => void
  onBossIntroComplete: () => void
}

export function GameplayOverlays({
  runIntro,
  bossIntro,
  onRunIntroComplete,
  onBossIntroComplete,
}: GameplayOverlaysProps) {
  return (
    <>
      {runIntro && (
        <RunIntroCrawlOverlay
          title={runIntro.title}
          text={runIntro.text}
          onComplete={onRunIntroComplete}
        />
      )}
      {bossIntro && (
        <BossIntroOverlay
          bossName={bossIntro.bossName}
          taunt={bossIntro.taunt}
          onComplete={onBossIntroComplete}
        />
      )}
    </>
  )
}
