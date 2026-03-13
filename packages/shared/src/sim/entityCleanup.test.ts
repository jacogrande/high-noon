import { describe, it, expect } from 'bun:test'
import { addEntity, removeEntity } from 'bitecs'
import { createGameWorld } from './world'
import { cleanupEntity } from './entityCleanup'
import { removePlayer, addPlayer } from './playerRegistry'

describe('cleanupEntity', () => {
  it('removes entries from all entity-keyed Maps and Sets', () => {
    const world = createGameWorld(42)
    const eid = addEntity(world)

    // Populate various Maps/Sets with this entity ID
    world.bulletCollisionCallbacks.set(eid, () => {})
    world.bulletPierceHits.set(eid, new Set([99]))
    world.hookPierceCount.set(eid, 3)
    world.hitscanVirtualBulletOwners.set(eid, 1)
    world.lastPlayerHitDir.set(eid, { x: 1, y: 0 })
    world.lastPlayerDamageFraction.set(eid, 0.5)
    world.playerInputs.set(eid, { moveX: 0, moveY: 0 } as any)
    world.rollDodgedBullets.set(eid, new Set([100]))
    world.playerUpgradeStates.set(eid, {} as any)
    world.playerCharacters.set(eid, 'sheriff')
    world.lastRitesZones.set(eid, {} as any)
    world.playerKillCounts.set(eid, 5)
    world.playerStats.set(eid, {} as any)
    world.interactionHoldTicksByPlayer.set(eid, 10)
    world.interactionTargetByPlayer.set(eid, 'npc_1')
    world.interactionLastInputSeqByPlayer.set(eid, 42)
    world.interactionPromptByPlayer.set(eid, 'Press E')
    world.interactionFeedbackByPlayer.set(eid, {} as any)
    world.lastDamageByEntity.set(eid, {} as any)
    world.floorSpeedMul.set(eid, 0.5)
    world.bossState.set(eid, { phase: 1 })
    world.overkillProcessed.add(eid)
    world.npcEntities.add(eid)
    world.lagComp.shotTickByPlayer.set(eid, 100)
    world.lagComp.bulletShotTick.set(eid, 100)
    world.lagComp.bulletSpawnTick.set(eid, 100)
    world.lagComp.bulletSweepStart.set(eid, { x: 0, y: 0 })

    cleanupEntity(world, eid)

    // Verify all cleaned up
    expect(world.bulletCollisionCallbacks.has(eid)).toBe(false)
    expect(world.bulletPierceHits.has(eid)).toBe(false)
    expect(world.hookPierceCount.has(eid)).toBe(false)
    expect(world.hitscanVirtualBulletOwners.has(eid)).toBe(false)
    expect(world.lastPlayerHitDir.has(eid)).toBe(false)
    expect(world.lastPlayerDamageFraction.has(eid)).toBe(false)
    expect(world.playerInputs.has(eid)).toBe(false)
    expect(world.rollDodgedBullets.has(eid)).toBe(false)
    expect(world.playerUpgradeStates.has(eid)).toBe(false)
    expect(world.playerCharacters.has(eid)).toBe(false)
    expect(world.lastRitesZones.has(eid)).toBe(false)
    expect(world.playerKillCounts.has(eid)).toBe(false)
    expect(world.playerStats.has(eid)).toBe(false)
    expect(world.interactionHoldTicksByPlayer.has(eid)).toBe(false)
    expect(world.interactionTargetByPlayer.has(eid)).toBe(false)
    expect(world.interactionLastInputSeqByPlayer.has(eid)).toBe(false)
    expect(world.interactionPromptByPlayer.has(eid)).toBe(false)
    expect(world.interactionFeedbackByPlayer.has(eid)).toBe(false)
    expect(world.lastDamageByEntity.has(eid)).toBe(false)
    expect(world.floorSpeedMul.has(eid)).toBe(false)
    expect(world.bossState.has(eid)).toBe(false)
    expect(world.overkillProcessed.has(eid)).toBe(false)
    expect(world.npcEntities.has(eid)).toBe(false)
    expect(world.lagComp.shotTickByPlayer.has(eid)).toBe(false)
    expect(world.lagComp.bulletShotTick.has(eid)).toBe(false)
    expect(world.lagComp.bulletSpawnTick.has(eid)).toBe(false)
    expect(world.lagComp.bulletSweepStart.has(eid)).toBe(false)
  })

  it('is safe to call on an entity with no map entries', () => {
    const world = createGameWorld(42)
    const eid = addEntity(world)
    // Should not throw
    cleanupEntity(world, eid)
  })

  it('prevents recycled entity IDs from inheriting stale state', () => {
    const world = createGameWorld(42)

    // Create entity A, store state
    const eidA = addEntity(world)
    world.playerKillCounts.set(eidA, 10)
    world.bossState.set(eidA, { phase: 2 })
    world.lastDamageByEntity.set(eidA, { ownerPlayerEid: 99 } as any)

    // Remove entity A with proper cleanup
    cleanupEntity(world, eidA)
    removeEntity(world, eidA)

    // Create entity B — may or may not reuse A's ID
    const eidB = addEntity(world)

    // Whether or not B got A's ID, B should not have A's state
    // (If IDs are different this is trivially true; if same, cleanup prevents inheritance)
    expect(world.playerKillCounts.has(eidB)).toBe(false)
    expect(world.bossState.has(eidB)).toBe(false)
    expect(world.lastDamageByEntity.has(eidB)).toBe(false)
  })
})

describe('removePlayer cleanup', () => {
  it('cleans up playerKillCounts and playerStats on removal', () => {
    const world = createGameWorld(42)
    const eid = addPlayer(world, 'session-1')

    // Simulate kill tracking
    world.playerKillCounts.set(eid, 15)
    world.playerStats.set(eid, { kills: 15 } as any)
    world.lastPlayerDamageFraction.set(eid, 0.3)

    removePlayer(world, 'session-1')

    expect(world.playerKillCounts.has(eid)).toBe(false)
    expect(world.playerStats.has(eid)).toBe(false)
    expect(world.lastPlayerDamageFraction.has(eid)).toBe(false)
  })
})
