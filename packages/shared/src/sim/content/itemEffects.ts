/**
 * Item Effect Hooks
 *
 * Registers behavioral effects for items that use hook triggers.
 * Follows the same HookRegistry pattern as nodeEffects.ts.
 * Item hooks use 'item:<key>:<playerEid>' IDs for per-player scoping
 * to avoid collisions in multiplayer.
 */

import type { GameWorld } from '../world'
import type { BulletHitResult } from '../hooks'
import { Health, Cylinder, Position } from '../components'
import { hasComponent } from 'bitecs'
import { forEachAliveEnemyInRadius } from '../systems/damageHelpers'
import { applyDamage } from '../systems/applyDamage'
import { getUpgradeStateForPlayer } from '../upgrade'
import { getItemDef } from './items'

/** Build a per-player hook ID for an item effect */
function itemHookId(key: string, playerEid: number): string {
  return `item:${key}:${playerEid}`
}

// ============================================================================
// Effect Registration Functions
// ============================================================================

/**
 * Rattlesnake Fang — 8% chance per stack: bullets deal 3 bonus damage.
 */
function registerRattlesnakeFang(world: GameWorld, stacks: number, playerEid: number): void {
  world.hooks.register('onBulletHit', itemHookId('rattlesnake_fang', playerEid), (
    w: GameWorld,
    bulletEid: number,
    targetEid: number,
    damage: number,
  ): BulletHitResult => {
    const chance = Math.min(0.08 * stacks, 1.0)
    if (w.rng.next() < chance) {
      return { damage: damage + 3, pierce: false }
    }
    return { damage, pierce: false }
  })
}

/**
 * Moonshine Flask — heal 1 HP on kill with internal cooldown.
 * Cooldown: max(0.5, 2 - 0.3 * (stacks - 1))
 */
function registerMoonshineFlask(world: GameWorld, stacks: number, ownerEid: number): void {
  const cooldownDuration = Math.max(0.5, 2 - 0.3 * (stacks - 1))

  world.hooks.register('onKill', itemHookId('moonshine_flask', ownerEid), (
    w: GameWorld,
    playerEid: number,
    _victimEid: number,
  ) => {
    if (playerEid !== ownerEid) return
    const us = getUpgradeStateForPlayer(w, playerEid)
    if (us.moonshineFlaskCooldown > 0) return

    const current = Health.current[playerEid]!
    const max = Health.max[playerEid]!
    if (current > 0 && current < max) {
      Health.current[playerEid] = Math.min(current + 1, max)
      us.moonshineFlaskCooldown = cooldownDuration
    }
  })
}

/**
 * Powder Keg — enemies explode on death.
 * Damage: 4 + 2*(stacks-1), Radius: 50 + 10*(stacks-1)
 */
function registerPowderKeg(world: GameWorld, stacks: number, ownerEid: number): void {
  const explosionDamage = 4 + 2 * (stacks - 1)
  const explosionRadius = 50 + 10 * (stacks - 1)

  world.hooks.register('onKill', itemHookId('powder_keg', ownerEid), (
    w: GameWorld,
    playerEid: number,
    victimEid: number,
  ) => {
    if (playerEid !== ownerEid) return
    const vx = Position.x[victimEid]!
    const vy = Position.y[victimEid]!

    forEachAliveEnemyInRadius(w, vx, vy, explosionRadius, (enemyEid) => {
      if (enemyEid === victimEid) return
      applyDamage(w, enemyEid, {
        amount: explosionDamage,
        ownerPlayerEid: playerEid,
      })
    })
  }, 5) // Run after default priority hooks
}

/**
 * Sidewinder Belt — rolling reloads rounds into cylinder.
 * Rounds: min(stacks, maxRounds - rounds)
 */
function registerSidewinderBelt(world: GameWorld, stacks: number, ownerEid: number): void {
  world.hooks.register('onRollEnd', itemHookId('sidewinder_belt', ownerEid), (
    w: GameWorld,
    playerEid: number,
  ) => {
    if (playerEid !== ownerEid) return
    if (!hasComponent(w, Cylinder, playerEid)) return
    const current = Cylinder.rounds[playerEid]!
    const max = Cylinder.maxRounds[playerEid]!
    const toReload = Math.min(stacks, max - current)
    if (toReload > 0) {
      Cylinder.rounds[playerEid] = current + toReload
    }
  })
}

