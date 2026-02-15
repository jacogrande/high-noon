import { describe, expect, test } from 'bun:test'
import { SeededRng } from '../../math/rng'
import {
  SHOVEL_BASE_PRICE,
  SHOVEL_STAGE_PRICE_STEP,
  getShovelPrice,
  rollStashReward,
} from './economy'

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
