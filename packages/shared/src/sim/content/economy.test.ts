import { describe, expect, test } from 'bun:test'
import { SeededRng } from '../../math/rng'
import {
  SHOVEL_BASE_PRICE,
  SHOVEL_STAGE_PRICE_STEP,
  getShovelPrice,
  rollStashReward,
  upgradeItemRarity,
} from './economy'
import { getItemDef, type ItemRarity } from './items'

describe('economy', () => {
  test('shovel price scales by stage index', () => {
    expect(getShovelPrice(0)).toBe(SHOVEL_BASE_PRICE)
    expect(getShovelPrice(1)).toBe(SHOVEL_BASE_PRICE + SHOVEL_STAGE_PRICE_STEP)
    expect(getShovelPrice(2)).toBe(SHOVEL_BASE_PRICE + SHOVEL_STAGE_PRICE_STEP * 2)
  })

  test('stash rewards are deterministic for a fixed rng stream', () => {
    const rngA = new SeededRng(12345)
    const rngB = new SeededRng(12345)
    const seqA = Array.from({ length: 8 }, () => rollStashReward(rngA, 1))
    const seqB = Array.from({ length: 8 }, () => rollStashReward(rngB, 1))
    expect(seqA).toEqual(seqB)
  })

  test('stash rewards always give items and no gold', () => {
    const rng = new SeededRng(42)
    for (let i = 0; i < 200; i++) {
      const reward = rollStashReward(rng, i % 3)
      expect(reward.gold).toBe(0)
      expect(reward.itemId).not.toBeNull()
    }
  })

  test('stash rewards include all rarity tiers', () => {
    // Use enough samples to hit all rarity bands
    const rng = new SeededRng(999)
    const rarities = new Set<boolean>()
    let hasItem = false
    for (let i = 0; i < 500; i++) {
      const reward = rollStashReward(rng, 0)
      if (reward.itemId !== null) hasItem = true
      rarities.add(reward.rare)
    }
    expect(hasItem).toBe(true)
    expect(rarities.has(true)).toBe(true)   // some rare (gold/cursed)
    expect(rarities.has(false)).toBe(true)  // some common (brass/silver)
  })
})

describe('upgradeItemRarity', () => {
  test('brass upgrades to silver', () => {
    expect(upgradeItemRarity('brass')).toBe('silver')
  })

  test('silver upgrades to gold', () => {
    expect(upgradeItemRarity('silver')).toBe('gold')
  })

  test('gold stays gold (ceiling)', () => {
    expect(upgradeItemRarity('gold')).toBe('gold')
  })

  test('cursed stays cursed', () => {
    expect(upgradeItemRarity('cursed')).toBe('cursed')
  })
})

describe('rollStashReward flags', () => {
  test('rarityUpgrade upgrades brass to silver', () => {
    // Run enough rolls to get brass-band hits (roll < 0.65) and verify they produce silver items
    const rng = new SeededRng(42)
    const rarities = new Set<ItemRarity>()
    for (let i = 0; i < 200; i++) {
      const reward = rollStashReward(rng, 0, true)
      if (reward.itemId !== null) {
        const def = getItemDef(reward.itemId)
        if (def) rarities.add(def.rarity)
      }
    }
    // With rarityUpgrade: brass→silver, silver→gold; no brass items should appear
    expect(rarities.has('brass')).toBe(false)
    // Should have silver (from upgraded brass) and gold (from upgraded silver + natural gold)
    expect(rarities.has('silver')).toBe(true)
    expect(rarities.has('gold')).toBe(true)
  })

  test('rarityUpgrade sets rare=true for upgraded gold items', () => {
    // With rarityUpgrade, silver→gold should produce rare=true
    const rng = new SeededRng(42)
    let gotRareFromUpgrade = false
    for (let i = 0; i < 200; i++) {
      const reward = rollStashReward(rng, 0, true)
      if (reward.rare && reward.itemId !== null) {
        gotRareFromUpgrade = true
      }
    }
    expect(gotRareFromUpgrade).toBe(true)
  })

  test('rarityFloorSilver converts brass band to silver', () => {
    const rng = new SeededRng(42)
    const rarities = new Set<ItemRarity>()
    for (let i = 0; i < 200; i++) {
      const reward = rollStashReward(rng, 0, false, true)
      if (reward.itemId !== null) {
        const def = getItemDef(reward.itemId)
        if (def) rarities.add(def.rarity)
      }
    }
    // No brass — the 65% brass band rolls silver instead
    expect(rarities.has('brass')).toBe(false)
    expect(rarities.has('silver')).toBe(true)
  })

  test('both flags combined: brass→silver→gold', () => {
    // rarityFloorSilver: brass band → silver
    // rarityUpgrade: silver → gold
    // So the 65% brass band produces gold items
    const rng = new SeededRng(42)
    const rarities = new Set<ItemRarity>()
    for (let i = 0; i < 200; i++) {
      const reward = rollStashReward(rng, 0, true, true)
      if (reward.itemId !== null) {
        const def = getItemDef(reward.itemId)
        if (def) rarities.add(def.rarity)
      }
    }
    // No brass, no silver (brass→silver→gold, silver→gold)
    expect(rarities.has('brass')).toBe(false)
    expect(rarities.has('silver')).toBe(false)
    expect(rarities.has('gold')).toBe(true)
  })
})
