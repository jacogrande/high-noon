import { Player, Position, ZPosition, type EnemySnapshot, type PlayerSnapshot, type WorldSnapshot } from '@high-noon/shared'
import type { InterpolationState } from '../../net/SnapshotBuffer'

/** Maximum extrapolation time in ms when alpha > 1.0.
 *  Matches SnapshotBuffer's MAX_EXTRAPOLATION_MS — the buffer caps alpha such
 *  that extrapolateTime can never exceed this in practice. */
const MAX_EXTRAPOLATION_MS = 100
/** Exponential decay base per 16.67ms (one 60Hz frame) */
const EXTRAPOLATION_DECAY_BASE = 0.85

export interface RemoteInterpolationContext {
  world: { tick: number }
  playerEntities: ReadonlyMap<number, number>
  enemyEntities: ReadonlyMap<number, number>
  myClientEid: number
}

export interface RemotePlayerRenderState {
  x: number
  y: number
  z: number
  aimAngle: number
}

export interface RemoteEnemyRenderState {
  x: number
  y: number
}

export interface RemoteInterpolationSample {
  alpha: number
  worldTick: number
  playerStates: ReadonlyMap<number, RemotePlayerRenderState>
  enemyStates: ReadonlyMap<number, RemoteEnemyRenderState>
}

/** Lerp an angle in radians with shortest-path wrapping across the -PI/PI boundary.
 *  Input angles are assumed to be in [-PI, PI] (from atan2), so diff is in [-2PI, 2PI]
 *  and a single wrap suffices. */
function lerpAngle(from: number, to: number, t: number): number {
  let diff = to - from
  if (diff > Math.PI) diff -= 2 * Math.PI
  else if (diff < -Math.PI) diff += 2 * Math.PI
  return from + diff * t
}

export class RemoteInterpolationApplier {
  private readonly fromPlayerIndex = new Map<number, PlayerSnapshot>()
  private readonly fromEnemyIndex = new Map<number, EnemySnapshot>()
  private readonly sampledPlayerStates = new Map<number, RemotePlayerRenderState>()
  private readonly sampledEnemyStates = new Map<number, RemoteEnemyRenderState>()
  private readonly activePlayerStateIds = new Set<number>()
  private readonly activeEnemyStateIds = new Set<number>()

  applyLatest(snapshot: WorldSnapshot, ctx: RemoteInterpolationContext): void {
    ctx.world.tick = snapshot.tick

    for (const p of snapshot.players) {
      const clientEid = ctx.playerEntities.get(p.eid)
      if (clientEid === undefined || clientEid === ctx.myClientEid) continue

      Position.prevX[clientEid] = p.x
      Position.prevY[clientEid] = p.y
      Position.x[clientEid] = p.x
      Position.y[clientEid] = p.y
      ZPosition.z[clientEid] = p.z
      Player.aimAngle[clientEid] = p.aimAngle
    }

    for (const e of snapshot.enemies) {
      const clientEid = ctx.enemyEntities.get(e.eid)
      if (clientEid === undefined) continue

      Position.prevX[clientEid] = e.x
      Position.prevY[clientEid] = e.y
      Position.x[clientEid] = e.x
      Position.y[clientEid] = e.y
    }
  }

  sample(interp: InterpolationState, ctx: RemoteInterpolationContext): RemoteInterpolationSample {
    const { from, to, alpha } = interp

    const worldTick = Math.round(from.tick + (to.tick - from.tick) * alpha)

    // Build index maps from `from` snapshot (reuse maps, clear instead of alloc)
    this.fromPlayerIndex.clear()
    for (const p of from.players) {
      this.fromPlayerIndex.set(p.eid, p)
    }

    this.fromEnemyIndex.clear()
    for (const e of from.enemies) {
      this.fromEnemyIndex.set(e.eid, e)
    }

    const span = to.serverTime - from.serverTime
    this.samplePlayers(to, ctx, alpha, span)
    this.sampleEnemies(to, ctx, alpha, span)

    return {
      alpha,
      worldTick,
      playerStates: this.sampledPlayerStates,
      enemyStates: this.sampledEnemyStates,
    }
  }

