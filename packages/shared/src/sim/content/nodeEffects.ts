/**
 * Node Effect Definitions
 *
 * Maps skill node IDs to behavioral effect handlers (hooks).
 * These effects are registered when a node is taken and complement
 * the existing StatMod system for non-numeric effects.
 */

import type { GameWorld } from '../world'
import type { HookRegistry, BulletHitResult } from '../hooks'
import { Health, Bullet, Player, Position, Weapon, Cylinder, Collider, Enemy, Dead, Invincible, SlowDebuff, MeleeWeapon, Roll } from '../components'
import { spawnBullet } from '../prefabs'
import { clampDamage } from '../damage'
import { BULLET_RADIUS } from './weapons'
import { applySlow } from '../systems/slowDebuff'
import { hasComponent, addComponent } from 'bitecs'
import { forEachInRadius } from '../SpatialHash'

// ============================================================================
// Effect registration functions (one per behavioral node)
// ============================================================================

/**
 * Piercing Rounds — bullets pass through one additional enemy.
 * Uses the onBulletHit transform hook to set pierce = true on
 * the first non-showdown hit per bullet.
 *
 * Pierce count is tracked on world.hookPierceCount to avoid memory leaks
 * (cleaned up alongside bulletPierceHits when bullets are removed).
 */
function registerPiercingRounds(hooks: HookRegistry): void {
  hooks.register('onBulletHit', 'piercing_rounds', (
    world: GameWorld,
    bulletEid: number,
    _targetEid: number,
    damage: number,
  ): BulletHitResult => {
    const count = world.hookPierceCount.get(bulletEid) ?? 0
    if (count < 1) {
      world.hookPierceCount.set(bulletEid, count + 1)
      return { damage, pierce: true }
    }
    // Already pierced once — let bullet be removed
    world.hookPierceCount.delete(bulletEid)
    return { damage, pierce: false }
  })
}

/**
 * Judge, Jury & Executioner — last round in cylinder deals massive bonus damage.
 *
 * onBulletHit: if cylinder has 0 rounds after this shot, apply 2x damage bonus.
 */
const JJE_LAST_ROUND_BONUS = 2.0

function registerJJE(hooks: HookRegistry): void {
  hooks.register('onBulletHit', 'jje_last_round', (
    world: GameWorld,
    bulletEid: number,
    _targetEid: number,
    damage: number,
  ): BulletHitResult => {
    // Check if the bullet owner's cylinder is empty (this was the last round)
    const ownerId = Bullet.ownerId[bulletEid]!
    if (Cylinder.rounds[ownerId] === 0) {
      return { damage: clampDamage(damage * JJE_LAST_ROUND_BONUS), pierce: false }
    }
    return { damage, pierce: false }
  }, 10) // higher priority = runs after pierce
}

/**
 * Second Wind — heal 1 HP when rolling through an enemy projectile.
 */
function registerSecondWind(hooks: HookRegistry): void {
  hooks.register('onRollDodge', 'second_wind', (
    world: GameWorld,
    playerEid: number,
    _dodgedBulletEid: number,
  ) => {
    const current = Health.current[playerEid]!
    const max = Health.max[playerEid]!
    if (current < max) {
      Health.current[playerEid] = Math.min(current + 1, max)
    }
  })
}

/**
 * Dead Man's Hand — emptying the cylinder triggers a 3-shot burst spread.
 */
const DEAD_MANS_HAND_COUNT = 3
const DEAD_MANS_HAND_SPREAD = Math.PI / 6 // 30° total spread

function registerDeadMansHand(hooks: HookRegistry): void {
  hooks.register('onCylinderEmpty', 'dead_mans_hand', (
    world: GameWorld,
    playerEid: number,
  ) => {
    const aimAngle = Player.aimAngle[playerEid]!
    // Offset spawn point forward along aim direction to avoid self-collision
    const spawnOffset = Collider.radius[playerEid]! + BULLET_RADIUS + 2
    const x = Position.x[playerEid]! + Math.cos(aimAngle) * spawnOffset
    const y = Position.y[playerEid]! + Math.sin(aimAngle) * spawnOffset
    const bulletSpeed = Weapon.bulletSpeed[playerEid]!
    const bulletDamage = Weapon.bulletDamage[playerEid]!
    const bulletRange = Weapon.range[playerEid]!

    const halfSpread = DEAD_MANS_HAND_SPREAD / 2
    const step = DEAD_MANS_HAND_COUNT > 1
      ? DEAD_MANS_HAND_SPREAD / (DEAD_MANS_HAND_COUNT - 1)
      : 0

    for (let i = 0; i < DEAD_MANS_HAND_COUNT; i++) {
      const angle = aimAngle - halfSpread + step * i
      const vx = Math.cos(angle) * bulletSpeed
      const vy = Math.sin(angle) * bulletSpeed

      spawnBullet(world, {
        x,
        y,
        vx,
        vy,
        damage: bulletDamage,
        range: bulletRange,
        ownerId: playerEid,
      })
    }
  })
}

