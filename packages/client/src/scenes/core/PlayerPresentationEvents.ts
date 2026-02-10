import type { InputState } from '@high-noon/shared'
import type { GameplayEventBuffer } from './GameplayEvents'
import type { PlayerHitPresentationPolicy } from './PresentationPolicy'
import {
  didCompleteReload,
  didFireRound,
  didStartReload,
  shouldTriggerDryFire,
} from './feedbackSignals'

export interface EmitCylinderPresentationEventsArgs {
  events: GameplayEventBuffer
  actorEid: number
  prevRounds: number
  newRounds: number
  prevReloading: number
  nowReloading: number
  inputState: InputState
  dryFireCooldown: number
  dryFireCooldownSeconds: number
  aimAngle: number
  muzzleX: number
  muzzleY: number
  fireTrauma: number
  fireKickStrength: number
}

export interface EmitShowdownCueFlags {
  showdownActivatedThisTick: boolean
  showdownKillThisTick: boolean
  showdownExpiredThisTick: boolean
}

export function emitPlayerHitEvent(
  events: GameplayEventBuffer,
  policy: PlayerHitPresentationPolicy,
  kickX: number,
  kickY: number,
): void {
  const hasKick = kickX !== 0 || kickY !== 0
  events.push({
    type: 'player-hit',
    trauma: policy.trauma,
    simHitStopSeconds: policy.simHitStopSeconds,
    renderPauseSeconds: policy.renderPauseSeconds,
    kickX,
    kickY,
    kickStrength: hasKick ? policy.directionalKickStrength : 0,
  })
}

export function emitCylinderPresentationEvents(args: EmitCylinderPresentationEventsArgs): number {
  if (didFireRound(args.prevRounds, args.newRounds)) {
    args.events.push({
      type: 'player-fire',
      eid: args.actorEid,
      angle: args.aimAngle,
      muzzleX: args.muzzleX,
      muzzleY: args.muzzleY,
      trauma: args.fireTrauma,
      kickStrength: args.fireKickStrength,
    })
  }

  if (didStartReload(args.prevReloading, args.nowReloading)) {
    args.events.push({ type: 'reload-start' })
  } else if (didCompleteReload(args.prevReloading, args.nowReloading)) {
    args.events.push({ type: 'reload-complete' })
  }

  if (shouldTriggerDryFire(
    args.newRounds,
    args.nowReloading,
    args.inputState,
    args.dryFireCooldown,
  )) {
    args.events.push({ type: 'dry-fire' })
    return args.dryFireCooldownSeconds
  }

  return args.dryFireCooldown
}

export function emitShowdownCueEvents(events: GameplayEventBuffer, flags: EmitShowdownCueFlags): void {
  if (flags.showdownActivatedThisTick) events.push({ type: 'showdown-activate' })
  if (flags.showdownKillThisTick) events.push({ type: 'showdown-kill' })
  if (flags.showdownExpiredThisTick) events.push({ type: 'showdown-expire' })
}
