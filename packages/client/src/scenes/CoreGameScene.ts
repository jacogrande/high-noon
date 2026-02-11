import type { GameApp } from '../engine/GameApp'
import type { CharacterId } from '@high-noon/shared'
import type { HUDState, SkillTreeUIData } from './types'
import type { SceneModeController } from './core/SceneModeController'
import { SingleplayerModeController } from './core/SingleplayerModeController'
import { MultiplayerModeController } from './core/MultiplayerModeController'

export type CoreSceneMode = 'singleplayer' | 'multiplayer'

export interface CoreGameSceneConfig {
  gameApp: GameApp
  mode: CoreSceneMode
  characterId?: CharacterId
  networkOptions?: Record<string, unknown>
}

export class CoreGameScene {
  private readonly controller: SceneModeController

  private constructor(controller: SceneModeController) {
    this.controller = controller
  }

  static async create(config: CoreGameSceneConfig): Promise<CoreGameScene> {
    const controller: SceneModeController = config.mode === 'singleplayer'
      ? new SingleplayerModeController(config.gameApp, config.characterId ?? 'sheriff')
      : new MultiplayerModeController(config.gameApp, config.characterId ?? 'sheriff')

    try {
      await controller.initialize(config.networkOptions)
    } catch (err) {
      controller.destroy()
      throw err
    }
    return new CoreGameScene(controller)
  }

  update(dt: number): void {
    this.controller.update(dt)
  }

  render(alpha: number, fps: number): void {
    this.controller.render(alpha, fps)
  }

  getHUDState(): HUDState {
    return this.controller.getHUDState()
  }

  hasPendingPoints(): boolean {
    return this.controller.hasPendingPoints()
  }

  getSkillTreeData(): SkillTreeUIData | null {
    return this.controller.getSkillTreeData()
  }

  selectNode(nodeId: string): boolean {
    return this.controller.selectNode(nodeId)
  }

  completeCamp(): void {
    this.controller.completeCamp()
  }

  setWorldVisible(visible: boolean): void {
    this.controller.setWorldVisible(visible)
  }

  isDisconnected(): boolean {
    return this.controller.isDisconnected()
  }

  destroy(): void {
    this.controller.destroy()
  }
}