  private samplePlayers(to: WorldSnapshot, ctx: RemoteInterpolationContext, alpha: number, span: number): void {
    this.activePlayerStateIds.clear()

    for (const p of to.players) {
      const clientEid = ctx.playerEntities.get(p.eid)
      if (clientEid === undefined) continue

      // Skip local player — driven by prediction, not interpolation
      if (clientEid === ctx.myClientEid) continue
      this.activePlayerStateIds.add(clientEid)

      const prev = this.fromPlayerIndex.get(p.eid)
      const fromX = prev?.x ?? p.x
      const fromY = prev?.y ?? p.y
      const fromZ = prev?.z ?? p.z

      let finalX = p.x
      let finalY = p.y

      // Velocity-based extrapolation when alpha > 1.0 (buffer running dry)
      if (alpha > 1.0 && span > 0) {
        const velX = (p.x - fromX) / span
        const velY = (p.y - fromY) / span
        const extrapolateTime = Math.min((alpha - 1.0) * span, MAX_EXTRAPOLATION_MS)
        const decay = Math.pow(EXTRAPOLATION_DECAY_BASE, extrapolateTime / 16.67)
        finalX = p.x + velX * extrapolateTime * decay
        finalY = p.y + velY * extrapolateTime * decay
      }
      const sampledX = alpha <= 1 ? fromX + (finalX - fromX) * alpha : finalX
      const sampledY = alpha <= 1 ? fromY + (finalY - fromY) * alpha : finalY

      const renderState = this.sampledPlayerStates.get(clientEid)
      const nextZ = fromZ + (p.z - fromZ) * Math.min(alpha, 1)
      const fromAngle = prev?.aimAngle ?? p.aimAngle
      const nextAimAngle = lerpAngle(fromAngle, p.aimAngle, Math.min(alpha, 1))
      if (renderState) {
        renderState.x = sampledX
        renderState.y = sampledY
        renderState.z = nextZ
        renderState.aimAngle = nextAimAngle
      } else {
        this.sampledPlayerStates.set(clientEid, {
          x: sampledX,
          y: sampledY,
          z: nextZ,
          aimAngle: nextAimAngle,
        })
      }
    }

    for (const clientEid of this.sampledPlayerStates.keys()) {
      if (!this.activePlayerStateIds.has(clientEid)) {
        this.sampledPlayerStates.delete(clientEid)
      }
    }
  }

  private sampleEnemies(to: WorldSnapshot, ctx: RemoteInterpolationContext, alpha: number, span: number): void {
    this.activeEnemyStateIds.clear()

    for (const e of to.enemies) {
      const clientEid = ctx.enemyEntities.get(e.eid)
      if (clientEid === undefined) continue
      this.activeEnemyStateIds.add(clientEid)

      const prev = this.fromEnemyIndex.get(e.eid)
      const fromX = prev?.x ?? e.x
      const fromY = prev?.y ?? e.y

      let finalX = e.x
      let finalY = e.y

      // Velocity-based extrapolation when alpha > 1.0 (buffer running dry)
      // Skip for idle enemies (aiState === 0) or dead enemies (hp <= 0)
      if (alpha > 1.0 && span > 0 && e.aiState !== 0 && e.hp > 0) {
        const velX = (e.x - fromX) / span
        const velY = (e.y - fromY) / span
        const extrapolateTime = Math.min((alpha - 1.0) * span, MAX_EXTRAPOLATION_MS)
        const decay = Math.pow(EXTRAPOLATION_DECAY_BASE, extrapolateTime / 16.67)
        finalX = e.x + velX * extrapolateTime * decay
        finalY = e.y + velY * extrapolateTime * decay
      }
      const sampledX = alpha <= 1 ? fromX + (finalX - fromX) * alpha : finalX
      const sampledY = alpha <= 1 ? fromY + (finalY - fromY) * alpha : finalY

      const renderState = this.sampledEnemyStates.get(clientEid)
      if (renderState) {
        renderState.x = sampledX
        renderState.y = sampledY
      } else {
        this.sampledEnemyStates.set(clientEid, { x: sampledX, y: sampledY })
      }
    }

    for (const clientEid of this.sampledEnemyStates.keys()) {
      if (!this.activeEnemyStateIds.has(clientEid)) {
        this.sampledEnemyStates.delete(clientEid)
      }
    }
  }
}
