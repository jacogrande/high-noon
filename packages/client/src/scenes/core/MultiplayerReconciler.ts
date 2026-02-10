import { addComponent, hasComponent, removeComponent } from 'bitecs'
import {
  Cylinder,
  Health,
  Player,
  PlayerState,
  PlayerStateType,
  Position,
  Roll,
  Showdown,
  Velocity,
  PLAYER_IFRAME_DURATION,
  type GameWorld,
  type WorldSnapshot,
} from '@high-noon/shared'
import type { InputBuffer } from '../../net/InputBuffer'
import type { LocalPlayerSimulationDriver } from './SimulationDriver'
import type { PlayerHitPresentationPolicy } from './PresentationPolicy'
import type { IGameplayEventSink, ILocalIdentityState, ISimStateSource } from './SceneRuntimeContracts'

export interface ReconcileContext extends ISimStateSource, ILocalIdentityState {
  inputBuffer: InputBuffer
  replayDriver: LocalPlayerSimulationDriver
  gameplayEventSink: IGameplayEventSink
  hitPolicy: PlayerHitPresentationPolicy
}

export interface ReconcileTelemetrySample {
  hadCorrection: boolean
  correctionErrorMagnitude: number
  snapped: boolean
}

export class MultiplayerReconciler {
  private prevHP = -1
  private errorX = 0
  private errorY = 0

  getError(): { x: number; y: number } {
    return { x: this.errorX, y: this.errorY }
  }

  decayError(rawDt: number, correctionSpeed: number): void {
    if (this.errorX !== 0 || this.errorY !== 0) {
      const smoothDt = Math.min(rawDt, 0.1)
      const factor = 1 - Math.exp(-correctionSpeed * smoothDt)
      this.errorX *= (1 - factor)
      this.errorY *= (1 - factor)
      if (Math.abs(this.errorX) < 0.1) this.errorX = 0
      if (Math.abs(this.errorY) < 0.1) this.errorY = 0
    }
  }

