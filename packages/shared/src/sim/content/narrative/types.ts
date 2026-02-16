export interface PlotBranchModifier {
  objectiveDescription?: string
  bossPool?: number[]
  unlockDialogue?: string
}

export interface PlotStageConfig {
  bossPool: number[]
  objectiveType?: 'protect' | 'intercept' | 'duel'
  objectiveDescription?: string
  softFailureNext?: PlotBranchModifier
}

export interface NarrativeDialogue {
  key: string
  speaker: 'visitor' | 'narrator'
  text: string
  requiresKey?: string
  requiresOutcome?: { stage: number; outcome: 'success' | 'soft_failure' }
}

export interface CampDialoguePool {
  campIndex: number
  lines: NarrativeDialogue[]
}

export interface PlotThread {
  id: string
  name: string
  premise: string
  introCrawls: string[]
  stages: PlotStageConfig[]
  campDialogue: CampDialoguePool[]
  bossTaunts: Record<number, string>
  resolution: {
    success: string
    softFailure: string
  }
}

export interface NarrativeState {
  threadId: string
  outcomes: Array<'success' | 'soft_failure'>
  shownDialogue: Set<string>
  unlockedKeys: Set<string>
}
