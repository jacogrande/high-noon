/**
 * Letterbox Overlay
 *
 * Cinematic black bars (top/bottom) for Phase 4 quick-draw duel.
 * Bars lerp to target height for smooth transitions.
 */

import { Graphics, type Container } from 'pixi.js'

const BAR_HEIGHT_RATIO = 0.12 // 12% of screen each
const LERP_SPEED = 6 // per second
const HEIGHT_SNAP_THRESHOLD = 0.5 // pixels — close enough to treat as target/zero

export class LetterboxOverlay {
  private readonly topBar: Graphics
  private readonly bottomBar: Graphics
  private readonly screenWidth: () => number
  private readonly screenHeight: () => number
  private active = false
  private currentHeight = 0

  constructor(
    uiLayer: Container,
    screenWidth: () => number,
    screenHeight: () => number,
  ) {
    this.screenWidth = screenWidth
    this.screenHeight = screenHeight

    this.topBar = new Graphics()
    this.topBar.visible = false
    uiLayer.addChild(this.topBar)

    this.bottomBar = new Graphics()
    this.bottomBar.visible = false
    uiLayer.addChild(this.bottomBar)
  }

  show(): void {
    this.active = true
  }

  hide(): void {
    this.active = false
  }

  update(dt: number): void {
    const targetHeight = this.active ? this.screenHeight() * BAR_HEIGHT_RATIO : 0
    if (this.currentHeight === 0 && targetHeight === 0) return

    // Lerp toward target
    const diff = targetHeight - this.currentHeight
    if (Math.abs(diff) < HEIGHT_SNAP_THRESHOLD) {
      this.currentHeight = targetHeight
    } else {
      this.currentHeight += diff * Math.min(1, LERP_SPEED * dt)
    }

    if (this.currentHeight < HEIGHT_SNAP_THRESHOLD) {
      this.topBar.visible = false
      this.bottomBar.visible = false
      this.currentHeight = 0
      return
    }

    const w = this.screenWidth()
    const h = this.screenHeight()

    this.topBar.clear()
    this.topBar.rect(0, 0, w, this.currentHeight).fill({ color: 0x000000, alpha: 1 })
    this.topBar.visible = true

    this.bottomBar.clear()
    this.bottomBar.rect(0, h - this.currentHeight, w, this.currentHeight).fill({ color: 0x000000, alpha: 1 })
    this.bottomBar.visible = true
  }

  destroy(): void {
    this.topBar.destroy()
    this.bottomBar.destroy()
  }
}
