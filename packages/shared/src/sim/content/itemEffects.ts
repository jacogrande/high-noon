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
import { Health, Cylinder, Position, Bullet, Enemy } from '../components'
import { hasComponent, defineQuery } from 'bitecs'
import { forEachAliveEnemyInRadius } from '../systems/damageHelpers'
import { applyDamage } from '../systems/applyDamage'
import { applySlow } from '../systems/slowDebuff'
import { getUpgradeStateForPlayer } from '../upgrade'
import { getItemDef } from './items'
import { BONUS_GOLD_DROP_VALUE } from './gold'

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

/**
 * Lightning Rod — 8% chance per stack: chain lightning to nearest enemy on kill.
 * Deals 25 damage to nearest enemy within 128px.
 */
function registerLightningRod(world: GameWorld, stacks: number, ownerEid: number): void {
  world.hooks.register('onKill', itemHookId('lightning_rod', ownerEid), (
    w: GameWorld,
    playerEid: number,
    victimEid: number,
  ) => {
    if (playerEid !== ownerEid) return
    const chance = Math.min(0.08 * stacks, 1.0)
    if (w.rng.next() >= chance) return

    const vx = Position.x[victimEid]!
    const vy = Position.y[victimEid]!
    let nearestEid = -1
    let nearestDistSq = Infinity

    forEachAliveEnemyInRadius(w, vx, vy, 128, (enemyEid, _dx, _dy, distSq) => {
      if (enemyEid === victimEid) return
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq
        nearestEid = enemyEid
      }
    })

    if (nearestEid >= 0) {
      applyDamage(w, nearestEid, {
        amount: 25,
        ownerPlayerEid: playerEid,
      })
    }
  })
}

/**
 * Cactus Spine — reflect 15 damage per stack to attacker when player takes damage.
 */
function registerCactusSpine(world: GameWorld, stacks: number, ownerEid: number): void {
  world.hooks.register('onHealthChanged', itemHookId('cactus_spine', ownerEid), (
    w: GameWorld,
    playerEid: number,
    oldHP: number,
    newHP: number,
  ) => {
    if (playerEid !== ownerEid) return
    if (newHP >= oldHP) return // only on damage

    // Find the nearest enemy within melee range to reflect damage to
    const px = Position.x[playerEid]!
    const py = Position.y[playerEid]!
    let nearestEid = -1
    let nearestDistSq = Infinity
    forEachAliveEnemyInRadius(w, px, py, 80, (enemyEid, _dx, _dy, distSq) => {
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq
        nearestEid = enemyEid
      }
    })

    if (nearestEid >= 0) {
      applyDamage(w, nearestEid, {
        amount: 15 * stacks,
        ownerPlayerEid: playerEid,
      })
    }
  })
}

/**
 * Scorpion Stinger — bullets slow enemies by 12% per stack for 1.5s.
 */
function registerScorpionStinger(world: GameWorld, stacks: number, playerEid: number): void {
  world.hooks.register('onBulletHit', itemHookId('scorpion_stinger', playerEid), (
    w: GameWorld,
    _bulletEid: number,
    targetEid: number,
    damage: number,
  ): BulletHitResult => {
    // Apply slow debuff (lower multiplier = more slow)
    const slowMul = Math.max(0.2, 1 - 0.12 * stacks)
    if (hasComponent(w, Enemy, targetEid)) {
      applySlow(w, targetEid, slowMul, 1.5)
    }
    return { damage, pierce: false }
  })
}

/**
 * Bandolier — first shot after reload deals +50% damage per stack.
 * Sets bonus on reload; consumed in weaponSystem.
 */
function registerBandolier(world: GameWorld, stacks: number, ownerEid: number): void {
  world.hooks.register('onReload', itemHookId('bandolier', ownerEid), (
    w: GameWorld,
    playerEid: number,
  ) => {
    if (playerEid !== ownerEid) return
    const us = getUpgradeStateForPlayer(w, playerEid)
    us.bandolierFirstShotBonus = 0.5 * stacks
  })
}

/**
 * Bounty Notice — 10% chance per stack to drop bonus gold on kill.
 */
function registerBountyNotice(world: GameWorld, stacks: number, ownerEid: number): void {
  world.hooks.register('onKill', itemHookId('bounty_notice', ownerEid), (
    w: GameWorld,
    playerEid: number,
    victimEid: number,
  ) => {
    if (playerEid !== ownerEid) return
    const chance = Math.min(0.10 * stacks, 1.0)
    if (w.rng.next() < chance) {
      w.goldNuggets.push({
        x: Position.x[victimEid]!,
        y: Position.y[victimEid]!,
        value: BONUS_GOLD_DROP_VALUE,
        lifetime: 10,
      })
    }
  })
}

/**
 * Peacemaker — consecutive hits on same target deal +10% damage per stack.
 */
function registerPeacemaker(world: GameWorld, stacks: number, playerEid: number): void {
  world.hooks.register('onBulletHit', itemHookId('peacemaker', playerEid), (
    w: GameWorld,
    _bulletEid: number,
    targetEid: number,
    damage: number,
  ): BulletHitResult => {
    const us = getUpgradeStateForPlayer(w, playerEid)
    if (targetEid === us.peacemakerLastTarget) {
      us.peacemakerHitCount++
    } else {
      us.peacemakerLastTarget = targetEid
      us.peacemakerHitCount = 1
    }
    const bonusMul = 1 + 0.10 * stacks * (us.peacemakerHitCount - 1)
    return { damage: Math.round(damage * bonusMul), pierce: false }
  })
}

/**
 * Witching Hour — 3s of double fire rate when cylinder empties.
 */
function registerWitchingHour(world: GameWorld, _stacks: number, ownerEid: number): void {
  world.hooks.register('onCylinderEmpty', itemHookId('witching_hour', ownerEid), (
    w: GameWorld,
    playerEid: number,
  ) => {
    if (playerEid !== ownerEid) return
    const us = getUpgradeStateForPlayer(w, playerEid)
    us.witchingHourActive = true
    us.witchingHourTimer = 3.0
  })
}

/**
 * Desert Rose — heal 2 HP per stack at wave start.
 */
function registerDesertRose(world: GameWorld, stacks: number, ownerEid: number): void {
  world.hooks.register('onWaveStart', itemHookId('desert_rose', ownerEid), (
    w: GameWorld,
    _waveNumber: number,
  ) => {
    const healAmount = 2 * stacks
    const current = Health.current[ownerEid]!
    const max = Health.max[ownerEid]!
    if (current > 0 && current < max) {
      Health.current[ownerEid] = Math.min(current + healAmount, max)
    }
  })
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
  lightning_rod: registerLightningRod,
  cactus_spine: registerCactusSpine,
  scorpion_stinger: registerScorpionStinger,
  bandolier: registerBandolier,
  bounty_notice: registerBountyNotice,
  peacemaker: registerPeacemaker,
  witching_hour: registerWitchingHour,
  desert_rose: registerDesertRose,
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
