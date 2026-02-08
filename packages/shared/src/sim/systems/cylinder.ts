/**
 * Cylinder System
 *
 * Manages the revolver cylinder reload state machine:
 * - Decrements fire cooldown each tick
 * - Cancels reload on roll
 * - Advances reload timer -> completes reload
 * - Initiates reload on R key press or auto-reload on empty
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { hasButton, Button } from '../../net/input'
import { Player, Cylinder, Roll, PlayerState, PlayerStateType } from '../components'

const cylinderQuery = defineQuery([Player, Cylinder])

export function cylinderSystem(
  world: GameWorld,
  dt: number,
): void {
  const entities = cylinderQuery(world)

  for (const eid of entities) {
    // 1. Decrement fire cooldown (input-independent)
    if (Cylinder.fireCooldown[eid]! > 0) {
      Cylinder.fireCooldown[eid] = Math.max(0, Cylinder.fireCooldown[eid]! - dt)
    }

    const isRolling =
      hasComponent(world, Roll, eid) ||
      PlayerState.state[eid] === PlayerStateType.ROLLING
    const isReloading = Cylinder.reloading[eid] === 1

    // 2. Roll cancels reload (input-independent)
    if (isRolling && isReloading) {
      Cylinder.reloading[eid] = 0
      Cylinder.reloadTimer[eid] = 0
      continue
    }

    // 3. Advance reload timer (input-independent)
    if (isReloading) {
      Cylinder.reloadTimer[eid] = Cylinder.reloadTimer[eid]! + dt
      if (Cylinder.reloadTimer[eid]! >= Cylinder.reloadTime[eid]!) {
        // Reload complete
        Cylinder.rounds[eid] = Cylinder.maxRounds[eid]!
        Cylinder.firstShotAfterReload[eid] = 1  // Used by Steady Hand upgrade (Phase 7)
        Cylinder.reloading[eid] = 0
        Cylinder.reloadTimer[eid] = 0
      }
      continue
    }

    // 4. Manual reload (R key) -- only if not full and not already reloading
    const input = world.playerInputs.get(eid)
    if (input) {
      const wantsReload = hasButton(input, Button.RELOAD)
      if (wantsReload && Cylinder.rounds[eid]! < Cylinder.maxRounds[eid]!) {
        Cylinder.reloading[eid] = 1
        Cylinder.reloadTimer[eid] = 0
        continue
      }
    }

    // 5. Auto-reload on empty (input-independent)
    if (Cylinder.rounds[eid] === 0) {
      Cylinder.reloading[eid] = 1
      Cylinder.reloadTimer[eid] = 0
      continue
    }
  }
}
