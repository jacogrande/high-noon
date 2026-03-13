/**
 * Stage Progression System
 *
 * Monitors encounter completion and drives transitions between stages
 * in a multi-stage run. Clears enemies/bullets between stages and
 * advances to the next StageEncounter after a brief delay.
 */

import { defineQuery, hasComponent, removeComponent, removeEntity } from 'bitecs'
import type { GameWorld } from '../world'
import { setEncounter, swapTilemap } from '../world'
import { cleanupEntity } from '../entityCleanup'
import { getArenaCenterFromTilemap } from '../tilemap'
import { GOLD_NUGGET_LIFETIME } from './goldRush'
import { Enemy, Position, Bullet, Player, Health, Dead, Downed, ObjectiveRole } from '../components'
import { removeBullet, spawnNpc } from '../prefabs'
import { initObjective, cleanupObjective } from './objectiveSystem'
import { generateMap } from '../content/maps/mapGenerator'
import { STAGE_NPC_SPAWNS } from '../content/npcs'
import { getTile, TileType } from '../tilemap'
import {
  selectCampVisitor,
  generateVisitorOffers,
  generateTinkererModOffers,
  pickVisitorGreeting,
} from './campVisitor'
import { getUpgradeStateForPlayer, getCharacterIdForPlayer } from '../upgrade'
import { createDraftState } from '../content/lootDistribution'
import { getVisitorDef } from '../content/visitors'
import { getAlivePlayers } from '../queries'
import { getThread, pickNarrativeLine } from '../content/narrative'
import type { ObjectiveConfig } from '../content/waves'

const playerHealthQuery = defineQuery([Player, Health])

const enemyCleanupQuery = defineQuery([Enemy, Position])
const bulletCleanupQuery = defineQuery([Bullet])

/**
 * Core cleanup: remove enemies, bullets, NPCs, boss state, and hazards.
 * When `keepLoot` is true, gold nuggets / item pickups / HP potions are preserved.
 */
function clearEnemiesCore(world: GameWorld, keepLoot: boolean): void {
  // Remove all enemy entities and their associated tracking state
  for (const eid of enemyCleanupQuery(world)) {
    cleanupEntity(world, eid)
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
    cleanupEntity(world, eid)
    removeEntity(world, eid)
  }
  world.npcEntities.clear()
  // Clean up boss group state (multi-entity bosses use sentinel keys)
  world.bossState.clear()
  // Reset derived/cached spatial state — will rebuild on next tick
  world.flowField = null
  world.spatialHash = null
  // Clear transient world objects and boss hazards
  world.dustClouds = []
  world.rockslideShockwaves = []
  world.dynamites = []
  world.groundCracks = []
  world.bossShockwaves = []
  world.bossTelegraphs = []
  world.hollowManVeils = []
  world.hollowManStorm = null
  world.oldScratchStorm = null
  world.trapZones = []
  world.trapDetonations = []
  // Clear per-encounter VFX/event buffers to prevent stale data between stages
  world.healerPulses = []
  world.healEvents = []
  world.rattlesnakeBites = []
  world.vultureDiveImpacts = []
  world.obstacleDestructions = []
  world.obstacleHits = []
  if (!keepLoot) {
    world.goldNuggets = []
    world.itemPickups = []
    world.hpPotionPickups = []
  }
}

/**
 * Remove all enemies, bullets, NPCs, hazards, and loot from the world.
 * Used during stage transitions to start fresh.
 */
export function clearAllEnemies(world: GameWorld): void {
  clearEnemiesCore(world, false)
}

/**
 * Remove enemies and hazards but keep loot (gold, items, potions).
 * Used when entering the looting phase after boss defeat.
 */
export function clearEnemiesForLooting(world: GameWorld): void {
  clearEnemiesCore(world, true)
}

/**
 * Find the nearest walkable floor tile via spiral search.
 * Returns the original tile if it's already walkable.
 */
function findWalkableTile(
  map: { width: number; height: number },
  tileX: number,
  tileY: number,
  getTileFn: (layer: number, x: number, y: number) => number,
): { tileX: number; tileY: number } {
  // Check original position first
  if (
    tileX > 1 && tileX < map.width - 2 &&
    tileY > 1 && tileY < map.height - 2 &&
    getTileFn(0, tileX, tileY) === TileType.EMPTY &&
    getTileFn(1, tileX, tileY) === TileType.FLOOR
  ) {
    return { tileX, tileY }
  }

  // Spiral outward until we find a walkable floor tile
  for (let r = 1; r <= 15; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue
        const tx = tileX + dx
        const ty = tileY + dy
        if (tx <= 1 || tx >= map.width - 2 || ty <= 1 || ty >= map.height - 2) continue
        if (getTileFn(0, tx, ty) === TileType.EMPTY && getTileFn(1, tx, ty) === TileType.FLOOR) {
          return { tileX: tx, tileY: ty }
        }
      }
    }
  }

  return { tileX, tileY }
}

/**
 * Spawn discovery NPCs for the given stage index.
 * Validates tile positions against the tilemap to avoid spawning inside buildings.
 */
