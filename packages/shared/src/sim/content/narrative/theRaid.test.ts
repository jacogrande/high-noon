import { describe, expect, test } from 'bun:test'
import { getBoss } from '../bosses'
import { THE_RAID } from './theRaid'
import { THE_STRANGER } from './theStranger'

describe('narrative thread content', () => {
  test('The Raid has valid stage config coverage', () => {
    expect(THE_RAID.stages.length).toBe(3)
    expect(THE_RAID.campDialogue.some(pool => pool.campIndex === 0)).toBe(true)
    expect(THE_RAID.campDialogue.some(pool => pool.campIndex === 1)).toBe(true)
    expect(THE_RAID.introCrawls.length).toBeGreaterThanOrEqual(2)
    expect(THE_RAID.resolution.success.length).toBeGreaterThan(0)
    expect(THE_RAID.resolution.softFailure.length).toBeGreaterThan(0)

    for (const stage of THE_RAID.stages) {
      for (const bossType of stage.bossPool) {
        expect(getBoss(bossType)).toBeDefined()
        expect(THE_RAID.bossTaunts[bossType]).toBeString()
      }
    }
  })

  test('The Stranger has valid stage config coverage', () => {
    expect(THE_STRANGER.stages.length).toBe(3)
    expect(THE_STRANGER.campDialogue.some(pool => pool.campIndex === 0)).toBe(true)
    expect(THE_STRANGER.campDialogue.some(pool => pool.campIndex === 1)).toBe(true)
    expect(THE_STRANGER.introCrawls.length).toBeGreaterThanOrEqual(2)
    expect(THE_STRANGER.resolution.success.length).toBeGreaterThan(0)
    expect(THE_STRANGER.resolution.softFailure.length).toBeGreaterThan(0)

    for (const stage of THE_STRANGER.stages) {
      for (const bossType of stage.bossPool) {
        expect(getBoss(bossType)).toBeDefined()
        expect(THE_STRANGER.bossTaunts[bossType]).toBeString()
      }
    }
  })
})
