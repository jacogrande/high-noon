/**
 * Wave & Encounter Definitions
 *
 * Defines the structure of combat encounters: waves of enemies
 * with fodder pools (continuous reinforcement) and threat entries
 * (finite, meaningful kills).
 */

import { EnemyType } from '../components'

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
}

/** Stage 1: Town Outskirts — easy intro (3 waves) */
export const STAGE_1_ENCOUNTER: StageEncounter = {
  waves: [
    // Wave 1: Swarmers + 1 shooter
    {
      fodderBudget: 12,
      fodderPool: [
        { type: EnemyType.SWARMER, weight: 3 },
        { type: EnemyType.GRUNT, weight: 1 },
      ],
      maxFodderAlive: 6,
      threats: [
        { type: EnemyType.SHOOTER, count: 1 },
      ],
      spawnDelay: 0,
      threatClearRatio: 1.0,
    },
    // Wave 2: Mixed fodder + 1 shooter + 1 charger
    {
      fodderBudget: 18,
      fodderPool: [
        { type: EnemyType.SWARMER, weight: 2 },
        { type: EnemyType.GRUNT, weight: 2 },
        { type: EnemyType.GOBLIN_ROGUE, weight: 2 },
      ],
      maxFodderAlive: 8,
      threats: [
        { type: EnemyType.SHOOTER, count: 1 },
        { type: EnemyType.CHARGER, count: 1 },
      ],
      spawnDelay: 5,
      threatClearRatio: 0.5,
    },
    // Wave 3: Heavier fodder + 2 shooters
    {
      fodderBudget: 24,
      fodderPool: [
        { type: EnemyType.SWARMER, weight: 2 },
        { type: EnemyType.GRUNT, weight: 2 },
        { type: EnemyType.GOBLIN_ROGUE, weight: 2 },
        { type: EnemyType.GOBLIN_BARBARIAN, weight: 1 },
      ],
      maxFodderAlive: 10,
      threats: [
        { type: EnemyType.SHOOTER, count: 2 },
      ],
      spawnDelay: 5,
      threatClearRatio: 1.0,
    },
  ],
}

/** Stage 2: Badlands — medium pressure (3 waves) */
export const STAGE_2_ENCOUNTER: StageEncounter = {
  waves: [
    // Wave 1: Mixed fodder + 2 shooters
    {
      fodderBudget: 25,
      fodderPool: [
        { type: EnemyType.SWARMER, weight: 2 },
        { type: EnemyType.GRUNT, weight: 3 },
        { type: EnemyType.GOBLIN_ROGUE, weight: 2 },
      ],
      maxFodderAlive: 10,
      threats: [
        { type: EnemyType.SHOOTER, count: 2 },
      ],
      spawnDelay: 0,
      threatClearRatio: 1.0,
    },
    // Wave 2: Heavy mix + shooter + 2 chargers
    {
      fodderBudget: 30,
      fodderPool: [
        { type: EnemyType.SWARMER, weight: 2 },
        { type: EnemyType.GRUNT, weight: 2 },
        { type: EnemyType.GOBLIN_ROGUE, weight: 3 },
        { type: EnemyType.GOBLIN_BARBARIAN, weight: 2 },
      ],
      maxFodderAlive: 12,
      threats: [
        { type: EnemyType.SHOOTER, count: 1 },
        { type: EnemyType.CHARGER, count: 2 },
      ],
      spawnDelay: 5,
      threatClearRatio: 0.6,
    },
    // Wave 3: Full pressure + 3 threats
    {
      fodderBudget: 35,
      fodderPool: [
        { type: EnemyType.SWARMER, weight: 2 },
        { type: EnemyType.GRUNT, weight: 3 },
        { type: EnemyType.GOBLIN_ROGUE, weight: 2 },
        { type: EnemyType.GOBLIN_BARBARIAN, weight: 3 },
      ],
      maxFodderAlive: 14,
      threats: [
        { type: EnemyType.SHOOTER, count: 2 },
        { type: EnemyType.CHARGER, count: 1 },
      ],
      spawnDelay: 5,
      threatClearRatio: 0.6,
    },
  ],
}

/** Stage 3: Devil's Canyon — hard finish (3 waves) */
export const STAGE_3_ENCOUNTER: StageEncounter = {
  waves: [
    // Wave 1: Immediate pressure + 2 shooters + 1 charger
    {
      fodderBudget: 30,
      fodderPool: [
        { type: EnemyType.SWARMER, weight: 2 },
        { type: EnemyType.GRUNT, weight: 3 },
        { type: EnemyType.GOBLIN_ROGUE, weight: 3 },
        { type: EnemyType.GOBLIN_BARBARIAN, weight: 2 },
      ],
      maxFodderAlive: 12,
      threats: [
        { type: EnemyType.SHOOTER, count: 2 },
        { type: EnemyType.CHARGER, count: 1 },
      ],
      spawnDelay: 0,
      threatClearRatio: 0.6,
    },
    // Wave 2: Heavy swarm + 2 chargers + 1 shooter
    {
      fodderBudget: 40,
      fodderPool: [
        { type: EnemyType.SWARMER, weight: 3 },
        { type: EnemyType.GRUNT, weight: 2 },
        { type: EnemyType.GOBLIN_ROGUE, weight: 3 },
        { type: EnemyType.GOBLIN_BARBARIAN, weight: 3 },
      ],
      maxFodderAlive: 14,
      threats: [
        { type: EnemyType.CHARGER, count: 2 },
        { type: EnemyType.SHOOTER, count: 1 },
      ],
      spawnDelay: 5,
      threatClearRatio: 0.6,
    },
    // Wave 3: Final stand — massive fodder + 4 threats
    {
      fodderBudget: 45,
      fodderPool: [
        { type: EnemyType.SWARMER, weight: 2 },
        { type: EnemyType.GRUNT, weight: 3 },
        { type: EnemyType.GOBLIN_ROGUE, weight: 3 },
        { type: EnemyType.GOBLIN_BARBARIAN, weight: 3 },
      ],
      maxFodderAlive: 16,
      threats: [
        { type: EnemyType.SHOOTER, count: 2 },
        { type: EnemyType.CHARGER, count: 2 },
      ],
      spawnDelay: 6,
      threatClearRatio: 0.5,
    },
  ],
}

/** Default 3-stage run */
export const DEFAULT_RUN_STAGES: StageEncounter[] = [
  STAGE_1_ENCOUNTER,
  STAGE_2_ENCOUNTER,
  STAGE_3_ENCOUNTER,
]
