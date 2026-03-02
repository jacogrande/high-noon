/**
 * Stage 1 Enemy Compound Shapes
 *
 * Draws distinctive silhouettes for each Stage 1 enemy type using PixiJS
 * Graphics primitives. Each enemy has one strong shape feature so types are
 * distinguishable by outline alone at 8-16px radius.
 *
 * Design principle: bold, chunky shapes with high-contrast fills. Every
 * visual feature is at least 4 world pixels (2 rendered pixels) so it
 * remains readable at the internal 360×202 render resolution.
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

// ── Drifter: circle + massive hat brim ──────────────────────────────────
// The hat extends far beyond the body so the silhouette is T-shaped.

const DRIFTER_RADIUS = 8

function drawDrifter(g: Graphics, color: number): void {
  // Body
  g.circle(0, 0, DRIFTER_RADIUS).fill({ color })

  // Hat crown (dark circle sitting on top of head)
  g.circle(0, -3, 5).fill({ color: darken(color, 0.5) })

  // Hat brim — very wide, thick bar spanning well beyond body
  const brimW = 22
  const brimH = 5
  g.roundRect(-brimW / 2, -DRIFTER_RADIUS - brimH + 2, brimW, brimH, 2)
    .fill({ color: darken(color, 0.4) })
}

// ── Knife Drifter: circle + long bright blade + bandana ─────────────────
// The blade is the dominant feature — extends 12px past body.

const KNIFE_DRIFTER_RADIUS = 8

function drawKnifeDrifter(g: Graphics, color: number): void {
  // Body
  g.circle(0, 0, KNIFE_DRIFTER_RADIUS).fill({ color })

  // Bandana — wide dark band across top, distinguishes from bare Drifter
  g.roundRect(-5, -KNIFE_DRIFTER_RADIUS - 2, 10, 4, 1)
    .fill({ color: darken(color, 0.55) })

  // Blade — wide, long, bright triangle extending forward (south default)
  g.moveTo(-5, KNIFE_DRIFTER_RADIUS - 3)
  g.lineTo(0, KNIFE_DRIFTER_RADIUS + 12)
  g.lineTo(5, KNIFE_DRIFTER_RADIUS - 3)
  g.closePath()
  g.fill({ color: lighten(color, 2.0) })
}

// ── Deadeye: diamond + bold scope line ──────────────────────────────────

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

  // Scope line — thick and long for visibility
  g.moveTo(0, DEADEYE_HALF)
  g.lineTo(0, DEADEYE_HALF + 14)
  g.stroke({ color: darken(color, 0.4), width: 3 })

  // Center eye — large
  g.circle(0, 0, 3).fill({ color: 0x111111 })
}

// ── Spitter: fat oval + bigger nubs ─────────────────────────────────────

const SPITTER_RX = 12
const SPITTER_RY = 10

function drawSpitter(g: Graphics, color: number): void {
  // Fat oval body (largest silhouette). Spitter does NOT rotate.
  g.ellipse(0, 0, SPITTER_RX, SPITTER_RY)
    .fill({ color })
    .stroke({ color: darken(color, 0.6), width: 1 })

  // Three nubs around the rim — big enough to read at scale
  const nubColor = lighten(color, 1.3)
  const angles = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6]
  for (const angle of angles) {
    const nx = Math.cos(angle) * (SPITTER_RX - 1)
    const ny = Math.sin(angle) * (SPITTER_RY - 1)
    g.circle(nx, ny, 3.5).fill({ color: nubColor })
  }
}

// ── Dustdevil: hollow ring + bold swirl arcs ────────────────────────────
// NOT a filled circle — reads as a spinning vortex, distinct from all
// other enemies which are solid shapes.

const DUSTDEVIL_RADIUS = 10

function drawDustdevil(g: Graphics, color: number): void {
  // Hollow ring instead of filled circle — key differentiator
  g.circle(0, 0, DUSTDEVIL_RADIUS)
    .stroke({ color, width: 3, alpha: 0.7 })

  // Semi-transparent inner fill so it's not invisible
  g.circle(0, 0, DUSTDEVIL_RADIUS - 2)
    .fill({ color, alpha: 0.25 })

  // Three bold swirl arcs at different radii and offsets
  const arcColor = lighten(color, 1.5)
  g.arc(0, 0, 4, 0, Math.PI * 0.9)
    .stroke({ color: arcColor, width: 2.5 })
  g.arc(0, 0, 7, Math.PI * 0.7, Math.PI * 1.7)
    .stroke({ color: arcColor, width: 3 })
  g.arc(0, 0, 10, Math.PI * 1.3, Math.PI * 2.3)
    .stroke({ color: arcColor, width: 3 })
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
