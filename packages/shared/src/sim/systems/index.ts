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
import { buffSystem } from './buffSystem'
import { slowDebuffSystem } from './slowDebuff'
import { meleeSystem } from './melee'
import { knockbackSystem } from './knockback'
import { dynamiteSystem } from './dynamite'
import { goldRushSystem } from './goldRush'

export {
  movementSystem,
  playerInputSystem,
  rollSystem,
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
  buffSystem,
  slowDebuffSystem,
  meleeSystem,
  knockbackSystem,
  dynamiteSystem,
  goldRushSystem,
}

/**
 * Register all simulation systems in the canonical execution order.
 * Both client and server call this to prevent order divergence.
 *
 * **Ordering dependencies:**
 * - meleeSystem sets `world.lastKillWasMelee` → healthSystem reads it →
 *   goldRushSystem resets it. This three-system chain MUST run in order.
 * - healthSystem fires onKill hooks (gold nugget spawning) →
 *   goldRushSystem handles pickup and Gold Fever stacking.
 * - buffSystem runs last to tick timers and process one-shot effects
 *   (rockslide shockwaves, combo timeout, etc.) after all combat resolves.
 *
 * @param systems - The system registry to populate
 * @param characterId - Which character is being played (affects ability system)
 */
export function registerAllSystems(systems: SystemRegistry, characterId: CharacterId = 'sheriff'): void {
  systems.register(playerInputSystem)
  systems.register(rollSystem)

  // Character-specific ability system
  if (characterId === 'undertaker') {
    systems.register(lastRitesSystem)
  } else if (characterId === 'prospector') {
    systems.register(dynamiteSystem)
  } else {
    systems.register(showdownSystem)
  }

  // Character-specific weapon system
  if (characterId === 'prospector') {
    systems.register(meleeSystem)
  } else {
    systems.register(cylinderSystem)
    systems.register(weaponSystem)
  }

  systems.register(knockbackSystem)
  systems.register(debugSpawnSystem)
  systems.register(waveSpawnerSystem)
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
  // healthSystem → goldRushSystem → buffSystem must stay in this order (see above)
  systems.register(healthSystem)
  systems.register(goldRushSystem)
  systems.register(buffSystem)
  systems.register(collisionSystem)
}