/**
 * Last Stand — at 1 HP, gain +50% damage and +20% speed for 5 seconds.
 * Uses timed buff pattern via onHealthChanged hook.
 */
const LAST_STAND_DURATION = 5.0 // seconds

function registerLastStand(hooks: HookRegistry): void {
  hooks.register('onHealthChanged', 'last_stand', (
    world: GameWorld,
    playerEid: number,
    oldHP: number,
    newHP: number,
  ) => {
    // Activate when dropping to 1 HP
    if (newHP === 1 && oldHP > 1) {
      world.upgradeState.lastStandActive = true
      world.upgradeState.lastStandTimer = LAST_STAND_DURATION
    }
    // Deactivate if healed above 1 HP
    if (newHP > 1 && world.upgradeState.lastStandActive) {
      world.upgradeState.lastStandActive = false
      world.upgradeState.lastStandTimer = 0
    }
  })
}

// ============================================================================
// Undertaker Effect Registration Functions
// ============================================================================

/**
 * Coffin Nails — bullets that kill an enemy pierce through to one additional target.
 * onBulletHit: if target will die (HP - damage <= 0), set pierce = true.
 */
function registerCoffinNails(hooks: HookRegistry): void {
  hooks.register('onBulletHit', 'coffin_nails', (
    world: GameWorld,
    bulletEid: number,
    targetEid: number,
    damage: number,
  ): BulletHitResult => {
    // If this shot will kill the target, pierce
    if (Health.current[targetEid]! - damage <= 0) {
      const count = world.hookPierceCount.get(bulletEid) ?? 0
      if (count < 1) {
        world.hookPierceCount.set(bulletEid, count + 1)
        return { damage, pierce: true }
      }
    }
    return { damage, pierce: false }
  })
}

/**
 * Formaldehyde Rounds — bullets slow enemies by 20% for 1.5s on hit.
 */
function registerFormaldehydeRounds(hooks: HookRegistry): void {
  hooks.register('onBulletHit', 'formaldehyde_rounds', (
    world: GameWorld,
    _bulletEid: number,
    targetEid: number,
    damage: number,
  ): BulletHitResult => {
    if (hasComponent(world, Enemy, targetEid)) {
      applySlow(world, targetEid, 0.8, 1.5)
    }
    return { damage, pierce: false }
  })
}

/**
 * Mortician's Precision (behavioral part) — killing with the last round instantly reloads.
 */
function registerMorticiansPrecision(hooks: HookRegistry): void {
  hooks.register('onKill', 'morticians_precision', (
    world: GameWorld,
    playerEid: number,
    _victimEid: number,
  ) => {
    // If cylinder was empty when this kill happened (last round consumed), instant reload
    if (Cylinder.rounds[playerEid] === 0 && Cylinder.reloading[playerEid] === 0) {
      Cylinder.rounds[playerEid] = Cylinder.maxRounds[playerEid]!
      Cylinder.reloading[playerEid] = 0
      Cylinder.reloadTimer[playerEid] = 0
      Cylinder.firstShotAfterReload[playerEid] = 1
    }
  })
}

/**
 * Corpse Harvest — killing an enemy heals 1 HP. 2-second internal cooldown.
 * Uses a countdown timer (ticked in buffSystem) instead of world.time for reset safety.
 */
function registerCorpseHarvest(hooks: HookRegistry): void {
  hooks.register('onKill', 'corpse_harvest', (
    world: GameWorld,
    playerEid: number,
    _victimEid: number,
  ) => {
    const us = world.upgradeState
    if (us.corpseHarvestCooldownTimer <= 0) {
      const current = Health.current[playerEid]!
      const max = Health.max[playerEid]!
      if (current < max && current > 0) {
        Health.current[playerEid] = Math.min(current + 1, max)
        us.corpseHarvestCooldownTimer = 2.0
      }
    }
  })
}

/**
 * Overkill — excess damage from a killing blow splashes to enemies within 60px.
 */
const OVERKILL_RADIUS = 60