export function spawnStageNpcs(world: GameWorld, stageIndex: number): void {
  const spawns = STAGE_NPC_SPAWNS[stageIndex]
  if (!spawns || !world.tilemap) return

  const map = world.tilemap
  const tileSize = map.tileSize
  for (const spawn of spawns) {
    const tile = findWalkableTile(map, spawn.tileX, spawn.tileY, (layer, x, y) => getTile(map, layer, x, y))
    const x = tile.tileX * tileSize + tileSize / 2
    const y = tile.tileY * tileSize + tileSize / 2
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
    if (hasComponent(world, Dead, eid)) {
      removeComponent(world, Dead, eid)
    }
    if (hasComponent(world, Downed, eid)) {
      removeComponent(world, Downed, eid)
    }
  }
}

function recordStageOutcome(world: GameWorld): void {
  if (!world.narrative) return
  const outcome = world.objective?.status === 'soft_failure' ? 'soft_failure' : 'success'
  world.narrative.outcomes.push(outcome)
}

function selectCampNarrativeLine(world: GameWorld): void {
  world.campNarrativeLine = null
  const run = world.run
  const narrative = world.narrative
  if (!run || !narrative) return

  const thread = getThread(narrative.threadId)
  const pool = thread?.campDialogue.find(entry => entry.campIndex === run.currentStage)
  if (!pool) return

  const line = pickNarrativeLine(narrative, pool.lines)
  if (!line) return

  narrative.shownDialogue.add(line.key)
  world.campNarrativeLine = line.text
}

function applySoftFailureBranch(world: GameWorld, completedStage: number, nextStageIndex: number): void {
  const narrative = world.narrative
  const run = world.run
  if (!narrative || !run) return

  const thread = getThread(narrative.threadId)
  const prevStageConfig = thread?.stages[completedStage]
  if (!prevStageConfig?.softFailureNext) return
  if (narrative.outcomes[completedStage] !== 'soft_failure') return

  const nextStage = run.stages[nextStageIndex]
  if (!nextStage) return

  const mod = prevStageConfig.softFailureNext
  if (mod.bossPool && mod.bossPool.length > 0) {
    nextStage.bossPool = [...mod.bossPool]
  }
  if (mod.unlockDialogue) {
    narrative.unlockedKeys.add(mod.unlockDialogue)
  }
}

function computeResolutionText(world: GameWorld): string | null {
  const narrative = world.narrative
  if (!narrative) return null

  const thread = getThread(narrative.threadId)
  if (!thread) return null
  const allSuccess = narrative.outcomes.length > 0 && narrative.outcomes.every(outcome => outcome === 'success')
  return allSuccess ? thread.resolution.success : thread.resolution.softFailure
}

function getObjectiveConfigForStage(
  world: GameWorld,
  stageIndex: number,
  baseObjective: ObjectiveConfig,
): ObjectiveConfig {
  const narrative = world.narrative
  if (!narrative) return baseObjective

  const stageConfig = getThread(narrative.threadId)?.stages[stageIndex]
  if (!stageConfig) return baseObjective

  const prevStage = stageIndex - 1
  const prevStageConfig = prevStage >= 0 ? getThread(narrative.threadId)?.stages[prevStage] : undefined
  const softFailureDescription = prevStage >= 0 &&
    narrative.outcomes[prevStage] === 'soft_failure'
    ? prevStageConfig?.softFailureNext?.objectiveDescription
    : undefined

  // Avoid forcing objective-type changes onto arbitrary custom encounters.
  if (stageConfig.objectiveType && stageConfig.objectiveType !== baseObjective.type) {
    return baseObjective
  }

  if (!stageConfig.objectiveType && !stageConfig.objectiveDescription && !softFailureDescription) {
    return baseObjective
  }

  return {
    ...baseObjective,
    ...(stageConfig.objectiveType ? { type: stageConfig.objectiveType } : {}),
    ...((softFailureDescription ?? stageConfig.objectiveDescription)
      ? { description: softFailureDescription ?? stageConfig.objectiveDescription! }
      : {}),
  }
}

/**
 * Transition from a completed stage to camp phase.
 * Heals players, pre-generates next tilemap, selects camp visitor.
 */
