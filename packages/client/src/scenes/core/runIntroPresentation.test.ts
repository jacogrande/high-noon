import { describe, expect, test } from 'bun:test'
import type { HUDState } from '../types'
import {
  getMultiplayerRunIntroUpdate,
  getSingleplayerRunIntroUpdate,
} from './runIntroPresentation'

function makeHudState(overrides: Partial<HUDState>): HUDState {
  return {
    characterId: 'sheriff',
    hp: 10,
    maxHP: 10,
    hpPotions: 0,
    hpPotionsMax: 6,
    xp: 0,
    goldCollected: 0,
    killCount: 0,
    shovelCount: 0,
    interactionPrompt: null,
    xpForCurrentLevel: 0,
    xpForNextLevel: 10,
    level: 1,
    waveNumber: 0,
    totalWaves: 0,
    waveStatus: 'none',
    stageNumber: 0,
    totalStages: 0,
    stageStatus: 'none',
    narrativeThreadId: null,
    narrativeThreadName: null,
    campNarrativeLine: null,
    resolutionText: null,
    runIntroTitle: null,
    runIntroText: null,
    runIntroSequence: 0,
    cylinderRounds: 0,
    cylinderMax: 0,
    isReloading: false,
    reloadProgress: 0,
    showCylinder: false,
    abilityName: '',
    abilityActive: false,
    abilityCooldown: 0,
    abilityCooldownMax: 0,
    abilityTimeLeft: 0,
    abilityDurationMax: 0,
    showdownActive: false,
    showdownCooldown: 0,
    showdownCooldownMax: 0,
    showdownTimeLeft: 0,
    showdownDurationMax: 0,
    pendingPoints: 0,
    isDead: false,
    items: [],
    minimap: null,
    objective: null,
    campVisitor: null,
    boss: null,
    ...overrides,
  }
}

describe('runIntroPresentation', () => {
  test('singleplayer returns crawl payload for new sequence', () => {
    const hud = makeHudState({
      runIntroSequence: 1,
      runIntroTitle: 'Thread Name',
      runIntroText: 'Opening crawl',
    })

    const update = getSingleplayerRunIntroUpdate(hud, 0)
    expect(update.nextLastSeenSequence).toBe(1)
    expect(update.runIntro).toEqual({
      title: 'Thread Name',
      text: 'Opening crawl',
    })
  })

  test('singleplayer falls back to narrative name then default title', () => {
    const withThreadName = makeHudState({
      runIntroSequence: 1,
      runIntroTitle: null,
      narrativeThreadName: 'Raid',
      runIntroText: 'Crawl text',
    })
    expect(getSingleplayerRunIntroUpdate(withThreadName, 0).runIntro?.title).toBe('Raid')

    const withNoName = makeHudState({
      runIntroSequence: 1,
      runIntroTitle: null,
      narrativeThreadName: null,
      runIntroText: 'Crawl text',
    })
    expect(getSingleplayerRunIntroUpdate(withNoName, 0).runIntro?.title).toBe('A New Tale')
  })

  test('singleplayer ignores repeated sequence and missing crawl text', () => {
    const repeated = makeHudState({
      runIntroSequence: 2,
      runIntroText: 'Crawl text',
    })
    expect(getSingleplayerRunIntroUpdate(repeated, 2)).toEqual({
      runIntro: null,
      nextLastSeenSequence: 2,
    })

    const missingText = makeHudState({
      runIntroSequence: 3,
      runIntroText: null,
    })
    expect(getSingleplayerRunIntroUpdate(missingText, 2)).toEqual({
      runIntro: null,
      nextLastSeenSequence: 2,
    })
  })

  test('multiplayer suppresses first seen crawl when lobby pre-state was not observed', () => {
    const hud = makeHudState({
      runIntroSequence: 4,
      runIntroText: 'Crawl text',
    })
    const update = getMultiplayerRunIntroUpdate(hud, 0, false)
    expect(update.runIntro).toBeNull()
    expect(update.nextLastSeenSequence).toBe(4)
    expect(update.nextSawPrePlayingLobby).toBe(true)
  })

  test('multiplayer shows first seen crawl after observing pre-playing lobby', () => {
    const hud = makeHudState({
      runIntroSequence: 4,
      runIntroText: 'Crawl text',
    })
    const update = getMultiplayerRunIntroUpdate(hud, 0, true)
    expect(update.runIntro).toEqual({
      title: 'A New Tale',
      text: 'Crawl text',
    })
    expect(update.nextLastSeenSequence).toBe(4)
    expect(update.nextSawPrePlayingLobby).toBe(true)
  })
})
