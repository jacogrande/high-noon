/**
 * Half-resolution lightmap renderer.
 *
 * Renders additive light sprites into a half-res RenderTexture and composites
 * it over the scene with multiply blending.
 */

import { Container, Graphics, RenderTexture, Sprite, type Renderer } from 'pixi.js'
import { LAVA_LIGHT_CONFIG, LIGHTMAP_CONFIG } from './config'
import type { LightSource } from './LightSource'
import { destroySoftCircleTexture, getSoftCircleTexture, SOFT_CIRCLE_RADIUS } from './textures'

export class LightingSystem {
  private readonly renderer: Renderer
  private readonly lightContainer: Container
  private readonly ambientBackground: Graphics
  private readonly pool: Sprite[] = []
  private readonly lights: LightSource[] = []

  private lightmapRT: RenderTexture
  private readonly lightmapSprite: Sprite
  private screenW: number
  private screenH: number
  private elapsed = 0

  constructor(renderer: Renderer, screenW: number, screenH: number) {
    this.renderer = renderer
    this.screenW = screenW
    this.screenH = screenH
    this.lightContainer = new Container()
    this.ambientBackground = new Graphics()

    this.lightmapRT = RenderTexture.create({
      width: Math.ceil(screenW * LIGHTMAP_CONFIG.scale),
      height: Math.ceil(screenH * LIGHTMAP_CONFIG.scale),
    })

    for (let i = 0; i < LIGHTMAP_CONFIG.poolSize; i++) {
      this.pool.push(this.createLightSprite())
    }

    this.lightmapSprite = new Sprite(this.lightmapRT)
    this.lightmapSprite.width = screenW
    this.lightmapSprite.height = screenH
    this.lightmapSprite.blendMode = 'multiply'
    this.lightmapSprite.eventMode = 'none'
  }

  private createLightSprite(): Sprite {
    const sprite = new Sprite(getSoftCircleTexture())
    sprite.anchor.set(0.5)
    sprite.blendMode = 'add'
    return sprite
  }

  getLightmapSprite(): Sprite {
    return this.lightmapSprite
  }

  addLight(light: LightSource): void {
    this.lights.push(light)
  }

  updateLights(realDt: number): void {
    this.elapsed += realDt
    for (let i = this.lights.length - 1; i >= 0; i--) {
      const light = this.lights[i]!
      if (light.ttl <= 0) continue

      light.ttl -= realDt
      if (light.ttl <= 0) {
        this.lights[i] = this.lights[this.lights.length - 1]!
        this.lights.pop()
      }
    }
  }

  render(cameraX: number, cameraY: number, zoom: number): void {
    const halfW = this.screenW / 2
    const halfH = this.screenH / 2
    const scale = LIGHTMAP_CONFIG.scale
    const targetW = Math.ceil(this.screenW * scale)
    const targetH = Math.ceil(this.screenH * scale)

    this.lightContainer.removeChildren()

    this.ambientBackground.clear()
    this.ambientBackground.rect(0, 0, targetW, targetH)
    this.ambientBackground.fill(LIGHTMAP_CONFIG.ambientColor)
    this.lightContainer.addChild(this.ambientBackground)

    while (this.pool.length < Math.min(this.lights.length, LIGHTMAP_CONFIG.maxPoolSize)) {
      this.pool.push(this.createLightSprite())
    }

    const count = Math.min(this.lights.length, this.pool.length)
    for (let i = 0; i < count; i++) {
      const light = this.lights[i]!
      const sprite = this.pool[i]!

      const screenX = (light.x - cameraX) * zoom + halfW
      const screenY = (light.y - cameraY) * zoom + halfH
      sprite.x = screenX * scale
      sprite.y = screenY * scale

      let intensity = light.intensity
      if (light.pulse) {
        const pulse = 1 + Math.sin(this.elapsed * LAVA_LIGHT_CONFIG.pulseSpeed + light.pulsePhase) * LAVA_LIGHT_CONFIG.pulseAmount
        intensity *= pulse
      }
      if (light.maxTtl > 0) {
        intensity *= Math.max(0, light.ttl / light.maxTtl)
      }

      sprite.tint = light.color
      sprite.alpha = intensity

      const screenRadius = light.radius * zoom
      const spriteScale = (screenRadius / SOFT_CIRCLE_RADIUS) * scale
      sprite.scale.set(spriteScale)

      this.lightContainer.addChild(sprite)
    }

    this.renderer.render({
      container: this.lightContainer,
      target: this.lightmapRT,
      clear: true,
    })
  }

  resize(screenW: number, screenH: number): void {
    if (screenW === this.screenW && screenH === this.screenH) return

    this.screenW = screenW
    this.screenH = screenH
    this.lightmapRT.destroy(true)
    this.lightmapRT = RenderTexture.create({
      width: Math.ceil(screenW * LIGHTMAP_CONFIG.scale),
      height: Math.ceil(screenH * LIGHTMAP_CONFIG.scale),
    })

    this.lightmapSprite.texture = this.lightmapRT
    this.lightmapSprite.width = screenW
    this.lightmapSprite.height = screenH
  }

  destroy(): void {
    this.lightmapRT.destroy(true)
    this.lightmapSprite.destroy()
    this.ambientBackground.destroy()
    for (const sprite of this.pool) {
      sprite.destroy()
    }
    this.pool.length = 0
    this.lightContainer.destroy()
    destroySoftCircleTexture()
  }
}
