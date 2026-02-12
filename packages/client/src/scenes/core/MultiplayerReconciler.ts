import { addComponent, hasComponent, removeComponent } from 'bitecs'
import {
  Health,
  Jump,
  JUMP_LANDING_DURATION,
  Player,
  PlayerState,
  PlayerStateType,
  Position,
  Roll,
  Velocity,
  ZPosition,
  PLAYER_IFRAME_DURATION,
  type GameWorld,
  type WorldSnapshot,
} from '@high-noon/shared'
import type { InputBuffer } from '../../net/InputBuffer'
import type { LocalPlayerSimulationDriver } from './SimulationDriver'
import type { PlayerHitPresentationPolicy } from './PresentationPolicy'
import type { IGameplayEventSink, ILocalIdentityState, ISimStateSource } from './SceneRuntimeContracts'
import { captureReplayExcludedState, restoreReplayExcludedState } from './ReplayExcludedState'

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
      const hitDir = ctx.world.lastPlayerHitDir.get(ctx.myClientEid)
      ctx.gameplayEventSink.pushGameplayEvent({
        type: 'player-hit',
        trauma: ctx.hitPolicy.trauma,
        simHitStopSeconds: ctx.hitPolicy.simHitStopSeconds,
        renderPauseSeconds: ctx.hitPolicy.renderPauseSeconds,
        kickX: hitDir?.x ?? 0,
        kickY: hitDir?.y ?? 0,
        kickStrength: hitDir ? ctx.hitPolicy.directionalKickStrength : 0,
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
    if (!hasComponent(ctx.world, ZPosition, ctx.myClientEid)) {
      addComponent(ctx.world, ZPosition, ctx.myClientEid)
    }
    ZPosition.z[ctx.myClientEid] = serverPlayer.z

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

    // Handle Jump component based on server state.
    const serverJumping = serverPlayer.state === PlayerStateType.JUMPING
    const serverLanding = serverPlayer.state === PlayerStateType.LANDING
    const serverJumpState = serverJumping || serverLanding
    const hasLocalJump = hasComponent(ctx.world, Jump, ctx.myClientEid)
    const hadLocalLanding = hasLocalJump && Jump.landed[ctx.myClientEid] === 1

    if (!serverJumpState) {
      if (hasLocalJump) {
        removeComponent(ctx.world, Jump, ctx.myClientEid)
      }
      ZPosition.z[ctx.myClientEid] = 0
      ZPosition.zVelocity[ctx.myClientEid] = 0
    } else {
      if (!hasLocalJump) {
        addComponent(ctx.world, Jump, ctx.myClientEid)
      }

      ZPosition.z[ctx.myClientEid] = serverPlayer.z
      ZPosition.zVelocity[ctx.myClientEid] = serverJumping
        ? serverPlayer.zVelocity
        : 0

      if (serverLanding) {
        Jump.landed[ctx.myClientEid] = 1
        // Only set full lockout when entering landing; do not re-extend landing
        // on every snapshot while already landing.
        if (!hadLocalLanding) {
          Jump.landingTimer[ctx.myClientEid] = JUMP_LANDING_DURATION
        }
      } else {
        Jump.landed[ctx.myClientEid] = 0
        Jump.landingTimer[ctx.myClientEid] = 0
      }
    }

    // Use authoritative edge-state from snapshot flags.
    Player.rollButtonWasDown[ctx.myClientEid] = (serverPlayer.flags & 4) !== 0 ? 1 : 0
    Player.jumpButtonWasDown[ctx.myClientEid] = (serverPlayer.flags & 8) !== 0 ? 1 : 0

    // Save state excluded from replay systems.
    const excludedState = captureReplayExcludedState(ctx.world, ctx.myClientEid)

    ctx.inputBuffer.acknowledgeUpTo(serverPlayer.lastProcessedSeq)
    const pending = ctx.inputBuffer.getPending()
    ctx.replayDriver.replay(ctx.myClientEid, pending)

    // Restore state excluded from replay systems.
    restoreReplayExcludedState(ctx.world, ctx.myClientEid, excludedState)

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
