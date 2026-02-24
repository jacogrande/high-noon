/**
 * Weapon Mod Effects (Behavioral)
 *
 * Follows the nodeEffects.ts pattern: registers hooks when a behavioral mod
 * is applied. Phase 1 mods are all stat-only, so this is currently empty.
 *
 * Future mods like Ricochet Rounds, Dragon's Breath, Flechette Rounds,
 * and Tesla Coil will register hooks here.
 */

import type { GameWorld } from '../world'
import { getWeaponModDef } from './weaponMods'

type ModEffectRegistrar = (world: GameWorld, playerEid: number) => void

const MOD_EFFECT_REGISTRY: Record<string, ModEffectRegistrar> = {
  // Future behavioral mods go here, keyed by mod `key`:
  // ricochet_rounds: registerRicochetRounds,
  // dragons_breath: registerDragonsBreath,
  // flechette_rounds: registerFlechetteRounds,
  // tesla_coil: registerTeslaCoil,
}

/**
 * Apply behavioral effects for a weapon mod (if any).
 * Called after stat mods are applied via recomputePlayerStats.
 */
export function applyWeaponModEffect(world: GameWorld, modId: number, playerEid: number): void {
  const def = getWeaponModDef(modId)
  if (!def || !def.hasEffect) return

  const registrar = MOD_EFFECT_REGISTRY[def.key]
  if (registrar) {
    registrar(world, playerEid)
  }
}
