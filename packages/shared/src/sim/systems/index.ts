/**
 * ECS Systems
 *
 * Systems are functions that operate on entities with specific components.
 * They run in a defined order each simulation tick.
 */

import type { SystemRegistry } from '../step'

import { movementSystem } from './movement'
import { playerInputSystem } from './playerInput'
import { rollSystem } from './roll'
import { showdownSystem } from './showdown'
import { cylinderSystem } from './cylinder'
import { collisionSystem } from './collision'
import { weaponSystem } from './weapon'
import { bulletSystem } from './bullet'
import { bulletCollisionSystem } from './bulletCollision'
import { healthSystem } from './health'
import { debugSpawnSystem } from './debugSpawn'
import { flowFieldSystem } from './flowField'
import { enemyDetectionSystem } from './enemyDetection'
import { enemyAISystem } from './enemyAI'
import { enemySteeringSystem } from './enemySteering'
import { enemyAttackSystem } from './enemyAttack'
import { spatialHashSystem } from './spatialHash'
import { waveSpawnerSystem } from './waveSpawner'
import { buffSystem } from './buffSystem'

export {
  movementSystem,
  playerInputSystem,
  rollSystem,
  showdownSystem,
  cylinderSystem,
  collisionSystem,
  weaponSystem,
  bulletSystem,
  bulletCollisionSystem,
  healthSystem,
  debugSpawnSystem,
  flowFieldSystem,
  enemyDetectionSystem,
  enemyAISystem,
  enemySteeringSystem,
  enemyAttackSystem,
  spatialHashSystem,
  waveSpawnerSystem,
  buffSystem,
}

/**
 * Register all 19 simulation systems in the canonical execution order.
 * Both client and server call this to prevent order divergence.
 */
export function registerAllSystems(systems: SystemRegistry): void {
  systems.register(playerInputSystem)
  systems.register(rollSystem)
  systems.register(showdownSystem)
  systems.register(cylinderSystem)
  systems.register(weaponSystem)
  systems.register(debugSpawnSystem)
  systems.register(waveSpawnerSystem)
  systems.register(bulletSystem)
  systems.register(flowFieldSystem)
  systems.register(enemyDetectionSystem)
  systems.register(enemyAISystem)
  systems.register(spatialHashSystem)
  systems.register(enemySteeringSystem)
  systems.register(enemyAttackSystem)
  systems.register(movementSystem)
  systems.register(bulletCollisionSystem)
  systems.register(healthSystem)
  systems.register(buffSystem)
  systems.register(collisionSystem)
}
