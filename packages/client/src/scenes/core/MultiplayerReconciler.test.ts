import { describe, expect, test } from 'bun:test'
import { addComponent } from 'bitecs'
import {
  createGameWorld,
  spawnPlayer,
  Jump,
  Position,
  PlayerState,
  PlayerStateType,
  JUMP_LANDING_DURATION,
  type WorldSnapshot,
} from '@high-noon/shared'
import { InputBuffer } from '../../net/InputBuffer'
import { MultiplayerReconciler } from './MultiplayerReconciler'

function makeSnapshot(playerEid: number, state: number, overrides?: Partial<{ x: number; y: number; lastProcessedSeq: number }>): WorldSnapshot {
  return {
    tick: 100,
    serverTime: 0,
    players: [{
      eid: playerEid,
      x: overrides?.x ?? 100,
      y: overrides?.y ?? 100,
      z: 0,
      zVelocity: 0,
      aimAngle: 0,
      state,
      hp: 5,
      flags: 0,
      lastProcessedSeq: overrides?.lastProcessedSeq ?? 0,
      rollElapsedMs: 0,
      rollDurationMs: 0,
      rollDirX: 0,
      rollDirY: 0,
      showdownActive: 0,
      showdownTargetEid: 0xffff,
    }],
    enemies: [],
    lastRitesZones: [],
    dynamites: [],
  }
}

function makeCtx(world: ReturnType<typeof createGameWorld>, eid: number, replayFn?: () => void) {
  return {
    world,
    myServerEid: eid,
    myClientEid: eid,
    inputBuffer: new InputBuffer(),
    replayDriver: { replay: replayFn ?? (() => undefined) } as any,
    gameplayEventSink: { pushGameplayEvent: () => undefined },
    hitPolicy: {
      trauma: 0,
      simHitStopSeconds: 0,
      renderPauseSeconds: 0,
      directionalKickStrength: 0,
    },
  }
}

