import type { GameWorld } from './world'
import { getCharacterDef } from './content/characters'

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

const VALID_FF_MODES = ['none', 'reduced', 'full']

/**
 * Validate world state after creation or reset.
 * Catches misconfigurations early — cheap to run every time.
 */
export function validateWorld(world: GameWorld): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!Number.isFinite(world.initialSeed)) {
    errors.push(`initialSeed must be finite, got ${world.initialSeed}`)
  }

  if (world.activePlayerCount < 1 || world.activePlayerCount > 8) {
    errors.push(`activePlayerCount must be 1-8, got ${world.activePlayerCount}`)
  }

  if (world.maxProjectiles <= 0) {
    errors.push(`maxProjectiles must be > 0, got ${world.maxProjectiles}`)
  }

  if (!getCharacterDef(world.characterId as any)) {
    errors.push(`Unknown characterId '${world.characterId}'`)
  }

  if (!VALID_FF_MODES.includes(world.friendlyFireMode)) {
    errors.push(`Invalid friendlyFireMode '${world.friendlyFireMode}'`)
  }

  if (world.tick < 0) {
    errors.push(`tick must be >= 0, got ${world.tick}`)
  }

  return { valid: errors.length === 0, errors, warnings }
}
