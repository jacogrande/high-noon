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

/**
 * Stage 1 encounter — 4 escalating waves
 */
export const STAGE_1_ENCOUNTER: StageEncounter = {
  waves: [
    // Wave 1: Gentle intro — swarmers only, 1 shooter (must kill it)
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
    // Wave 2: Ramp up — kill 1 of 2 threats to advance
    {
      fodderBudget: 20,
      fodderPool: [
        { type: EnemyType.SWARMER, weight: 2 },
        { type: EnemyType.GRUNT, weight: 2 },
      ],
      maxFodderAlive: 8,
      threats: [
        { type: EnemyType.SHOOTER, count: 1 },
        { type: EnemyType.CHARGER, count: 1 },
      ],
      spawnDelay: 6,
      threatClearRatio: 0.5,
    },
    // Wave 3: Pressure — kill 2 of 3 threats to advance
    {
      fodderBudget: 30,
      fodderPool: [
        { type: EnemyType.SWARMER, weight: 3 },
        { type: EnemyType.GRUNT, weight: 2 },
      ],
      maxFodderAlive: 10,
      threats: [
        { type: EnemyType.SHOOTER, count: 2 },
        { type: EnemyType.CHARGER, count: 1 },
      ],
      spawnDelay: 6,
      threatClearRatio: 0.6,
    },
    // Wave 4: Boss rush — kill 2 of 4 threats to complete
    {
      fodderBudget: 40,
      fodderPool: [
        { type: EnemyType.SWARMER, weight: 2 },
        { type: EnemyType.GRUNT, weight: 3 },
      ],
      maxFodderAlive: 12,
      threats: [
        { type: EnemyType.SHOOTER, count: 2 },
        { type: EnemyType.CHARGER, count: 2 },
      ],
      spawnDelay: 8,
      threatClearRatio: 0.5,
    },
  ],
}
