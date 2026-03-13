import {
  MeleeWeapon,
  PICKAXE_CHARGE_ARC,
  Position,
  getBoss,
  getThread,
  type GameWorld,
  type InputState,
} from '@high-noon/shared'
import type { GameplayEventBuffer } from './GameplayEvents'
import type { PlayerHitPresentationPolicy } from './PresentationPolicy'
import type { EnemyRenderer } from '../../render/EnemyRenderer'
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
  fireSlowdownMs?: number
}

export interface EmitShowdownCueFlags {
  showdownActivatedThisTick: boolean
  showdownKillThisTick: boolean
  showdownExpiredThisTick: boolean
}

export interface EmitBossIntroEventsArgs {
  events: GameplayEventBuffer
  enemyRenderer: EnemyRenderer
  narrativeThreadId: string | null
}

/**
 * Compute camera trauma from a proportional damage fraction.
 * Scales linearly (0.8×) and caps at 0.5 to prevent full-screen shakes.
 */
export function computeHitTrauma(damageFraction: number): number {
  return Math.min(damageFraction * 0.8, 0.5)
}

export function emitPlayerHitEvent(
  events: GameplayEventBuffer,
  policy: PlayerHitPresentationPolicy,
  kickX: number,
  kickY: number,
  damageFraction?: number,
): void {
  const hasKick = kickX !== 0 || kickY !== 0
  const trauma = damageFraction !== undefined
    ? computeHitTrauma(damageFraction)
    : policy.trauma
  events.push({
    type: 'player-hit',
    trauma,
    simHitStopSeconds: policy.simHitStopSeconds,
    renderPauseSeconds: policy.renderPauseSeconds,
    kickX,
    kickY,
    kickStrength: hasKick ? policy.directionalKickStrength : 0,
  })
}

export function emitCylinderPresentationEvents(args: EmitCylinderPresentationEventsArgs): number {
  if (didFireRound(args.prevRounds, args.newRounds)) {
    const fireEvent: Parameters<GameplayEventBuffer['push']>[0] = {
      type: 'player-fire',
      eid: args.actorEid,
      angle: args.aimAngle,
      muzzleX: args.muzzleX,
      muzzleY: args.muzzleY,
      trauma: args.fireTrauma,
      kickStrength: args.fireKickStrength,
    }
    if (args.fireSlowdownMs !== undefined) {
      fireEvent.fireSlowdownMs = args.fireSlowdownMs
    }
    args.events.push(fireEvent)
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

export function emitBossIntroEvents(args: EmitBossIntroEventsArgs): void {
  const pending = args.enemyRenderer.consumePendingBossIntro()
  if (!pending) return

  const bossName = getBoss(pending.type)?.displayName ?? 'BOSS'
  const taunt = args.narrativeThreadId
    ? (getThread(args.narrativeThreadId)?.bossTaunts[pending.type] ?? '')
    : ''

  args.events.push({
    type: 'boss-intro',
    bossName,
    taunt,
    x: pending.x,
    y: pending.y,
  })
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

/**
 * Emit trap detonation presentation cues from world state.
 */
export function emitTrapDetonationEvents(events: GameplayEventBuffer, world: GameWorld): void {
  for (const det of world.trapDetonations) {
    events.push({
      type: 'trap-detonation',
      kind: det.kind,
      x: det.x,
      y: det.y,
      radius: det.radius,
    })
  }
}

/**
 * Emit boss phase transition presentation cues from world state.
 */
export function emitBossPhaseTransitionEvents(events: GameplayEventBuffer, world: GameWorld): void {
  for (const pt of world.bossPhaseChanges) {
    events.push({
      type: 'boss-phase-transition',
      x: pt.x,
      y: pt.y,
      newPhase: pt.newPhase,
    })
  }
}

/**
 * Emit Prospector melee swing presentation cues.
 */
export function emitMeleeSwingEvents(
  events: GameplayEventBuffer,
  world: GameWorld,
  playerEid: number | null,
): void {
  if (playerEid === null || MeleeWeapon.swungThisTick[playerEid] !== 1) return

  const state = world.playerUpgradeStates.get(playerEid) ?? world.upgradeState
  const charged = MeleeWeapon.wasChargedSwing[playerEid] === 1
  const angle = MeleeWeapon.swingAngle[playerEid]!

  events.push({
    type: 'player-melee-swing',
    eid: playerEid,
    x: Position.x[playerEid]!,
    y: Position.y[playerEid]!,
    angle,
    arcHalf: charged ? PICKAXE_CHARGE_ARC / 2 : state.cleaveArc / 2,
    reach: state.reach,
    charged,
    trauma: charged ? 0.2 : 0.1,
    kickStrength: charged ? 6 : 3,
  })
}
