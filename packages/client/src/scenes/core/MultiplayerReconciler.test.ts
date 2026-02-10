import { describe, expect, test } from 'bun:test'
import { addComponent } from 'bitecs'
import {
  createGameWorld,
  spawnPlayer,
  Jump,
  PlayerState,
  PlayerStateType,
  JUMP_LANDING_DURATION,
  type WorldSnapshot,
} from '@high-noon/shared'
import { InputBuffer } from '../../net/InputBuffer'
import { MultiplayerReconciler } from './MultiplayerReconciler'

function makeSnapshot(playerEid: number, state: number): WorldSnapshot {
  return {
    tick: 100,
    serverTime: 0,
    players: [{
      eid: playerEid,
      x: 100,
      y: 100,
      z: 0,
      zVelocity: 0,
      aimAngle: 0,
      state,
      hp: 5,
      flags: 0,
      lastProcessedSeq: 0,
      rollElapsedMs: 0,
      rollDurationMs: 0,
      rollDirX: 0,
      rollDirY: 0,
    }],
    bullets: [],
    enemies: [],
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
    reconciler.reconcile(
      makeSnapshot(eid, PlayerStateType.LANDING),
      {
        world,
        myServerEid: eid,
        myClientEid: eid,
        inputBuffer: new InputBuffer(),
        replayDriver: { replay: () => undefined } as any,
        gameplayEventSink: { pushGameplayEvent: () => undefined },
        hitPolicy: {
          trauma: 0,
          simHitStopSeconds: 0,
          renderPauseSeconds: 0,
        },
      },
      0.5,
      96,
    )

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
    reconciler.reconcile(
      makeSnapshot(eid, PlayerStateType.LANDING),
      {
        world,
        myServerEid: eid,
        myClientEid: eid,
        inputBuffer: new InputBuffer(),
        replayDriver: { replay: () => undefined } as any,
        gameplayEventSink: { pushGameplayEvent: () => undefined },
        hitPolicy: {
          trauma: 0,
          simHitStopSeconds: 0,
          renderPauseSeconds: 0,
        },
      },
      0.5,
      96,
    )

    expect(Jump.landed[eid]).toBe(1)
    expect(Jump.landingTimer[eid]).toBeCloseTo(JUMP_LANDING_DURATION, 6)
  })
})