/**
 * Dead Man's Deed — if target will die from this hit, pierce with 60% damage.
 * Unlimited pierce on kill-shots. The killing blow itself deals full damage;
 * only subsequent pierce targets take 60%.
 */
function registerDeadMansDeed(world: GameWorld, _stacks: number, playerEid: number): void {
  world.hooks.register('onBulletHit', itemHookId('dead_mans_deed', playerEid), (
    w: GameWorld,
    bulletEid: number,
    targetEid: number,
    damage: number,
  ): BulletHitResult => {
    const pierceCount = w.hookPierceCount.get(bulletEid) ?? 0

    // Check if this hit will kill the target
    if (Health.current[targetEid]! - damage <= 0) {
      // Kill-shot: full damage, enable pierce for subsequent targets
      w.hookPierceCount.set(bulletEid, pierceCount + 1)
      return { damage, pierce: true }
    }
    // Not a killing blow — apply 60% reduction if already piercing
    if (pierceCount > 0) {
      w.hookPierceCount.set(bulletEid, pierceCount + 1)
      return { damage: Math.round(damage * 0.6), pierce: false }
    }
    return { damage, pierce: false }
  }, -5) // Run before other onBulletHit hooks so pierce status is set early
}

/**
 * Grim Harvest — on-kill effects trigger twice.
 * Uses grimHarvestFiring guard to prevent infinite recursion.
 */
function registerGrimHarvest(world: GameWorld, _stacks: number, ownerEid: number): void {
  world.hooks.register('onKill', itemHookId('grim_harvest', ownerEid), (
    w: GameWorld,
    playerEid: number,
    victimEid: number,
  ) => {
    if (playerEid !== ownerEid) return
    const us = getUpgradeStateForPlayer(w, playerEid)
    if (us.grimHarvestFiring) return
    us.grimHarvestFiring = true
    w.hooks.fireKill(w, playerEid, victimEid)
    us.grimHarvestFiring = false
  }, 20) // Run last so other kill effects fire first, then we re-fire them
}

// ============================================================================
// Effect Registry
// ============================================================================

type ItemEffectRegistrar = (world: GameWorld, stacks: number, playerEid: number) => void

const ITEM_EFFECT_REGISTRY: Record<string, ItemEffectRegistrar> = {
  rattlesnake_fang: registerRattlesnakeFang,
  moonshine_flask: registerMoonshineFlask,
  powder_keg: registerPowderKeg,
  sidewinder_belt: registerSidewinderBelt,
  dead_mans_deed: registerDeadMansDeed,
  grim_harvest: registerGrimHarvest,
}

/**
 * Apply a single item's behavioral effect (if any) by registering hooks.
 */
export function applyItemEffect(world: GameWorld, key: string, stacks: number, playerEid: number): void {
  const registrar = ITEM_EFFECT_REGISTRY[key]
  if (registrar) {
    registrar(world, stacks, playerEid)
  }
}

/**
 * Clear all item hooks for a specific player from the registry.
 */
export function clearItemEffectsForPlayer(world: GameWorld, playerEid: number): void {
  for (const key of Object.keys(ITEM_EFFECT_REGISTRY)) {
    world.hooks.unregister(itemHookId(key, playerEid))
  }
}

/**
 * Reapply all item effects for a player based on current inventory.
 * Clears only this player's item hooks, then re-registers with current stack counts.
 */
export function reapplyAllItemEffects(
  world: GameWorld,
  playerEid: number,
  items: Map<number, number>,
): void {
  clearItemEffectsForPlayer(world, playerEid)

  for (const [itemId, stacks] of items) {
    const def = getItemDef(itemId)
    if (!def || !def.hasEffect) continue
    applyItemEffect(world, def.key, stacks, playerEid)
  }
}