function registerOverkill(hooks: HookRegistry): void {
  hooks.register('onKill', 'overkill', (
    world: GameWorld,
    _playerEid: number,
    victimEid: number,
  ) => {
    // Prevent overkill from chaining with itself this tick
    if (world.overkillProcessed.has(victimEid)) return
    world.overkillProcessed.add(victimEid)

    const excessDamage = Math.abs(Health.current[victimEid]!)
    if (excessDamage <= 0 || !world.spatialHash) return

    const vx = Position.x[victimEid]!
    const vy = Position.y[victimEid]!

    forEachInRadius(world.spatialHash, vx, vy, OVERKILL_RADIUS, (nearbyEid) => {
      if (nearbyEid === victimEid) return
      if (!hasComponent(world, Enemy, nearbyEid)) return
      if (!hasComponent(world, Health, nearbyEid)) return
      if (hasComponent(world, Dead, nearbyEid)) return
      if (Health.current[nearbyEid]! <= 0) return

      const dx = Position.x[nearbyEid]! - vx
      const dy = Position.y[nearbyEid]! - vy
      if (dx * dx + dy * dy > OVERKILL_RADIUS * OVERKILL_RADIUS) return

      Health.current[nearbyEid] = Health.current[nearbyEid]! - excessDamage
      world.overkillProcessed.add(nearbyEid)
    })
  }, 10) // Higher priority to run after other onKill hooks
}

/**
 * Grave Dust — rolling leaves a dust cloud that slows enemies.
 */
function registerGraveDust(hooks: HookRegistry): void {
  hooks.register('onRollEnd', 'grave_dust', (
    world: GameWorld,
    playerEid: number,
  ) => {
    world.dustClouds.push({
      x: Position.x[playerEid]!,
      y: Position.y[playerEid]!,
      radius: 80,
      duration: 2,
      slow: 0.75, // 25% slow = 0.75 multiplier
    })
  })
}

/**
 * Deadweight — next shot within 1s of a roll deals +40% damage.
 * Sets a timer on UpgradeState. Weapon system checks this timer.
 */
function registerDeadweight(hooks: HookRegistry): void {
  hooks.register('onRollEnd', 'deadweight', (
    world: GameWorld,
    _playerEid: number,
  ) => {
    world.upgradeState.deadweightBuffTimer = 1.0
  })
}

/**
 * Final Arrangement — while below 50% HP, take 25% reduced damage.
 * Sets a flag on UpgradeState. bulletCollisionSystem checks this.
 */
function registerFinalArrangement(hooks: HookRegistry): void {
  hooks.register('onHealthChanged', 'final_arrangement', (
    world: GameWorld,
    playerEid: number,
    _oldHP: number,
    newHP: number,
  ) => {
    const maxHP = Health.max[playerEid]!
    world.upgradeState.finalArrangementActive = newHP <= maxHP * 0.5 && newHP > 0
  })
}

/**
 * Open Casket — survive a killing blow once per encounter.
 * Drop to 1 HP, release a death pulse, gain invulnerability.
 */
const OPEN_CASKET_PULSE_RADIUS = 200
const OPEN_CASKET_PULSE_DAMAGE = 15
const OPEN_CASKET_IFRAME_DURATION = 1.5
const OPEN_CASKET_COOLDOWN = 75

function registerOpenCasket(hooks: HookRegistry): void {
  hooks.register('onHealthChanged', 'open_casket', (
    world: GameWorld,
    playerEid: number,
    _oldHP: number,
    newHP: number,
  ) => {
    const us = world.upgradeState
    if (newHP <= 0 && us.openCasketAvailable) {
      // Survive the killing blow
      Health.current[playerEid] = 1
      Health.iframes[playerEid] = OPEN_CASKET_IFRAME_DURATION

      // Queue a death pulse at player position
      if (world.lastRites) {
        world.lastRites.pendingPulses.push({
          x: Position.x[playerEid]!,
          y: Position.y[playerEid]!,
          damage: OPEN_CASKET_PULSE_DAMAGE,
        })
      } else {
        // Even without active zone, apply pulse damage to nearby enemies
        if (world.spatialHash) {
          const px = Position.x[playerEid]!
          const py = Position.y[playerEid]!
          forEachInRadius(world.spatialHash, px, py, OPEN_CASKET_PULSE_RADIUS, (enemyEid) => {
            if (!hasComponent(world, Enemy, enemyEid)) return
            if (!hasComponent(world, Health, enemyEid)) return
            if (hasComponent(world, Dead, enemyEid)) return
            if (Health.current[enemyEid]! <= 0) return
            const dx = Position.x[enemyEid]! - px
            const dy = Position.y[enemyEid]! - py
            if (dx * dx + dy * dy > OPEN_CASKET_PULSE_RADIUS * OPEN_CASKET_PULSE_RADIUS) return
            Health.current[enemyEid] = Health.current[enemyEid]! - OPEN_CASKET_PULSE_DAMAGE
          })
          world.lastRitesPulseThisTick = true
        }
      }

      // Start cooldown
      us.openCasketAvailable = false
      us.openCasketCooldownTimer = OPEN_CASKET_COOLDOWN
    }
  }, -10) // Lower priority = runs before other onHealthChanged hooks
}

