import type { SoundManager } from '../../audio/SoundManager'
import type { HUDState, SkillTreeUIData } from '../types'

export interface SceneModeController {
  initialize(options?: Record<string, unknown>): Promise<void>
  update(dt: number): void
  render(alpha: number, fps: number): void
  getHUDState(): HUDState
  consumePendingBossIntro(): { bossName: string; taunt: string } | null
  hasPendingPoints(): boolean
  getSkillTreeData(): SkillTreeUIData | null
  selectNode(nodeId: string): boolean
  completeCamp(): void
  handleVisitorPurchase?(offerIndex: number): boolean
  handleTinkererModSelect?(offerIndex: number): boolean
  handleDraftPick?(poolIndex: number): boolean
  setWorldVisible(visible: boolean): void
  isDisconnected(): boolean
  setPaused(paused: boolean): void
  isPaused(): boolean
  getSoundManager(): SoundManager
  destroy(): void
}
