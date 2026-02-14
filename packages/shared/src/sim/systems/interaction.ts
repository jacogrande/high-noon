import { defineQuery, hasComponent } from 'bitecs'
import { Button, hasButton, type InputState } from '../../net/input'
import {
  INTERACT_HOLD_TICKS,
  INTERACTION_FEEDBACK_DURATION,
  SALESMAN_INTERACT_RADIUS,
  SHOVEL_MAX_STACK,
  STASH_INTERACT_RADIUS,
  getShovelPrice,
} from '../content/economy'
import { generateCampSalesmanSpawn, generateStagePoiLayout } from '../content/maps/poiGenerator'
import { Dead, Player, Position } from '../components'
import type { GameWorld, StashState } from '../world'

const playerQuery = defineQuery([Player, Position])

interface InteractionTarget {
  key: string
  prompt: string
  kind: 'salesman' | 'stash'
  stageIndex: number
  stashId: number
  distSq: number
}

function setFeedback(world: GameWorld, playerEid: number, text: string): void {
  world.interactionFeedbackByPlayer.set(playerEid, {
    text,
    timeLeft: INTERACTION_FEEDBACK_DURATION,
  })
}

function refreshFeedbackTimers(world: GameWorld, dt: number): void {
  for (const [playerEid, feedback] of world.interactionFeedbackByPlayer) {
    feedback.timeLeft -= dt
    if (feedback.timeLeft <= 0) {
      world.interactionFeedbackByPlayer.delete(playerEid)
    }
  }
}

function clearPlayerInteractionState(world: GameWorld): void {
  world.interactionPromptByPlayer.clear()
  world.interactionHoldTicksByPlayer.clear()
  world.interactionTargetByPlayer.clear()
  world.interactionLastInputSeqByPlayer.clear()
}

function clearInteractionLayout(world: GameWorld): void {
  world.interactionLayoutKey = ''
  world.salesman = null
  world.stashes = []
  clearPlayerInteractionState(world)
}

function ensureInteractionLayout(world: GameWorld): void {
  const map = world.tilemap
  const run = world.run
  if (!map || !run || run.completed || run.transition === 'clearing') {
    if (world.salesman || world.stashes.length > 0 || world.interactionLayoutKey !== '') {
      clearInteractionLayout(world)
    }
    return
  }

  const stageIndex = Math.max(0, run.currentStage)
  const mode: 'camp' | 'stage' = run.transition === 'camp' ? 'camp' : 'stage'
  const nextKey = `${mode}:${stageIndex}:${map.width}:${map.height}`
  if (world.interactionLayoutKey === nextKey) return

  world.interactionLayoutKey = nextKey
  world.interactionFeedbackByPlayer.clear()
  clearPlayerInteractionState(world)

  if (mode === 'camp') {
    const campSalesman = generateCampSalesmanSpawn(map)
    world.salesman = {
      x: campSalesman.x,
      y: campSalesman.y,
      stageIndex,
      camp: true,
      active: true,
    }
    world.stashes = []
    return
  }

  const layout = generateStagePoiLayout(map, world.initialSeed, stageIndex)
  world.salesman = {
    x: layout.salesman.x,
    y: layout.salesman.y,
    stageIndex,
    camp: false,
    active: true,
  }
  world.stashes = layout.stashes.map((stash, index) => ({
    id: index,
    x: stash.x,
    y: stash.y,
    stageIndex,
    opened: false,
  }))
}

function getNearestTarget(world: GameWorld, playerEid: number): InteractionTarget | null {
  const playerX = Position.x[playerEid]!
  const playerY = Position.y[playerEid]!
  let best: InteractionTarget | null = null

  const salesman = world.salesman
  if (salesman && salesman.active) {
    const dx = salesman.x - playerX
    const dy = salesman.y - playerY
    const distSq = dx * dx + dy * dy
    const radiusSq = SALESMAN_INTERACT_RADIUS * SALESMAN_INTERACT_RADIUS
    if (distSq <= radiusSq) {
      const price = getShovelPrice(salesman.stageIndex)
      best = {
        key: `salesman:${salesman.stageIndex}:${salesman.camp ? 1 : 0}`,
        prompt: `Hold E: Buy Shovel ($${price})`,
        kind: 'salesman',
        stageIndex: salesman.stageIndex,
        stashId: -1,
        distSq,
      }
    }
  }

  const stashRadiusSq = STASH_INTERACT_RADIUS * STASH_INTERACT_RADIUS
  for (let i = 0; i < world.stashes.length; i++) {
    const stash = world.stashes[i]!
    if (stash.opened) continue
    const dx = stash.x - playerX
    const dy = stash.y - playerY
    const distSq = dx * dx + dy * dy
    if (distSq > stashRadiusSq) continue

    const shovels = world.shovelCount
    const prompt = shovels > 0
      ? 'Hold E: Dig Stash (1 shovel)'
      : 'Need shovel to dig stash'

    if (!best || distSq < best.distSq) {
      best = {
        key: `stash:${stash.stageIndex}:${stash.id}`,
        prompt,
        kind: 'stash',
        stageIndex: stash.stageIndex,
        stashId: stash.id,
        distSq,
      }
    }
  }

  return best
}

