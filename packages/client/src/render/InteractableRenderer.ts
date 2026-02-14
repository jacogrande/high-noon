import { Container, Graphics, Sprite } from 'pixi.js'
import type { InteractablesData } from '@high-noon/shared'
import { AssetLoader } from '../assets/AssetLoader'
import { getItemDef } from '@high-noon/shared'

const SALESMAN_CORE = 0xe4b86a
const SALESMAN_RING = 0xffd89a
const STASH_CLOSED = 0x9c6232
const STASH_OPENED = 0x5a5a5a

const RARITY_COLORS: Record<string, number> = {
  brass: 0xd4a046,
  silver: 0xb0b0c0,
  gold: 0xffc800,
}

export class InteractableRenderer {
  private readonly graphics: Graphics
  private readonly entityLayer: Container
  private readonly pickupSprites = new Map<number, Sprite>()
  private pulseClock = 0

  constructor(entityLayer: Container) {
    this.entityLayer = entityLayer
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

    // Render item pickups
    const activePickupIds = new Set<number>()
    if (data.itemPickups) {
      for (let i = 0; i < data.itemPickups.length; i++) {
        const pickup = data.itemPickups[i]!
        activePickupIds.add(pickup.id)
        const color = RARITY_COLORS[pickup.rarity] ?? RARITY_COLORS.brass!
        const bob = Math.sin(this.pulseClock * 3 + pickup.id * 1.7) * 3
        const glow = Math.sin(this.pulseClock * 5 + pickup.id * 0.8) * 0.5 + 0.5
        const px = pickup.x
        const py = pickup.y + bob

        // Rarity glow ring (drawn with graphics)
        this.graphics
          .circle(px, py, 10 + glow * 2)
          .stroke({ color, width: 1.5, alpha: 0.3 + glow * 0.4 })

        // Item icon sprite
        const def = getItemDef(pickup.itemId)
        const tex = def ? AssetLoader.getItemTexture(def.key) : null
        if (tex) {
          let sprite = this.pickupSprites.get(pickup.id)
          if (!sprite) {
            sprite = new Sprite(tex)
            sprite.anchor.set(0.5)
            this.entityLayer.addChild(sprite)
            this.pickupSprites.set(pickup.id, sprite)
          }
          sprite.texture = tex
          sprite.position.set(px, py)
          sprite.visible = true
        } else {
          // Fallback: colored circle
          this.graphics
            .circle(px, py, 6)
            .fill({ color, alpha: 0.9 })
        }
      }
    }

    // Remove stale pickup sprites
    for (const [id, sprite] of this.pickupSprites) {
      if (!activePickupIds.has(id)) {
        sprite.destroy()
        this.pickupSprites.delete(id)
      }
    }
  }

  destroy(): void {
    for (const sprite of this.pickupSprites.values()) {
      sprite.destroy()
    }
    this.pickupSprites.clear()
    this.graphics.destroy()
  }
}
