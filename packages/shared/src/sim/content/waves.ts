/**
 * Wave & Encounter Definitions
 *
 * Defines the structure of combat encounters: waves of enemies
 * with fodder pools (continuous reinforcement) and threat entries
 * (finite, meaningful kills).
 */

import { EnemyType } from '../components'
import type { MapConfig } from './maps/mapConfig'
import { STAGE_1_MAP_CONFIG, STAGE_2_MAP_CONFIG, STAGE_3_MAP_CONFIG } from './maps/mapConfig'

export interface FodderPool {
  type: number       // EnemyType
  weight: number     // relative spawn probability
}

export interface ThreatEntry {
  type: number       // EnemyType
  count: number
}

export interface WaveDefinition {
  fodderBudget: number
  fodderPool: FodderPool[]
  maxFodderAlive: number
  threats: ThreatEntry[]
  spawnDelay: number       // seconds before wave starts after previous clears
  threatClearRatio: number // fraction of threats to kill for wave advance (0-1)
}

export interface StageEncounter {
  waves: WaveDefinition[]
  mapConfig: MapConfig
}

/** Stage 1: Town Outskirts — easy intro (2 waves) */
export const STAGE_1_ENCOUNTER: StageEncounter = {
  mapConfig: STAGE_1_MAP_CONFIG,
  waves: [
    // Wave 1: Swarmers + 1 shooter
    {
      fodderBudget: 6,
      fodderPool: [
        { type: EnemyType.SWARMER, weight: 3 },
        { type: EnemyType.GRUNT, weight: 1 },
      ],
      maxFodderAlive: 4,
      threats: [
        { type: EnemyType.SHOOTER, count: 1 },
      ],
      spawnDelay: 0,
      threatClearRatio: 1.0,
    },
    // Wave 2: Mixed fodder + stage boss
    {
      fodderBudget: 10,
      fodderPool: [
        { type: EnemyType.SWARMER, weight: 2 },
        { type: EnemyType.GRUNT, weight: 2 },
        { type: EnemyType.GOBLIN_ROGUE, weight: 2 },
      ],
      maxFodderAlive: 5,
      threats: [
        { type: EnemyType.BOOMSTICK, count: 1 },
      ],
      spawnDelay: 3,
      threatClearRatio: 1.0,
    },
  ],
}

/** Stage 2: Badlands — medium pressure (2 waves) */
export const STAGE_2_ENCOUNTER: StageEncounter = {
  mapConfig: STAGE_2_MAP_CONFIG,
  waves: [
    // Wave 1: Mixed fodder + 1 shooter + 1 charger
    {
      fodderBudget: 12,
      fodderPool: [
        { type: EnemyType.SWARMER, weight: 2 },
        { type: EnemyType.GRUNT, weight: 3 },
        { type: EnemyType.GOBLIN_ROGUE, weight: 2 },
      ],
      maxFodderAlive: 6,
      threats: [
        { type: EnemyType.SHOOTER, count: 1 },
        { type: EnemyType.CHARGER, count: 1 },
      ],
      spawnDelay: 0,
      threatClearRatio: 1.0,
    },
    // Wave 2: Heavier mix + shooter + charger
    {
      fodderBudget: 16,
      fodderPool: [
        { type: EnemyType.SWARMER, weight: 2 },
        { type: EnemyType.GRUNT, weight: 2 },
        { type: EnemyType.GOBLIN_ROGUE, weight: 3 },
        { type: EnemyType.GOBLIN_BARBARIAN, weight: 2 },
      ],
      maxFodderAlive: 7,
      threats: [
        { type: EnemyType.SHOOTER, count: 1 },
        { type: EnemyType.CHARGER, count: 1 },
      ],
      spawnDelay: 3,
      threatClearRatio: 1.0,
    },
  ],
}

/** Stage 3: Devil's Canyon — hard finish (2 waves) */
export const STAGE_3_ENCOUNTER: StageEncounter = {
  mapConfig: STAGE_3_MAP_CONFIG,
  waves: [
    // Wave 1: Pressure + 1 shooter + 1 charger
    {
      fodderBudget: 15,
      fodderPool: [
        { type: EnemyType.SWARMER, weight: 2 },
        { type: EnemyType.GRUNT, weight: 3 },
        { type: EnemyType.GOBLIN_ROGUE, weight: 3 },
        { type: EnemyType.GOBLIN_BARBARIAN, weight: 2 },
      ],
      maxFodderAlive: 7,
      threats: [
        { type: EnemyType.SHOOTER, count: 1 },
        { type: EnemyType.CHARGER, count: 1 },
      ],
      spawnDelay: 0,
      threatClearRatio: 1.0,
    },
    // Wave 2: Final stand + 2 threats
    {
      fodderBudget: 20,
      fodderPool: [
        { type: EnemyType.SWARMER, weight: 3 },
        { type: EnemyType.GRUNT, weight: 2 },
        { type: EnemyType.GOBLIN_ROGUE, weight: 3 },
        { type: EnemyType.GOBLIN_BARBARIAN, weight: 3 },
      ],
      maxFodderAlive: 8,
      threats: [
        { type: EnemyType.CHARGER, count: 1 },
        { type: EnemyType.SHOOTER, count: 1 },
      ],
      spawnDelay: 3,
      threatClearRatio: 1.0,
    },
  ],
}

/** Default 3-stage run */
export const DEFAULT_RUN_STAGES: StageEncounter[] = [
  STAGE_1_ENCOUNTER,
  STAGE_2_ENCOUNTER,
  STAGE_3_ENCOUNTER,
]
