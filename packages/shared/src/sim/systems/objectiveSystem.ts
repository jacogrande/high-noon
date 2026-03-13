/**
 * Objective System
 *
 * Manages stage objective lifecycle: spawning objective entities,
 * ticking protect/intercept logic, and transitioning status.
 * Runs after waveSpawner, before stageProgression.
 */

import { defineQuery, hasComponent, removeEntity } from 'bitecs'
import type { GameWorld, ObjectiveState } from '../world'
import { cleanupEntity } from '../entityCleanup'
import type { ObjectiveConfig } from '../content/waves'
import {
  Enemy,
  Position,
  Health,
  Dead,
  ObjectiveRole,
  ObjRole,
} from '../components'
import {
  spawnProtectTarget,
  spawnInterceptDest,
  spawnObjectiveRunner,
  spawnObjectiveAttacker,
  spawnDuelist,
} from '../prefabs'
import { DUEL_RING_RADIUS, DUEL_FORFEIT_GRACE } from '../content/enemies'
import { pickSpawnPosition } from './waveSpawner'
import { getPlayableBoundsFromTilemap } from '../tilemap'
import { getAlivePlayers } from '../queries'
import { applyCoopHpScale } from '../content/coopScaling'

const objectiveRoleQuery = defineQuery([ObjectiveRole, Enemy, Position])

/** Distance threshold for runner reaching destination */
const RUNNER_ARRIVE_DIST = 20
const RUNNER_ARRIVE_DIST_SQ = RUNNER_ARRIVE_DIST * RUNNER_ARRIVE_DIST

/** Spawn position parameters: min/max range from reference point, min dist from player */
const SPAWN_RANGE_MIN = 200
const SPAWN_RANGE_MAX = 400
const SPAWN_MIN_PLAYER_DIST = 80

/**
 * Initialize a stage objective from config.
 * Spawns objective entities and sets world.objective state.
 */
export function initObjective(world: GameWorld, config: ObjectiveConfig): void {
  if (!world.tilemap) return

  const bounds = getPlayableBoundsFromTilemap(world.tilemap)
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerY = (bounds.minY + bounds.maxY) / 2

  if (config.type === 'protect') {
    const hp = config.protectHP ?? 50
    let px: number
    let py: number

    if (config.protectPosition === 'center') {
      px = centerX
      py = centerY
    } else {
      // 'random' — pick a position near center but offset
      const angle = world.rng.next() * Math.PI * 2
      const dist = world.rng.nextRange(40, 100)
      px = centerX + Math.cos(angle) * dist
      py = centerY + Math.sin(angle) * dist
    }

    const targetEid = spawnProtectTarget(world, px, py, hp)

    world.objective = {
      type: 'protect',
      status: 'active',
      description: config.description,
      targetEids: [targetEid],
      escapedCount: 0,
      escapeThreshold: 0,
      spawnTimer: 0,
      totalSpawned: 0,
      maxSpawns: Infinity,
      spawnInterval: config.attackerSpawnInterval ?? 8,
      maxAlive: config.maxAttackersAlive ?? 2,
      runnerSpeed: 0,
      runnerHP: 0,
      ringCenterX: 0,
      ringCenterY: 0,
      ringRadius: 0,
      duelistEid: 0,
      forfeitTimer: 0,
      forfeitGrace: 0,
    }
  } else if (config.type === 'intercept') {
    // Place destination marker near center
    const destEid = spawnInterceptDest(world, centerX, centerY)

    world.objective = {
      type: 'intercept',
      status: 'active',
      description: config.description,
      targetEids: [destEid],
      escapedCount: 0,
      escapeThreshold: config.escapeThreshold ?? 3,
      spawnTimer: 0,
      totalSpawned: 0,
      maxSpawns: config.totalRunners ?? 5,
      spawnInterval: config.runnerSpawnInterval ?? 12,
      maxAlive: Infinity,
      runnerSpeed: config.runnerSpeed ?? 140,
      runnerHP: config.runnerHP ?? 2,
      ringCenterX: 0,
      ringCenterY: 0,
      ringRadius: 0,
      duelistEid: 0,
      forfeitTimer: 0,
      forfeitGrace: 0,
    }
  } else if (config.type === 'duel') {
    // Ring center = first alive player position
    const alivePlayers = getAlivePlayers(world)
    let ringX = centerX
    let ringY = centerY
    if (alivePlayers.length > 0) {
      ringX = Position.x[alivePlayers[0]!]!
      ringY = Position.y[alivePlayers[0]!]!
    }

    const ringRadius = config.ringRadius ?? DUEL_RING_RADIUS

    // Spawn duelist inside the ring, offset from center
    const angle = world.rng.next() * Math.PI * 2
    const spawnDist = ringRadius * 0.7
    const duelistX = ringX + Math.cos(angle) * spawnDist
    const duelistY = ringY + Math.sin(angle) * spawnDist
    const duelistEid = spawnDuelist(world, duelistX, duelistY, config.duelistHP, config.duelistDamage)
    applyCoopHpScale(world.activePlayerCount, duelistEid, false, Health)

    world.objective = {
      type: 'duel',
      status: 'active',
      description: config.description,
      targetEids: [],
      escapedCount: 0,
      escapeThreshold: 0,
      spawnTimer: 0,
      totalSpawned: 0,
      maxSpawns: 0,
      spawnInterval: 0,
      maxAlive: 0,
      runnerSpeed: 0,
      runnerHP: 0,
      ringCenterX: ringX,
      ringCenterY: ringY,
      ringRadius,
      duelistEid,
      forfeitTimer: 0,
      forfeitGrace: DUEL_FORFEIT_GRACE,
    }
  }
}

