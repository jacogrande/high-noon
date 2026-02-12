/**
 * Health System
 *
 * Decrements i-frame timers and processes entity death.
 * Runs after bulletCollisionSystem (damage applied) and before
 * collisionSystem (dead entities shouldn't get push-out).
 */

import { defineQuery, removeEntity, hasComponent, addComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { Health, Player, Dead, Enemy, Position } from '../components'
import { XP_VALUES } from '../content/xp'
import { awardXP, getUpgradeStateForPlayer } from '../upgrade'
import { GOLD_NUGGET_LIFETIME } from './goldRush'

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

        // Fire onKill hook only when the kill can be attributed to a player.
        if (killerPlayerEid !== null && hasComponent(world, Player, killerPlayerEid)) {
          world.hooks.fireKill(world, killerPlayerEid, eid)
        }

        // Drop gold nugget at enemy position
        const goldValue = 1
        const goldCount = killWasMelee ? 2 : 1
        for (let g = 0; g < goldCount; g++) {
          world.goldNuggets.push({
            x: Position.x[eid]!,
            y: Position.y[eid]!,
            value: goldValue,
            lifetime: GOLD_NUGGET_LIFETIME,
          })
        }

        // Queue death pulses for any active Last Rites zones that contain this kill.
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

        // Award XP for enemy kills
        const xp = XP_VALUES[Enemy.type[eid]!]
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
        removeEntity(world, eid)
      }
    }
  }
}