  reconcile(snapshot: WorldSnapshot, ctx: ReconcileContext, epsilon: number, snapThreshold: number): ReconcileTelemetrySample {
    const serverPlayer = snapshot.players.find(p => p.eid === ctx.myServerEid)
    if (!serverPlayer) {
      return { hadCorrection: false, correctionErrorMagnitude: 0, snapped: false }
    }

    // Detect damage for camera shake + sound.
    if (this.prevHP > 0 && serverPlayer.hp < this.prevHP) {
      ctx.gameplayEventSink.pushGameplayEvent({
        type: 'player-hit',
        trauma: ctx.hitPolicy.trauma,
        simHitStopSeconds: ctx.hitPolicy.simHitStopSeconds,
        renderPauseSeconds: ctx.hitPolicy.renderPauseSeconds,
        kickX: 0,
        kickY: 0,
        kickStrength: 0,
      })
      const duration = Health.iframeDuration[ctx.myClientEid]!
      Health.iframes[ctx.myClientEid] = duration > 0 ? duration : PLAYER_IFRAME_DURATION
    }
    this.prevHP = serverPlayer.hp

    // Save current predicted position.
    const oldPredX = Position.x[ctx.myClientEid]!
    const oldPredY = Position.y[ctx.myClientEid]!

    // Rewind — accept server's authoritative state.
    Position.x[ctx.myClientEid] = serverPlayer.x
    Position.y[ctx.myClientEid] = serverPlayer.y
    Position.prevX[ctx.myClientEid] = serverPlayer.x
    Position.prevY[ctx.myClientEid] = serverPlayer.y
    Velocity.x[ctx.myClientEid] = 0
    Velocity.y[ctx.myClientEid] = 0
    PlayerState.state[ctx.myClientEid] = serverPlayer.state

    // Handle Roll component based on server state.
    const serverRolling = serverPlayer.state === PlayerStateType.ROLLING
    const hasLocalRoll = hasComponent(ctx.world, Roll, ctx.myClientEid)
    if (!serverRolling) {
      if (hasLocalRoll) {
        removeComponent(ctx.world, Roll, ctx.myClientEid)
      }
      ctx.world.rollDodgedBullets.delete(ctx.myClientEid)
    } else {
      if (!hasLocalRoll) {
        addComponent(ctx.world, Roll, ctx.myClientEid)
      }

      const durationS = Math.max(0, serverPlayer.rollDurationMs / 1000)
      const elapsedS = Math.max(0, Math.min(durationS, serverPlayer.rollElapsedMs / 1000))
      let dirX = serverPlayer.rollDirX
      let dirY = serverPlayer.rollDirY
      const len = Math.hypot(dirX, dirY)
      if (len > 1e-6) {
        dirX /= len
        dirY /= len
      } else {
        const a = Player.aimAngle[ctx.myClientEid]!
        dirX = Math.cos(a)
        dirY = Math.sin(a)
      }

      Roll.duration[ctx.myClientEid] = durationS
      Roll.elapsed[ctx.myClientEid] = elapsedS
      Roll.iframeRatio[ctx.myClientEid] = ctx.world.upgradeState.rollIframeRatio
      Roll.speedMultiplier[ctx.myClientEid] = ctx.world.upgradeState.rollSpeedMultiplier
      Roll.directionX[ctx.myClientEid] = dirX
      Roll.directionY[ctx.myClientEid] = dirY
      ctx.world.rollDodgedBullets.delete(ctx.myClientEid)
    }

    // Use authoritative roll edge-state from snapshot flags.
    Player.rollButtonWasDown[ctx.myClientEid] = (serverPlayer.flags & 4) !== 0 ? 1 : 0

    // Save state excluded from replay systems.
    const savedFireCooldown = Cylinder.fireCooldown[ctx.myClientEid]!
    const savedShootWasDown = Player.shootWasDown[ctx.myClientEid]!
    const savedShowdownActive = Showdown.active[ctx.myClientEid]!
    const savedShowdownTargetEid = Showdown.targetEid[ctx.myClientEid]!
    const savedShowdownDuration = Showdown.duration[ctx.myClientEid]!
    const savedShowdownCooldown = Showdown.cooldown[ctx.myClientEid]!
    const savedAbilityWasDown = Player.abilityWasDown[ctx.myClientEid]!

    ctx.inputBuffer.acknowledgeUpTo(serverPlayer.lastProcessedSeq)
    const pending = ctx.inputBuffer.getPending()
    ctx.replayDriver.replay(ctx.myClientEid, pending)

    // Restore state excluded from replay systems.
    Cylinder.fireCooldown[ctx.myClientEid] = savedFireCooldown
    Player.shootWasDown[ctx.myClientEid] = savedShootWasDown
    Showdown.active[ctx.myClientEid] = savedShowdownActive
    Showdown.targetEid[ctx.myClientEid] = savedShowdownTargetEid
    Showdown.duration[ctx.myClientEid] = savedShowdownDuration
    Showdown.cooldown[ctx.myClientEid] = savedShowdownCooldown
    Player.abilityWasDown[ctx.myClientEid] = savedAbilityWasDown

    const newPredX = Position.x[ctx.myClientEid]!
    const newPredY = Position.y[ctx.myClientEid]!
    const dx = oldPredX - newPredX
    const dy = oldPredY - newPredY
    const errorMag = Math.sqrt(dx * dx + dy * dy)

    let snapped = false
    if (errorMag > epsilon) {
      const newErrorX = this.errorX + dx
      const newErrorY = this.errorY + dy
      const totalMag = Math.sqrt(newErrorX * newErrorX + newErrorY * newErrorY)

      if (totalMag > snapThreshold) {
        this.errorX = 0
        this.errorY = 0
        snapped = true
      } else {
        this.errorX = newErrorX
        this.errorY = newErrorY
      }
    }

    return {
      hadCorrection: errorMag > epsilon,
      correctionErrorMagnitude: errorMag,
      snapped,
    }
  }
}
