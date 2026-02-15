/**
 * Objective Content Definitions
 *
 * Concrete objective configurations for each stage.
 */

import type { ObjectiveConfig } from './waves'

export const STAGE_2_PROTECT: ObjectiveConfig = {
  type: 'protect',
  description: 'Protect the Town Hall',
  protectHP: 50,
  protectPosition: 'random',
  attackerSpawnInterval: 8,
  maxAttackersAlive: 2,
}

export const STAGE_3_INTERCEPT: ObjectiveConfig = {
  type: 'intercept',
  description: 'Stop the Signal Runners',
  runnerSpawnInterval: 12,
  runnerSpeed: 140,
  runnerHP: 2,
  escapeThreshold: 3,
  totalRunners: 5,
}

export const STAGE_1_DUEL: ObjectiveConfig = {
  type: 'duel',
  description: 'The Stranger Draws',
  duelistHP: 60,
  duelistDamage: 8,
  ringRadius: 120,
}
