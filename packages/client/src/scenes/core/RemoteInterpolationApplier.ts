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

  apply(interp: InterpolationState, ctx: RemoteInterpolationContext): number {
    const { from, to, alpha } = interp

    // Interpolate world.tick for smooth animation cycling
    ctx.world.tick = Math.round(from.tick + (to.tick - from.tick) * alpha)

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
    this.interpolatePlayers(to, ctx, alpha, span)
    this.interpolateEnemies(to, ctx, alpha, span)

    return alpha
  }

  private interpolatePlayers(to: WorldSnapshot, ctx: RemoteInterpolationContext, alpha: number, span: number): void {
    for (const p of to.players) {
      const clientEid = ctx.playerEntities.get(p.eid)
      if (clientEid === undefined) continue

      // Skip local player — driven by prediction, not interpolation
      if (clientEid === ctx.myClientEid) continue

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

      Position.prevX[clientEid] = fromX
      Position.prevY[clientEid] = fromY
      Position.x[clientEid] = finalX
      Position.y[clientEid] = finalY
      ZPosition.z[clientEid] = fromZ + (p.z - fromZ) * Math.min(alpha, 1)

      // Interpolate aim angle with shortest-path wrapping
      const fromAngle = prev?.aimAngle ?? p.aimAngle
      Player.aimAngle[clientEid] = lerpAngle(fromAngle, p.aimAngle, Math.min(alpha, 1))
    }
  }

  private interpolateEnemies(to: WorldSnapshot, ctx: RemoteInterpolationContext, alpha: number, span: number): void {
    for (const e of to.enemies) {
      const clientEid = ctx.enemyEntities.get(e.eid)
      if (clientEid === undefined) continue

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

      Position.prevX[clientEid] = fromX
      Position.prevY[clientEid] = fromY
      Position.x[clientEid] = finalX
      Position.y[clientEid] = finalY
    }
  }
}
