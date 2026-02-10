import { addComponent, hasComponent } from 'bitecs'
import { Cylinder, Player, Showdown, type GameWorld } from '@high-noon/shared'

export interface ReplayExcludedStateSnapshot {
  shootWasDown: number
  abilityWasDown: number
  cylinder: {
    present: boolean
    fireCooldown: number
  }
  showdown: {
    present: boolean
    active: number
    targetEid: number
    duration: number
    cooldown: number
  }
}

/**
 * Capture local state owned by systems excluded from reconciliation replay.
 * Replay currently re-simulates only movement/collision paths, so these values
 * must survive rewind/replay unchanged.
 */
export function captureReplayExcludedState(world: GameWorld, eid: number): ReplayExcludedStateSnapshot {
  const hasCylinder = hasComponent(world, Cylinder, eid)
  const hasShowdown = hasComponent(world, Showdown, eid)

  return {
    shootWasDown: Player.shootWasDown[eid]!,
    abilityWasDown: Player.abilityWasDown[eid]!,
    cylinder: {
      present: hasCylinder,
      fireCooldown: hasCylinder ? Cylinder.fireCooldown[eid]! : 0,
    },
    showdown: {
      present: hasShowdown,
      active: hasShowdown ? Showdown.active[eid]! : 0,
      targetEid: hasShowdown ? Showdown.targetEid[eid]! : 0,
      duration: hasShowdown ? Showdown.duration[eid]! : 0,
      cooldown: hasShowdown ? Showdown.cooldown[eid]! : 0,
    },
  }
}

/**
 * Restore local state captured before replay.
 */
export function restoreReplayExcludedState(
  world: GameWorld,
  eid: number,
  snapshot: ReplayExcludedStateSnapshot,
): void {
  if (snapshot.cylinder.present) {
    if (!hasComponent(world, Cylinder, eid)) {
      addComponent(world, Cylinder, eid)
    }
    Cylinder.fireCooldown[eid] = snapshot.cylinder.fireCooldown
  }

  if (snapshot.showdown.present) {
    if (!hasComponent(world, Showdown, eid)) {
      addComponent(world, Showdown, eid)
    }
    Showdown.active[eid] = snapshot.showdown.active
    Showdown.targetEid[eid] = snapshot.showdown.targetEid
    Showdown.duration[eid] = snapshot.showdown.duration
    Showdown.cooldown[eid] = snapshot.showdown.cooldown
  }

  Player.shootWasDown[eid] = snapshot.shootWasDown
  Player.abilityWasDown[eid] = snapshot.abilityWasDown
}
