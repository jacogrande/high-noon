/**
 * Boss Attack Telegraph Renderer
 *
 * Reads world.bossTelegraphs each render frame and draws shapes using
 * PixiJS Graphics. Supports arc, circle, ring, and line telegraph types
 * with pulsing animations based on telegraph progress.
 */

import { Graphics, Container } from 'pixi.js'
import type { GameWorld, BossTelegraph } from '@high-noon/shared'
import type { ParticlePool } from '../fx/ParticlePool'

const STROKE_WIDTH = 2
const RING_STROKE_WIDTH = 2.5
const LINE_DASH_LENGTH = 6
const LINE_GAP_LENGTH = 4
const ARROW_SIZE = 6

const TELEGRAPH_PARTICLE_INTERVAL = 1 / 15 // ~15 emissions/sec per telegraph
const LINE_TRACER_TINT = 0xFF2222
const ARC_EDGE_FIRE_TINT = 0xFF6600
const CIRCLE_ERUPTION_TINT = 0xFF8800
const FLASH_FALLBACK_RADIUS = 40

export class BossAttackRenderer {
  private readonly graphics: Graphics
  private particleAccumulator = 0

  constructor(entityLayer: Container) {
    this.graphics = new Graphics()
    this.graphics.visible = false
    entityLayer.addChild(this.graphics)
  }

  render(world: GameWorld, particles?: ParticlePool, dt: number = 0): void {
    const telegraphs = world.bossTelegraphs
    if (telegraphs.length === 0) {
      this.graphics.visible = false
      return
    }

    this.graphics.clear()

    for (const t of telegraphs) {
      switch (t.kind) {
        case 'arc':
          this.drawArc(t)
          break
        case 'circle':
          this.drawCircle(t)
          break
        case 'ring':
          this.drawRing(t)
          break
        case 'line':
          this.drawLine(t)
          break
        case 'flash':
          this.drawFlash(t)
          break
      }
    }

    this.graphics.visible = true

    // Emit particles along telegraphs for extra visual impact
    if (particles && dt > 0) {
      this.particleAccumulator += dt
      if (this.particleAccumulator >= TELEGRAPH_PARTICLE_INTERVAL) {
        this.particleAccumulator = 0
        for (const t of telegraphs) {
          this.emitTelegraphParticles(t, particles)
        }
      }
    }
  }

