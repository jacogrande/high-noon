/**
 * ECS Systems
 *
 * Systems are functions that operate on entities with specific components.
 * They run in a defined order each simulation tick.
 */

import type { SystemRegistry } from '../step'
import type { CharacterId } from '../content/characters'

import { movementSystem } from './movement'
import { playerInputSystem } from './playerInput'
import { rollSystem } from './roll'
import { jumpSystem } from './jump'
import { showdownSystem } from './showdown'
import { lastRitesSystem } from './lastRites'
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
import { stageProgressionSystem, clearAllEnemies } from './stageProgression'
import { buffSystem } from './buffSystem'
import { slowDebuffSystem } from './slowDebuff'
import { meleeSystem } from './melee'
import { knockbackSystem } from './knockback'
import { dynamiteSystem } from './dynamite'
import { goldRushSystem } from './goldRush'
import { hazardTileSystem } from './hazardTile'

export {
  movementSystem,
  playerInputSystem,
  rollSystem,
  jumpSystem,
  showdownSystem,
  lastRitesSystem,
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
  stageProgressionSystem,
  clearAllEnemies,
  buffSystem,
  slowDebuffSystem,
  meleeSystem,
  knockbackSystem,
  dynamiteSystem,
  goldRushSystem,
  hazardTileSystem,
}

/**
 * Register prediction systems for client-side forward ticks.
 *
 * Includes both legacy Sheriff path and new character systems; systems self-gate
 * by player character/components.
 */
export function registerPredictionSystems(systems: SystemRegistry): void {
  systems.register(playerInputSystem)
  systems.register(rollSystem)
  systems.register(jumpSystem)
  systems.register(showdownSystem)
  systems.register(lastRitesSystem)
  systems.register(dynamiteSystem)
  systems.register(cylinderSystem)
  systems.register(weaponSystem)
  systems.register(meleeSystem)
  systems.register(knockbackSystem)
  systems.register(bulletSystem)
  systems.register(movementSystem)
  systems.register(bulletCollisionSystem)
  systems.register(collisionSystem)
  systems.register(hazardTileSystem)
}

/**
 * Register replay systems for server reconciliation.
 * Movement-only — excludes weapon/ability systems to avoid duplicate spawns.
 */
export function registerReplaySystems(systems: SystemRegistry): void {
  systems.register(playerInputSystem)
  systems.register(rollSystem)
  systems.register(jumpSystem)
  systems.register(movementSystem)
  systems.register(collisionSystem)
  systems.register(hazardTileSystem)
}

/**
 * Register all simulation systems in canonical order.
 *
 * `characterId` is retained for backwards API compatibility but runtime now
 * supports mixed-character rooms via per-player character gating inside systems.
 */
export function registerAllSystems(systems: SystemRegistry, _characterId: CharacterId = 'sheriff'): void {
  systems.register(playerInputSystem)
  systems.register(rollSystem)
  systems.register(jumpSystem)
  systems.register(showdownSystem)
  systems.register(lastRitesSystem)
  systems.register(dynamiteSystem)
  systems.register(cylinderSystem)
  systems.register(weaponSystem)
  systems.register(meleeSystem)
  systems.register(knockbackSystem)
  systems.register(debugSpawnSystem)
  systems.register(waveSpawnerSystem)
  systems.register(stageProgressionSystem)
  systems.register(bulletSystem)
  systems.register(flowFieldSystem)
  systems.register(enemyDetectionSystem)
  systems.register(enemyAISystem)
  systems.register(spatialHashSystem)
  systems.register(slowDebuffSystem)
  systems.register(enemySteeringSystem)
  systems.register(enemyAttackSystem)
  systems.register(movementSystem)
  systems.register(bulletCollisionSystem)
  systems.register(hazardTileSystem)
  systems.register(healthSystem)
  systems.register(goldRushSystem)
  systems.register(buffSystem)
  systems.register(collisionSystem)
}
