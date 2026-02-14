import { describe, expect, test } from 'bun:test'
import {
  getItemDef,
  getItemDefByKey,
  getItemsByRarity,
  getAllItems,
  computeLinearBonus,
  computeHyperbolicChance,
  computeAdditiveChance,
  TIN_STAR_COEFFICIENT,
  MAX_ITEM_SLOTS,
} from './items'

describe('items', () => {
  test('all 12 Wave 1 items are defined', () => {
    expect(getAllItems().length).toBe(12)
  })

  test('getItemDef returns correct item by id', () => {
    const item = getItemDef(1)
    expect(item).toBeDefined()
    expect(item!.key).toBe('gun_oil_tin')
    expect(item!.name).toBe('Gun Oil Tin')
  })

  test('getItemDefByKey returns correct item', () => {
    const item = getItemDefByKey('powder_keg')
    expect(item).toBeDefined()
    expect(item!.id).toBe(9)
    expect(item!.rarity).toBe('silver')
  })

  test('getItemsByRarity returns correct counts', () => {
    expect(getItemsByRarity('brass').length).toBe(6)
    expect(getItemsByRarity('silver').length).toBe(4)
    expect(getItemsByRarity('gold').length).toBe(2)
  })

  test('all item IDs are unique', () => {
    const ids = getAllItems().map(i => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('all item keys are unique', () => {
    const keys = getAllItems().map(i => i.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  test('gold items have maxStack = 1', () => {
    for (const item of getItemsByRarity('gold')) {
      expect(item.maxStack).toBe(1)
      expect(item.stackFormula).toBe('unique')
    }
  })

  test('MAX_ITEM_SLOTS is 8', () => {
    expect(MAX_ITEM_SLOTS).toBe(8)
  })
})

describe('stacking math', () => {
  test('computeLinearBonus scales linearly', () => {
    expect(computeLinearBonus(0.12, 1)).toBeCloseTo(0.12)
    expect(computeLinearBonus(0.12, 3)).toBeCloseTo(0.36)
    expect(computeLinearBonus(0.12, 5)).toBeCloseTo(0.60)
  })

  test('computeHyperbolicChance approaches but never reaches 1', () => {
    expect(computeHyperbolicChance(TIN_STAR_COEFFICIENT, 0)).toBe(0)
    expect(computeHyperbolicChance(TIN_STAR_COEFFICIENT, 1)).toBeCloseTo(0.107, 2)
    expect(computeHyperbolicChance(TIN_STAR_COEFFICIENT, 5)).toBeCloseTo(0.375, 2)
    expect(computeHyperbolicChance(TIN_STAR_COEFFICIENT, 10)).toBeCloseTo(0.545, 2)
    expect(computeHyperbolicChance(TIN_STAR_COEFFICIENT, 100)).toBeLessThan(1)
  })

  test('computeAdditiveChance caps at 1.0', () => {
    expect(computeAdditiveChance(0.08, 1)).toBeCloseTo(0.08)
    expect(computeAdditiveChance(0.08, 5)).toBeCloseTo(0.40)
    expect(computeAdditiveChance(0.08, 13)).toBe(1.0)
    expect(computeAdditiveChance(0.08, 20)).toBe(1.0)
  })
})