  private emitTelegraphParticles(t: BossTelegraph, pool: ParticlePool): void {
    if (t.kind === 'line' && t.progress > 0.5) {
      // Red tracer along the line
      const endX = t.endX ?? t.x
      const endY = t.endY ?? t.y
      const lerp = Math.random()
      pool.emit({
        x: t.x + (endX - t.x) * lerp,
        y: t.y + (endY - t.y) * lerp,
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20,
        life: 0.15 + Math.random() * 0.1,
        startScale: 2 + Math.random() * 2,
        endScale: 0,
        startAlpha: 0.8,
        endAlpha: 0,
        tint: LINE_TRACER_TINT,
      })
    } else if (t.kind === 'arc' && t.progress > 0.5) {
      // Fire particles at arc edges
      const angle = t.angle ?? 0
      const arcHalf = t.arcHalf ?? Math.PI / 2
      for (const edgeAngle of [angle - arcHalf, angle + arcHalf]) {
        pool.emit({
          x: t.x + Math.cos(edgeAngle) * t.radius * (0.5 + Math.random() * 0.5),
          y: t.y + Math.sin(edgeAngle) * t.radius * (0.5 + Math.random() * 0.5),
          vx: Math.cos(edgeAngle) * (20 + Math.random() * 30),
          vy: Math.sin(edgeAngle) * (20 + Math.random() * 30),
          life: 0.15 + Math.random() * 0.15,
          startScale: 2 + Math.random() * 2,
          endScale: 0,
          startAlpha: 0.9,
          endAlpha: 0,
          tint: ARC_EDGE_FIRE_TINT,
        })
      }
    } else if (t.kind === 'circle' && t.progress > 0.8) {
      // Eruption particles from center
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * Math.PI * 2
        pool.emit({
          x: t.x + (Math.random() - 0.5) * 6,
          y: t.y + (Math.random() - 0.5) * 6,
          vx: Math.cos(a) * (30 + Math.random() * 40),
          vy: Math.sin(a) * (30 + Math.random() * 40),
          life: 0.2 + Math.random() * 0.15,
          startScale: 2 + Math.random() * 3,
          endScale: 0,
          startAlpha: 0.9,
          endAlpha: 0,
          tint: CIRCLE_ERUPTION_TINT,
        })
      }
    }
  }

  private drawArc(t: BossTelegraph): void {
    const angle = t.angle ?? 0
    const arcHalf = t.arcHalf ?? Math.PI / 2
    const startAngle = angle - arcHalf
    const endAngle = angle + arcHalf
    // Pulsing fill alpha
    const fillAlpha = t.alpha * (0.5 + Math.sin(t.progress * Math.PI * 4) * 0.3)
    const strokeAlpha = Math.min(1, fillAlpha + 0.2)

    // Filled pie slice
    this.graphics
      .moveTo(t.x, t.y)
      .arc(t.x, t.y, t.radius, startAngle, endAngle)
      .lineTo(t.x, t.y)
      .fill({ color: t.color, alpha: fillAlpha })

    // Brighter stroke outline
    this.graphics
      .moveTo(t.x, t.y)
      .arc(t.x, t.y, t.radius, startAngle, endAngle)
      .lineTo(t.x, t.y)
      .stroke({ color: t.color, width: STROKE_WIDTH, alpha: strokeAlpha })
  }

  private drawCircle(t: BossTelegraph): void {
    // Pulsing fill with breathing effect
    const fillAlpha = 0.15 + Math.sin(t.progress * Math.PI * 4) * 0.1
    const strokeAlpha = Math.min(1, fillAlpha + 0.25)

    // Filled circle
    this.graphics
      .circle(t.x, t.y, t.radius)
      .fill({ color: t.color, alpha: fillAlpha })

    // Outer stroke ring
    this.graphics
      .circle(t.x, t.y, t.radius)
      .stroke({ color: t.color, width: STROKE_WIDTH, alpha: strokeAlpha })
  }

  private drawRing(t: BossTelegraph): void {
    // Pulsing stroke width
    const pulseWidth = RING_STROKE_WIDTH + Math.sin(t.progress * Math.PI * 4) * 1.0
    const alpha = t.alpha * (0.6 + Math.sin(t.progress * Math.PI * 3) * 0.3)

    this.graphics
      .circle(t.x, t.y, t.radius)
      .stroke({ color: t.color, width: pulseWidth, alpha })
  }

  private drawLine(t: BossTelegraph): void {
    const endX = t.endX ?? t.x
    const endY = t.endY ?? t.y
    const dx = endX - t.x
    const dy = endY - t.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len <= 0) return

    const nx = dx / len
    const ny = dy / len
    const alpha = t.alpha * (0.5 + Math.sin(t.progress * Math.PI * 4) * 0.3)

    // Draw dashed line
    let drawn = 0
    let drawing = true
    while (drawn < len) {
      const segLen = drawing ? LINE_DASH_LENGTH : LINE_GAP_LENGTH
      const end = Math.min(drawn + segLen, len)
      if (drawing) {
        const sx = t.x + nx * drawn
        const sy = t.y + ny * drawn
        const ex = t.x + nx * end
        const ey = t.y + ny * end
        this.graphics
          .moveTo(sx, sy)
          .lineTo(ex, ey)
          .stroke({ color: t.color, width: STROKE_WIDTH, alpha })
      }
      drawn = end
      drawing = !drawing
    }

    // Arrowhead at the end
    const perpX = -ny
    const perpY = nx
    const tipX = endX
    const tipY = endY
    const baseX = endX - nx * ARROW_SIZE
    const baseY = endY - ny * ARROW_SIZE
    this.graphics
      .moveTo(tipX, tipY)
      .lineTo(baseX + perpX * ARROW_SIZE * 0.5, baseY + perpY * ARROW_SIZE * 0.5)
      .lineTo(baseX - perpX * ARROW_SIZE * 0.5, baseY - perpY * ARROW_SIZE * 0.5)
      .lineTo(tipX, tipY)
      .fill({ color: t.color, alpha })
  }

  private drawFlash(t: BossTelegraph): void {
    this.graphics
      .circle(t.x, t.y, t.radius > 0 ? t.radius : FLASH_FALLBACK_RADIUS)
      .fill({ color: 0xFFFFFF, alpha: t.alpha * 0.9 })
  }

  destroy(): void {
    this.graphics.destroy()
  }
}