describe('MultiplayerReconciler', () => {
  test('does not re-extend landing timer when already landing', () => {
    const world = createGameWorld(1)
    const eid = spawnPlayer(world, 100, 100, 0)
    addComponent(world, Jump, eid)
    PlayerState.state[eid] = PlayerStateType.LANDING
    Jump.landed[eid] = 1
    Jump.landingTimer[eid] = 0.02

    const reconciler = new MultiplayerReconciler()
    reconciler.reconcile(makeSnapshot(eid, PlayerStateType.LANDING), makeCtx(world, eid), 0.5, 96)

    expect(Jump.landingTimer[eid]).toBeCloseTo(0.02, 6)
  })

  test('initializes full landing timer when entering landing from non-landing state', () => {
    const world = createGameWorld(2)
    const eid = spawnPlayer(world, 100, 100, 0)
    addComponent(world, Jump, eid)
    PlayerState.state[eid] = PlayerStateType.JUMPING
    Jump.landed[eid] = 0
    Jump.landingTimer[eid] = 0

    const reconciler = new MultiplayerReconciler()
    reconciler.reconcile(makeSnapshot(eid, PlayerStateType.LANDING), makeCtx(world, eid), 0.5, 96)

    expect(Jump.landed[eid]).toBe(1)
    expect(Jump.landingTimer[eid]).toBeCloseTo(JUMP_LANDING_DURATION, 6)
  })

  // ---------------------------------------------------------------------------
  // Error velocity damping
  // ---------------------------------------------------------------------------

  test('error velocity damping reduces oscillation from alternating corrections', () => {
    const world = createGameWorld(10)
    const eid = spawnPlayer(world, 100, 100, 0)
    const reconciler = new MultiplayerReconciler()
    const ctx = makeCtx(world, eid)

    // First correction: player predicted at (110, 100) but server says (100, 100)
    Position.x[eid] = 110
    Position.y[eid] = 100
    reconciler.reconcile(makeSnapshot(eid, PlayerStateType.IDLE), ctx, 0.5, 96)
    const err1 = reconciler.getError()
    const mag1 = Math.sqrt(err1.x * err1.x + err1.y * err1.y)

    // Second correction in opposite direction: player predicted at (90, 100) but server says (100, 100)
    Position.x[eid] = 90
    Position.y[eid] = 100
    reconciler.reconcile(makeSnapshot(eid, PlayerStateType.IDLE), ctx, 0.5, 96)
    const err2 = reconciler.getError()
    const mag2 = Math.sqrt(err2.x * err2.x + err2.y * err2.y)

    // With damping, second error should be smaller than first since velocity blends
    expect(mag2).toBeLessThan(mag1)
  })

  // ---------------------------------------------------------------------------
  // Error cap
  // ---------------------------------------------------------------------------

  test('caps error offset at MAX_ERROR_OFFSET (48)', () => {
    const world = createGameWorld(11)
    const eid = spawnPlayer(world, 100, 100, 0)
    const reconciler = new MultiplayerReconciler()
    const ctx = makeCtx(world, eid)

    // Create a large correction that should still be below snap threshold
    Position.x[eid] = 160
    Position.y[eid] = 100
    reconciler.reconcile(makeSnapshot(eid, PlayerStateType.IDLE), ctx, 0.5, 200)

    const err = reconciler.getError()
    const mag = Math.sqrt(err.x * err.x + err.y * err.y)
    expect(mag).toBeLessThanOrEqual(48 + 0.01)
  })

  // ---------------------------------------------------------------------------
  // Snap resets error velocity
  // ---------------------------------------------------------------------------

  test('snap resets error velocity', () => {
    const world = createGameWorld(12)
    const eid = spawnPlayer(world, 100, 100, 0)
    const reconciler = new MultiplayerReconciler()
    const ctx = makeCtx(world, eid)

    // Huge misprediction that exceeds snap threshold
    Position.x[eid] = 300
    Position.y[eid] = 100
    const sample = reconciler.reconcile(makeSnapshot(eid, PlayerStateType.IDLE), ctx, 0.5, 96)

    expect(sample.snapped).toBe(true)
    expect(reconciler.getError().x).toBe(0)
    expect(reconciler.getError().y).toBe(0)
  })

  // ---------------------------------------------------------------------------
  // Skip replay when no pending inputs
  // ---------------------------------------------------------------------------

  test('skips replay when no pending inputs', () => {
    const world = createGameWorld(13)
    const eid = spawnPlayer(world, 100, 100, 0)
    let replayCalled = false
    const ctx = makeCtx(world, eid, () => { replayCalled = true })

    const reconciler = new MultiplayerReconciler()
    // No inputs pushed to the input buffer, so pending.length === 0
    Position.x[eid] = 105
    Position.y[eid] = 100
    reconciler.reconcile(makeSnapshot(eid, PlayerStateType.IDLE), ctx, 0.5, 96)

    expect(replayCalled).toBe(false)
    // Should still compute error offset
    const err = reconciler.getError()
    // Server position is (100, 100), old predicted was (105, 100)
    // After reconcile with no replay, new predicted = server (100, 100)
    // dx = 105 - 100 = 5, which is > epsilon 0.5
    expect(Math.abs(err.x)).toBeGreaterThan(0)
  })

  test('calls replay when there are pending inputs', () => {
    const world = createGameWorld(14)
    const eid = spawnPlayer(world, 100, 100, 0)
    let replayCalled = false
    const ctx = makeCtx(world, eid, () => { replayCalled = true })

    // Push a pending input
    ctx.inputBuffer.push({
      seq: 1,
      clientTick: 0,
      clientTimeMs: 0,
      estimatedServerTimeMs: 0,
      viewInterpDelayMs: 0,
      shootSeq: 0,
      moveX: 1,
      moveY: 0,
      aimAngle: 0,
      buttons: 0,
    })

    const reconciler = new MultiplayerReconciler()
    reconciler.reconcile(makeSnapshot(eid, PlayerStateType.IDLE), ctx, 0.5, 96)

    expect(replayCalled).toBe(true)
  })
})
