/**
 * Stage Progression System
 *
 * Monitors encounter completion and drives transitions between stages
 * in a multi-stage run. Clears enemies/bullets between stages and
 * advances to the next StageEncounter after a brief delay.
 */

import { defineQuery, removeEntity } from 'bitecs'
import type { GameWorld } from '../world'
import { setEncounter } from '../world'
import { Enemy, Position, Bullet } from '../components'
import { removeBullet } from '../prefabs'

const STAGE_CLEAR_DELAY = 3.0 // seconds between stages

const enemyCleanupQuery = defineQuery([Enemy, Position])
const bulletCleanupQuery = defineQuery([Bullet])

/**
 * Remove all enemies and bullets from the world.
 * Used during stage transitions to start fresh.
 */
export function clearAllEnemies(world: GameWorld): void {
  // Remove all enemy entities and their associated tracking state
  for (const eid of enemyCleanupQuery(world)) {
    world.bulletCollisionCallbacks.delete(eid)
    world.bulletPierceHits.delete(eid)
    world.hookPierceCount.delete(eid)
    removeEntity(world, eid)
  }
  // Remove all bullets so none carry across stages
  for (const eid of bulletCleanupQuery(world)) {
    removeBullet(world, eid)
  }
  // Reset derived/cached spatial state — will rebuild on next tick
  world.flowField = null
  world.spatialHash = null
  // Clear transient world objects tied to the previous stage
  world.goldNuggets = []
  world.dustClouds = []
  world.rockslideShockwaves = []
  world.dynamites = []
}

export function stageProgressionSystem(world: GameWorld, dt: number): void {
  const run = world.run
  if (!run || run.completed) return

  const enc = world.encounter
  if (!enc) return

  // Reset per-tick flag
  world.stageCleared = false

  // Detect encounter completion -> begin clearing
  if (enc.completed && run.transition === 'none') {
    run.transition = 'clearing'
    run.transitionTimer = STAGE_CLEAR_DELAY
    world.stageCleared = true
    clearAllEnemies(world)
    return
  }

  // Count down clearing timer
  if (run.transition === 'clearing') {
    run.transitionTimer -= dt
    if (run.transitionTimer <= 0) {
      run.currentStage++
      if (run.currentStage >= run.totalStages) {
        run.completed = true
        run.transition = 'none'
      } else {
        setEncounter(world, run.stages[run.currentStage]!)
        run.transition = 'none'
      }
    }
  }
}
