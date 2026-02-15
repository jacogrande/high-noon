import { ITEM_FEEDBACK_DURATION, rollStashReward } from '../content/economy'
import { getItemDef } from '../content/items'
import { Position } from '../components'
import { addItemToPlayer } from '../upgrade'
import { reapplyAllItemEffects } from '../content/itemEffects'
import type { GameWorld } from '../world'

/** Item pickup lifetime in seconds */
const ITEM_PICKUP_LIFETIME = 30

export function stashRewardSystem(world: GameWorld, _dt: number): void {
  if (world.pendingStashRewards.length === 0) return

  for (let i = 0; i < world.pendingStashRewards.length; i++) {
    const pending = world.pendingStashRewards[i]!
    const reward = rollStashReward(world.rng, pending.stageIndex)

    const itemDef = reward.itemId !== null ? getItemDef(reward.itemId) : undefined

    if (reward.itemId !== null && itemDef) {
      // Try to add item directly to player inventory
      const added = addItemToPlayer(world, pending.playerEid, reward.itemId, reapplyAllItemEffects)

      if (!added) {
        // Inventory full — fallback: spawn as ground pickup
        const offsetX = (world.rng.next() - 0.5) * 20
        const offsetY = (world.rng.next() - 0.5) * 20
        const stash = world.stashes.find(s => s.id === pending.stashId)
        const baseX = stash ? stash.x : Position.x[pending.playerEid]!
        const baseY = stash ? stash.y : Position.y[pending.playerEid]!

        world.itemPickups.push({
          id: world.nextItemPickupId++,
          itemId: reward.itemId,
          x: baseX + offsetX,
          y: baseY + offsetY,
          lifetime: ITEM_PICKUP_LIFETIME,
          collected: false,
        })
      }

      world.interactionFeedbackByPlayer.set(pending.playerEid, {
        text: `Found: ${itemDef.name}!`,
        description: itemDef.description,
        timeLeft: ITEM_FEEDBACK_DURATION,
      })
    } else {
      // Fallback (shouldn't happen with items-only table, but safe)
      world.interactionFeedbackByPlayer.set(pending.playerEid, {
        text: 'Empty stash...',
        timeLeft: ITEM_FEEDBACK_DURATION,
      })
    }
  }

  world.pendingStashRewards.length = 0
}
