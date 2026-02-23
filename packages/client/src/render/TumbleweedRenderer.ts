/**
 * TumbleweedRenderer — spawns 3-5 tumbleweeds rolling across the arena on stage clear.
 * Pre-allocates 8 Graphics circles to avoid needing a new texture asset.
 */

import { Container, Graphics } from 'pixi.js'

const MAX_TUMBLEWEEDS = 8
const TUMBLEWEED_RADIUS = 6
const TUMBLEWEED_COLOR = 0x886644

interface Tumbleweed {
  active: boolean
  x: number
  y: number
  vx: number
  spin: number
  exitX: number
}

export class TumbleweedRenderer {
  private readonly container: Container
  private readonly graphics: Graphics[]
  private readonly state: Tumbleweed[]

  constructor(parentLayer: Container) {
    this.container = new Container()
    parentLayer.addChild(this.container)

    this.graphics = new Array(MAX_TUMBLEWEEDS)
    this.state = new Array(MAX_TUMBLEWEEDS)

    for (let i = 0; i < MAX_TUMBLEWEEDS; i++) {
      const g = new Graphics()
      g.circle(0, 0, TUMBLEWEED_RADIUS)
      g.fill(TUMBLEWEED_COLOR)
      // Add cross lines for visual detail
      g.moveTo(-4, 0).lineTo(4, 0).stroke({ color: 0x664422, width: 1 })
      g.moveTo(0, -4).lineTo(0, 4).stroke({ color: 0x664422, width: 1 })
      g.visible = false
      this.container.addChild(g)
      this.graphics[i] = g
      this.state[i] = { active: false, x: 0, y: 0, vx: 0, spin: 0, exitX: 0 }
    }
  }

  /** Spawn 3-5 tumbleweeds from arena edges. */
  trigger(minX: number, maxX: number, minY: number, maxY: number): void {
    const count = 3 + Math.floor(Math.random() * 3) // 3-5
    let spawned = 0
    for (let i = 0; i < MAX_TUMBLEWEEDS && spawned < count; i++) {
      if (this.state[i]!.active) continue

      const fromLeft = Math.random() < 0.5
      const tw = this.state[i]!
      tw.active = true
      tw.x = fromLeft ? minX - 20 : maxX + 20
      tw.y = minY + Math.random() * (maxY - minY)
      tw.vx = (fromLeft ? 1 : -1) * (60 + Math.random() * 60)
      tw.spin = (Math.random() - 0.5) * 6
      tw.exitX = fromLeft ? maxX + 30 : minX - 30
      this.graphics[i]!.visible = true
      spawned++
    }
  }

  update(dt: number): void {
    for (let i = 0; i < MAX_TUMBLEWEEDS; i++) {
      const tw = this.state[i]!
      if (!tw.active) continue

      tw.x += tw.vx * dt
      const g = this.graphics[i]!
      g.position.set(tw.x, tw.y)
      g.rotation += tw.spin * dt

      // Check if off opposite edge
      if ((tw.vx > 0 && tw.x > tw.exitX) || (tw.vx < 0 && tw.x < tw.exitX)) {
        tw.active = false
        g.visible = false
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
