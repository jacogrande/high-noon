import { Button, hasButton, type InputState } from '@high-noon/shared'

export function didTakeDamageFromIframes(prevIframes: number, nextIframes: number): boolean {
  return prevIframes === 0 && nextIframes > 0
}

export function didTakeDamageFromHp(prevHp: number, nextHp: number): boolean {
  return prevHp >= 0 && nextHp < prevHp
}

export function didFireRound(prevRounds: number, nextRounds: number): boolean {
  return prevRounds >= 0 && nextRounds >= 0 && nextRounds < prevRounds
}

export function didStartReload(prevReloading: number, nextReloading: number): boolean {
  return prevReloading === 0 && nextReloading === 1
}

export function didCompleteReload(prevReloading: number, nextReloading: number): boolean {
  return prevReloading === 1 && nextReloading === 0
}

export function shouldTriggerDryFire(
  rounds: number,
  reloading: number,
  input: InputState,
  cooldownSeconds: number
): boolean {
  return rounds === 0
    && hasButton(input, Button.SHOOT)
    && reloading === 0
    && cooldownSeconds <= 0
}
