import type { DebugHotkeysPolicy } from './PresentationPolicy'

export interface SceneDebugHotkeyActions {
  toggleDebugOverlay: () => void
  toggleCollisionDebugOverlay?: () => void
  toggleSpawnPause?: () => void
}

export function createSceneDebugHotkeyHandler(
  policy: DebugHotkeysPolicy,
  actions: SceneDebugHotkeyActions,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (policy.enableOverlayToggle && e.code === 'Backquote') {
      actions.toggleDebugOverlay()
      actions.toggleCollisionDebugOverlay?.()
    }

    if (policy.enableSpawnPauseToggle && e.code === 'KeyP') {
      actions.toggleSpawnPause?.()
    }
  }
}
