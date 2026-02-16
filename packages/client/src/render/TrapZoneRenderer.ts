/**
 * Trap Zone Renderer
 *
 * Draws visual feedback for active trap zones:
 * - Bear traps: copper/iron circles with jaw lines
 * - Caltrops: scattered dot patterns with translucent slow-zone fill
 * - Tripwires: red line between endpoints with anchor dots
 *
 * Redraws when trapZones array length changes or caltrop durations tick.
 */

import { Graphics, Container } from 'pixi.js'
import type { GameWorld } from '@high-noon/shared'

// Bear trap visuals
const BEAR_TRAP_FILL = 0x8b4513
const BEAR_TRAP_STROKE = 0xcd853f
const BEAR_TRAP_FILL_ALPHA = 0.35
const BEAR_TRAP_STROKE_ALPHA = 0.6
const BEAR_TRAP_JAW_COUNT = 6

// Caltrop visuals (brighter for better visibility)
const CALTROP_FILL = 0x8b6914
const CALTROP_STROKE = 0xb8860b
const CALTROP_FILL_ALPHA = 0.25
const CALTROP_STROKE_ALPHA = 0.5
const CALTROP_DOT_COLOR = 0xa0a0a0
const CALTROP_DOT_ALPHA = 0.7
const CALTROP_DOT_COUNT = 8

// Tripwire visuals
const TRIPWIRE_STROKE = 0xff3333
const TRIPWIRE_STROKE_ALPHA = 0.6
const TRIPWIRE_DOT_COLOR = 0xff2222
const TRIPWIRE_DOT_ALPHA = 0.8
const TRIPWIRE_DOT_RADIUS = 3

export class TrapZoneRenderer {
  private readonly graphics: Graphics
  private cachedCount = 0
  private cachedKey = ''

  constructor(entityLayer: Container) {
    this.graphics = new Graphics()
    this.graphics.visible = false
    entityLayer.addChild(this.graphics)
  }

  render(world: GameWorld): void {
    const traps = world.trapZones
    if (traps.length === 0) {
      if (this.cachedCount !== 0) {
        this.graphics.clear()
        this.graphics.visible = false
        this.cachedCount = 0
        this.cachedKey = ''
      }
      return
    }

    // Build a cache key from count + positions + kinds to detect changes
    // (caltrops can be removed mid-array, bear traps can trigger)
    let key = `${traps.length}`
    for (const t of traps) {
      key += `|${t.kind}:${t.x | 0},${t.y | 0}`
      if (t.kind === 'tripwire') key += `:${(t.x2 ?? 0) | 0},${(t.y2 ?? 0) | 0}`
    }

    if (key === this.cachedKey) return

    this.cachedCount = traps.length
    this.cachedKey = key
    this.graphics.clear()

    for (const trap of traps) {
      if (trap.kind === 'bearTrap') {
        // Filled circle base
        this.graphics
          .circle(trap.x, trap.y, trap.radius)
          .fill({ color: BEAR_TRAP_FILL, alpha: BEAR_TRAP_FILL_ALPHA })

        // Border
        this.graphics
          .circle(trap.x, trap.y, trap.radius)
          .stroke({ color: BEAR_TRAP_STROKE, width: 1.5, alpha: BEAR_TRAP_STROKE_ALPHA })

        // Jaw lines (radial spokes)
        for (let i = 0; i < BEAR_TRAP_JAW_COUNT; i++) {
          const angle = (i / BEAR_TRAP_JAW_COUNT) * Math.PI * 2
          const innerR = trap.radius * 0.3
          const outerR = trap.radius * 0.85
          this.graphics
            .moveTo(trap.x + Math.cos(angle) * innerR, trap.y + Math.sin(angle) * innerR)
            .lineTo(trap.x + Math.cos(angle) * outerR, trap.y + Math.sin(angle) * outerR)
            .stroke({ color: BEAR_TRAP_STROKE, width: 1.5, alpha: BEAR_TRAP_STROKE_ALPHA * 0.8 })
        }

        // Center dot
        this.graphics
          .circle(trap.x, trap.y, 2)
          .fill({ color: BEAR_TRAP_STROKE, alpha: BEAR_TRAP_STROKE_ALPHA })

      } else if (trap.kind === 'caltrop') {
        // Translucent slow-zone fill
        this.graphics
          .circle(trap.x, trap.y, trap.radius)
          .fill({ color: CALTROP_FILL, alpha: CALTROP_FILL_ALPHA })

        // Border
        this.graphics
          .circle(trap.x, trap.y, trap.radius)
          .stroke({ color: CALTROP_STROKE, width: 1, alpha: CALTROP_STROKE_ALPHA })

        // Scattered dot pattern for caltrops
        for (let i = 0; i < CALTROP_DOT_COUNT; i++) {
          const angle = (i / CALTROP_DOT_COUNT) * Math.PI * 2 + 0.3
          const dist = trap.radius * (0.3 + (i % 3) * 0.2)
          const dotX = trap.x + Math.cos(angle) * dist
          const dotY = trap.y + Math.sin(angle) * dist
          this.graphics
            .circle(dotX, dotY, 1.5)
            .fill({ color: CALTROP_DOT_COLOR, alpha: CALTROP_DOT_ALPHA })
        }

      } else if (trap.kind === 'tripwire') {
        const x1 = trap.x
        const y1 = trap.y
        const x2 = trap.x2 ?? trap.x
        const y2 = trap.y2 ?? trap.y

        // Wire line
        this.graphics
          .moveTo(x1, y1)
          .lineTo(x2, y2)
          .stroke({ color: TRIPWIRE_STROKE, width: 2, alpha: TRIPWIRE_STROKE_ALPHA })

        // Anchor dots at endpoints
        this.graphics
          .circle(x1, y1, TRIPWIRE_DOT_RADIUS)
          .fill({ color: TRIPWIRE_DOT_COLOR, alpha: TRIPWIRE_DOT_ALPHA })
        this.graphics
          .circle(x2, y2, TRIPWIRE_DOT_RADIUS)
          .fill({ color: TRIPWIRE_DOT_COLOR, alpha: TRIPWIRE_DOT_ALPHA })
      }
    }

    this.graphics.visible = true
  }

  destroy(): void {
    this.graphics.destroy()
  }
}
