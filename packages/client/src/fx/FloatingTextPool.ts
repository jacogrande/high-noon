/**
 * FloatingTextPool - Pre-allocated Text pool for damage numbers.
 *
 * Uses SoA layout and swap-remove, same pattern as ParticlePool.
 * Pool exhaustion silently drops (no crash).
 */

import { Container, Text, TextStyle } from 'pixi.js'

const POOL_SIZE = 64
const FLOAT_DISTANCE = 30 // pixels upward
const FLOAT_DURATION = 0.6 // seconds

const TEXT_STYLE = new TextStyle({
  fontFamily: 'monospace',
  fontSize: 12,
  fontWeight: 'bold',
  fill: '#ffffff',
  stroke: { color: '#000000', width: 2 },
})

export class FloatingTextPool {
  private readonly texts: Text[]
  private readonly life: Float32Array
  private readonly maxLife: Float32Array
  private readonly startX: Float32Array
  private readonly startY: Float32Array

  private readonly freeList: number[]
  private readonly activeList: number[]

  constructor(fxLayer: Container) {
    this.texts = new Array(POOL_SIZE)
    this.life = new Float32Array(POOL_SIZE)
    this.maxLife = new Float32Array(POOL_SIZE)
    this.startX = new Float32Array(POOL_SIZE)
    this.startY = new Float32Array(POOL_SIZE)

    this.freeList = new Array(POOL_SIZE)
    this.activeList = []

    for (let i = 0; i < POOL_SIZE; i++) {
      const text = new Text({ text: '', style: TEXT_STYLE })
      text.anchor.set(0.5)
      text.visible = false
      fxLayer.addChild(text)
      this.texts[i] = text
      this.freeList[i] = i
    }
  }

  spawn(x: number, y: number, amount: number, color: number): void {
    if (this.freeList.length === 0) return

    const idx = this.freeList.pop()!
    this.activeList.push(idx)

    const text = this.texts[idx]!
    text.text = String(amount)
    text.tint = color
    text.position.set(x, y)
    text.alpha = 1
    text.visible = true

    this.life[idx] = FLOAT_DURATION
    this.maxLife[idx] = FLOAT_DURATION
    this.startX[idx] = x
    this.startY[idx] = y
  }

  update(dt: number): void {
    for (let i = this.activeList.length - 1; i >= 0; i--) {
      const idx = this.activeList[i]!

      const remaining = this.life[idx]! - dt
      this.life[idx] = remaining
      if (remaining <= 0) {
        const text = this.texts[idx]!
        text.visible = false

        const last = this.activeList.length - 1
        this.activeList[i] = this.activeList[last]!
        this.activeList.length = last
        this.freeList.push(idx)
        continue
      }

      const t = 1 - this.life[idx]! / this.maxLife[idx]! // 0 at spawn → 1 at death
      const text = this.texts[idx]!

      text.x = this.startX[idx]!
      text.y = this.startY[idx]! - FLOAT_DISTANCE * t
      text.alpha = 1 - t
    }
  }

  destroy(): void {
    for (const text of this.texts) {
      text.destroy()
    }
    this.activeList.length = 0
    this.freeList.length = 0
  }
}
