import { describe, expect, test } from 'bun:test'
import {
  MULTIPLAYER_PRESENTATION_POLICY,
  SINGLEPLAYER_PRESENTATION_POLICY,
} from './PresentationPolicy'
import { createSceneDebugHotkeyHandler } from './SceneDebugHotkeys'

describe('SceneDebugHotkeys', () => {
  test('singleplayer policy enables overlay + collision + spawn-pause handlers', () => {
    let overlayToggles = 0
    let collisionToggles = 0
    let spawnPauseToggles = 0

    const handler = createSceneDebugHotkeyHandler(
      SINGLEPLAYER_PRESENTATION_POLICY.debugHotkeys,
      {
        toggleDebugOverlay: () => { overlayToggles++ },
        toggleCollisionDebugOverlay: () => { collisionToggles++ },
        toggleSpawnPause: () => { spawnPauseToggles++ },
      },
    )

    handler({ code: 'Backquote' } as KeyboardEvent)
    handler({ code: 'KeyP' } as KeyboardEvent)

    expect(overlayToggles).toBe(1)
    expect(collisionToggles).toBe(1)
    expect(spawnPauseToggles).toBe(1)
  })

  test('multiplayer policy enables overlay only', () => {
    let overlayToggles = 0
    let spawnPauseToggles = 0

    const handler = createSceneDebugHotkeyHandler(
      MULTIPLAYER_PRESENTATION_POLICY.debugHotkeys,
      {
        toggleDebugOverlay: () => { overlayToggles++ },
        toggleSpawnPause: () => { spawnPauseToggles++ },
      },
    )

    handler({ code: 'Backquote' } as KeyboardEvent)
    handler({ code: 'KeyP' } as KeyboardEvent)

    expect(overlayToggles).toBe(1)
    expect(spawnPauseToggles).toBe(0)
  })
})
