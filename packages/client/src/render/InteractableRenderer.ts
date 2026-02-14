import { Container, Graphics } from 'pixi.js'
import type { InteractablesData } from '@high-noon/shared'

const SALESMAN_CORE = 0xe4b86a
const SALESMAN_RING = 0xffd89a
const STASH_CLOSED = 0x9c6232
const STASH_OPENED = 0x5a5a5a

export class InteractableRenderer {
  private readonly graphics: Graphics
  private pulseClock = 0

  constructor(entityLayer: Container) {
    this.graphics = new Graphics()
    entityLayer.addChild(this.graphics)
  }

  render(data: InteractablesData | null, realDt: number): void {
    this.pulseClock += realDt
    this.graphics.clear()
    if (!data) return

    const pulse = Math.sin(this.pulseClock * 4) * 0.5 + 0.5

    if (data.salesman?.active) {
      const salesman = data.salesman
      this.graphics
        .circle(salesman.x, salesman.y, 11)
        .fill({ color: SALESMAN_CORE, alpha: 0.95 })
      this.graphics
        .circle(salesman.x, salesman.y, 18 + pulse * 3)
        .stroke({ color: SALESMAN_RING, width: 2, alpha: 0.3 + pulse * 0.45 })

      // Simple shovel glyph (handle + head) for fast readability.
      this.graphics
        .rect(salesman.x - 1, salesman.y - 10, 2, 8)
        .fill({ color: 0x3c2a1a, alpha: 1 })
      this.graphics
        .rect(salesman.x - 4, salesman.y - 2, 8, 4)
        .fill({ color: 0xc6ced4, alpha: 0.95 })
    }

    for (let i = 0; i < data.stashes.length; i++) {
      const stash = data.stashes[i]!
      const x = stash.x
      const y = stash.y
      const opened = stash.opened

      this.graphics
        .rect(x - 9, y - 7, 18, 14)
        .fill({ color: opened ? STASH_OPENED : STASH_CLOSED, alpha: opened ? 0.6 : 0.92 })
      this.graphics
        .rect(x - 9, y - 9, 18, 3)
        .fill({ color: opened ? 0x666666 : 0xc28b44, alpha: opened ? 0.65 : 0.95 })
      this.graphics
        .rect(x - 2, y - 3, 4, 5)
        .fill({ color: opened ? 0x8a8a8a : 0xe2c16f, alpha: opened ? 0.6 : 1 })

      if (opened) continue

      // Discovery shimmer for unopened stashes.
      const shimmer = Math.sin(this.pulseClock * 6 + i * 0.9) * 0.5 + 0.5
      this.graphics
        .circle(x, y - 14, 2 + shimmer * 1.8)
        .fill({ color: 0xffd37c, alpha: 0.35 + shimmer * 0.45 })
      this.graphics
        .circle(x, y - 14, 6 + shimmer * 2)
        .stroke({ color: 0xffc56b, width: 1, alpha: 0.2 + shimmer * 0.3 })
    }
  }

  destroy(): void {
    this.graphics.destroy()
  }
}
