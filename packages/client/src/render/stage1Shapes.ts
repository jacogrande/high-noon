/**
 * Stage 1 Enemy Compound Shapes
 *
 * Draws distinctive silhouettes for each Stage 1 enemy type using PixiJS
 * Graphics primitives. Each enemy has one strong shape feature so types are
 * distinguishable by outline alone at 8-16px radius.
 *
 * These draw functions are passed to SpriteRegistry.createCustom() and are
 * re-invoked by setColor() when telegraph/damage colors change.
 */

import { Graphics } from 'pixi.js'
import { EnemyType } from '@high-noon/shared'
import type { CustomDrawFn } from './SpriteRegistry'

// ── Shared helpers ──────────────────────────────────────────────────────

function darken(color: number, factor: number): number {
  const r = Math.floor(((color >> 16) & 0xff) * factor)
  const g = Math.floor(((color >> 8) & 0xff) * factor)
  const b = Math.floor((color & 0xff) * factor)
  return (r << 16) | (g << 8) | b
}

function lighten(color: number, factor: number): number {
  const r = Math.min(255, Math.floor(((color >> 16) & 0xff) * factor))
  const g = Math.min(255, Math.floor(((color >> 8) & 0xff) * factor))
  const b = Math.min(255, Math.floor((color & 0xff) * factor))
  return (r << 16) | (g << 8) | b
}

// ── Drifter: circle + hat brim ─────────────────────────────────────────

const DRIFTER_RADIUS = 8

function drawDrifter(g: Graphics, color: number): void {
  // Body
  g.circle(0, 0, DRIFTER_RADIUS).fill({ color })

  // Hat brim (flat rectangle on top, slightly darker)
  const brimW = 14
  const brimH = 3
  g.roundRect(-brimW / 2, -DRIFTER_RADIUS - brimH + 1, brimW, brimH, 1)
    .fill({ color: darken(color, 0.7) })

  // Eye dot (facing indicator — defaults to south, rotated by renderer)
  g.circle(0, 3, 1.5).fill({ color: 0x111111 })
}

// ── Knife Drifter: circle + blade wedge ─────────────────────────────────

const KNIFE_DRIFTER_RADIUS = 8

function drawKnifeDrifter(g: Graphics, color: number): void {
  // Body
  g.circle(0, 0, KNIFE_DRIFTER_RADIUS).fill({ color })

  // Blade wedge extending forward (south by default, rotated by renderer)
  g.moveTo(-3, KNIFE_DRIFTER_RADIUS - 2)
  g.lineTo(0, KNIFE_DRIFTER_RADIUS + 8)
  g.lineTo(3, KNIFE_DRIFTER_RADIUS - 2)
  g.fill({ color: 0xcccccc })

  // Blade edge highlight
  g.moveTo(0, KNIFE_DRIFTER_RADIUS - 1)
  g.lineTo(0, KNIFE_DRIFTER_RADIUS + 7)
  g.stroke({ color: 0xeeeeee, width: 0.5 })
}

// ── Deadeye: diamond + scope line ──────────────────────────────────────

const DEADEYE_HALF = 10

function drawDeadeye(g: Graphics, color: number): void {
  // Diamond body (rotated square — the only non-round Stage 1 enemy)
  g.moveTo(0, -DEADEYE_HALF)
  g.lineTo(DEADEYE_HALF, 0)
  g.lineTo(0, DEADEYE_HALF)
  g.lineTo(-DEADEYE_HALF, 0)
  g.closePath()
  g.fill({ color })
  g.stroke({ color: darken(color, 0.6), width: 1 })

  // Scope line extending forward (south by default, rotated by renderer)
  g.moveTo(0, DEADEYE_HALF)
  g.lineTo(0, DEADEYE_HALF + 12)
  g.stroke({ color: darken(color, 0.5), width: 1.5 })

  // Center eye
  g.circle(0, 0, 2).fill({ color: 0x111111 })
}

// ── Spitter: fat oval + nubs ────────────────────────────────────────────

const SPITTER_RX = 12
const SPITTER_RY = 10

function drawSpitter(g: Graphics, color: number): void {
  // Fat oval body (largest silhouette)
  g.ellipse(0, 0, SPITTER_RX, SPITTER_RY).fill({ color })
  g.ellipse(0, 0, SPITTER_RX, SPITTER_RY).stroke({ color: darken(color, 0.6), width: 1 })

  // Three nubs around the rim (suggest multiple projectile sources)
  const nubColor = lighten(color, 1.3)
  const angles = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6]
  for (const angle of angles) {
    const nx = Math.cos(angle) * (SPITTER_RX - 2)
    const ny = Math.sin(angle) * (SPITTER_RY - 2)
    g.circle(nx, ny, 2.5).fill({ color: nubColor })
  }
}

// ── Dustdevil: circle + spiral ─────────────────────────────────────────

const DUSTDEVIL_RADIUS = 8

function drawDustdevil(g: Graphics, color: number): void {
  // Body
  g.circle(0, 0, DUSTDEVIL_RADIUS).fill({ color })

  // Inner spiral arc (drawn as a short curved stroke)
  const spiralColor = lighten(color, 1.4)
  const arcR = DUSTDEVIL_RADIUS * 0.55
  g.arc(0, 0, arcR, 0, Math.PI * 1.2)
    .stroke({ color: spiralColor, width: 1.5 })

  // Small inner swirl dot
  g.circle(arcR * 0.5, -arcR * 0.3, 1.5)
    .fill({ color: spiralColor })
}

// ── Factory ─────────────────────────────────────────────────────────────

const STAGE_1_DRAW_FNS: Partial<Record<number, CustomDrawFn>> = {
  [EnemyType.DRIFTER]: drawDrifter,
  [EnemyType.KNIFE_DRIFTER]: drawKnifeDrifter,
  [EnemyType.DEADEYE]: drawDeadeye,
  [EnemyType.SPITTER]: drawSpitter,
  [EnemyType.DUSTDEVIL]: drawDustdevil,
}

/** Returns true if this enemy type has a custom Stage 1 compound shape. */
export function isStage1ShapeEnemy(type: number): boolean {
  return STAGE_1_DRAW_FNS[type] !== undefined
}

/** Get the draw function for a Stage 1 enemy type (or undefined). */
export function getStage1DrawFn(type: number): CustomDrawFn | undefined {
  return STAGE_1_DRAW_FNS[type]
}
