/**
 * Dynamite System (Prospector ability)
 *
 * Handles dynamite throwing, fuse countdown, detonation, AoE damage,
 * knockback, cook-the-fuse mechanic, and self-damage.
 *
 * Reuses Showdown.cooldown for ability cooldown tracking.
 */

import { defineQuery, hasComponent, addComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { hasButton, Button } from '../../net/input'
import {
  Player,
  Position,
  Showdown,
  Health,
  Dead,
  Knockback,
  Roll,
  PlayerState,
  PlayerStateType,
  MeleeWeapon,
} from '../components'
import {
  DYNAMITE_KNOCKBACK,
  DYNAMITE_EXPLOSION_KB_DURATION,
  NITRO_RADIUS,
  NITRO_DAMAGE,
} from '../content/weapons'
import { forEachAliveEnemyInRadius } from './damageHelpers'
import { getCharacterIdForPlayer, getUpgradeStateForPlayer, type UpgradeState } from '../upgrade'

const dynamitePlayerQuery = defineQuery([Player, Showdown, Position, MeleeWeapon])

const EXPLOSION_KB_SPEED = DYNAMITE_KNOCKBACK / DYNAMITE_EXPLOSION_KB_DURATION

export function dynamiteSystem(world: GameWorld, dt: number): void {
  // Reset per-tick flags
  world.dynamiteDetonatedThisTick = false
  world.dynamiteDetonations.length = 0

  const players = dynamitePlayerQuery(world)

  for (const eid of players) {
    if (world.simulationScope === 'local-player' && world.localPlayerEid >= 0 && eid !== world.localPlayerEid) {
      continue
    }
    if (getCharacterIdForPlayer(world, eid) !== 'prospector') continue
    const us = getUpgradeStateForPlayer(world, eid)

    // Decrement cooldown
    if (Showdown.cooldown[eid]! > 0) {
      Showdown.cooldown[eid] = Math.max(0, Showdown.cooldown[eid]! - dt)
    }

    const input = world.playerInputs.get(eid)
    if (!input) {
      Player.abilityWasDown[eid] = 0
      continue
    }

    const wantsAbility = hasButton(input, Button.ABILITY)
    const wasDown = Player.abilityWasDown[eid] === 1

    // Can't use ability while rolling
    const isRolling =
      hasComponent(world, Roll, eid) ||
      PlayerState.state[eid] === PlayerStateType.ROLLING

    if (us.dynamiteCooking) {
      if (isRolling) {
        // Cancel cooking if rolling
        us.dynamiteCooking = false
        us.dynamiteCookTimer = 0
      } else if (wantsAbility) {
        // Continue cooking
        us.dynamiteCookTimer += dt

        // Self-detonation: cooked past fuse time
        if (us.dynamiteCookTimer >= us.dynamiteFuse) {
          const px = Position.x[eid]!
          const py = Position.y[eid]!
          world.dynamites.push({
            x: px,
            y: py,
            fuseRemaining: 0,
            damage: us.dynamiteDamage,
            radius: us.dynamiteRadius,
            knockback: DYNAMITE_KNOCKBACK,
            ownerId: eid,
          })
          us.dynamiteCooking = false
          us.dynamiteCookTimer = 0
          Showdown.cooldown[eid] = us.dynamiteCooldown
        }
      } else {
        // Released — throw
        const px = Position.x[eid]!
        const py = Position.y[eid]!
        const cx = input.cursorWorldX
        const cy = input.cursorWorldY

        let tx = cx
        let ty = cy
        const dx = cx - px
        const dy = cy - py
        const distSq = dx * dx + dy * dy
        const maxRange = us.showdownMarkRange // throw range
        if (distSq > maxRange * maxRange) {
          const dist = Math.sqrt(distSq)
          tx = px + (dx / dist) * maxRange
          ty = py + (dy / dist) * maxRange
        }

        const remainingFuse = Math.max(0, us.dynamiteFuse - us.dynamiteCookTimer)
        world.dynamites.push({
          x: tx,
          y: ty,
          fuseRemaining: remainingFuse,
          damage: us.dynamiteDamage,
          radius: us.dynamiteRadius,
          knockback: DYNAMITE_KNOCKBACK,
          ownerId: eid,
        })
        us.dynamiteCooking = false
        us.dynamiteCookTimer = 0
        Showdown.cooldown[eid] = us.dynamiteCooldown
      }
    } else if (wantsAbility && !wasDown && !isRolling && Showdown.cooldown[eid]! <= 0) {
      // Start cooking on rising edge
      us.dynamiteCooking = true
      us.dynamiteCookTimer = 0
    }

    Player.abilityWasDown[eid] = wantsAbility ? 1 : 0
  }

  // Tick fuses and detonate
  for (let i = world.dynamites.length - 1; i >= 0; i--) {
    const dyn = world.dynamites[i]!
    if (world.simulationScope === 'local-player' && world.localPlayerEid >= 0 && dyn.ownerId !== world.localPlayerEid) {
      continue
    }
    dyn.fuseRemaining -= dt

    if (dyn.fuseRemaining <= 0) {
      // Record position for client VFX before removing
      world.dynamiteDetonations.push({ x: dyn.x, y: dyn.y, radius: dyn.radius })
      // Detonate
      detonateDynamite(world, dyn)
      world.dynamites.splice(i, 1)
    }
  }
}

function detonateDynamite(world: GameWorld, dyn: { x: number; y: number; damage: number; radius: number; knockback: number; ownerId: number }): void {
  world.dynamiteDetonatedThisTick = true
  const us: UpgradeState = getUpgradeStateForPlayer(world, dyn.ownerId)

  if (!world.spatialHash) return

  const hasNitro = us.nodesTaken.has('nitro')
  const nitroKills: Array<{ x: number; y: number }> = []
  // Track entities already hit this detonation to avoid double-dipping
  const hitThisFrame = new Set<number>()

  forEachAliveEnemyInRadius(world, dyn.x, dyn.y, dyn.radius, (enemyEid, dx, dy, distSq) => {
    hitThisFrame.add(enemyEid)

    // Apply damage
    Health.current[enemyEid] = Health.current[enemyEid]! - dyn.damage

    // Apply knockback
    const dist = Math.sqrt(distSq)
    if (dist > 0) {
      const nx = dx / dist
      const ny = dy / dist

      addComponent(world, Knockback, enemyEid)
      Knockback.vx[enemyEid] = nx * EXPLOSION_KB_SPEED
      Knockback.vy[enemyEid] = ny * EXPLOSION_KB_SPEED
      Knockback.duration[enemyEid] = DYNAMITE_EXPLOSION_KB_DURATION
    }

    // Track Nitro kills
    if (Health.current[enemyEid]! <= 0 && hasNitro) {
      nitroKills.push({ x: Position.x[enemyEid]!, y: Position.y[enemyEid]! })
    }
  })

  // Self-damage: check if owner is in blast radius
  const ownerEid = dyn.ownerId
  if (ownerEid >= 0 && hasComponent(world, Health, ownerEid) && !hasComponent(world, Dead, ownerEid)) {
    // Controlled Demolition: skip self-damage
    if (!us.nodesTaken.has('controlled_demolition')) {
      const px = Position.x[ownerEid]!
      const py = Position.y[ownerEid]!
      const dx = px - dyn.x
      const dy = py - dyn.y
      if (dx * dx + dy * dy <= dyn.radius * dyn.radius) {
        Health.current[ownerEid] = Health.current[ownerEid]! - dyn.damage
      }
    }
  }

  // Nitro: secondary explosions on kills (batch-processed with dedup)
  if (hasNitro) {
    for (const kill of nitroKills) {
      forEachAliveEnemyInRadius(world, kill.x, kill.y, NITRO_RADIUS, (nearbyEid) => {
        if (hitThisFrame.has(nearbyEid)) return
        hitThisFrame.add(nearbyEid)
        Health.current[nearbyEid] = Health.current[nearbyEid]! - NITRO_DAMAGE
      })
    }
  }
}
