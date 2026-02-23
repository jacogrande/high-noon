/**
 * FloatingTextPool - Pre-allocated Text pool for damage numbers.
 *
 * Uses SoA layout and swap-remove, same pattern as ParticlePool.
 * Pool exhaustion silently drops (no crash).
 *
 * Rendered on the UI layer at native resolution. World positions are
 * converted to screen space each frame via an optional camera state.
 */

import { Container, Text, TextStyle } from 'pixi.js'

/** Camera state for world→screen conversion (same shape as ChatBubblePool). */
export interface FloatingTextCameraState {
  x: number
  y: number
  zoom: number
  halfW: number
  halfH: number
}

const POOL_SIZE = 64
const FLOAT_DISTANCE = 80 // screen pixels upward
const FLOAT_DURATION = 0.6 // seconds

const TEXT_STYLE = new TextStyle({
  fontFamily: 'monospace',
  fontSize: 32,
  fontWeight: 'bold',
  fill: '#ffffff',
  stroke: { color: '#000000', width: 5 },
})

export class FloatingTextPool {
  private readonly texts: Text[]
  private readonly life: Float32Array
  private readonly maxLife: Float32Array
  /** World-space origin X. */
  private readonly worldX: Float32Array
  /** World-space origin Y. */
  private readonly worldY: Float32Array

  private readonly freeList: number[]
  private readonly activeList: number[]

  constructor(layer: Container) {
    this.texts = new Array(POOL_SIZE)
    this.life = new Float32Array(POOL_SIZE)
    this.maxLife = new Float32Array(POOL_SIZE)
    this.worldX = new Float32Array(POOL_SIZE)
    this.worldY = new Float32Array(POOL_SIZE)

    this.freeList = new Array(POOL_SIZE)
    this.activeList = []

    for (let i = 0; i < POOL_SIZE; i++) {
      const text = new Text({ text: '', style: TEXT_STYLE })
      text.anchor.set(0.5)
      text.visible = false
      layer.addChild(text)
      this.texts[i] = text
      this.freeList[i] = i
    }
  }

  spawn(x: number, y: number, amount: number, color: number, scale: number = 1): void {
    if (this.freeList.length === 0) return

    const idx = this.freeList.pop()!
    this.activeList.push(idx)

    const text = this.texts[idx]!
    text.text = String(amount)
    text.tint = color
    text.alpha = 1
    text.scale.set(scale)
    text.visible = true

    this.life[idx] = FLOAT_DURATION
    this.maxLife[idx] = FLOAT_DURATION
    this.worldX[idx] = x
    this.worldY[idx] = y
  }

  update(dt: number, camera?: FloatingTextCameraState): void {
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

      const wx = this.worldX[idx]!
      const wy = this.worldY[idx]!

      if (camera) {
        const screenX = (wx - camera.x) * camera.zoom + camera.halfW
        const screenY = (wy - camera.y) * camera.zoom + camera.halfH
        text.x = screenX
        text.y = screenY - FLOAT_DISTANCE * t
      } else {
        text.x = wx
        text.y = wy - FLOAT_DISTANCE * t
      }
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
