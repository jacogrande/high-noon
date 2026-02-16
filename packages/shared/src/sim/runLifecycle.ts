import type { SeededRng } from '../math/rng'
import { getAllThreads, getThread, selectIntroCrawl, selectThread, type NarrativeState } from './content/narrative'
import type { StageEncounter } from './content/waves'

export interface RunNarrativeSetup {
  narrative: NarrativeState | null
  runIntroTitle: string | null
  runIntroText: string | null
}

function cloneStageEncounter(encounter: StageEncounter): StageEncounter {
  return {
    ...encounter,
    waves: encounter.waves.map(wave => ({
      ...wave,
      fodderPool: wave.fodderPool.map(entry => ({ ...entry })),
      threats: wave.threats.map(threat => ({ ...threat })),
    })),
    ...(encounter.objective ? { objective: { ...encounter.objective } } : {}),
    ...(encounter.bossPool ? { bossPool: [...encounter.bossPool] } : {}),
  }
}

export function cloneRunStages(stages: StageEncounter[]): StageEncounter[] {
  return stages.map(cloneStageEncounter)
}

export function createRunNarrativeSetup(rng: SeededRng): RunNarrativeSetup {
  if (getAllThreads().length === 0) {
    return {
      narrative: null,
      runIntroTitle: null,
      runIntroText: null,
    }
  }

  const thread = selectThread(rng)
  if (!thread) {
    return {
      narrative: null,
      runIntroTitle: null,
      runIntroText: null,
    }
  }

  return {
    narrative: {
      threadId: thread.id,
      outcomes: [],
      shownDialogue: new Set(),
      unlockedKeys: new Set(),
    },
    runIntroTitle: thread.name,
    runIntroText: selectIntroCrawl(rng, thread),
  }
}

export function selectBossFromEncounterPool(args: {
  rng: SeededRng
  encounterPool: number[]
  narrative: NarrativeState | null
  currentStage: number | null
}): number {
  let pool = args.encounterPool

  if (args.narrative !== null && args.currentStage !== null) {
    const thread = getThread(args.narrative.threadId)
    const stageConfig = thread?.stages[args.currentStage]
    if (stageConfig && stageConfig.bossPool.length > 0) {
      const filtered = args.encounterPool.filter(type => stageConfig.bossPool.includes(type))
      if (filtered.length > 0) pool = filtered
    }
  }

  return pool[Math.floor(args.rng.next() * pool.length)]!
}
