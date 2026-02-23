import { ITEM_FEEDBACK_DURATION, rollStashReward } from '../content/economy'
import {
  HP_POTION_HEAL_AMOUNT,
  HP_POTION_MAX_STACK,
  HP_POTION_PICKUP_LIFETIME,
  HP_POTION_STASH_GRANT,
} from '../content/hpPotion'
import { getItemDef } from '../content/items'
import { Position } from '../components'
import { addItemToPlayer, getUpgradeStateForPlayer, FOOLS_ERRAND_ID, UNMARKED_GRAVE_ID } from '../upgrade'
import { reapplyAllItemEffects } from '../content/itemEffects'
import type { GameWorld } from '../world'

/** Item pickup lifetime in seconds */
const ITEM_PICKUP_LIFETIME = 30

function getStashBasePosition(world: GameWorld, playerEid: number, stashId: number): { x: number; y: number } {
  const stash = world.stashes.find(s => s.id === stashId)
  return {
    x: stash ? stash.x : Position.x[playerEid]!,
    y: stash ? stash.y : Position.y[playerEid]!,
  }
}

export function stashRewardSystem(world: GameWorld, _dt: number): void {
  if (world.pendingStashRewards.length === 0) return

  for (let i = 0; i < world.pendingStashRewards.length; i++) {
    const pending = world.pendingStashRewards[i]!
    const base = getStashBasePosition(world, pending.playerEid, pending.stashId)
    const playerState = getUpgradeStateForPlayer(world, pending.playerEid)
    const hasFoolsErrand = (playerState.items.get(FOOLS_ERRAND_ID) ?? 0) > 0
    const hasUnmarkedGrave = (playerState.items.get(UNMARKED_GRAVE_ID) ?? 0) > 0
    const reward = rollStashReward(world.rng, pending.stageIndex, hasFoolsErrand, hasUnmarkedGrave)

    const itemDef = reward.itemId !== null ? getItemDef(reward.itemId) : undefined
    let feedbackText = 'Empty stash...'
    let feedbackDescription = ''
    let hasItemReward = false

    if (reward.itemId !== null && itemDef) {
      // Try to add item directly to player inventory
      const added = addItemToPlayer(world, pending.playerEid, reward.itemId, reapplyAllItemEffects)

      if (!added) {
        // Inventory full — fallback: spawn as ground pickup
        const offsetX = (world.rng.next() - 0.5) * 20
        const offsetY = (world.rng.next() - 0.5) * 20

        world.itemPickups.push({
          id: world.nextItemPickupId++,
          itemId: reward.itemId,
          x: base.x + offsetX,
          y: base.y + offsetY,
          lifetime: ITEM_PICKUP_LIFETIME,
          collected: false,
        })
      }
      feedbackText = `Found: ${itemDef.name}!`
      feedbackDescription = itemDef.description
      hasItemReward = true
    }

    const state = getUpgradeStateForPlayer(world, pending.playerEid)
    let potionsGranted = 0
    for (let count = 0; count < HP_POTION_STASH_GRANT; count++) {
      if (state.hpPotionCount < HP_POTION_MAX_STACK) {
        state.hpPotionCount++
        potionsGranted++
      } else {
        const offsetX = (world.rng.next() - 0.5) * 20
        const offsetY = (world.rng.next() - 0.5) * 20
        world.hpPotionPickups.push({
          id: world.nextHpPotionPickupId++,
          x: base.x + offsetX,
          y: base.y + offsetY,
          lifetime: HP_POTION_PICKUP_LIFETIME,
          collected: false,
        })
      }
    }

    if (potionsGranted > 0) {
      const suffix = potionsGranted === 1 ? '' : 's'
      if (!hasItemReward) {
        feedbackText = `Found: ${potionsGranted} HP Potion${suffix}!`
        feedbackDescription = `Use F to heal ${HP_POTION_HEAL_AMOUNT} HP`
      } else {
        feedbackText += ` +${potionsGranted} HP Potion${suffix}`
      }
    }

    world.interactionFeedbackByPlayer.set(pending.playerEid, {
      text: feedbackText,
      description: feedbackDescription,
      timeLeft: ITEM_FEEDBACK_DURATION,
    })
  }

  world.pendingStashRewards.length = 0
}
