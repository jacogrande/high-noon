import type { HUDState, SkillTreeUIData } from '../types'

export interface SceneModeController {
  initialize(options?: Record<string, unknown>): Promise<void>
  update(dt: number): void
  render(alpha: number, fps: number): void
  getHUDState(): HUDState
  hasPendingPoints(): boolean
  getSkillTreeData(): SkillTreeUIData | null
  selectNode(nodeId: string): boolean
  completeCamp(): void
  handleVisitorPurchase?(offerIndex: number): boolean
  setWorldVisible(visible: boolean): void
  isDisconnected(): boolean
  destroy(): void
}