/**
 * Clean up objective entities when a stage ends.
 */
export function cleanupObjective(world: GameWorld): void {
  if (!world.objective) return

  // Remove duel's duelist if still alive
  if (world.objective.type === 'duel' && world.objective.duelistEid) {
    const duelistEid = world.objective.duelistEid
    if (hasComponent(world, Position, duelistEid)) {
      cleanupEntity(world, duelistEid)
      removeEntity(world, duelistEid)
    }
  }

  // Remove objective target entities
  for (const eid of world.objective.targetEids) {
    if (hasComponent(world, Position, eid)) {
      cleanupEntity(world, eid)
      removeEntity(world, eid)
    }
  }

  // Remove any remaining objective-role enemies
  for (const eid of objectiveRoleQuery(world)) {
    cleanupEntity(world, eid)
    removeEntity(world, eid)
  }

  world.objective = null
}

function protectTick(world: GameWorld, obj: ObjectiveState, dt: number): void {
  // Check if any protect target has died or been removed.
  // healthSystem removes non-Player entities when HP reaches 0, so we also
  // need to detect removal (entity no longer has Position) — not just HP <= 0.
  for (const targetEid of obj.targetEids) {
    const removed = !hasComponent(world, Position, targetEid)
    const dead = hasComponent(world, Health, targetEid) && Health.current[targetEid]! <= 0
    if (removed || dead) {
      obj.status = 'soft_failure'
      return
    }
  }

  // Count alive attackers
  let aliveAttackers = 0
  for (const eid of objectiveRoleQuery(world)) {
    if (ObjectiveRole.role[eid] === ObjRole.ATTACKER && !hasComponent(world, Dead, eid)) {
      aliveAttackers++
    }
  }

  // Spawn attackers on timer
  obj.spawnTimer += dt
  if (obj.spawnTimer >= obj.spawnInterval && aliveAttackers < obj.maxAlive && obj.targetEids.length > 0) {
    obj.spawnTimer = 0

    // Spawn around the protect target so attackers come from all sides
    const targetEid = obj.targetEids[0]!
    const targetX = Position.x[targetEid]!
    const targetY = Position.y[targetEid]!

    const pos = pickSpawnPosition(world.rng, targetX, targetY, world.tilemap, SPAWN_RANGE_MIN, SPAWN_RANGE_MAX, SPAWN_MIN_PLAYER_DIST)
    const attackerEid = spawnObjectiveAttacker(world, pos.x, pos.y, targetEid)
    applyCoopHpScale(world.activePlayerCount, attackerEid, false, Health)
    obj.totalSpawned++
  }
}

