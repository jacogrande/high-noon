import { INTERACTION_FEEDBACK_DURATION, rollStashReward } from '../content/economy'
import { getItemDef } from '../content/items'
import { Position } from '../components'
import { getUpgradeStateForPlayer } from '../upgrade'
import type { GameWorld } from '../world'

/** Item pickup lifetime in seconds */
const ITEM_PICKUP_LIFETIME = 30

export function stashRewardSystem(world: GameWorld, _dt: number): void {
  if (world.pendingStashRewards.length === 0) return

  for (let i = 0; i < world.pendingStashRewards.length; i++) {
    const pending = world.pendingStashRewards[i]!
    const reward = rollStashReward(world.rng, pending.stageIndex)

    // Apply gold multiplier from Fool's Gold Nugget
    const playerState = getUpgradeStateForPlayer(world, pending.playerEid)
    let gold = reward.gold
    if (playerState.goldMultiplier > 1) {
      gold = Math.round(gold * playerState.goldMultiplier)
    }
    world.goldCollected += gold

    // Spawn item pickup if reward includes an item
    if (reward.itemId !== null) {
      // Always consume RNG for determinism, then compute spawn position
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

    // Build feedback text
    const itemDef = reward.itemId !== null ? getItemDef(reward.itemId) : undefined
    let feedbackText: string
    if (gold > 0 && itemDef) {
      feedbackText = `+$${gold} + ${itemDef.name}`
    } else if (itemDef) {
      feedbackText = `Found: ${itemDef.name}!`
    } else if (reward.rare) {
      feedbackText = `Rare haul: +$${gold}`
    } else {
      feedbackText = `+$${gold} gold`
    }

    world.interactionFeedbackByPlayer.set(pending.playerEid, {
      text: feedbackText,
      timeLeft: INTERACTION_FEEDBACK_DURATION,
    })
  }

  world.pendingStashRewards.length = 0
}
