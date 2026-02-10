/**
 * Dynamite Renderer
 *
 * Renders Prospector dynamite presentation:
 * - Pixel throw arc dots + trail particles while in flight
 * - Pulsing ground telegraph + fuse pixel on landed dynamites
 */

import { hasComponent } from 'bitecs'
import { Container, Graphics } from 'pixi.js'
import { Position, type GameWorld } from '@high-noon/shared'
import { emitDynamiteTrail, type ParticlePool } from '../fx'

interface DynamiteThrowAnim {
  startX: number
  startY: number
  endX: number
  endY: number
  elapsed: number
  duration: number
}

const MIN_THROW_DURATION = 0.2
const MAX_THROW_DURATION = 0.5
const THROW_SPEED = 500

export class DynamiteRenderer {
  private readonly dotsGraphics: Graphics
  private readonly trackedDynamites = new Set<object>()
  private readonly throwAnims: DynamiteThrowAnim[] = []
  private pulseClock = 0

  constructor(entityLayer: Container) {
    this.dotsGraphics = new Graphics()
    entityLayer.addChild(this.dotsGraphics)
  }

  private trackThrowSpawns(world: GameWorld): void {
    const nextTracked = new Set<object>()

    for (const dyn of world.dynamites) {
      const ref = dyn as object
      nextTracked.add(ref)
      if (this.trackedDynamites.has(ref) || dyn.fuseRemaining <= 0) {
        continue
      }

      if (!hasComponent(world, Position, dyn.ownerId)) {
        continue
      }

      const startX = Position.x[dyn.ownerId]!
      const startY = Position.y[dyn.ownerId]!
      const dx = dyn.x - startX
      const dy = dyn.y - startY
      const dist = Math.sqrt(dx * dx + dy * dy)

      this.throwAnims.push({
        startX,
        startY,
        endX: dyn.x,
        endY: dyn.y,
        elapsed: 0,
        duration: Math.min(MAX_THROW_DURATION, Math.max(MIN_THROW_DURATION, dist / THROW_SPEED)),
      })
    }

    this.trackedDynamites.clear()
    for (const ref of nextTracked) {
      this.trackedDynamites.add(ref)
    }
  }

  render(world: GameWorld, realDt: number, particles: ParticlePool): void {
    this.trackThrowSpawns(world)
    this.pulseClock += realDt

    this.dotsGraphics.clear()

    for (let i = this.throwAnims.length - 1; i >= 0; i--) {
      const anim = this.throwAnims[i]!
      anim.elapsed += realDt
      if (anim.elapsed >= anim.duration) {
        this.throwAnims.splice(i, 1)
        continue
      }

      const t = anim.elapsed / anim.duration
      const x = anim.startX + (anim.endX - anim.startX) * t
      const baseY = anim.startY + (anim.endY - anim.startY) * t
      const dx = anim.endX - anim.startX
      const dy = anim.endY - anim.startY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const arcHeight = Math.min(dist * 0.25, 50)
      const y = baseY - arcHeight * 4 * t * (1 - t)

      this.dotsGraphics.circle(x, y, 3.5)
      this.dotsGraphics.fill({ color: 0xff8822, alpha: 1 })
      emitDynamiteTrail(particles, x, y)
    }

    const inFlightTargets = this.throwAnims.map(anim => ({ x: anim.endX, y: anim.endY }))

    for (const dyn of world.dynamites) {
      const inFlight = inFlightTargets.some(target =>
        Math.abs(target.x - dyn.x) < 1 && Math.abs(target.y - dyn.y) < 1,
      )
      if (inFlight) continue

      const ownerState = world.playerUpgradeStates.get(dyn.ownerId) ?? world.upgradeState
      const maxFuse = ownerState.dynamiteFuse
      const fuseProgress = maxFuse > 0 ? 1 - dyn.fuseRemaining / maxFuse : 1
      const pulseFreq = 3 + fuseProgress * 9
      const pulse = Math.sin(this.pulseClock * pulseFreq * Math.PI * 2) * 0.5 + 0.5
      const radiusAlpha = 0.08 + pulse * 0.12

      this.dotsGraphics.circle(dyn.x, dyn.y, dyn.radius)
      this.dotsGraphics.fill({ color: 0xff4400, alpha: radiusAlpha })
      this.dotsGraphics.circle(dyn.x, dyn.y, dyn.radius)
      this.dotsGraphics.stroke({ color: 0xff6622, width: 1.5, alpha: radiusAlpha + 0.1 })

      this.dotsGraphics.circle(dyn.x, dyn.y, 4)
      this.dotsGraphics.fill({ color: 0xff6622, alpha: 0.9 })

      this.dotsGraphics.circle(dyn.x, dyn.y, 6)
      this.dotsGraphics.stroke({ color: 0xffaa44, width: 1.5, alpha: 0.6 })

      const fuseAlpha = 0.35 + pulse * 0.65
      this.dotsGraphics.rect(dyn.x + 3, dyn.y - 3, 1, 1)
      this.dotsGraphics.fill({ color: 0xffdd66, alpha: fuseAlpha })
    }
  }

  destroy(): void {
    this.throwAnims.length = 0
    this.trackedDynamites.clear()
    this.dotsGraphics.destroy()
  }
}
