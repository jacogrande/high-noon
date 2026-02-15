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
import { Enemy, Position, Bullet, Player, Health, ObjectiveRole } from '../components'
import { removeBullet, spawnNpc } from '../prefabs'
import { initObjective, cleanupObjective } from './objectiveSystem'
import { generateArena } from '../content/maps/mapGenerator'
import { STAGE_NPC_SPAWNS } from '../content/npcs'
import {
  selectCampVisitor,
  generateVisitorOffers,
  pickVisitorGreeting,
} from './campVisitor'
import { getUpgradeStateForPlayer } from '../upgrade'
import { getAlivePlayers } from '../queries'

const CAMP_CLEAR_DELAY = 0.5 // seconds to despawn enemies before entering camp

const playerHealthQuery = defineQuery([Player, Health])

const enemyCleanupQuery = defineQuery([Enemy, Position])
const bulletCleanupQuery = defineQuery([Bullet])

/**
 * Remove all enemies, bullets, and NPCs from the world.
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
  // Clean up objective entities
  cleanupObjective(world)
  // Remove all NPCs
  for (const eid of world.npcEntities) {
    removeEntity(world, eid)
  }
  world.npcEntities.clear()
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
 * Spawn discovery NPCs for the given stage index.
 * Converts tile coordinates to world pixel positions.
 */
export function spawnStageNpcs(world: GameWorld, stageIndex: number): void {
  const spawns = STAGE_NPC_SPAWNS[stageIndex]
  if (!spawns || !world.tilemap) return

  const tileSize = world.tilemap.tileSize
  for (const spawn of spawns) {
    const x = spawn.tileX * tileSize + tileSize / 2
    const y = spawn.tileY * tileSize + tileSize / 2
    spawnNpc(world, spawn.type, x, y)
  }
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

  // Spawn NPCs and init objective if a stage is active but none have been spawned yet (covers stage 0)
  if (run.transition === 'none' && !enc.completed && !run.npcsSpawned) {
    spawnStageNpcs(world, run.currentStage)
    run.npcsSpawned = true
    // Initialize objective if configured for this stage
    const stageEnc = run.stages[run.currentStage]
    if (stageEnc?.objective && !world.objective) {
      initObjective(world, stageEnc.objective)
    }
  }

  // Detect encounter completion -> begin clearing
  if (enc.completed && run.transition === 'none') {
    // Promote active objective to success (player survived the encounter)
    if (world.objective?.status === 'active') {
      world.objective.status = 'success'
    }
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

        // Generate camp visitor
        const visitor = selectCampVisitor(world.rng, run.previousVisitorIds)
        const alivePlayers = getAlivePlayers(world)
        // Union all players' items for duplicate avoidance in co-op
        const allPlayerItems = new Map<number, number>()
        for (const pEid of alivePlayers) {
          const state = getUpgradeStateForPlayer(world, pEid)
          for (const [itemId, stacks] of state.items) {
            allPlayerItems.set(itemId, Math.max(allPlayerItems.get(itemId) ?? 0, stacks))
          }
        }
        const offers = generateVisitorOffers(world.rng, visitor, allPlayerItems)
        const [greeting, greetingIdx] = pickVisitorGreeting(world.rng, visitor, run.lastGreetingIndex)
        run.lastGreetingIndex = greetingIdx
        world.campVisitor = { visitorId: visitor.id, greeting, greetingIndex: greetingIdx, offers }
      }
    }
    return
  }

  // Camp phase — wait for player to signal ready
  if (run.transition === 'camp') {
    if (world.campComplete) {
      world.campComplete = false
      // Clean up camp visitor
      if (world.campVisitor) {
        run.previousVisitorIds.push(world.campVisitor.visitorId)
        world.campVisitor = null
      }
      // Reset per-stage item state for all alive players
      for (const pEid of getAlivePlayers(world)) {
        const us = getUpgradeStateForPlayer(world, pEid)
        us.peacemakerLastTarget = 0xFFFF
        us.peacemakerHitCount = 0
      }
      run.currentStage++
      const nextStage = run.stages[run.currentStage]!
      // Use pre-generated map (built on camp entry), fall back to generating if missing
      const newMap = run.pendingTilemap ?? generateArena(nextStage.mapConfig, world.initialSeed, run.currentStage)
      run.pendingTilemap = null
      swapTilemap(world, newMap)
      setEncounter(world, nextStage)
      spawnStageNpcs(world, run.currentStage)
      run.npcsSpawned = true
      // Initialize objective if configured for this stage
      if (nextStage.objective) {
        initObjective(world, nextStage.objective)
      }
      run.transition = 'none'
    }
  }
}
