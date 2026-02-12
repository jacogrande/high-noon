/**
 * Melee System (Prospector weapon)
 *
 * Handles pickaxe swing detection, charge state, arc collision,
 * and knockback application. Runs in place of cylinderSystem + weaponSystem
 * for the Prospector.
 *
 * Input flow: press → start charge → hold to charge → release → swing.
 * Quick taps produce an uncharged swing; long holds produce a charged swing.
 */

import { defineQuery, hasComponent, addComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { hasButton, Button } from '../../net/input'
import {
  Player,
  Position,
  MeleeWeapon,
  Knockback,
  Roll,
  PlayerState,
  PlayerStateType,
} from '../components'
import { PICKAXE_CHARGE_ARC, MELEE_KNOCKBACK_DURATION, TREMOR_RADIUS } from '../content/weapons'
import { forEachAliveEnemyInRadius } from './damageHelpers'
import { getCharacterIdForPlayer, getUpgradeStateForPlayer, type UpgradeState } from '../upgrade'
import { applyDamage } from './applyDamage'

const meleePlayerQuery = defineQuery([Player, MeleeWeapon, Position])

/** Knockback speed = distance / duration */
const KNOCKBACK_SPEED_FACTOR = 1 / MELEE_KNOCKBACK_DURATION

/** How long between swings before the combo counter resets (seconds) */
const COMBO_TIMEOUT = 2.0

/**
 * Check if a point (ex, ey) is within an arc centered at (px, py)
 * with aim direction aimAngle, half-arc arcHalf, and max distance reach.
 */
export function isInArc(
  px: number, py: number,
  aimAngle: number,
  arcHalf: number,
  reach: number,
  ex: number, ey: number,
): boolean {
  const dx = ex - px
  const dy = ey - py
  const distSq = dx * dx + dy * dy
  if (distSq > reach * reach) return false

  const angleToEnemy = Math.atan2(dy, dx)
  let angleDiff = angleToEnemy - aimAngle
  // Normalize to [-PI, PI]
  while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI
  while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI
  return Math.abs(angleDiff) <= arcHalf
}

export function meleeSystem(world: GameWorld, dt: number): void {
  const players = meleePlayerQuery(world)

  for (const eid of players) {
    if (world.simulationScope === 'local-player' && world.localPlayerEid >= 0 && eid !== world.localPlayerEid) {
      continue
    }

    if (getCharacterIdForPlayer(world, eid) !== 'prospector') {
      continue
    }

    const us = getUpgradeStateForPlayer(world, eid)

    // Reset per-tick flags
    MeleeWeapon.swungThisTick[eid] = 0
    MeleeWeapon.wasChargedSwing[eid] = 0

    // Tick down swing cooldown
    if (MeleeWeapon.swingCooldown[eid]! > 0) {
      MeleeWeapon.swingCooldown[eid] = Math.max(0, MeleeWeapon.swingCooldown[eid]! - dt)
    }

    const input = world.playerInputs.get(eid)
    if (!input) {
      MeleeWeapon.shootWasDown[eid] = 0
      continue
    }

    const wantsShoot = hasButton(input, Button.SHOOT)
    const wasShootDown = MeleeWeapon.shootWasDown[eid] === 1
    MeleeWeapon.shootWasDown[eid] = wantsShoot ? 1 : 0

    // Can't swing while rolling
    const isRolling =
      hasComponent(world, Roll, eid) ||
      PlayerState.state[eid] === PlayerStateType.ROLLING
    if (isRolling) {
      // Cancel charge if rolling
      MeleeWeapon.charging[eid] = 0
      MeleeWeapon.chargeTimer[eid] = 0
      continue
    }

    const aimAngle = Player.aimAngle[eid]!
    const px = Position.x[eid]!
    const py = Position.y[eid]!

    if (wantsShoot) {
      if (MeleeWeapon.charging[eid] === 1) {
        // Continue charging
        MeleeWeapon.chargeTimer[eid] = MeleeWeapon.chargeTimer[eid]! + dt
      } else if (!wasShootDown && MeleeWeapon.swingCooldown[eid]! <= 0) {
        // Fresh press — start charging
        MeleeWeapon.charging[eid] = 1
        MeleeWeapon.chargeTimer[eid] = 0
      }
    } else if (!wantsShoot && wasShootDown) {
      // Button released
      if (MeleeWeapon.charging[eid] === 1) {
        const chargeTime = MeleeWeapon.chargeTimer[eid]!
        const isCharged = chargeTime >= us.chargeTime

        if (MeleeWeapon.swingCooldown[eid]! <= 0) {
          executeSwing(world, us, eid, px, py, aimAngle, isCharged)
        }

        MeleeWeapon.charging[eid] = 0
        MeleeWeapon.chargeTimer[eid] = 0
      }
    }
  }
}

function executeSwing(
  world: GameWorld,
  us: UpgradeState,
  eid: number,
  px: number,
  py: number,
  aimAngle: number,
  isCharged: boolean,
): void {
  // Determine swing parameters
  const arcAngle = isCharged ? PICKAXE_CHARGE_ARC : us.cleaveArc
  const arcHalf = arcAngle / 2
  const reach = us.reach
  let baseDamage = us.swingDamage
  if (isCharged) {
    baseDamage *= us.chargeMultiplier
  }

  // Apply Gold Fever bonus
  const feverBonus = 1 + us.goldFeverStacks * us.goldFeverBonus
  const damage = Math.round(baseDamage * feverBonus)

  const knockbackDist = us.knockback * (isCharged ? 1.5 : 1)

  // Tunnel Through: charged swing pulls instead of pushing
  const hasTunnelThrough = us.nodesTaken.has('tunnel_through')
  const pullMode = isCharged && hasTunnelThrough

  // Set swing flags for VFX
  MeleeWeapon.swungThisTick[eid] = 1
  MeleeWeapon.wasChargedSwing[eid] = isCharged ? 1 : 0
  MeleeWeapon.swingAngle[eid] = aimAngle
  MeleeWeapon.swingCooldown[eid] = 1 / us.swingRate

  // Increment consecutive swing counter for Tremor and reset combo timer
  us.consecutiveSwings++
  us.consecutiveSwingTimer = COMBO_TIMEOUT

  let killedWithCharge = false

  // Hit enemies in arc via spatial hash helper
  forEachAliveEnemyInRadius(world, px, py, reach, (enemyEid, dx, dy, distSq) => {
    const ex = Position.x[enemyEid]!
    const ey = Position.y[enemyEid]!

    if (!isInArc(px, py, aimAngle, arcHalf, reach, ex, ey)) return

    // Apply damage
    const hit = applyDamage(world, enemyEid, {
      amount: damage,
      ownerPlayerEid: eid,
      melee: true,
    })

    // Apply knockback
    const dist = Math.sqrt(distSq)
    if (dist > 0) {
      const nx = dx / dist
      const ny = dy / dist
      const kbSpeed = knockbackDist * KNOCKBACK_SPEED_FACTOR
      const dirMul = pullMode ? -1 : 1

      addComponent(world, Knockback, enemyEid)
      Knockback.vx[enemyEid] = nx * kbSpeed * dirMul
      Knockback.vy[enemyEid] = ny * kbSpeed * dirMul
      Knockback.duration[enemyEid] = MELEE_KNOCKBACK_DURATION
    }

    // Track melee kill for Gold Rush (2x gold)
    if (hit.killed) {
      world.lastKillWasMelee = true
      if (isCharged) killedWithCharge = true
    }
  })

  // Tunnel Through: charged kill resets swing cooldown
  if (killedWithCharge && hasTunnelThrough) {
    MeleeWeapon.swingCooldown[eid] = 0
  }

  // Tremor: every 4th swing triggers ground slam
  if (us.nodesTaken.has('tremor') && us.consecutiveSwings % 4 === 0) {
    executeTremor(world, us, eid, px, py)
  }
}

function executeTremor(world: GameWorld, us: UpgradeState, eid: number, px: number, py: number): void {
  const tremorDamage = Math.round(us.swingDamage * 0.5)

  world.tremorThisTick = true

  forEachAliveEnemyInRadius(world, px, py, TREMOR_RADIUS, (enemyEid) => {
    applyDamage(world, enemyEid, {
      amount: tremorDamage,
      ownerPlayerEid: eid,
    })
  })
}
