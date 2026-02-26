/**
 * Draw Flash Overlay
 *
 * Full-screen white flash for Phase 4 quick-draw signal,
 * plus floating result text (PERFECT / GOOD / SLOW).
 * Uses PixiJS Graphics for frame-precise timing.
 */

import { Graphics, Text, TextStyle, type Container } from 'pixi.js'

const FLASH_DECAY_RATE = 15 // alpha per second — fades out in ~2-3 frames at 60fps
const FLASH_ALPHA_EPSILON = 0.01 // below this, treat as fully transparent
const RESULT_DISPLAY_TIME = 1.5 // seconds
const RESULT_FADE_DURATION = 0.3 // seconds at end of display to fade text out

const RESULT_TEXT_STYLE = new TextStyle({
  fontFamily: 'monospace',
  fontSize: 32,
  fontWeight: 'bold',
  fill: 0xFFFFFF,
  stroke: { color: 0x000000, width: 5 },
})

export class DrawFlashOverlay {
  private readonly flashGraphics: Graphics
  private readonly resultLabel: Text
  private readonly screenWidth: () => number
  private readonly screenHeight: () => number
  private flashAlpha = 0
  private flashColor = 0xFFFFFF
  private resultTimer = 0

  constructor(
    uiLayer: Container,
    screenWidth: () => number,
    screenHeight: () => number,
  ) {
    this.screenWidth = screenWidth
    this.screenHeight = screenHeight

    this.flashGraphics = new Graphics()
    this.flashGraphics.visible = false
    uiLayer.addChild(this.flashGraphics)

    this.resultLabel = new Text({ text: '', style: RESULT_TEXT_STYLE })
    this.resultLabel.anchor.set(0.5)
    this.resultLabel.visible = false
    uiLayer.addChild(this.resultLabel)
  }

  triggerFlash(tintColor: number = 0xFFFFFF): void {
    this.flashAlpha = 1.0
    this.flashColor = tintColor
  }

  showResult(text: string, color: number): void {
    this.resultLabel.text = text
    this.resultLabel.style.fill = color
    this.resultTimer = RESULT_DISPLAY_TIME
  }

  update(dt: number): void {
    // Flash fade
    if (this.flashAlpha > 0) {
      this.flashAlpha = Math.max(0, this.flashAlpha - dt * FLASH_DECAY_RATE)
      this.flashGraphics.clear()
      if (this.flashAlpha > FLASH_ALPHA_EPSILON) {
        const w = this.screenWidth()
        const h = this.screenHeight()
        this.flashGraphics
          .rect(0, 0, w, h)
          .fill({ color: this.flashColor, alpha: this.flashAlpha })
        this.flashGraphics.visible = true
      } else {
        this.flashGraphics.visible = false
        this.flashAlpha = 0
      }
    }

    // Result text fade
    if (this.resultTimer > 0) {
      this.resultTimer = Math.max(0, this.resultTimer - dt)
      if (this.resultTimer > 0) {
        const w = this.screenWidth()
        const h = this.screenHeight()
        this.resultLabel.position.set(w / 2, h * 0.35)
        const alpha = this.resultTimer < RESULT_FADE_DURATION ? this.resultTimer / RESULT_FADE_DURATION : 1
        this.resultLabel.alpha = alpha
        this.resultLabel.visible = true
      } else {
        this.resultLabel.visible = false
      }
    }
  }

  destroy(): void {
    this.flashGraphics.destroy()
    this.resultLabel.destroy()
  }
}
