import { describe, expect, test } from 'bun:test'
import { SeededRng } from '../math/rng'
import { EnemyType } from './components'
import { getThread, THE_RAID } from './content/narrative'
import { STAGE_1_MAP_CONFIG } from './content/maps/mapConfig'
import type { StageEncounter } from './content/waves'
import {
  cloneRunStages,
  createRunNarrativeSetup,
  selectBossFromEncounterPool,
} from './runLifecycle'

describe('runLifecycle helpers', () => {
  test('cloneRunStages deep-clones mutable encounter fields', () => {
    const source: StageEncounter = {
      mapConfig: STAGE_1_MAP_CONFIG,
      objective: {
        type: 'protect',
        description: 'Protect the caravan',
        protectHP: 150,
        protectPosition: 'center',
      },
      bossPool: [EnemyType.MAD_DOG],
      waves: [{
        fodderBudget: 8,
        fodderPool: [{ type: EnemyType.SWARMER, weight: 1 }],
        maxFodderAlive: 4,
        threats: [{ type: EnemyType.SHOOTER, count: 1 }],
        spawnDelay: 0,
        threatClearRatio: 1,
      }],
    }

    const cloned = cloneRunStages([source])[0]!
    cloned.waves[0]!.threats[0]!.count = 9
    cloned.waves[0]!.fodderPool[0]!.weight = 7
    if (!cloned.objective) throw new Error('Expected objective')
    cloned.objective.description = 'Mutated'
    cloned.bossPool = [EnemyType.DALTON]

    expect(source.waves[0]!.threats[0]!.count).toBe(1)
    expect(source.waves[0]!.fodderPool[0]!.weight).toBe(1)
    expect(source.objective?.description).toBe('Protect the caravan')
    expect(source.bossPool).toEqual([EnemyType.MAD_DOG])
  })

  test('createRunNarrativeSetup initializes narrative and intro crawl from selected thread', () => {
    const setup = createRunNarrativeSetup(new SeededRng(12345))
    expect(setup.narrative).not.toBeNull()
    if (!setup.narrative) throw new Error('Expected narrative state')

    const thread = getThread(setup.narrative.threadId)
    expect(thread).toBeDefined()
    expect(setup.narrative.outcomes).toEqual([])
    expect(setup.narrative.shownDialogue.size).toBe(0)
    expect(setup.narrative.unlockedKeys.size).toBe(0)
    expect(setup.runIntroTitle).toBe(thread?.name ?? null)
    expect(thread?.introCrawls).toContain(setup.runIntroText)
  })

  test('selectBossFromEncounterPool uses thread stage boss restrictions when available', () => {
    const stageBossPool = THE_RAID.stages[0]?.bossPool ?? []
    expect(stageBossPool.length).toBeGreaterThan(0)

    const selected = selectBossFromEncounterPool({
      rng: new SeededRng(12345),
      encounterPool: [-1, ...stageBossPool],
      narrative: {
        threadId: THE_RAID.id,
        outcomes: [],
        shownDialogue: new Set(),
        unlockedKeys: new Set(),
      },
      currentStage: 0,
    })

    expect(stageBossPool.includes(selected)).toBe(true)
  })

  test('selectBossFromEncounterPool falls back to encounter pool when no stage filter matches', () => {
    const selected = selectBossFromEncounterPool({
      rng: new SeededRng(12345),
      encounterPool: [-1],
      narrative: {
        threadId: THE_RAID.id,
        outcomes: [],
        shownDialogue: new Set(),
        unlockedKeys: new Set(),
      },
      currentStage: 0,
    })

    expect(selected).toBe(-1)
  })
})
