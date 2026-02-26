/**
 * Ping Renderer
 *
 * Renders player-initiated map pings in world space.
 * - Location ping: expanding ring that fades out
 * - Enemy ping: pulsing diamond above target enemy
 * - Danger ping: red exclamation with pulsing circle
 *
 * Pings are purely visual overlays — they have no ECS representation.
 */

import { Container, Graphics } from 'pixi.js'
import { Position } from '@high-noon/shared'
import type { PingType, PlayerPingEvent } from '@high-noon/shared'
import { PING_LIFETIME_S } from '@high-noon/shared'
import { hasComponent } from 'bitecs'
import type { GameWorld } from '@high-noon/shared'
import { Enemy, Dead } from '@high-noon/shared'

/** Color per ping type */
const PING_COLORS: Record<PingType, number> = {
  location: 0x44aaff,
  enemy: 0xff8844,
  danger: 0xff4444,
}

interface ActivePing {
  type: PingType
  worldX: number
  worldY: number
  targetEid: number | undefined
  senderEid: number
  createdAt: number // performance.now()
  graphics: Graphics
}

export class PingRenderer {
  private readonly container: Container
  private readonly pings: ActivePing[] = []

  constructor(fxLayer: Container) {
    this.container = new Container()
    fxLayer.addChild(this.container)
  }

  /** Add a new ping from a server event */
  addPing(event: PlayerPingEvent): void {
    const gfx = new Graphics()
    this.container.addChild(gfx)

    this.pings.push({
      type: event.type,
      worldX: event.worldX,
      worldY: event.worldY,
      targetEid: event.targetEid,
      senderEid: event.senderEid,
      createdAt: performance.now(),
      graphics: gfx,
    })
  }

  /** Update and render all active pings */
  update(world: GameWorld | null): void {
    const now = performance.now()

    for (let i = this.pings.length - 1; i >= 0; i--) {
      const ping = this.pings[i]!
      const age = (now - ping.createdAt) / 1000
      const t = age / PING_LIFETIME_S

      // Expired — remove
      if (t >= 1.0) {
        this.container.removeChild(ping.graphics)
        ping.graphics.destroy()
        this.pings.splice(i, 1)
        continue
      }

      // Track enemy position for enemy pings
      if (ping.type === 'enemy' && ping.targetEid !== undefined && world) {
        if (hasComponent(world, Enemy, ping.targetEid) && !hasComponent(world, Dead, ping.targetEid)) {
          ping.worldX = Position.x[ping.targetEid]!
          ping.worldY = Position.y[ping.targetEid]!
        }
      }

      const gfx = ping.graphics
      gfx.clear()

      const color = PING_COLORS[ping.type]
      const alpha = 1.0 - t * t // Quadratic fade-out

      gfx.position.set(ping.worldX, ping.worldY)

      switch (ping.type) {
        case 'location':
          this.drawLocationPing(gfx, age, alpha, color)
          break
        case 'enemy':
          this.drawEnemyPing(gfx, age, alpha, color)
          break
        case 'danger':
          this.drawDangerPing(gfx, age, alpha, color)
          break
      }
    }
  }

  private drawLocationPing(gfx: Graphics, age: number, alpha: number, color: number): void {
    // Expanding ring
    const expandT = Math.min(1.0, age * 2.0) // Expand over 0.5s
    const radius = 6 + expandT * 14
    gfx.circle(0, 0, radius)
    gfx.stroke({ color, alpha: alpha * 0.8, width: 2 })

    // Center dot
    gfx.circle(0, 0, 2)
    gfx.fill({ color, alpha })
  }

  private drawEnemyPing(gfx: Graphics, age: number, alpha: number, color: number): void {
    // Pulsing diamond above target
    const pulse = Math.sin(age * 6) * 0.2 + 0.8
    const size = 5 * pulse
    const y = -18 // Above the enemy

    gfx.moveTo(0, y - size)
    gfx.lineTo(size, y)
    gfx.lineTo(0, y + size)
    gfx.lineTo(-size, y)
    gfx.closePath()
    gfx.fill({ color, alpha: alpha * pulse })
    gfx.stroke({ color, alpha, width: 1 })
  }

  private drawDangerPing(gfx: Graphics, age: number, alpha: number, color: number): void {
    // Pulsing circle
    const pulse = Math.sin(age * 5) * 0.15 + 0.85
    const radius = 12 * pulse
    gfx.circle(0, 0, radius)
    gfx.stroke({ color, alpha: alpha * 0.6, width: 2 })

    // Exclamation mark (line + dot)
    const exAlpha = alpha * pulse
    gfx.rect(-1.5, -8, 3, 10)
    gfx.fill({ color, alpha: exAlpha })
    gfx.circle(0, 6, 2)
    gfx.fill({ color, alpha: exAlpha })
  }

  /** Clean up all ping graphics */
  destroy(): void {
    for (const ping of this.pings) {
      this.container.removeChild(ping.graphics)
      ping.graphics.destroy()
    }
    this.pings.length = 0
    this.container.destroy()
  }

  /** Remove all active pings (e.g., on stage transition) */
  clear(): void {
    for (const ping of this.pings) {
      this.container.removeChild(ping.graphics)
      ping.graphics.destroy()
    }
    this.pings.length = 0
  }
}
