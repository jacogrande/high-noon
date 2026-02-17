import { Position, ZPosition, type EnemySnapshot, type PlayerSnapshot, type WorldSnapshot } from '@high-noon/shared'
import type { InterpolationState } from '../../net/SnapshotBuffer'

export interface RemoteInterpolationContext {
  world: { tick: number }
  playerEntities: ReadonlyMap<number, number>
  enemyEntities: ReadonlyMap<number, number>
  myClientEid: number
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

    this.interpolatePlayers(to, ctx, alpha)
    this.interpolateEnemies(to, ctx)

    return alpha
  }

  private interpolatePlayers(to: WorldSnapshot, ctx: RemoteInterpolationContext, alpha: number): void {
    for (const p of to.players) {
      const clientEid = ctx.playerEntities.get(p.eid)
      if (clientEid === undefined) continue

      // Skip local player — driven by prediction, not interpolation
      if (clientEid === ctx.myClientEid) continue

      const prev = this.fromPlayerIndex.get(p.eid)
      const fromX = prev?.x ?? p.x
      const fromY = prev?.y ?? p.y
      const fromZ = prev?.z ?? p.z

      Position.prevX[clientEid] = fromX
      Position.prevY[clientEid] = fromY
      Position.x[clientEid] = p.x
      Position.y[clientEid] = p.y
      ZPosition.z[clientEid] = fromZ + (p.z - fromZ) * alpha
    }
  }

  private interpolateEnemies(to: WorldSnapshot, ctx: RemoteInterpolationContext): void {
    for (const e of to.enemies) {
      const clientEid = ctx.enemyEntities.get(e.eid)
      if (clientEid === undefined) continue

      const prev = this.fromEnemyIndex.get(e.eid)
      const fromX = prev?.x ?? e.x
      const fromY = prev?.y ?? e.y

      Position.prevX[clientEid] = fromX
      Position.prevY[clientEid] = fromY
      Position.x[clientEid] = e.x
      Position.y[clientEid] = e.y
    }
  }
}
