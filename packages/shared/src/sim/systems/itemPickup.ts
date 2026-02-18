/**
 * Item Pickup System
 *
 * Ticks item pickup lifetimes, removes expired/collected pickups,
 * and auto-collects pickups when players walk over them.
 */

import { defineQuery } from 'bitecs'
import type { GameWorld } from '../world'
import { Player, Position, Dead } from '../components'
import { hasComponent } from 'bitecs'
import { addItemToPlayer, getUpgradeStateForPlayer } from '../upgrade'
import { getItemDef } from '../content/items'
import { reapplyAllItemEffects } from '../content/itemEffects'
import { ITEM_FEEDBACK_DURATION } from '../content/economy'
import { HP_POTION_MAX_STACK, HP_POTION_HEAL_AMOUNT } from '../content/hpPotion'

const playerQuery = defineQuery([Player, Position])

/** Pickup auto-collection radius in world pixels */
const PICKUP_RADIUS = 32
const PICKUP_RADIUS_SQ = PICKUP_RADIUS * PICKUP_RADIUS

export function itemPickupSystem(world: GameWorld, dt: number): void {
  if (world.itemPickups.length === 0 && world.hpPotionPickups.length === 0) return

  // Tick lifetimes and remove expired/collected
  for (let i = world.itemPickups.length - 1; i >= 0; i--) {
    const pickup = world.itemPickups[i]!
    if (pickup.collected) {
      world.itemPickups.splice(i, 1)
      continue
    }
    pickup.lifetime -= dt
    if (pickup.lifetime <= 0) {
      world.itemPickups.splice(i, 1)
      continue
    }
  }
  for (let i = world.hpPotionPickups.length - 1; i >= 0; i--) {
    const pickup = world.hpPotionPickups[i]!
    if (pickup.collected) {
      world.hpPotionPickups.splice(i, 1)
      continue
    }
    pickup.lifetime -= dt
    if (pickup.lifetime <= 0) {
      world.hpPotionPickups.splice(i, 1)
      continue
    }
  }

  // Check player proximity for auto-pickup
  const players = playerQuery(world)
  for (const pickup of world.itemPickups) {
    if (pickup.collected) continue

    for (const playerEid of players) {
      if (hasComponent(world, Dead, playerEid)) continue

      const dx = Position.x[playerEid]! - pickup.x
      const dy = Position.y[playerEid]! - pickup.y
      if (dx * dx + dy * dy > PICKUP_RADIUS_SQ) continue

      // Try to add the item
      const success = addItemToPlayer(world, playerEid, pickup.itemId, reapplyAllItemEffects)
      if (success) {
        pickup.collected = true
        const def = getItemDef(pickup.itemId)
        if (def) {
          world.interactionFeedbackByPlayer.set(playerEid, {
            text: `Found: ${def.name}!`,
            description: def.description,
            timeLeft: ITEM_FEEDBACK_DURATION,
          })
        }
        break // One player picks up each item
      }
    }
  }

  // HP potion pickups
  for (const pickup of world.hpPotionPickups) {
    if (pickup.collected) continue

    for (const playerEid of players) {
      if (hasComponent(world, Dead, playerEid)) continue

      const state = getUpgradeStateForPlayer(world, playerEid)
      if (state.hpPotionCount >= HP_POTION_MAX_STACK) continue

      const dx = Position.x[playerEid]! - pickup.x
      const dy = Position.y[playerEid]! - pickup.y
      if (dx * dx + dy * dy > PICKUP_RADIUS_SQ) continue

      state.hpPotionCount = Math.min(HP_POTION_MAX_STACK, state.hpPotionCount + 1)
      pickup.collected = true
      world.interactionFeedbackByPlayer.set(playerEid, {
        text: 'Found: HP Potion!',
        description: `Use F to heal ${HP_POTION_HEAL_AMOUNT} HP`,
        timeLeft: ITEM_FEEDBACK_DURATION,
      })
      break // One player picks up each potion pickup
    }
  }
}
