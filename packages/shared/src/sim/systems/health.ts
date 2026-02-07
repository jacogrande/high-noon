/**
 * Health System
 *
 * Decrements i-frame timers and processes entity death.
 * Runs after bulletCollisionSystem (damage applied) and before
 * collisionSystem (dead entities shouldn't get push-out).
 */

import { defineQuery, removeEntity, hasComponent, addComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { Health, Player, Dead, Enemy } from '../components'
import { XP_VALUES } from '../content/xp'
import { awardXP } from '../upgrade'

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
        // Fire onKill hook for player kills
        const players = playerQuery(world)
        if (players.length > 0) {
          world.hooks.fireKill(world, players[0]!, eid)
        }

        // Award XP for enemy kills
        const xp = XP_VALUES[Enemy.type[eid]!]
        if (xp !== undefined) {
          awardXP(world.upgradeState, xp)
        }
        // Non-player death — clean up any stale map entries keyed by this eid
        world.bulletCollisionCallbacks.delete(eid)
        world.bulletPierceHits.delete(eid)
        world.hookPierceCount.delete(eid)
        removeEntity(world, eid)
      }
    }
  }
}