// Consecrated Ground and Undertaker's Overtime are system-level effects
// handled directly in lastRitesSystem, not via hooks. They use
// `us.nodesTaken.has('consecrated_ground')` / `us.nodesTaken.has('undertakers_overtime')`
// checks at runtime. No hook registration needed.

// ============================================================================
// Prospector Effect Registration Functions
// ============================================================================

// Tunnel Through and Tremor are system-level effects handled directly in
// meleeSystem via `us.nodesTaken.has(...)` checks. No hook registration needed.

// Nitro is a system-level effect handled directly in dynamiteSystem via
// `us.nodesTaken.has('nitro')` check. No hook registration needed.

/**
 * Brace — while charging a swing, take 30% reduced damage.
 * Uses onHealthChanged hook to check MeleeWeapon.charging state.
 */
function registerBrace(hooks: HookRegistry): void {
  hooks.register('onHealthChanged', 'brace', (
    world: GameWorld,
    playerEid: number,
    _oldHP: number,
    newHP: number,
  ) => {
    // Only reduce damage while actively charging a melee swing
    if (MeleeWeapon.charging[playerEid] === 1) {
      // Undo the damage that was just applied, apply 70% of it instead
      const damageTaken = _oldHP - newHP
      if (damageTaken > 0) {
        const reducedDamage = Math.round(damageTaken * 0.7)
        Health.current[playerEid] = Math.min(_oldHP - reducedDamage, Health.max[playerEid]!)
      }
    }
  }, -5) // Run early to adjust damage before other hooks see it
}

/**
 * Rockslide — rolling triggers a shockwave at the roll start position.
 * Deals 5 damage and 25% slow for 1.5s in 80px radius.
 *
 * Reads Roll.startX/startY which are stored when the roll begins
 * (in playerInput.ts). The typed arrays retain values after
 * removeComponent, so this is safe within the same tick.
 */
function registerRockslide(hooks: HookRegistry): void {
  hooks.register('onRollEnd', 'rockslide', (
    world: GameWorld,
    playerEid: number,
  ) => {
    world.rockslideShockwaves.push({
      x: Roll.startX[playerEid]!,
      y: Roll.startY[playerEid]!,
      radius: 80,
      damage: 5,
      slow: 0.75,
      slowDuration: 1.5,
      processed: false,
    })
  })
}

// ============================================================================
// Node Effect Registry
// ============================================================================

/** Map of node ID → registration function */
type EffectRegistrar = (hooks: HookRegistry) => void

const NODE_EFFECT_REGISTRY: Record<string, EffectRegistrar> = {
  // Sheriff
  piercing_rounds: registerPiercingRounds,
  judge_jury_executioner: registerJJE,
  second_wind: registerSecondWind,
  dead_mans_hand: registerDeadMansHand,
  last_stand: registerLastStand,
  // Undertaker
  coffin_nails: registerCoffinNails,
  formaldehyde_rounds: registerFormaldehydeRounds,
  morticians_precision: registerMorticiansPrecision,
  corpse_harvest: registerCorpseHarvest,
  overkill: registerOverkill,
  grave_dust: registerGraveDust,
  deadweight: registerDeadweight,
  final_arrangement: registerFinalArrangement,
  open_casket: registerOpenCasket,
  // Prospector (system-level: tunnel_through, tremor, nitro handled in systems)
  brace: registerBrace,
  rockslide: registerRockslide,
}

/**
 * Apply a node's behavioral effect (if any) by registering hooks.
 * Called from takeNode() after stat mods are applied.
 */
export function applyNodeEffect(world: GameWorld, nodeId: string): void {
  const registrar = NODE_EFFECT_REGISTRY[nodeId]
  if (registrar) {
    registrar(world.hooks)
  }
}

