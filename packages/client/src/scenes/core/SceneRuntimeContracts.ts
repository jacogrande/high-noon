import type { GameWorld } from '@high-noon/shared'
import type { GameplayEvent } from './GameplayEvents'

export interface ISimStateSource {
  world: GameWorld
}

export interface ILocalIdentityState {
  myServerEid: number
  myClientEid: number
}

export interface ILocalIdentityBinding {
  setMyClientEid: (eid: number) => void
  setLocalPlayerRenderEid: (eid: number | null) => void
}

export interface IGameplayEventSink {
  pushGameplayEvent: (event: GameplayEvent) => void
}

export interface IMultiplayerTelemetrySink {
  onSnapshotReceived: (overwrotePending: boolean) => void
  onSnapshotApplied: () => void
  onReconciliationCorrection: (snapped: boolean) => void
  onPredictedBulletsSpawned: (count: number) => void
  onPredictedBulletsMatched: (count: number) => void
  onPredictedBulletsTimedOut: (count: number) => void
}
