/**
 * Map Obstacle Renderer
 *
 * Draws procedural graphics for map obstacles (crates, barrels, boulders,
 * fallen trees, low walls, fence rails). Redraws when obstacle state changes (count,
 * positions, or HP values). Damage states shown via tint modulation.
 *
 * Follows the TrapZoneRenderer pattern: single Graphics object with
 * cache-key invalidation.
 */

import { Graphics, Container } from 'pixi.js'
import { MapObstacleType, type GameWorld } from '@high-noon/shared'

// ── Color constants ─────────────────────────────────────────────────
const CRATE_FILL = 0x8b6833
const CRATE_STROKE = 0x6b4c26
const CRATE_PLANK = 0x7a5c2e

const BARREL_FILL = 0x7a5230
const BARREL_STROKE = 0x5c3d22
const BARREL_BAND = 0x444444

const BOULDER_FILL = 0x777777
const BOULDER_STROKE = 0x555555

const FALLEN_TREE_FILL = 0x6b4c26
const FALLEN_TREE_STROKE = 0x4a3418
const FALLEN_TREE_BRANCH = 0x5a4020

const LOW_WALL_FILL = 0x888888
const LOW_WALL_STROKE = 0x666666
const LOW_WALL_DOT = 0x999999

const FENCE_RAIL_FILL = 0x9b7840
const FENCE_RAIL_STROKE = 0x6b4c26
const FENCE_RAIL_POST = 0x7a5c2e

const DAMAGE_CRACK_COLOR = 0x333333
const DAMAGE_CRITICAL_TINT = 0xff6666

export class MapObstacleRenderer {
  private readonly graphics: Graphics
  private cachedKey = ''

  constructor(entityLayer: Container) {
    this.graphics = new Graphics()
    this.graphics.visible = false
    entityLayer.addChild(this.graphics)
  }

  render(world: GameWorld): void {
    const obstacles = world.mapObstacles
    if (obstacles.length === 0) {
      if (this.cachedKey !== '') {
        this.graphics.clear()
        this.graphics.visible = false
        this.cachedKey = ''
      }
      return
    }

    // Build cache key from count + positions + HP
    let key = `${obstacles.length}`
    for (const obs of obstacles) {
      key += `|${obs.type}:${obs.x | 0},${obs.y | 0}:${obs.hp ?? -1}`
    }

    if (key === this.cachedKey) return

    this.cachedKey = key
    this.graphics.clear()

    const ts = world.tilemap?.tileSize ?? 32

    for (const obs of obstacles) {
      const w = obs.widthTiles * ts
      const h = obs.heightTiles * ts
      const left = obs.x - w / 2
      const top = obs.y - h / 2

      // Damage ratio for visual feedback
      const dmgRatio = obs.hp !== undefined && obs.maxHp !== undefined && obs.maxHp > 0
        ? obs.hp / obs.maxHp
        : 1

      switch (obs.type) {
        case MapObstacleType.CRATE:
          this.drawCrate(left, top, w, h, dmgRatio)
          break
        case MapObstacleType.BARREL:
          this.drawBarrel(obs.x, obs.y, w, h, dmgRatio)
          break
        case MapObstacleType.BOULDER:
          this.drawBoulder(obs.x, obs.y, w, h, dmgRatio)
          break
        case MapObstacleType.FALLEN_TREE:
          this.drawFallenTree(left, top, w, h)
          break
        case MapObstacleType.LOW_WALL:
          this.drawLowWall(left, top, w, h, dmgRatio)
          break
        case MapObstacleType.FENCE_RAIL:
          this.drawFenceRail(left, top, w, h, dmgRatio)
          break
        default: {
          const _exhaustive: never = obs.type
          console.warn('MapObstacleRenderer: unhandled obstacle type', _exhaustive)
        }
      }
    }

    this.graphics.visible = true
  }

