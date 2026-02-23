import { describe, expect, test, beforeEach } from 'bun:test'
import { createGameWorld, type GameWorld } from '../world'
import { spawnPlayer } from '../prefabs'
import { tryVisitorPurchase } from './campVisitor'
import { getUpgradeStateForPlayer, FOOLS_ERRAND_ID } from '../upgrade'
import { getItemDefByKey } from '../content/items'

function setupVisitorWorld(seed = 42): { world: GameWorld; playerEid: number } {
  const world = createGameWorld(seed)
  const playerEid = spawnPlayer(world, 100, 100)

  const brassItem = getItemDefByKey('gun_oil_tin')!
  world.campVisitor = {
    visitorId: 1,
    greeting: 'Howdy',
    greetingIndex: 0,
    offers: [
      { itemId: brassItem.id, price: 20, sold: false },
      { itemId: brassItem.id, price: 30, sold: false },
    ],
  }
  world.goldCollected = 100

  return { world, playerEid }
}

describe('tryVisitorPurchase', () => {
  test('succeeds under normal conditions', () => {
    const { world, playerEid } = setupVisitorWorld()

    const result = tryVisitorPurchase(world, playerEid, 0)

    expect(result).toBe(true)
    expect(world.goldCollected).toBe(80) // 100 - 20
    expect(world.campVisitor!.offers[0]!.sold).toBe(true)
  })

  test('rejects when player has Fool\'s Errand', () => {
    const { world, playerEid } = setupVisitorWorld()

    const us = getUpgradeStateForPlayer(world, playerEid)
    us.items.set(FOOLS_ERRAND_ID, 1)

    const result = tryVisitorPurchase(world, playerEid, 0)

    expect(result).toBe(false)
    expect(world.goldCollected).toBe(100) // No gold spent
    expect(world.campVisitor!.offers[0]!.sold).toBe(false) // Not sold
  })

  test('rejects when insufficient gold', () => {
    const { world, playerEid } = setupVisitorWorld()
    world.goldCollected = 5

    const result = tryVisitorPurchase(world, playerEid, 0)

    expect(result).toBe(false)
    expect(world.goldCollected).toBe(5)
  })

  test('rejects already sold offers', () => {
    const { world, playerEid } = setupVisitorWorld()
    world.campVisitor!.offers[0]!.sold = true

    const result = tryVisitorPurchase(world, playerEid, 0)

    expect(result).toBe(false)
  })

  test('rejects when no visitor present', () => {
    const { world, playerEid } = setupVisitorWorld()
    world.campVisitor = null

    const result = tryVisitorPurchase(world, playerEid, 0)

    expect(result).toBe(false)
  })
})
