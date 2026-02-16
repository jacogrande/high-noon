/**
 * Shared Boss Spawn Helpers
 *
 * Common component setup and default initialization used by all boss modules.
 */

import { addComponent } from 'bitecs'
import type { GameWorld } from '../../world'
import {
  Position, Velocity, Speed, Collider, Health,
  Enemy, EnemyAI, AIState, Detection, AttackConfig, Steering,
} from '../../components'
import { CollisionLayer, NO_TARGET } from '../../prefabs'

/** Add all standard enemy components to an entity. */
export function addEnemyComponents(world: GameWorld, eid: number): void {
  addComponent(world, Position, eid)
  addComponent(world, Velocity, eid)
  addComponent(world, Speed, eid)
  addComponent(world, Collider, eid)
  addComponent(world, Health, eid)
  addComponent(world, Enemy, eid)
  addComponent(world, EnemyAI, eid)
  addComponent(world, Detection, eid)
  addComponent(world, AttackConfig, eid)
  addComponent(world, Steering, eid)
}

/** Set standard enemy defaults for position, collision, AI, and steering. */
export function setEnemyDefaults(world: GameWorld, eid: number, x: number, y: number): void {
  Position.x[eid] = x
  Position.y[eid] = y
  Position.prevX[eid] = x
  Position.prevY[eid] = y
  Velocity.x[eid] = 0
  Velocity.y[eid] = 0
  Collider.layer[eid] = CollisionLayer.ENEMY
  Health.iframes[eid] = 0
  Health.iframeDuration[eid] = 0
  EnemyAI.state[eid] = AIState.IDLE
  EnemyAI.stateTimer[eid] = 0
  EnemyAI.targetEid[eid] = NO_TARGET
  EnemyAI.initialDelay[eid] = 0
  Detection.staggerOffset[eid] = world.tick % 5
  AttackConfig.cooldownRemaining[eid] = 0
  AttackConfig.projectileAccel[eid] = 0
  AttackConfig.projectileDrag[eid] = 0
  AttackConfig.aimX[eid] = 0
  AttackConfig.aimY[eid] = 0
  Steering.seekWeight[eid] = 1.0
  Steering.separationWeight[eid] = 1.0
}