  private drawCrate(x: number, y: number, w: number, h: number, dmgRatio: number): void {
    const fill = dmgRatio <= 0.34 ? DAMAGE_CRITICAL_TINT : CRATE_FILL
    const alpha = dmgRatio <= 0.5 ? 0.8 : 1

    // Body
    this.graphics
      .rect(x + 1, y + 1, w - 2, h - 2)
      .fill({ color: fill, alpha })
    this.graphics
      .rect(x + 1, y + 1, w - 2, h - 2)
      .stroke({ color: CRATE_STROKE, width: 1.5, alpha: 0.8 })

    // Cross planks
    this.graphics
      .moveTo(x + 2, y + 2)
      .lineTo(x + w - 2, y + h - 2)
      .stroke({ color: CRATE_PLANK, width: 1, alpha: 0.6 })
    this.graphics
      .moveTo(x + w - 2, y + 2)
      .lineTo(x + 2, y + h - 2)
      .stroke({ color: CRATE_PLANK, width: 1, alpha: 0.6 })

    // Damage cracks
    if (dmgRatio <= 0.5) {
      this.graphics
        .moveTo(x + w * 0.3, y + 2)
        .lineTo(x + w * 0.5, y + h * 0.6)
        .stroke({ color: DAMAGE_CRACK_COLOR, width: 1, alpha: 0.7 })
    }
  }

  private drawBarrel(cx: number, cy: number, w: number, h: number, dmgRatio: number): void {
    const fill = dmgRatio <= 0.34 ? DAMAGE_CRITICAL_TINT : BARREL_FILL
    const rw = w * 0.4
    const rh = h * 0.4

    // Oval body
    this.graphics
      .ellipse(cx, cy, rw, rh)
      .fill({ color: fill, alpha: dmgRatio <= 0.5 ? 0.8 : 1 })
    this.graphics
      .ellipse(cx, cy, rw, rh)
      .stroke({ color: BARREL_STROKE, width: 1.5, alpha: 0.8 })

    // Horizontal bands
    this.graphics
      .moveTo(cx - rw * 0.9, cy - rh * 0.3)
      .lineTo(cx + rw * 0.9, cy - rh * 0.3)
      .stroke({ color: BARREL_BAND, width: 1, alpha: 0.5 })
    this.graphics
      .moveTo(cx - rw * 0.9, cy + rh * 0.3)
      .lineTo(cx + rw * 0.9, cy + rh * 0.3)
      .stroke({ color: BARREL_BAND, width: 1, alpha: 0.5 })

    // Damage cracks
    if (dmgRatio <= 0.5) {
      this.graphics
        .moveTo(cx - rw * 0.2, cy - rh)
        .lineTo(cx + rw * 0.1, cy + rh * 0.3)
        .stroke({ color: DAMAGE_CRACK_COLOR, width: 1, alpha: 0.6 })
    }
  }

  private drawBoulder(cx: number, cy: number, w: number, h: number, dmgRatio: number): void {
    const fill = dmgRatio <= 0.34 ? 0x996666 : BOULDER_FILL
    const rw = w * 0.45
    const rh = h * 0.42

    // Irregular ellipse
    this.graphics
      .ellipse(cx, cy, rw, rh)
      .fill({ color: fill, alpha: dmgRatio <= 0.5 ? 0.85 : 1 })
    this.graphics
      .ellipse(cx, cy, rw, rh)
      .stroke({ color: BOULDER_STROKE, width: 2, alpha: 0.7 })

    // Highlight
    this.graphics
      .ellipse(cx - rw * 0.2, cy - rh * 0.2, rw * 0.3, rh * 0.25)
      .fill({ color: 0x999999, alpha: 0.2 })

    // Damage cracks
    if (dmgRatio <= 0.6) {
      this.graphics
        .moveTo(cx - rw * 0.3, cy - rh * 0.5)
        .lineTo(cx + rw * 0.2, cy + rh * 0.4)
        .stroke({ color: DAMAGE_CRACK_COLOR, width: 1, alpha: 0.5 })
    }
    if (dmgRatio <= 0.3) {
      this.graphics
        .moveTo(cx + rw * 0.1, cy - rh * 0.3)
        .lineTo(cx - rw * 0.4, cy + rh * 0.2)
        .stroke({ color: DAMAGE_CRACK_COLOR, width: 1, alpha: 0.5 })
    }
  }

