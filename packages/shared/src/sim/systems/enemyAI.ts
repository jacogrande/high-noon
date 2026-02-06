/**
 * Enemy AI State Machine System
 *
 * Handles FSM transitions for enemies: IDLE → CHASE → TELEGRAPH → ATTACK → RECOVERY.
 * ATTACK is a 1-tick pass-through in Phase 3; Phase 4 adds attack execution.
 */

import { defineQuery } from 'bitecs'
import type { GameWorld } from '../world'
import { EnemyAI, AIState, Enemy, Detection, AttackConfig, Position } from '../components'
import { NO_TARGET } from '../prefabs'

const aiQuery = defineQuery([EnemyAI, Enemy, Detection, AttackConfig, Position])

/** Duration of stun state in seconds */
const STUN_DURATION = 0.2

export function transition(eid: number, newState: number): void {
  EnemyAI.state[eid] = newState
  EnemyAI.stateTimer[eid] = 0
}

export function enemyAISystem(world: GameWorld, dt: number): void {
  const enemies = aiQuery(world)

  for (const eid of enemies) {
    // Decrement cooldown
    const cd = AttackConfig.cooldownRemaining[eid]! - dt
    AttackConfig.cooldownRemaining[eid] = cd > 0 ? cd : 0

    // Decrement initial delay
    if (EnemyAI.initialDelay[eid]! > 0) {
      EnemyAI.initialDelay[eid] = Math.max(0, EnemyAI.initialDelay[eid]! - dt)
    }

    // Increment state timer
    EnemyAI.stateTimer[eid] = EnemyAI.stateTimer[eid]! + dt

    const state = EnemyAI.state[eid]!
    const targetEid = EnemyAI.targetEid[eid]!
    const stateTimer = EnemyAI.stateTimer[eid]!

    switch (state) {
      case AIState.IDLE: {
        // Stay idle during spawn-in period so enemies visibly materialize in place
        if (EnemyAI.initialDelay[eid]! > 0) break
        if (targetEid !== NO_TARGET) {
          transition(eid, AIState.CHASE)
        }
        break
      }

      case AIState.CHASE: {
        if (targetEid === NO_TARGET) {
          transition(eid, AIState.IDLE)
          break
        }

        // Check if in attack range and off cooldown
        const attackRange = Detection.attackRange[eid]!
        const ex = Position.x[eid]!
        const ey = Position.y[eid]!
        const tx = Position.x[targetEid]!
        const ty = Position.y[targetEid]!
        const dx = tx - ex
        const dy = ty - ey
        const distSq = dx * dx + dy * dy

        if (distSq <= attackRange * attackRange && AttackConfig.cooldownRemaining[eid]! <= 0) {
          // Gate: initial delay must have expired
          if (EnemyAI.initialDelay[eid]! > 0) break

          transition(eid, AIState.TELEGRAPH)
        }
        break
      }

      case AIState.TELEGRAPH: {
        if (stateTimer >= AttackConfig.telegraphDuration[eid]!) {
          transition(eid, AIState.ATTACK)
        }
        break
      }

      case AIState.ATTACK: {
        // Projectile spawning handled by enemyAttackSystem
        break
      }

      case AIState.RECOVERY: {
        if (stateTimer >= AttackConfig.recoveryDuration[eid]!) {
          AttackConfig.cooldownRemaining[eid] = AttackConfig.cooldown[eid]!
          transition(eid, AIState.CHASE)
        }
        break
      }

      case AIState.STUNNED: {
        if (stateTimer >= STUN_DURATION) {
          transition(eid, AIState.CHASE)
        }
        break
      }

      default: {
        // FLEE and any unknown state → fall back to IDLE
        transition(eid, AIState.IDLE)
        break
      }
    }
  }
}
