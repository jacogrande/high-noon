/**
 * Shared ECS Queries
 *
 * Common queries used by multiple systems. Defined once to avoid
 * redundant defineQuery() calls across system files.
 */

import { defineQuery } from 'bitecs'
import { Player, Position } from './components'

/** Player entity with position — used by enemy AI, steering, detection, flow field */
export const playerQuery = defineQuery([Player, Position])
