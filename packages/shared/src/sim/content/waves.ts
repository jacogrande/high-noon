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
import { STAGE_1_DUEL, STAGE_2_PROTECT, STAGE_3_INTERCEPT } from './objectives'

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

export interface ObjectiveConfig {
  type: 'protect' | 'intercept' | 'duel'
  description: string
  // Protect
  protectHP?: number
  protectPosition?: 'center' | 'random'
  attackerSpawnInterval?: number
  maxAttackersAlive?: number
  // Intercept
  runnerSpawnInterval?: number
  runnerSpeed?: number
  runnerHP?: number
  escapeThreshold?: number
  totalRunners?: number
  // Duel
  duelistHP?: number
  duelistDamage?: number
  ringRadius?: number
}

export interface StageEncounter {
  waves: WaveDefinition[]
  mapConfig: MapConfig
  objective?: ObjectiveConfig
  /** Pool of EnemyType values eligible as boss for this stage. Encounter
   *  builder picks one at random via world.rng when the stage starts. */
  bossPool?: number[]
}

/** Stage 1: Town Outskirts — easy intro (2 waves) */
export const STAGE_1_ENCOUNTER: StageEncounter = {
  mapConfig: STAGE_1_MAP_CONFIG,
  objective: STAGE_1_DUEL,
  bossPool: [EnemyType.BOOMSTICK, EnemyType.MAD_DOG, EnemyType.DALTON],
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
  objective: STAGE_2_PROTECT,
  bossPool: [EnemyType.COYOTE_JANE],
  waves: [
    // Wave 1: Mixed fodder + 1 shooter + 1 charger
    {
      fodderBudget: 12,
      fodderPool: [
        { type: EnemyType.SWARMER, weight: 2 },
        { type: EnemyType.GRUNT, weight: 3 },
        { type: EnemyType.GOBLIN_ROGUE, weight: 2 },
        { type: EnemyType.DYNAMITE_TOSSER, weight: 1 },
      ],
      maxFodderAlive: 6,
      threats: [
        { type: EnemyType.SHOOTER, count: 1 },
        { type: EnemyType.LASSO_BANDIT, count: 1 },
      ],
      spawnDelay: 0,
      threatClearRatio: 1.0,
    },
    // Wave 2: Heavier mix + stage boss
    {
      fodderBudget: 16,
      fodderPool: [
        { type: EnemyType.SWARMER, weight: 2 },
        { type: EnemyType.GRUNT, weight: 2 },
        { type: EnemyType.GOBLIN_ROGUE, weight: 3 },
        { type: EnemyType.GOBLIN_BARBARIAN, weight: 2 },
        { type: EnemyType.DYNAMITE_TOSSER, weight: 1 },
      ],
      maxFodderAlive: 7,
      threats: [
        { type: EnemyType.COYOTE_JANE, count: 1 },
      ],
      spawnDelay: 3,
      threatClearRatio: 1.0,
    },
  ],
}

/** Stage 3: Devil's Canyon — hard finish (2 waves) */
export const STAGE_3_ENCOUNTER: StageEncounter = {
  mapConfig: STAGE_3_MAP_CONFIG,
  objective: STAGE_3_INTERCEPT,
  bossPool: [EnemyType.HOLLOW_MAN],
  waves: [
    // Wave 1: Pressure + mixed threats
    {
      fodderBudget: 15,
      fodderPool: [
        { type: EnemyType.SWARMER, weight: 2 },
        { type: EnemyType.GRUNT, weight: 3 },
        { type: EnemyType.GOBLIN_ROGUE, weight: 3 },
        { type: EnemyType.GOBLIN_BARBARIAN, weight: 2 },
        { type: EnemyType.DYNAMITE_TOSSER, weight: 2 },
      ],
      maxFodderAlive: 7,
      threats: [
        { type: EnemyType.LASSO_BANDIT, count: 1 },
        { type: EnemyType.ARMORED_BANDIT, count: 1 },
      ],
      spawnDelay: 0,
      threatClearRatio: 1.0,
    },
    // Wave 2: Final stand + stage boss
    {
      fodderBudget: 20,
      fodderPool: [
        { type: EnemyType.SWARMER, weight: 3 },
        { type: EnemyType.GRUNT, weight: 2 },
        { type: EnemyType.GOBLIN_ROGUE, weight: 3 },
        { type: EnemyType.GOBLIN_BARBARIAN, weight: 3 },
        { type: EnemyType.DYNAMITE_TOSSER, weight: 2 },
      ],
      maxFodderAlive: 8,
      threats: [
        { type: EnemyType.HOLLOW_MAN, count: 1 },
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
