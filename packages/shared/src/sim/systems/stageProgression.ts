/**
 * Stage Progression System
 *
 * Monitors encounter completion and drives transitions between stages
 * in a multi-stage run. Clears enemies/bullets between stages and
 * advances to the next StageEncounter after a brief delay.
 */

import { defineQuery, removeEntity } from 'bitecs'
import type { GameWorld } from '../world'
import { setEncounter, swapTilemap } from '../world'
import { Enemy, Position, Bullet, Player, Health } from '../components'
import { removeBullet } from '../prefabs'
import { generateArena } from '../content/maps/mapGenerator'

const CAMP_CLEAR_DELAY = 0.5 // seconds to despawn enemies before entering camp

const playerHealthQuery = defineQuery([Player, Health])

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
    world.lastDamageByEntity.delete(eid)
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

/**
 * Heal all players to full HP.
 * Called when entering camp between stages.
 */
export function healAllPlayers(world: GameWorld): void {
  for (const eid of playerHealthQuery(world)) {
    Health.current[eid] = Health.max[eid]!
  }
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
    run.transitionTimer = CAMP_CLEAR_DELAY
    world.stageCleared = true
    clearAllEnemies(world)
    return
  }

  // Count down clearing timer
  if (run.transition === 'clearing') {
    run.transitionTimer -= dt
    if (run.transitionTimer <= 0) {
      const isLastStage = run.currentStage + 1 >= run.totalStages
      if (isLastStage) {
        // Final stage — skip camp, go straight to completed
        run.currentStage++
        run.completed = true
        run.transition = 'none'
      } else {
        // Enter camp phase — heal players and wait for campComplete signal
        // currentStage stays at the just-completed stage so HUD shows correct number
        run.transition = 'camp'
        run.transitionTimer = 0
        world.campComplete = false
        healAllPlayers(world)
        // Pre-generate the next stage's map now so campComplete doesn't cause a frame hitch
        const nextStageIndex = run.currentStage + 1
        const nextStage = run.stages[nextStageIndex]!
        run.pendingTilemap = generateArena(nextStage.mapConfig, world.initialSeed, nextStageIndex)
      }
    }
    return
  }

  // Camp phase — wait for player to signal ready
  if (run.transition === 'camp') {
    if (world.campComplete) {
      world.campComplete = false
      run.currentStage++
      const nextStage = run.stages[run.currentStage]!
      // Use pre-generated map (built on camp entry), fall back to generating if missing
      const newMap = run.pendingTilemap ?? generateArena(nextStage.mapConfig, world.initialSeed, run.currentStage)
      run.pendingTilemap = null
      swapTilemap(world, newMap)
      setEncounter(world, nextStage)
      run.transition = 'none'
    }
  }
}
