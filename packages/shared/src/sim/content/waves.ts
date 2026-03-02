/**
 * Wave & Encounter Definitions
 *
 * Defines the structure of combat encounters: waves of enemies
 * with fodder pools (continuous reinforcement) and threat entries
 * (finite, meaningful kills).
 */

import { EnemyType } from '../components'
import type { MapConfig } from './maps/mapConfig'
import { STAGE_1_MAP_CONFIG, STAGE_2_MAP_CONFIG, STAGE_3_MAP_CONFIG, STAGE_4_MAP_CONFIG } from './maps/mapConfig'
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

/** Stage 1: Town Outskirts — introductory encounter (3 waves)
 *
 *  Teaches core bullet hell skills one at a time:
 *  Wave 1: Drifters (shoot things, basic kiting)
 *  Wave 2: Deadeyes + Spitters (keep moving, dodge patterns)
 *  Wave 3: Full mix + Dustdevils (spatial awareness) → boss
 */
export const STAGE_1_ENCOUNTER: StageEncounter = {
  mapConfig: STAGE_1_MAP_CONFIG,
  objective: STAGE_1_DUEL,
  bossPool: [EnemyType.BOOMSTICK, EnemyType.MAD_DOG, EnemyType.DALTON],
  waves: [
    // Wave 1: Drifters only — learn to shoot and kite
    {
      fodderBudget: 20,
      fodderPool: [
        { type: EnemyType.DRIFTER, weight: 3 },
        { type: EnemyType.KNIFE_DRIFTER, weight: 2 },
      ],
      maxFodderAlive: 12,
      threats: [],
      spawnDelay: 0,
      threatClearRatio: 1.0,
    },
    // Wave 2: Introduce Deadeyes + Spitters — learn to keep moving and dodge spreads
    {
      fodderBudget: 30,
      fodderPool: [
        { type: EnemyType.DRIFTER, weight: 3 },
        { type: EnemyType.KNIFE_DRIFTER, weight: 1 },
        { type: EnemyType.SPITTER, weight: 2 },
      ],
      maxFodderAlive: 14,
      threats: [
        { type: EnemyType.DEADEYE, count: 3 },
      ],
      spawnDelay: 2,
      threatClearRatio: 1.0,
    },
    // Wave 3: Full roster + Dustdevils — spatial awareness, then boss
    {
      fodderBudget: 40,
      fodderPool: [
        { type: EnemyType.DRIFTER, weight: 2 },
        { type: EnemyType.KNIFE_DRIFTER, weight: 1 },
        { type: EnemyType.SPITTER, weight: 2 },
        { type: EnemyType.DUSTDEVIL, weight: 2 },
      ],
      maxFodderAlive: 15,
      threats: [
        { type: EnemyType.DEADEYE, count: 1 },
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
    // Wave 1: Mixed fodder + 1 shooter + 1 lasso bandit + 1 healer shaman
    {
      fodderBudget: 12,
      fodderPool: [
        { type: EnemyType.SWARMER, weight: 2 },
        { type: EnemyType.GRUNT, weight: 3 },
        { type: EnemyType.GOBLIN_ROGUE, weight: 2 },
        { type: EnemyType.DYNAMITE_TOSSER, weight: 1 },
        { type: EnemyType.RATTLESNAKE, weight: 2 },
      ],
      maxFodderAlive: 6,
      threats: [
        { type: EnemyType.SHOOTER, count: 1 },
        { type: EnemyType.LASSO_BANDIT, count: 1 },
        { type: EnemyType.HEALER_SHAMAN, count: 1 },
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
        { type: EnemyType.RATTLESNAKE, weight: 1 },
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
        { type: EnemyType.HEALER_SHAMAN, count: 1 },
        { type: EnemyType.VULTURE, count: 1 },
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
        { type: EnemyType.RATTLESNAKE, weight: 3 },
      ],
      maxFodderAlive: 8,
      threats: [
        { type: EnemyType.HOLLOW_MAN, count: 1 },
        { type: EnemyType.VULTURE, count: 1 },
      ],
      spawnDelay: 3,
      threatClearRatio: 1.0,
    },
  ],
}

/** Stage 4: Crossroads — Old Scratch final boss (1 wave, no fodder) */
export const STAGE_4_ENCOUNTER: StageEncounter = {
  mapConfig: STAGE_4_MAP_CONFIG,
  // No objective — the boss IS the encounter
  waves: [
    {
      fodderBudget: 0,
      fodderPool: [],
      maxFodderAlive: 0,
      threats: [{ type: EnemyType.OLD_SCRATCH, count: 1 }],
      spawnDelay: 2,
      threatClearRatio: 1.0,
    },
  ],
}

/** Default 4-stage run */
export const DEFAULT_RUN_STAGES: StageEncounter[] = [
  STAGE_1_ENCOUNTER,
  STAGE_2_ENCOUNTER,
  STAGE_3_ENCOUNTER,
  STAGE_4_ENCOUNTER,
]