  private drawFallenTree(x: number, y: number, w: number, h: number): void {
    // Main trunk
    this.graphics
      .rect(x + 2, y + h * 0.2, w - 4, h * 0.6)
      .fill({ color: FALLEN_TREE_FILL, alpha: 0.9 })
    this.graphics
      .rect(x + 2, y + h * 0.2, w - 4, h * 0.6)
      .stroke({ color: FALLEN_TREE_STROKE, width: 1.5, alpha: 0.7 })

    // Branch stubs
    const branchY1 = y + h * 0.15
    const branchY2 = y + h * 0.85
    this.graphics
      .moveTo(x + w * 0.25, y + h * 0.2)
      .lineTo(x + w * 0.2, branchY1)
      .stroke({ color: FALLEN_TREE_BRANCH, width: 2, alpha: 0.6 })
    this.graphics
      .moveTo(x + w * 0.6, y + h * 0.8)
      .lineTo(x + w * 0.65, branchY2)
      .stroke({ color: FALLEN_TREE_BRANCH, width: 2, alpha: 0.6 })
  }

  private drawLowWall(x: number, y: number, w: number, h: number, dmgRatio: number): void {
    const fill = dmgRatio <= 0.34 ? 0x996666 : LOW_WALL_FILL

    // Stone rect
    this.graphics
      .rect(x + 1, y + 1, w - 2, h - 2)
      .fill({ color: fill, alpha: dmgRatio <= 0.5 ? 0.8 : 0.9 })
    this.graphics
      .rect(x + 1, y + 1, w - 2, h - 2)
      .stroke({ color: LOW_WALL_STROKE, width: 1.5, alpha: 0.7 })

    // Stone texture dots
    const dotSpacing = 8
    for (let dx = 4; dx < w - 4; dx += dotSpacing) {
      for (let dy = 4; dy < h - 4; dy += dotSpacing) {
        this.graphics
          .circle(x + dx, y + dy, 1.5)
          .fill({ color: LOW_WALL_DOT, alpha: 0.4 })
      }
    }

    // Damage cracks
    if (dmgRatio <= 0.5) {
      this.graphics
        .moveTo(x + w * 0.4, y + 1)
        .lineTo(x + w * 0.5, y + h - 1)
        .stroke({ color: DAMAGE_CRACK_COLOR, width: 1, alpha: 0.6 })
    }
  }

  private drawFenceRail(x: number, y: number, w: number, h: number, dmgRatio: number): void {
    const fill = dmgRatio <= 0.34 ? DAMAGE_CRITICAL_TINT : FENCE_RAIL_FILL
    const alpha = dmgRatio <= 0.5 ? 0.8 : 0.9
    const postW = 4
    const plankH = 3

    // Vertical posts at each end
    this.graphics
      .rect(x + 2, y + 2, postW, h - 4)
      .fill({ color: FENCE_RAIL_POST, alpha })
    this.graphics
      .rect(x + w - postW - 2, y + 2, postW, h - 4)
      .fill({ color: FENCE_RAIL_POST, alpha })

    // Horizontal planks (two rails)
    const plankLeft = x + postW + 2
    const plankW = w - (postW + 2) * 2
    this.graphics
      .rect(plankLeft, y + h * 0.25, plankW, plankH)
      .fill({ color: fill, alpha })
    this.graphics
      .rect(plankLeft, y + h * 0.65, plankW, plankH)
      .fill({ color: fill, alpha })

    // Outline
    this.graphics
      .rect(x + 1, y + 1, w - 2, h - 2)
      .stroke({ color: FENCE_RAIL_STROKE, width: 1, alpha: 0.6 })

    // Damage cracks
    if (dmgRatio <= 0.5) {
      this.graphics
        .moveTo(x + w * 0.4, y + 2)
        .lineTo(x + w * 0.45, y + h - 2)
        .stroke({ color: DAMAGE_CRACK_COLOR, width: 1, alpha: 0.6 })
    }
  }

  destroy(): void {
    this.graphics.destroy()
  }
}
