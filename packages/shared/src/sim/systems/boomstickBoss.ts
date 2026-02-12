/**
 * Boomstick Boss Phase System
 *
 * Drives Reverend Boomstick's multi-phase combat behavior:
 * - Phase transitions at HP thresholds
 * - Brief transition i-frames + forced telegraph
 * - Per-phase attack cadence and projectile scaling
 * - One-time add bursts on phase entry
 */

import { defineQuery } from 'bitecs'
import type { GameWorld } from '../world'
import { Enemy, EnemyType, BossPhase, Health, AttackConfig, EnemyAI, AIState, Position } from '../components'
import { transition } from './enemyAI'
import { spawnSwarmer, spawnGoblinRogue } from '../prefabs'
import { isSolidAt } from '../tilemap'
import {
  BOOMSTICK_PHASE_2_THRESHOLD,
  BOOMSTICK_PHASE_3_THRESHOLD,
  BOOMSTICK_TRANSITION_IFRAMES,
  BOOMSTICK_PHASE_2_TELEGRAPH,
  BOOMSTICK_PHASE_2_RECOVERY,
  BOOMSTICK_PHASE_2_COOLDOWN,
  BOOMSTICK_PHASE_2_FAN_BULLETS,
  BOOMSTICK_PHASE_2_SUMMON_SWARMERS,
  BOOMSTICK_PHASE_2_SUMMON_ROGUES,
  BOOMSTICK_PHASE_3_TELEGRAPH,
  BOOMSTICK_PHASE_3_RECOVERY,
  BOOMSTICK_PHASE_3_COOLDOWN,
  BOOMSTICK_PHASE_3_FAN_BULLETS,
  BOOMSTICK_PHASE_3_SUMMON_SWARMERS,
  BOOMSTICK_PHASE_3_SUMMON_ROGUES,
} from '../content/enemies'

const boomstickQuery = defineQuery([Enemy, BossPhase, Health, AttackConfig, EnemyAI, Position])

const SUMMON_MIN_RADIUS = 80
const SUMMON_MAX_RADIUS = 160
const SUMMON_FALLBACK_RADIUS = 96
const SUMMON_MAX_ATTEMPTS = 12

function getDesiredPhase(hpRatio: number): number {
  if (hpRatio <= BOOMSTICK_PHASE_3_THRESHOLD) return 3
  if (hpRatio <= BOOMSTICK_PHASE_2_THRESHOLD) return 2
  return 1
}

function applyPhaseTuning(eid: number, phase: number): void {
  switch (phase) {
    case 2:
      AttackConfig.telegraphDuration[eid] = BOOMSTICK_PHASE_2_TELEGRAPH
      AttackConfig.recoveryDuration[eid] = BOOMSTICK_PHASE_2_RECOVERY
      AttackConfig.cooldown[eid] = BOOMSTICK_PHASE_2_COOLDOWN
      AttackConfig.projectileCount[eid] = BOOMSTICK_PHASE_2_FAN_BULLETS
      break
    case 3:
      AttackConfig.telegraphDuration[eid] = BOOMSTICK_PHASE_3_TELEGRAPH
      AttackConfig.recoveryDuration[eid] = BOOMSTICK_PHASE_3_RECOVERY
      AttackConfig.cooldown[eid] = BOOMSTICK_PHASE_3_COOLDOWN
      AttackConfig.projectileCount[eid] = BOOMSTICK_PHASE_3_FAN_BULLETS
      break
    default:
      break
  }
}

function pickSummonPosition(
  world: GameWorld,
  centerX: number,
  centerY: number,
  baseAngle: number,
): { x: number; y: number } {
  const tilemap = world.tilemap

  for (let attempt = 0; attempt < SUMMON_MAX_ATTEMPTS; attempt++) {
    const angleJitter = world.rng.nextRange(-0.6, 0.6)
    const angle = baseAngle + angleJitter
    const dist = world.rng.nextRange(SUMMON_MIN_RADIUS, SUMMON_MAX_RADIUS)
    const x = centerX + Math.cos(angle) * dist
    const y = centerY + Math.sin(angle) * dist

    if (tilemap && isSolidAt(tilemap, x, y)) continue
    return { x, y }
  }

  const fallbackX = centerX + Math.cos(baseAngle) * SUMMON_FALLBACK_RADIUS
  const fallbackY = centerY + Math.sin(baseAngle) * SUMMON_FALLBACK_RADIUS

  if (tilemap && isSolidAt(tilemap, fallbackX, fallbackY)) {
    return { x: centerX, y: centerY }
  }
  return { x: fallbackX, y: fallbackY }
}

function spawnBurst(
  world: GameWorld,
  bossEid: number,
  swarmers: number,
  rogues: number,
): void {
  const centerX = Position.x[bossEid]!
  const centerY = Position.y[bossEid]!
  const total = swarmers + rogues
  if (total <= 0) return

  let slot = 0
  const spawnAtSlot = (fn: (w: GameWorld, x: number, y: number) => number) => {
    const angle = (slot / total) * Math.PI * 2
    slot++
    const pos = pickSummonPosition(world, centerX, centerY, angle)
    fn(world, pos.x, pos.y)
  }

  for (let i = 0; i < swarmers; i++) {
    spawnAtSlot(spawnSwarmer)
  }
  for (let i = 0; i < rogues; i++) {
    spawnAtSlot(spawnGoblinRogue)
  }
}

function enterPhase(world: GameWorld, eid: number, phase: number): void {
  BossPhase.phase[eid] = phase
  applyPhaseTuning(eid, phase)

  Health.iframes[eid] = Math.max(Health.iframes[eid]!, BOOMSTICK_TRANSITION_IFRAMES)
  AttackConfig.cooldownRemaining[eid] = 0

  if (EnemyAI.state[eid] !== AIState.TELEGRAPH) {
    transition(eid, AIState.TELEGRAPH)
  } else {
    EnemyAI.stateTimer[eid] = 0
  }

  if (phase === 2) {
    spawnBurst(world, eid, BOOMSTICK_PHASE_2_SUMMON_SWARMERS, BOOMSTICK_PHASE_2_SUMMON_ROGUES)
  } else if (phase === 3) {
    spawnBurst(world, eid, BOOMSTICK_PHASE_3_SUMMON_SWARMERS, BOOMSTICK_PHASE_3_SUMMON_ROGUES)
  }
}

export function boomstickBossSystem(world: GameWorld, _dt: number): void {
  const enemies = boomstickQuery(world)

  for (const eid of enemies) {
    if (Enemy.type[eid] !== EnemyType.BOOMSTICK) continue
    if (Health.current[eid]! <= 0 || Health.max[eid]! <= 0) continue

    const currentPhase = Math.max(1, BossPhase.phase[eid]!)
    const hpRatio = Health.current[eid]! / Health.max[eid]!
    const desiredPhase = getDesiredPhase(hpRatio)

    if (desiredPhase <= currentPhase) continue

    // Handle big burst damage robustly by advancing through each crossed phase.
    for (let phase = currentPhase + 1; phase <= desiredPhase; phase++) {
      enterPhase(world, eid, phase)
    }
  }
}