function interceptTick(world: GameWorld, obj: ObjectiveState, dt: number): void {
  if (obj.targetEids.length === 0) return

  const destEid = obj.targetEids[0]!
  const destX = Position.x[destEid]!
  const destY = Position.y[destEid]!

  // Check each alive runner — has it reached the destination?
  for (const eid of objectiveRoleQuery(world)) {
    if (ObjectiveRole.role[eid] !== ObjRole.RUNNER) continue
    if (hasComponent(world, Dead, eid)) continue

    const rx = Position.x[eid]!
    const ry = Position.y[eid]!
    const dx = destX - rx
    const dy = destY - ry
    const distSq = dx * dx + dy * dy

    if (distSq <= RUNNER_ARRIVE_DIST_SQ) {
      obj.escapedCount++
      cleanupEntity(world, eid)
      removeEntity(world, eid)
    }
  }

  // Check soft failure
  if (obj.escapedCount >= obj.escapeThreshold) {
    obj.status = 'soft_failure'
    return
  }

  // Check success: all runners spawned and all dead/escaped
  if (obj.totalSpawned >= obj.maxSpawns) {
    let anyAlive = false
    for (const eid of objectiveRoleQuery(world)) {
      if (ObjectiveRole.role[eid] === ObjRole.RUNNER && !hasComponent(world, Dead, eid)) {
        anyAlive = true
        break
      }
    }
    if (!anyAlive) {
      obj.status = 'success'
      return
    }
  }

  // Spawn runners on timer
  obj.spawnTimer += dt
  if (obj.spawnTimer >= obj.spawnInterval && obj.totalSpawned < obj.maxSpawns) {
    obj.spawnTimer = 0

    // Spawn at arena edge, far from destination
    const alivePlayers = getAlivePlayers(world)
    let playerX = destX
    let playerY = destY
    if (alivePlayers.length > 0) {
      playerX = 0
      playerY = 0
      for (const pid of alivePlayers) {
        playerX += Position.x[pid]!
        playerY += Position.y[pid]!
      }
      playerX /= alivePlayers.length
      playerY /= alivePlayers.length
    }

    // Spawn far from destination (use player centroid as reference, spawn at edge)
    const pos = pickSpawnPosition(world.rng, destX, destY, world.tilemap, 200, 400, 80)
    const runnerEid = spawnObjectiveRunner(world, pos.x, pos.y, destEid, obj.runnerSpeed, obj.runnerHP)
    applyCoopHpScale(world.activePlayerCount, runnerEid, false, Health)
    obj.totalSpawned++
  }
}

function duelTick(world: GameWorld, obj: ObjectiveState, dt: number): void {
  const duelistEid = obj.duelistEid

  // Check if duelist is dead (entity removed or HP <= 0)
  const duelistRemoved = !hasComponent(world, Position, duelistEid)
  const duelistDead = hasComponent(world, Health, duelistEid) && Health.current[duelistEid]! <= 0
  if (duelistRemoved || duelistDead) {
    obj.status = 'success'
    return
  }

  // Check player distance to ring center
  const alivePlayers = getAlivePlayers(world)
  if (alivePlayers.length === 0) return

  const playerEid = alivePlayers[0]!
  const px = Position.x[playerEid]!
  const py = Position.y[playerEid]!
  const dx = px - obj.ringCenterX
  const dy = py - obj.ringCenterY
  const distSq = dx * dx + dy * dy
  const radiusSq = obj.ringRadius * obj.ringRadius

  if (distSq > radiusSq) {
    obj.forfeitTimer += dt
    if (obj.forfeitTimer >= obj.forfeitGrace) {
      obj.status = 'soft_failure'
      // Remove the duelist on forfeit
      if (hasComponent(world, Position, duelistEid)) {
        cleanupEntity(world, duelistEid)
        removeEntity(world, duelistEid)
      }
    }
  } else {
    obj.forfeitTimer = 0
  }
}

export function objectiveSystem(world: GameWorld, dt: number): void {
  const obj = world.objective
  if (!obj || obj.status !== 'active') return

  if (obj.type === 'protect') {
    protectTick(world, obj, dt)
  } else if (obj.type === 'intercept') {
    interceptTick(world, obj, dt)
  } else if (obj.type === 'duel') {
    duelTick(world, obj, dt)
  }
}