function findStash(world: GameWorld, stageIndex: number, stashId: number): StashState | null {
  for (let i = 0; i < world.stashes.length; i++) {
    const stash = world.stashes[i]!
    if (stash.stageIndex === stageIndex && stash.id === stashId) return stash
  }
  return null
}

function getNetworkInputSeq(input: InputState | undefined): number | null {
  if (!input || typeof input !== 'object' || !('seq' in input)) return null
  const seq = (input as { seq?: unknown }).seq
  if (typeof seq !== 'number' || !Number.isFinite(seq) || seq <= 0) return null
  return seq
}

function tryBuyShovel(world: GameWorld, playerEid: number, stageIndex: number): void {
  const shovelCount = world.shovelCount
  if (shovelCount >= SHOVEL_MAX_STACK) {
    setFeedback(world, playerEid, 'Shovels full')
    return
  }

  const price = getShovelPrice(stageIndex)
  if (world.goldCollected < price) {
    setFeedback(world, playerEid, `Need $${price}`)
    return
  }

  world.goldCollected -= price
  world.shovelCount = shovelCount + 1
  setFeedback(world, playerEid, '+1 shovel')
}

function tryOpenStash(world: GameWorld, playerEid: number, stageIndex: number, stashId: number): void {
  const stash = findStash(world, stageIndex, stashId)
  if (!stash || stash.opened) return

  const shovelCount = world.shovelCount
  if (shovelCount <= 0) {
    setFeedback(world, playerEid, 'Need a shovel')
    return
  }

  world.shovelCount = shovelCount - 1
  stash.opened = true
  world.pendingStashRewards.push({
    playerEid,
    stageIndex,
    stashId,
  })
  setFeedback(world, playerEid, 'Stash opened')
}

function resolveInteraction(world: GameWorld, playerEid: number, target: InteractionTarget): void {
  if (target.kind === 'salesman') {
    tryBuyShovel(world, playerEid, target.stageIndex)
    return
  }
  tryOpenStash(world, playerEid, target.stageIndex, target.stashId)
}

export function interactionSystem(world: GameWorld, dt: number): void {
  refreshFeedbackTimers(world, dt)
  ensureInteractionLayout(world)

  const players = playerQuery(world)
  for (const playerEid of players) {
    if (hasComponent(world, Dead, playerEid)) {
      world.interactionPromptByPlayer.delete(playerEid)
      world.interactionHoldTicksByPlayer.delete(playerEid)
      world.interactionTargetByPlayer.delete(playerEid)
      world.interactionLastInputSeqByPlayer.delete(playerEid)
      continue
    }

    const input = world.playerInputs.get(playerEid)
    const currentInputSeq = getNetworkInputSeq(input)
    const lastInputSeq = world.interactionLastInputSeqByPlayer.get(playerEid) ?? 0
    const hasFreshNetworkInput = currentInputSeq !== null && currentInputSeq !== lastInputSeq
    if (hasFreshNetworkInput) {
      world.interactionLastInputSeqByPlayer.set(playerEid, currentInputSeq)
    }
    const hasNetworkInput = currentInputSeq !== null
    const interactDown = !!input && hasButton(input, Button.INTERACT)
    const releaseObserved = !interactDown && (!hasNetworkInput || hasFreshNetworkInput)
    const target = getNearestTarget(world, playerEid)
    const feedback = world.interactionFeedbackByPlayer.get(playerEid)

    if (!target) {
      world.interactionTargetByPlayer.delete(playerEid)
      if (releaseObserved) {
        world.interactionHoldTicksByPlayer.set(playerEid, 0)
      }
      if (feedback) {
        world.interactionPromptByPlayer.set(playerEid, feedback.text)
      } else {
        world.interactionPromptByPlayer.delete(playerEid)
      }
      continue
    }

    const previousTarget = world.interactionTargetByPlayer.get(playerEid)
    if (previousTarget !== target.key) {
      const existingHoldTicks = world.interactionHoldTicksByPlayer.get(playerEid) ?? 0
      if (existingHoldTicks >= 0) {
        world.interactionHoldTicksByPlayer.set(playerEid, 0)
      }
      world.interactionTargetByPlayer.set(playerEid, target.key)
    }

    let holdTicks = world.interactionHoldTicksByPlayer.get(playerEid) ?? 0
    if (holdTicks < 0) {
      if (releaseObserved) {
        holdTicks = 0
      }
    } else {
      if (!interactDown) {
        if (!hasNetworkInput || hasFreshNetworkInput) {
          holdTicks = 0
        }
      } else {
        holdTicks++
        if (holdTicks >= INTERACT_HOLD_TICKS) {
          resolveInteraction(world, playerEid, target)
          holdTicks = -1
        }
      }
    }

    world.interactionHoldTicksByPlayer.set(playerEid, holdTicks)
    const nextFeedback = world.interactionFeedbackByPlayer.get(playerEid)
    world.interactionPromptByPlayer.set(playerEid, nextFeedback ? nextFeedback.text : target.prompt)
  }
}
