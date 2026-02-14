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

  test('later stages produce higher average stash payout', () => {
    const samples = 200
    const rngA = new SeededRng(7)
    const rngB = new SeededRng(7)
    let stage0 = 0
    let stage2 = 0
    for (let i = 0; i < samples; i++) {
      stage0 += rollStashReward(rngA, 0).gold
      stage2 += rollStashReward(rngB, 2).gold
    }
    expect(stage2 / samples).toBeGreaterThan(stage0 / samples)
  })
})
