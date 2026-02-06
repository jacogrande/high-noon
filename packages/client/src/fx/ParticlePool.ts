/**
 * ParticlePool - Pre-allocated sprite pool with SoA data layout.
 *
 * Uses Texture.WHITE sprites with tint for colored particles.
 * Swap-remove on activeList for O(1) recycle. Pool exhaustion silently drops.
 */

import { Container, Sprite, Texture } from 'pixi.js'

export interface ParticleConfig {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  startScale: number
  endScale: number
  startAlpha: number
  endAlpha: number
  tint: number
}

const DEFAULT_POOL_SIZE = 512

export class ParticlePool {
  private readonly sprites: Sprite[]
  // SoA arrays
  private readonly vx: Float32Array
  private readonly vy: Float32Array
  private readonly life: Float32Array
  private readonly maxLife: Float32Array
  private readonly startScale: Float32Array
  private readonly endScale: Float32Array
  private readonly startAlpha: Float32Array
  private readonly endAlpha: Float32Array

  private readonly freeList: number[]
  private readonly activeList: number[]

  constructor(fxLayer: Container, poolSize = DEFAULT_POOL_SIZE) {
    this.sprites = new Array(poolSize)
    this.vx = new Float32Array(poolSize)
    this.vy = new Float32Array(poolSize)
    this.life = new Float32Array(poolSize)
    this.maxLife = new Float32Array(poolSize)
    this.startScale = new Float32Array(poolSize)
    this.endScale = new Float32Array(poolSize)
    this.startAlpha = new Float32Array(poolSize)
    this.endAlpha = new Float32Array(poolSize)

    this.freeList = new Array(poolSize)
    this.activeList = []

    for (let i = 0; i < poolSize; i++) {
      const sprite = new Sprite(Texture.WHITE)
      sprite.anchor.set(0.5)
      sprite.visible = false
      fxLayer.addChild(sprite)
      this.sprites[i] = sprite
      this.freeList[i] = i
    }
  }

  emit(config: ParticleConfig): void {
    if (this.freeList.length === 0) return // silently drop

    const idx = this.freeList.pop()!
    this.activeList.push(idx)

    const sprite = this.sprites[idx]!
    sprite.position.set(config.x, config.y)
    sprite.scale.set(config.startScale)
    sprite.alpha = config.startAlpha
    sprite.tint = config.tint
    sprite.visible = true

    this.vx[idx] = config.vx
    this.vy[idx] = config.vy
    this.life[idx] = config.life
    this.maxLife[idx] = config.life
    this.startScale[idx] = config.startScale
    this.endScale[idx] = config.endScale
    this.startAlpha[idx] = config.startAlpha
    this.endAlpha[idx] = config.endAlpha
  }

  update(dt: number): void {
    for (let i = this.activeList.length - 1; i >= 0; i--) {
      const idx = this.activeList[i]!

      const remaining = this.life[idx]! - dt
      this.life[idx] = remaining
      if (remaining <= 0) {
        // Recycle: swap-remove from activeList
        const sprite = this.sprites[idx]!
        sprite.visible = false

        const last = this.activeList.length - 1
        this.activeList[i] = this.activeList[last]!
        this.activeList.length = last
        this.freeList.push(idx)
        continue
      }

      const t = 1 - this.life[idx]! / this.maxLife[idx]! // 0 at spawn → 1 at death
      const sprite = this.sprites[idx]!

      // Move
      sprite.x += this.vx[idx]! * dt
      sprite.y += this.vy[idx]! * dt

      // Lerp scale and alpha
      const scale = this.startScale[idx]! + (this.endScale[idx]! - this.startScale[idx]!) * t
      sprite.scale.set(scale)
      sprite.alpha = this.startAlpha[idx]! + (this.endAlpha[idx]! - this.startAlpha[idx]!) * t
    }
  }

  destroy(): void {
    for (const sprite of this.sprites) {
      sprite.destroy()
    }
    this.activeList.length = 0
    this.freeList.length = 0
  }
}
