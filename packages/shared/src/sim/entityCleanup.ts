import type { GameWorld } from './world'

/**
 * Remove all entity-keyed state for `eid` from the world's Maps and Sets.
 * Call this BEFORE `removeEntity(world, eid)` in every removal path.
 *
 * When adding a new entity-keyed Map/Set to GameWorld, add cleanup here too.
 */
export function cleanupEntity(world: GameWorld, eid: number): void {
  // Bullet state
  world.bulletCollisionCallbacks.delete(eid)
  world.bulletPierceHits.delete(eid)
  world.hookPierceCount.delete(eid)
  world.hitscanVirtualBulletOwners.delete(eid)

  // Lag compensation
  world.lagComp.shotTickByPlayer.delete(eid)
  world.lagComp.bulletShotTick.delete(eid)
  world.lagComp.bulletSpawnTick.delete(eid)
  world.lagComp.bulletSweepStart.delete(eid)

  // Player state
  world.playerInputs.delete(eid)
  world.rollDodgedBullets.delete(eid)
  world.lastPlayerHitDir.delete(eid)
  world.lastPlayerDamageFraction.delete(eid)
  world.playerUpgradeStates.delete(eid)
  world.playerCharacters.delete(eid)
  world.lastRitesZones.delete(eid)
  world.playerKillCounts.delete(eid)
  world.playerStats.delete(eid)
  world.interactionHoldTicksByPlayer.delete(eid)
  world.interactionTargetByPlayer.delete(eid)
  world.interactionLastInputSeqByPlayer.delete(eid)
  world.interactionPromptByPlayer.delete(eid)
  world.interactionFeedbackByPlayer.delete(eid)

  // General entity state
  world.lastDamageByEntity.delete(eid)
  world.floorSpeedMul.delete(eid)
  world.bossState.delete(eid)
  world.overkillProcessed.delete(eid)

  // Sets
  world.npcEntities.delete(eid)
}
