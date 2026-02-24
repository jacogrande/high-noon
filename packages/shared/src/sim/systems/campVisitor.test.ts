import { describe, expect, test, beforeEach } from 'bun:test'
import { createGameWorld, type GameWorld } from '../world'
import { spawnPlayer } from '../prefabs'
import { tryVisitorPurchase, tryTinkererModSelect, type WeaponModOffer } from './campVisitor'
import { getUpgradeStateForPlayer, FOOLS_ERRAND_ID } from '../upgrade'
import { getItemDefByKey } from '../content/items'
import { getModsForCharacter } from '../content/weaponMods'

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
    modOffers: [],
    modOffersByPlayer: new Map(),
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

function setupTinkererWorld(seed = 42): { world: GameWorld; playerEid: number; modOffers: WeaponModOffer[] } {
  const world = createGameWorld(seed)
  const playerEid = spawnPlayer(world, 100, 100)

  // Sheriff mods (IDs 1-6) — default world character is sheriff
  const sheriffMods = getModsForCharacter('sheriff')
  const modOffers: WeaponModOffer[] = sheriffMods.slice(0, 3).map(m => ({ modId: m.id, taken: false }))

  world.campVisitor = {
    visitorId: 2, // Tinkerer
    greeting: 'Let me take a look at that iron...',
    greetingIndex: 0,
    offers: [],
    modOffers,
    modOffersByPlayer: new Map([[playerEid, modOffers]]),
  }

  return { world, playerEid, modOffers }
}

describe('tryTinkererModSelect', () => {
  test('succeeds and adds mod to player state', () => {
    const { world, playerEid, modOffers } = setupTinkererWorld()

    const result = tryTinkererModSelect(world, playerEid, 0)

    expect(result).toBe(true)
    expect(modOffers[0]!.taken).toBe(true)
    const us = getUpgradeStateForPlayer(world, playerEid)
    expect(us.weaponMods.has(modOffers[0]!.modId)).toBe(true)
  })

  test('rejects wrong character mod', () => {
    const world = createGameWorld(42)
    const playerEid = spawnPlayer(world, 100, 100)

    // Offer undertaker mods to a sheriff player
    const undertakerMods = getModsForCharacter('undertaker')
    const modOffers: WeaponModOffer[] = undertakerMods.slice(0, 2).map(m => ({ modId: m.id, taken: false }))
    world.campVisitor = {
      visitorId: 2,
      greeting: 'Test',
      greetingIndex: 0,
      offers: [],
      modOffers,
      modOffersByPlayer: new Map([[playerEid, modOffers]]),
    }

    const result = tryTinkererModSelect(world, playerEid, 0)

    expect(result).toBe(false)
    expect(modOffers[0]!.taken).toBe(false)
  })

  test('enforces one mod per visit', () => {
    const { world, playerEid, modOffers } = setupTinkererWorld()

    const first = tryTinkererModSelect(world, playerEid, 0)
    expect(first).toBe(true)

    const second = tryTinkererModSelect(world, playerEid, 1)
    expect(second).toBe(false)
    expect(modOffers[1]!.taken).toBe(false)
  })

  test('rejects out-of-bounds offer index', () => {
    const { world, playerEid } = setupTinkererWorld()

    expect(tryTinkererModSelect(world, playerEid, -1)).toBe(false)
    expect(tryTinkererModSelect(world, playerEid, 99)).toBe(false)
  })

  test('rejects when no visitor present', () => {
    const { world, playerEid } = setupTinkererWorld()
    world.campVisitor = null

    expect(tryTinkererModSelect(world, playerEid, 0)).toBe(false)
  })

  test('recomputes player stats after mod selection', () => {
    const { world, playerEid } = setupTinkererWorld()
    const usBefore = getUpgradeStateForPlayer(world, playerEid)
    const rangeBefore = usBefore.range

    // Mod 0 is 'long_barrel' which has range mul 1.6
    const result = tryTinkererModSelect(world, playerEid, 0)
    expect(result).toBe(true)

    const usAfter = getUpgradeStateForPlayer(world, playerEid)
    expect(usAfter.range).not.toBe(rangeBefore)
  })
})
