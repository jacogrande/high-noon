/**
 * Low-frequency interactable state for stage props/NPCs.
 * Sent from server to clients at HUD cadence.
 */
export interface SalesmanData {
  x: number
  y: number
  stageIndex: number
  camp: boolean
  active: boolean
  shovelPrice: number
}

export interface StashData {
  id: number
  x: number
  y: number
  stageIndex: number
  opened: boolean
}

export interface InteractablesData {
  salesman: SalesmanData | null
  stashes: StashData[]
}