function enterCampPhase(world: GameWorld, run: NonNullable<GameWorld['run']>): void {
  run.transition = 'camp'
  run.transitionTimer = 0
  world.campComplete = false
  healAllPlayers(world)
  // Pre-generate the next stage's map now so campComplete doesn't cause a frame hitch
  const nextStageIndex = run.currentStage + 1
  const nextStage = run.stages[nextStageIndex]!
  run.pendingTilemap = generateMap(nextStage.mapConfig, world.initialSeed, nextStageIndex)

  // Generate camp visitor
  const visitor = selectCampVisitor(world.rng, run.previousVisitorIds)
  const alivePlayers = getAlivePlayers(world)
  const [greeting, greetingIdx] = pickVisitorGreeting(world.rng, visitor, run.lastGreetingIndex)
  run.lastGreetingIndex = greetingIdx

  // Compute combined item inventory across all players (used by visitor offers and draft pool)
  const allPlayerItems = new Map<number, number>()
  for (const pEid of alivePlayers) {
    const state = getUpgradeStateForPlayer(world, pEid)
    for (const [itemId, stacks] of state.items) {
      allPlayerItems.set(itemId, Math.max(allPlayerItems.get(itemId) ?? 0, stacks))
    }
  }

  const visitorDef = getVisitorDef(visitor.id)
  const isTinkerer = visitorDef?.key === 'tinkerer'

  if (isTinkerer) {
    // Tinkerer: generate per-player weapon mod offers
    const modOffersByPlayer = new Map<number, import('./campVisitor').WeaponModOffer[]>()
    let firstPlayerOffers: import('./campVisitor').WeaponModOffer[] = []
    for (const pEid of alivePlayers) {
      const characterId = getCharacterIdForPlayer(world, pEid)
      const takenMods = getUpgradeStateForPlayer(world, pEid).weaponMods
      const offers = generateTinkererModOffers(world.rng, characterId, takenMods)
      modOffersByPlayer.set(pEid, offers)
      if (pEid === alivePlayers[0]) firstPlayerOffers = offers
    }
    world.campVisitor = { visitorId: visitor.id, greeting, greetingIndex: greetingIdx, offers: [], modOffers: firstPlayerOffers, modOffersByPlayer }
  } else {
    // Other visitors: generate item offers
    const offers = generateVisitorOffers(world.rng, visitor, allPlayerItems)
    world.campVisitor = { visitorId: visitor.id, greeting, greetingIndex: greetingIdx, offers, modOffers: [], modOffersByPlayer: new Map() }
  }
  selectCampNarrativeLine(world)

  // Generate draft-pick pool for multiplayer (2+ players)
  if (alivePlayers.length > 1) {
    world.draftState = createDraftState(world.rng, [...alivePlayers], world.playerKillCounts, allPlayerItems)
  } else {
    world.draftState = null
  }
}

/**
 * Complete a stage: mark run as completed (final) or enter camp (mid-run).
 */
function finishStage(world: GameWorld, run: NonNullable<GameWorld['run']>): void {
  const isLastStage = run.currentStage + 1 >= run.totalStages
  if (isLastStage) {
    world.resolutionText = computeResolutionText(world)
    world.campNarrativeLine = null
    run.currentStage++
    run.completed = true
    run.transition = 'none'
  } else {
    enterCampPhase(world, run)
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
      initObjective(world, getObjectiveConfigForStage(world, run.currentStage, stageEnc.objective))
    }
  }

  // Detect encounter completion -> enter looting phase
  if (enc.completed && run.transition === 'none') {
    // Promote active objective to success (player survived the encounter)
    if (world.objective?.status === 'active') {
      world.objective.status = 'success'
    }
    recordStageOutcome(world)
    run.transition = 'looting'
    run.transitionTimer = 0
    world.stageCleared = true
    clearEnemiesForLooting(world)
    // Extend gold nugget lifetimes so they don't expire during looting
    for (const nugget of world.goldNuggets) {
      nugget.lifetime = Math.max(nugget.lifetime, GOLD_NUGGET_LIFETIME)
    }
    // Spawn horse at arena center (fallback to map center if tilemap unavailable)
    const center = world.tilemap
      ? getArenaCenterFromTilemap(world.tilemap)
      : { x: 800, y: 600 }
    world.horse = { x: center.x, y: center.y, active: true }
    return
  }

  // Looting phase — wait for player to interact with horse
  if (run.transition === 'looting') {
    // Defensive: if horse was never created, skip looting to avoid a stuck run
    const horseDone = !world.horse || !world.horse.active
    if (horseDone) {
      world.horse = null
      // Clear remaining loot before transitioning
      world.goldNuggets = []
      world.itemPickups = []
      world.hpPotionPickups = []
      finishStage(world, run)
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
      world.campNarrativeLine = null
      world.draftState = null
      // Reset per-stage item state for all alive players
      for (const pEid of getAlivePlayers(world)) {
        const us = getUpgradeStateForPlayer(world, pEid)
        us.peacemakerLastTarget = 0xFFFF
        us.peacemakerHitCount = 0
      }
      const completedStage = run.currentStage
      run.currentStage++
      applySoftFailureBranch(world, completedStage, run.currentStage)
      const nextStage = run.stages[run.currentStage]!
      // Use pre-generated map (built on camp entry), fall back to generating if missing
      const newMap = run.pendingTilemap ?? generateMap(nextStage.mapConfig, world.initialSeed, run.currentStage)
      run.pendingTilemap = null
      swapTilemap(world, newMap)
      setEncounter(world, nextStage)
      spawnStageNpcs(world, run.currentStage)
      run.npcsSpawned = true
      // Initialize objective if configured for this stage
      if (nextStage.objective) {
        initObjective(world, getObjectiveConfigForStage(world, run.currentStage, nextStage.objective))
      }
      run.transition = 'none'
    }
  }
}
