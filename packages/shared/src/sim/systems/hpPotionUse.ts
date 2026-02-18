import { defineQuery, hasComponent } from 'bitecs'
import { Button, hasButton } from '../../net/input'
import { Health, Player, Dead } from '../components'
import { INTERACTION_FEEDBACK_DURATION } from '../content/economy'
import { HP_POTION_HEAL_AMOUNT, HP_POTION_MAX_STACK } from '../content/hpPotion'
import { getUpgradeStateForPlayer } from '../upgrade'
import type { GameWorld } from '../world'

const playerQuery = defineQuery([Player, Health])

export function hpPotionUseSystem(world: GameWorld, _dt: number): void {
  const players = playerQuery(world)

  for (const playerEid of players) {
    const input = world.playerInputs.get(playerEid)
    const wantsUse = !!input && hasButton(input, Button.USE_HP_POTION)
    const wasDown = Player.potionButtonWasDown[playerEid] === 1

    if (!wantsUse) {
      Player.potionButtonWasDown[playerEid] = 0
      continue
    }

    Player.potionButtonWasDown[playerEid] = 1
    if (wasDown) continue
    if (hasComponent(world, Dead, playerEid)) continue

    const currentHP = Health.current[playerEid]!
    const maxHP = Health.max[playerEid]!
    if (currentHP >= maxHP) continue

    const state = getUpgradeStateForPlayer(world, playerEid)
    if (state.hpPotionCount <= 0) continue

    const newHP = Math.min(maxHP, currentHP + HP_POTION_HEAL_AMOUNT)
    if (newHP <= currentHP) continue

    state.hpPotionCount -= 1
    Health.current[playerEid] = newHP
    world.hooks.fireHealthChanged(world, playerEid, currentHP, newHP)
    world.interactionFeedbackByPlayer.set(playerEid, {
      text: `Used HP Potion (+${Math.round(newHP - currentHP)} HP)`,
      description: `Potions: ${state.hpPotionCount}/${HP_POTION_MAX_STACK}`,
      timeLeft: INTERACTION_FEEDBACK_DURATION,
    })
  }
}
