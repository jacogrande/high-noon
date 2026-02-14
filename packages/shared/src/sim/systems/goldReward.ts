import type { GameWorld } from '../world'
import { getGoldRewardForKill } from '../content/gold'
import { GOLD_FEVER_MAX_STACKS } from '../content/weapons'
import { getCharacterIdForPlayer, getUpgradeStateForPlayer } from '../upgrade'
import { hasComponent } from 'bitecs'
import { Player } from '../components'

/**
 * Applies queued kill rewards from healthSystem.
 * Rewards scale with enemy strength, elapsed run time, and stage progression.
 */
export function goldRewardSystem(world: GameWorld, _dt: number): void {
  if (world.pendingGoldRewards.length === 0) return

  for (const reward of world.pendingGoldRewards) {
    let amount = getGoldRewardForKill(world, reward.enemyType, reward.wasMelee)

    // Apply Fool's Gold Nugget multiplier
    const killer = reward.killerPlayerEid
    if (killer !== null && hasComponent(world, Player, killer)) {
      const killerState = getUpgradeStateForPlayer(world, killer)
      if (killerState.goldMultiplier > 1) {
        amount = Math.round(amount * killerState.goldMultiplier)
      }
    }

    world.goldCollected += amount

    if (killer === null || !hasComponent(world, Player, killer)) continue

    if (getCharacterIdForPlayer(world, killer) !== 'prospector') continue
    const us = getUpgradeStateForPlayer(world, killer)
    us.goldFeverStacks = Math.min(us.goldFeverStacks + 1, GOLD_FEVER_MAX_STACKS)
    us.goldFeverTimer = us.goldFeverDuration
  }

  world.pendingGoldRewards.length = 0
}
