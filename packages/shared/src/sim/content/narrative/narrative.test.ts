import { describe, expect, test } from 'bun:test'
import { SeededRng } from '../../../math/rng'
import { pickNarrativeLine, selectIntroCrawl, selectThread } from './registry'
import type { NarrativeState, PlotThread } from './types'
import './index'

function makeState(overrides?: Partial<NarrativeState>): NarrativeState {
  return {
    threadId: 'test',
    outcomes: [],
    shownDialogue: new Set(),
    unlockedKeys: new Set(),
    ...overrides,
  }
}

describe('narrative registry', () => {
  test('selectThread returns deterministic results for same seed', () => {
    const rngA = new SeededRng(12345)
    const rngB = new SeededRng(12345)

    const picksA = [
      selectThread(rngA).id,
      selectThread(rngA).id,
      selectThread(rngA).id,
      selectThread(rngA).id,
    ]
    const picksB = [
      selectThread(rngB).id,
      selectThread(rngB).id,
      selectThread(rngB).id,
      selectThread(rngB).id,
    ]

    expect(picksA).toEqual(picksB)
  })

  test('pickNarrativeLine skips shown lines and respects key/outcome conditions', () => {
    const state = makeState({
      outcomes: ['soft_failure'],
      shownDialogue: new Set(['line_a']),
      unlockedKeys: new Set(['unlock_a']),
    })

    const line = pickNarrativeLine(state, [
      { key: 'line_a', speaker: 'visitor', text: 'already shown' },
      { key: 'line_b', speaker: 'visitor', text: 'needs missing key', requiresKey: 'unlock_b' },
      {
        key: 'line_c',
        speaker: 'visitor',
        text: 'needs outcome',
        requiresOutcome: { stage: 0, outcome: 'soft_failure' },
      },
    ])

    expect(line?.key).toBe('line_c')
  })

  test('selectIntroCrawl uses premise fallback when no variants exist', () => {
    const thread: PlotThread = {
      id: 'fallback',
      name: 'Fallback',
      premise: 'Fallback premise line',
      introCrawls: [],
      stages: [{ bossPool: [] }],
      campDialogue: [],
      bossTaunts: {},
      resolution: {
        success: 'ok',
        softFailure: 'ok',
      },
    }

    expect(selectIntroCrawl(new SeededRng(1), thread)).toBe('Fallback premise line')
  })

  test('selectIntroCrawl is deterministic for same seed and thread', () => {
    const thread: PlotThread = {
      id: 'deterministic',
      name: 'Deterministic',
      premise: 'Base premise',
      introCrawls: ['A', 'B', 'C'],
      stages: [{ bossPool: [] }],
      campDialogue: [],
      bossTaunts: {},
      resolution: {
        success: 'ok',
        softFailure: 'ok',
      },
    }

    const rngA = new SeededRng(999)
    const rngB = new SeededRng(999)
    expect(selectIntroCrawl(rngA, thread)).toBe(selectIntroCrawl(rngB, thread))
  })
})
