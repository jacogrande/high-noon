import type { HUDState } from '../types'

type RunIntroHUDSnapshot = Pick<
  HUDState,
  'runIntroSequence' | 'runIntroText' | 'runIntroTitle' | 'narrativeThreadName'
>

export interface RunIntroOverlayState {
  title: string
  text: string
}

export interface RunIntroUpdate {
  runIntro: RunIntroOverlayState | null
  nextLastSeenSequence: number
}

export interface MultiplayerRunIntroUpdate extends RunIntroUpdate {
  nextSawPrePlayingLobby: boolean
}

const DEFAULT_RUN_INTRO_TITLE = 'A New Tale'

function resolveRunIntroContent(hud: RunIntroHUDSnapshot, text: string): RunIntroOverlayState {
  return {
    title: hud.runIntroTitle ?? hud.narrativeThreadName ?? DEFAULT_RUN_INTRO_TITLE,
    text,
  }
}

function getBaseRunIntroUpdate(
  hud: RunIntroHUDSnapshot,
  lastSeenSequence: number,
): RunIntroUpdate {
  if (hud.runIntroSequence <= lastSeenSequence || !hud.runIntroText) {
    return {
      runIntro: null,
      nextLastSeenSequence: lastSeenSequence,
    }
  }

  return {
    runIntro: resolveRunIntroContent(hud, hud.runIntroText),
    nextLastSeenSequence: hud.runIntroSequence,
  }
}

export function getSingleplayerRunIntroUpdate(
  hud: RunIntroHUDSnapshot,
  lastSeenSequence: number,
): RunIntroUpdate {
  return getBaseRunIntroUpdate(hud, lastSeenSequence)
}

export function getMultiplayerRunIntroUpdate(
  hud: RunIntroHUDSnapshot,
  lastSeenSequence: number,
  sawPrePlayingLobby: boolean,
): MultiplayerRunIntroUpdate {
  const base = getBaseRunIntroUpdate(hud, lastSeenSequence)
  if (!base.runIntro) {
    return {
      ...base,
      nextSawPrePlayingLobby: sawPrePlayingLobby,
    }
  }

  const isFirstSeenSequence = lastSeenSequence === 0
  const suppressFirstSeen = isFirstSeenSequence && !sawPrePlayingLobby
  return {
    runIntro: suppressFirstSeen ? null : base.runIntro,
    nextLastSeenSequence: base.nextLastSeenSequence,
    nextSawPrePlayingLobby: sawPrePlayingLobby || isFirstSeenSequence,
  }
}
