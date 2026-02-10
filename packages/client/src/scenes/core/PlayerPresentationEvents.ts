import { Position, type GameWorld, type InputState } from '@high-noon/shared'
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

/**
 * Emit Last Rites ability cues (Undertaker) from per-tick world flags.
 */
export function emitLastRitesCueEvents(events: GameplayEventBuffer, world: GameWorld): void {
  if (world.lastRitesActivatedThisTick) {
    events.push({ type: 'last-rites-activate' })
  }
  if (world.lastRitesPulseThisTick && world.lastRites?.active) {
    events.push({
      type: 'last-rites-pulse',
      x: world.lastRites.x,
      y: world.lastRites.y,
      radius: world.lastRites.radius,
    })
  }
  if (world.lastRitesExpiredThisTick) {
    events.push({ type: 'last-rites-expire' })
  }
}

/**
 * Emit Prospector dynamite presentation cues from world state.
 */
export function emitDynamiteCueEvents(
  events: GameplayEventBuffer,
  world: GameWorld,
  playerEid: number | null,
): void {
  if (world.dynamiteDetonatedThisTick) {
    for (const det of world.dynamiteDetonations) {
      events.push({ type: 'dynamite-detonation', x: det.x, y: det.y, radius: det.radius })
    }
  }

  if (playerEid === null) return
  const state = world.playerUpgradeStates.get(playerEid) ?? world.upgradeState
  if (!state.dynamiteCooking || state.dynamiteFuse <= 0) return

  events.push({
    type: 'dynamite-fuse-sparks',
    x: Position.x[playerEid]!,
    y: Position.y[playerEid]!,
    intensity: Math.min(state.dynamiteCookTimer / state.dynamiteFuse, 1),
  })
}
