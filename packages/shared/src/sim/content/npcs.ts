/**
 * NPC Content Definitions
 *
 * Discovery NPCs — non-combat flavor characters that appear in stages,
 * have movement patterns, and trigger dialogue when the player approaches.
 */

import { NpcMovementType } from '../components'

export interface NpcDialogueLine {
  /** The text to display */
  text: string
  /** Display duration in seconds (auto-calculated from text length if omitted) */
  duration?: number
}

export interface NpcDef {
  /** Unique type ID (matches Npc.type) */
  id: number
  /** Display name (for debug/future UI) */
  name: string
  /** Sprite identifier (for AssetLoader) */
  spriteId: string
  /** Movement pattern */
  movement: number
  /** Movement speed in pixels/second (0 for NONE) */
  speed: number
  /** Movement range in pixels (pace distance or wander radius) */
  moveRange: number
  /** Distance at which player triggers dialogue (pixels) */
  triggerDistance: number
  /** Dialogue lines — one is chosen randomly per trigger */
  lines: NpcDialogueLine[]
  /** Whether NPC can be re-triggered after cooldown (vs one-shot) */
  repeatable: boolean
  /** Cooldown between triggers in seconds (if repeatable) */
  cooldownTime: number
}

/** NPC type IDs */
export const NPC_TYPE = {
  TOWNSFOLK: 0,
  PROSPECTOR: 1,
  COWBOY: 2,
  PREACHER: 3,
} as const

/** Auto-calculate duration: ~40ms per character + 2s base read time */
function autoDuration(text: string): number {
  return 2.0 + text.length * 0.04
}

function defLine(text: string, duration?: number): NpcDialogueLine {
  return { text, duration: duration ?? autoDuration(text) }
}

export const NPC_DEFS: Record<number, NpcDef> = {
  [NPC_TYPE.TOWNSFOLK]: {
    id: NPC_TYPE.TOWNSFOLK,
    name: 'Townsfolk',
    spriteId: 'npc_townsfolk',
    movement: NpcMovementType.PACE,
    speed: 20,
    moveRange: 48,
    triggerDistance: 80,
    lines: [
      defLine("Ain't safe 'round here no more."),
      defLine("You best watch yourself, stranger."),
      defLine("They came from the canyon at dawn."),
      defLine("I seen what those things do to a man."),
    ],
    repeatable: false,
    cooldownTime: 0,
  },

  [NPC_TYPE.PROSPECTOR]: {
    id: NPC_TYPE.PROSPECTOR,
    name: 'Prospector',
    spriteId: 'npc_prospector',
    movement: NpcMovementType.WANDER,
    speed: 30,
    moveRange: 64,
    triggerDistance: 80,
    lines: [
      defLine("Gold in them hills! ...Or was it lead?"),
      defLine("Don't touch my claim, ya hear?"),
      defLine("Somethin' wrong with the water down there."),
    ],
    repeatable: false,
    cooldownTime: 0,
  },

  [NPC_TYPE.COWBOY]: {
    id: NPC_TYPE.COWBOY,
    name: 'Cowboy',
    spriteId: 'npc_cowboy',
    movement: NpcMovementType.NONE,
    speed: 0,
    moveRange: 0,
    triggerDistance: 80,
    lines: [
      defLine("I'd ride out if I were you."),
      defLine("Last posse that came through... didn't leave."),
      defLine("You got the look of trouble about ya."),
    ],
    repeatable: false,
    cooldownTime: 0,
  },

  [NPC_TYPE.PREACHER]: {
    id: NPC_TYPE.PREACHER,
    name: 'Preacher',
    spriteId: 'npc_preacher',
    movement: NpcMovementType.PACE,
    speed: 15,
    moveRange: 32,
    triggerDistance: 80,
    lines: [
      defLine("The Lord works in mysterious ways, son."),
      defLine("Redemption comes to those who seek it."),
      defLine("I've been prayin', but the sky don't answer."),
      defLine("Even the Devil fears what's in that canyon."),
    ],
    repeatable: false,
    cooldownTime: 0,
  },
}

/** Get NPC definition by type ID */
export function getNpcDef(type: number): NpcDef | undefined {
  return NPC_DEFS[type]
}

/** Spawn position for an NPC in a stage */
export interface NpcSpawn {
  /** NPC type from NPC_TYPE */
  type: number
  /** Spawn tile X (converted to world coords at spawn time) */
  tileX: number
  /** Spawn tile Y */
  tileY: number
}

/**
 * NPC spawns per stage index.
 * Positions are tile coordinates — the spawn system converts to world pixels.
 */
export const STAGE_NPC_SPAWNS: NpcSpawn[][] = [
  // Stage 0: 2 NPCs
  [
    { type: NPC_TYPE.TOWNSFOLK, tileX: 10, tileY: 12 },
    { type: NPC_TYPE.COWBOY, tileX: 38, tileY: 25 },
  ],
  // Stage 1: 2 NPCs
  [
    { type: NPC_TYPE.PROSPECTOR, tileX: 14, tileY: 8 },
    { type: NPC_TYPE.PREACHER, tileX: 40, tileY: 30 },
  ],
  // Stage 2: 1 NPC
  [
    { type: NPC_TYPE.TOWNSFOLK, tileX: 22, tileY: 18 },
  ],
]
