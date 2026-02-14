import { INTERACTION_FEEDBACK_DURATION, rollStashReward } from '../content/economy'
import type { GameWorld } from '../world'

export function stashRewardSystem(world: GameWorld, _dt: number): void {
  if (world.pendingStashRewards.length === 0) return

  for (let i = 0; i < world.pendingStashRewards.length; i++) {
    const pending = world.pendingStashRewards[i]!
    const reward = rollStashReward(world.rng, pending.stageIndex)
    world.goldCollected += reward.gold
    world.interactionFeedbackByPlayer.set(pending.playerEid, {
      text: reward.rare
        ? `Rare haul: +$${reward.gold}`
        : `+$${reward.gold} gold`,
      timeLeft: INTERACTION_FEEDBACK_DURATION,
    })
  }

  world.pendingStashRewards.length = 0
}
