/**
 * Health System
 *
 * Two focused passes each tick:
 *   1. iframeSystem — decrements i-frame timers
 *   2. deathSystem  — processes entities whose HP reached zero
 *
 * Runs after bulletCollisionSystem (damage applied) and before
 * collisionSystem (dead entities shouldn't get push-out).
 */

import { defineQuery, removeEntity, hasComponent, addComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { cleanupEntity } from '../entityCleanup'
import { Health, Player, Dead, Downed, Enemy, EnemyTier, Position, BossPhase } from '../components'
import { NO_TARGET } from '../prefabs'
import { BLEED_TIMER } from './reviveSystem'
import { XP_VALUES } from '../content/xp'
import { awardXP, getUpgradeStateForPlayer } from '../upgrade'
import { DROP_RARITY_WEIGHTS_FODDER, DROP_RARITY_WEIGHTS_THREAT } from '../content/enemies'
import { getEnemyDef } from '../content/enemyRegistry'
import { getRandomItemByRarity, type ItemRarity } from '../content/items'
import { getBoss } from '../content/bosses'
import { getOrCreatePlayerStats } from '../stats'
import {
  HP_POTION_DROP_CHANCE_BOSS,
  HP_POTION_DROP_CHANCE_FODDER,
  HP_POTION_DROP_CHANCE_THREAT,
  HP_POTION_PICKUP_LIFETIME,
} from '../content/hpPotion'

/** Lifetime in seconds for item pickups dropped by enemies */
const ENEMY_ITEM_DROP_LIFETIME = 15

const healthQuery = defineQuery([Health])
const playerQuery = defineQuery([Player, Health])

// ---------------------------------------------------------------------------
// Focused helpers
// ---------------------------------------------------------------------------

function handlePlayerDeath(world: GameWorld, eid: number): void {
  if (world.activePlayerCount > 1) {
    // Co-op: enter downed state (can be revived by allies).
    addComponent(world, Downed, eid)
    Downed.bleedTimer[eid] = BLEED_TIMER
    Downed.reviveProgress[eid] = 0
    Downed.reviverEid[eid] = NO_TARGET
    const ps = getOrCreatePlayerStats(world.playerStats, eid)
    ps.timesDown++
    ps._currentStreak = 0
  } else {
    // Single-player: instant death (no revive possible).
    addComponent(world, Dead, eid)
    getOrCreatePlayerStats(world.playerStats, eid)._currentStreak = 0
  }
}

function handleEnemyDeath(world: GameWorld, eid: number): void {
  const attribution = world.lastDamageByEntity.get(eid)
  const killerPlayerEid = attribution?.ownerPlayerEid ?? null
  const killWasMelee = attribution?.wasMelee ?? world.lastKillWasMelee
  const isEnemy = hasComponent(world, Enemy, eid)

  // Fire onKill hook only when the kill can be attributed to a player.
  if (killerPlayerEid !== null && hasComponent(world, Player, killerPlayerEid)) {
    world.hooks.fireKill(world, killerPlayerEid, eid)
  }

  if (isEnemy) {
    processEnemyKillRewards(world, eid, killerPlayerEid, killWasMelee)
    processEnemyDrops(world, eid)
    processLastRitesDeathPulses(world, eid)
    processEnemyXP(world, eid)
  }

  cleanupEntity(world, eid)
  removeEntity(world, eid)
}

function processEnemyKillRewards(
  world: GameWorld,
  eid: number,
  killerPlayerEid: number | null,
  killWasMelee: boolean,
): void {
  world.killCount++

  if (killerPlayerEid !== null) {
    world.playerKillCounts.set(killerPlayerEid, (world.playerKillCounts.get(killerPlayerEid) ?? 0) + 1)
  }

  world.pendingGoldRewards.push({
    enemyType: Enemy.type[eid]!,
    killerPlayerEid,
    wasMelee: killWasMelee,
  })

  // Per-player run stats: kills + streak
  if (killerPlayerEid !== null) {
    const ps = getOrCreatePlayerStats(world.playerStats, killerPlayerEid)
    const enemyType = Enemy.type[eid]!
    const bossDef = getBoss(enemyType)
    ps.enemiesKilled++
    if (bossDef !== undefined) ps.bossesKilled++
    ps._currentStreak++
    if (ps._currentStreak > ps.longestKillStreak) {
      ps.longestKillStreak = ps._currentStreak
    }
  }
}

function processEnemyDrops(world: GameWorld, eid: number): void {
  const enemyType = Enemy.type[eid]!
  const isFodder = Enemy.tier[eid] === EnemyTier.FODDER
  const bossDef = getBoss(enemyType)
  const isBoss = bossDef !== undefined

  // Item drop roll
  const dropChance = getEnemyDef(enemyType)?.dropChance ?? bossDef?.dropChance ?? 0
  if (dropChance > 0 && world.rng.next() < dropChance) {
    const weights = isFodder ? DROP_RARITY_WEIGHTS_FODDER : DROP_RARITY_WEIGHTS_THREAT
    let totalW = 0
    for (const [, w] of weights) totalW += w
    let roll = world.rng.next() * totalW
    let droppedRarity: ItemRarity = 'brass'
    for (const [rarity, w] of weights) {
      roll -= w
      if (roll <= 0) { droppedRarity = rarity; break }
    }
    const itemId = getRandomItemByRarity(world.rng, droppedRarity)
    if (itemId !== null) {
      world.itemPickups.push({
        id: world.nextItemPickupId++,
        itemId,
        x: Position.x[eid]!,
        y: Position.y[eid]!,
        lifetime: ENEMY_ITEM_DROP_LIFETIME,
        collected: false,
      })
    }
  }

  // HP potion drop roll
  const potionDropChance = isBoss
    ? HP_POTION_DROP_CHANCE_BOSS
    : isFodder
      ? HP_POTION_DROP_CHANCE_FODDER
      : HP_POTION_DROP_CHANCE_THREAT
  if (potionDropChance > 0 && world.rng.next() < potionDropChance) {
    world.hpPotionPickups.push({
      id: world.nextHpPotionPickupId++,
      x: Position.x[eid]!,
      y: Position.y[eid]!,
      lifetime: HP_POTION_PICKUP_LIFETIME,
      collected: false,
    })
  }
}

function processLastRitesDeathPulses(world: GameWorld, eid: number): void {
  for (const [ownerEid, zone] of world.lastRitesZones) {
    if (!zone.active) continue
    const dx = Position.x[eid]! - zone.x
    const dy = Position.y[eid]! - zone.y
    if (dx * dx + dy * dy <= zone.radius * zone.radius) {
      const ownerState = getUpgradeStateForPlayer(world, ownerEid)
      zone.pendingPulses.push({
        x: Position.x[eid]!,
        y: Position.y[eid]!,
        damage: ownerState.pulseDamage + zone.chainDamageBonus,
      })
    }
  }
}

function processEnemyXP(world: GameWorld, eid: number): void {
  const xp = XP_VALUES[Enemy.type[eid]!]
  if (xp !== undefined) {
    const players = playerQuery(world)
    for (const playerEid of players) {
      awardXP(getUpgradeStateForPlayer(world, playerEid), xp)
    }
  }
}

// ---------------------------------------------------------------------------
// System entry point
// ---------------------------------------------------------------------------

export function healthSystem(world: GameWorld, dt: number): void {
  const entities = healthQuery(world)

  for (const eid of entities) {
    // Pass 1: Decrement i-frame timer
    if (Health.iframes[eid]! > 0) {
      Health.iframes[eid] = Math.max(0, Health.iframes[eid]! - dt)
    }

    // Pass 2: Process death (skip already-dead or already-downed entities)
    if (Health.current[eid]! <= 0 && !hasComponent(world, Dead, eid) && !hasComponent(world, Downed, eid)) {
      if (hasComponent(world, Player, eid)) {
        handlePlayerDeath(world, eid)
      } else {
        handleEnemyDeath(world, eid)
      }
    }
  }
}
