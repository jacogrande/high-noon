import type { DebugHotkeysPolicy } from './PresentationPolicy'

export interface SceneDebugHotkeyActions {
  toggleDebugOverlay: () => void
  toggleCollisionDebugOverlay?: () => void
  toggleSpawnPause?: () => void
  cycleNetOverlay?: () => void
  recordLagReport?: () => void
  exportReplay?: () => void
  // Individual debug overlay layers (Digit1-3)
  toggleColliderOverlay?: () => void
  toggleAIRangeOverlay?: () => void
  toggleSpawnZoneOverlay?: () => void
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

    if (policy.enableNetOverlay && e.code === 'KeyN') {
      actions.cycleNetOverlay?.()
    }

    if (policy.enableNetOverlay && e.code === 'KeyL') {
      actions.recordLagReport?.()
    }

    if (policy.enableNetOverlay && e.code === 'KeyR' && e.shiftKey) {
      actions.exportReplay?.()
    }

    if (policy.enableOverlayToggle && e.code === 'Digit1') {
      actions.toggleColliderOverlay?.()
    }
    if (policy.enableOverlayToggle && e.code === 'Digit2') {
      actions.toggleAIRangeOverlay?.()
    }
    if (policy.enableOverlayToggle && e.code === 'Digit3') {
      actions.toggleSpawnZoneOverlay?.()
    }
  }
}
