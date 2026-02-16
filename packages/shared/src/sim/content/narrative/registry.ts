import type { SeededRng } from '../../../math/rng'
import type { NarrativeDialogue, NarrativeState, PlotThread } from './types'

const THREADS = new Map<string, PlotThread>()

export function registerThread(thread: PlotThread): void {
  THREADS.set(thread.id, thread)
}

export function getThread(id: string): PlotThread | undefined {
  return THREADS.get(id)
}

export function getAllThreads(): PlotThread[] {
  return [...THREADS.values()]
}

export function selectThread(rng: SeededRng): PlotThread {
  const all = getAllThreads()
  if (all.length === 0) {
    throw new Error('No plot threads are registered')
  }
  return all[rng.nextInt(all.length)]!
}

export function selectIntroCrawl(rng: SeededRng, thread: PlotThread): string {
  if (thread.introCrawls.length === 0) return thread.premise
  return thread.introCrawls[rng.nextInt(thread.introCrawls.length)]!
}

export function pickNarrativeLine(
  state: NarrativeState,
  lines: NarrativeDialogue[],
): NarrativeDialogue | null {
  for (const line of lines) {
    if (state.shownDialogue.has(line.key)) continue
    if (line.requiresKey && !state.unlockedKeys.has(line.requiresKey)) continue
    if (line.requiresOutcome) {
      const actual = state.outcomes[line.requiresOutcome.stage]
      if (actual !== line.requiresOutcome.outcome) continue
    }
    return line
  }
  return null
}
