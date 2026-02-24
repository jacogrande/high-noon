/**
 * Health System
 *
 * Decrements i-frame timers and processes entity death.
 * Runs after bulletCollisionSystem (damage applied) and before
 * collisionSystem (dead entities shouldn't get push-out).
 */

import { defineQuery, removeEntity, hasComponent, addComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { Health, Player, Dead, Enemy, EnemyTier, Position, BossPhase } from '../components'
import { XP_VALUES } from '../content/xp'
import { awardXP, getUpgradeStateForPlayer } from '../upgrade'
import { DROP_RARITY_WEIGHTS_FODDER, DROP_RARITY_WEIGHTS_THREAT } from '../content/enemies'
import { getEnemyDef } from '../content/enemyRegistry'
import { getRandomItemByRarity, type ItemRarity } from '../content/items'
import { getBoss } from '../content/bosses'
/** Lifetime in seconds for item pickups dropped by enemies */
const ENEMY_ITEM_DROP_LIFETIME = 15
import {
  HP_POTION_DROP_CHANCE_BOSS,
  HP_POTION_DROP_CHANCE_FODDER,
  HP_POTION_DROP_CHANCE_THREAT,
  HP_POTION_PICKUP_LIFETIME,
} from '../content/hpPotion'

const healthQuery = defineQuery([Health])
const playerQuery = defineQuery([Player, Health])

export function healthSystem(world: GameWorld, dt: number): void {
  const entities = healthQuery(world)

  for (const eid of entities) {
    // Decrement i-frame timer
    if (Health.iframes[eid]! > 0) {
      Health.iframes[eid] = Math.max(0, Health.iframes[eid]! - dt)
    }

    // Check for death (skip already-dead entities)
    if (Health.current[eid]! <= 0 && !hasComponent(world, Dead, eid)) {
      if (hasComponent(world, Player, eid)) {
        // Player death — tag as dead, keep entity for rendering
        addComponent(world, Dead, eid)
      } else {
        const attribution = world.lastDamageByEntity.get(eid)
        const killerPlayerEid = attribution?.ownerPlayerEid ?? null
        const killWasMelee = attribution?.wasMelee ?? world.lastKillWasMelee
        const isEnemy = hasComponent(world, Enemy, eid)

        // Fire onKill hook only when the kill can be attributed to a player.
        if (killerPlayerEid !== null && hasComponent(world, Player, killerPlayerEid)) {
          world.hooks.fireKill(world, killerPlayerEid, eid)
        }

        if (isEnemy) {
          // Total enemies eliminated this run, regardless of kill attribution
          world.killCount++
          world.pendingGoldRewards.push({
            enemyType: Enemy.type[eid]!,
            killerPlayerEid,
            wasMelee: killWasMelee,
          })

          const enemyType = Enemy.type[eid]!
          const isFodder = Enemy.tier[eid] === EnemyTier.FODDER
          const bossDef = getBoss(enemyType)
          const isBoss = bossDef !== undefined

          // Item drop roll (check enemy registry, then boss registry)
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

        // Queue death pulses for any active Last Rites zones that contain this kill.
        if (isEnemy) {
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

        // Award XP for enemy kills
        const xp = isEnemy ? XP_VALUES[Enemy.type[eid]!] : undefined
        if (xp !== undefined) {
          // Shared encounter progression: all alive players receive encounter XP.
          const players = playerQuery(world)
          for (const playerEid of players) {
            awardXP(getUpgradeStateForPlayer(world, playerEid), xp)
          }
        }
        // Non-player death — clean up any stale map entries keyed by this eid
        world.bulletCollisionCallbacks.delete(eid)
        world.bulletPierceHits.delete(eid)
        world.hookPierceCount.delete(eid)
        world.lastDamageByEntity.delete(eid)
        // Clean up boss-specific state
        if (hasComponent(world, BossPhase, eid)) {
          world.bossState.delete(eid)
        }
        removeEntity(world, eid)
      }
    }
  }
}
