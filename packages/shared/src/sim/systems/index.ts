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
import { hpPotionUseSystem } from './hpPotionUse'
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
import { bossPhaseSystem } from './bossPhase'
// Trigger boss module registration
import '../content/bosses'
import { enemyAISystem } from './enemyAI'
import { enemySteeringSystem } from './enemySteering'
import { enemyAttackSystem } from './enemyAttack'
import { spatialHashSystem } from './spatialHash'
import { waveSpawnerSystem } from './waveSpawner'
import { objectiveSystem, initObjective, cleanupObjective } from './objectiveSystem'
import { stageProgressionSystem, clearAllEnemies, clearEnemiesForLooting, spawnStageNpcs } from './stageProgression'
import { npcMovementSystem } from './npcMovement'
import { npcDialogueSystem } from './npcDialogue'
import { buffSystem } from './buffSystem'
import { slowDebuffSystem } from './slowDebuff'
import { rootSystem } from './root'
import { poisonSystem, applyPoison } from './poison'
import { meleeSystem } from './melee'
import { knockbackSystem } from './knockback'
import { dynamiteSystem } from './dynamite'
import { goldRewardSystem } from './goldReward'
import { goldRushSystem } from './goldRush'
import { hazardTileSystem } from './hazardTile'
import { groundCrackSystem } from './groundCrackSystem'
import { bossShockwaveSystem } from './bossShockwaveSystem'
import { trapZoneSystem } from './trapZoneSystem'
import { mapObstacleSystem } from './mapObstacle'
import { interactionSystem } from './interaction'
import { stashRewardSystem } from './stashReward'
import { itemPickupSystem } from './itemPickup'
import { lifespanSystem } from './lifespan'
import { tryVisitorPurchase, tryTinkererModSelect, type CampVisitorState, type WeaponModOffer } from './campVisitor'

export {
  movementSystem,
  playerInputSystem,
  hpPotionUseSystem,
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
  bossPhaseSystem,
  enemyAISystem,
  enemySteeringSystem,
  enemyAttackSystem,
  spatialHashSystem,
  waveSpawnerSystem,
  objectiveSystem,
  initObjective,
  cleanupObjective,
  stageProgressionSystem,
  clearAllEnemies,
  clearEnemiesForLooting,
  spawnStageNpcs,
  npcMovementSystem,
  npcDialogueSystem,
  buffSystem,
  slowDebuffSystem,
  rootSystem,
  poisonSystem,
  applyPoison,
  meleeSystem,
  knockbackSystem,
  dynamiteSystem,
  goldRewardSystem,
  goldRushSystem,
  hazardTileSystem,
  groundCrackSystem,
  bossShockwaveSystem,
  interactionSystem,
  stashRewardSystem,
  itemPickupSystem,
  tryVisitorPurchase,
  tryTinkererModSelect,
  trapZoneSystem,
  mapObstacleSystem,
  lifespanSystem,
}

export type { CampVisitorState, WeaponModOffer }

/**
 * Register prediction systems for client-side forward ticks.
 *
 * Includes both legacy Sheriff path and new character systems; systems self-gate
 * by player character/components.
 * Consumables like HP potions remain server-authoritative and are excluded.
 */
export function registerPredictionSystems(systems: SystemRegistry): void {
  systems.register(playerInputSystem)
  systems.register(rootSystem)
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
  systems.register(groundCrackSystem)
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
  systems.register(groundCrackSystem)
}

/**
 * Register all simulation systems in canonical order.
 *
 * `characterId` is retained for backwards API compatibility but runtime now
 * supports mixed-character rooms via per-player character gating inside systems.
 *
 * ### Ordering dependency: `floorSpeedMul`
 *
 * `hazardTileSystem` clears and writes `world.floorSpeedMul` each tick.
 * `playerInputSystem` and `enemySteeringSystem` read it for velocity scaling.
 * Because hazardTileSystem runs **after** those consumers, the speed multiplier
 * is always one tick stale. This is intentional — the single-tick lag is
 * imperceptible and avoids a circular dependency (movement must happen before
 * position-based tile lookups make sense). The same ordering holds in
 * `registerPredictionSystems` and `registerReplaySystems`.
 */
export function registerAllSystems(systems: SystemRegistry, _characterId: CharacterId = 'sheriff'): void {
  // -- Clear previous tick's per-frame events --
  systems.register(mapObstacleSystem)
  // -- Input & abilities (read floorSpeedMul from previous tick) --
  systems.register(playerInputSystem)
  systems.register(hpPotionUseSystem)
  systems.register(rollSystem)
  systems.register(jumpSystem)
  systems.register(showdownSystem)
  systems.register(lastRitesSystem)
  systems.register(dynamiteSystem)
  systems.register(cylinderSystem)
  systems.register(weaponSystem)
  systems.register(meleeSystem)
  systems.register(knockbackSystem)
  // -- Spawning & progression --
  systems.register(debugSpawnSystem)
  systems.register(waveSpawnerSystem)
  systems.register(objectiveSystem)
  systems.register(stageProgressionSystem)
  // -- NPC systems --
  systems.register(npcMovementSystem)
  systems.register(npcDialogueSystem)
  // -- Projectiles & pathfinding --
  systems.register(bulletSystem)
  systems.register(flowFieldSystem)
  // -- Enemy AI & steering (read floorSpeedMul from previous tick) --
  systems.register(enemyDetectionSystem)
  systems.register(bossPhaseSystem)
  systems.register(enemyAISystem)
  systems.register(spatialHashSystem)
  systems.register(slowDebuffSystem)
  systems.register(rootSystem)
  systems.register(poisonSystem)
  systems.register(enemySteeringSystem)
  systems.register(enemyAttackSystem)
  // -- Physics --
  systems.register(movementSystem)
  systems.register(bulletCollisionSystem)
  // -- Tile hazards (writes floorSpeedMul for next tick's consumers) --
  systems.register(hazardTileSystem)
  // -- Boss hazards (composes with tile hazards via Math.min on floorSpeedMul) --
  systems.register(groundCrackSystem)
  systems.register(bossShockwaveSystem)
  systems.register(trapZoneSystem)
  // -- Post-movement --
  systems.register(healthSystem)
  systems.register(lifespanSystem)
  systems.register(goldRewardSystem)
  systems.register(goldRushSystem)
  systems.register(buffSystem)
  systems.register(collisionSystem)
  systems.register(interactionSystem)
  systems.register(stashRewardSystem)
  systems.register(itemPickupSystem)
}
