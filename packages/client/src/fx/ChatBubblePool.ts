/**
 * ChatBubblePool - Pooled world-space speech bubbles with typewriter text.
 *
 * Uses SoA layout and swap-remove, same pattern as FloatingTextPool.
 * Bubbles track NPC position via ECS reads and fade out before expiring.
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import { hasComponent } from 'bitecs'
import type { GameWorld } from '@high-noon/shared'
import { Npc, Position } from '@high-noon/shared'

const POOL_SIZE = 8
const CHARS_PER_SECOND = 30
const FADE_DURATION = 0.5
const BUBBLE_OFFSET_Y = -28
const MAX_WIDTH = 160
const PADDING_X = 8
const PADDING_Y = 6
const BORDER_RADIUS = 6
const TAIL_SIZE = 5
const BG_COLOR = 0xfff8e7
const BORDER_COLOR = 0x5c3a1e

const TEXT_STYLE = new TextStyle({
  fontFamily: 'monospace',
  fontSize: 10,
  fill: '#3b2507',
  wordWrap: true,
  wordWrapWidth: MAX_WIDTH - PADDING_X * 2,
})

export class ChatBubblePool {
  private readonly containers: Container[]
  private readonly backgrounds: Graphics[]
  private readonly textObjects: Text[]
  private readonly npcEid: Int32Array
  private readonly fullText: string[]
  private readonly visibleChars: Float32Array
  private readonly life: Float32Array
  private readonly maxLife: Float32Array
  private readonly freeList: number[]
  private readonly activeList: number[]

  constructor(worldLayer: Container, poolSize = POOL_SIZE) {
    this.containers = new Array(poolSize)
    this.backgrounds = new Array(poolSize)
    this.textObjects = new Array(poolSize)
    this.npcEid = new Int32Array(poolSize)
    this.fullText = new Array(poolSize).fill('')
    this.visibleChars = new Float32Array(poolSize)
    this.life = new Float32Array(poolSize)
    this.maxLife = new Float32Array(poolSize)
    this.freeList = new Array(poolSize)
    this.activeList = []

    for (let i = 0; i < poolSize; i++) {
      const container = new Container()
      container.visible = false

      const bg = new Graphics()
      container.addChild(bg)

      const text = new Text({ text: '', style: TEXT_STYLE })
      container.addChild(text)

      worldLayer.addChild(container)

      this.containers[i] = container
      this.backgrounds[i] = bg
      this.textObjects[i] = text
      this.freeList[i] = i
    }
  }

  show(eid: number, x: number, y: number, text: string, duration: number): void {
    if (this.freeList.length === 0) return

    const idx = this.freeList.pop()!
    this.activeList.push(idx)

    this.npcEid[idx] = eid
    this.fullText[idx] = text
    this.visibleChars[idx] = 0
    this.life[idx] = duration
    this.maxLife[idx] = duration

    const textObj = this.textObjects[idx]!
    textObj.text = text
    textObj.style = TEXT_STYLE

    // Measure text to size the background
    const textWidth = Math.min(textObj.width, MAX_WIDTH - PADDING_X * 2)
    const textHeight = textObj.height

    // Reset text to empty for typewriter
    textObj.text = ''

    const bgWidth = textWidth + PADDING_X * 2
    const bgHeight = textHeight + PADDING_Y * 2

    // Draw background with tail
    const bg = this.backgrounds[idx]!
    bg.clear()
    // Border
    bg.roundRect(-bgWidth / 2, -bgHeight - TAIL_SIZE, bgWidth, bgHeight, BORDER_RADIUS)
    bg.fill({ color: BG_COLOR })
    bg.stroke({ color: BORDER_COLOR, width: 1 })
    // Tail triangle
    bg.moveTo(-TAIL_SIZE, -TAIL_SIZE)
    bg.lineTo(0, 0)
    bg.lineTo(TAIL_SIZE, -TAIL_SIZE)
    bg.fill({ color: BG_COLOR })
    // Tail border lines (just the two visible edges)
    bg.moveTo(-TAIL_SIZE, -TAIL_SIZE)
    bg.lineTo(0, 0)
    bg.lineTo(TAIL_SIZE, -TAIL_SIZE)
    bg.stroke({ color: BORDER_COLOR, width: 1 })

    // Position text inside the bubble
    textObj.x = -bgWidth / 2 + PADDING_X
    textObj.y = -bgHeight - TAIL_SIZE + PADDING_Y

    const container = this.containers[idx]!
    container.position.set(x, y + BUBBLE_OFFSET_Y)
    container.alpha = 1
    container.visible = true
  }

  update(dt: number, world: GameWorld): void {
    for (let i = this.activeList.length - 1; i >= 0; i--) {
      const idx = this.activeList[i]!
      const eid = this.npcEid[idx]!

      // If NPC entity is gone, expire immediately
      if (!hasComponent(world, Npc, eid)) {
        this.recycle(i, idx)
        continue
      }

      this.life[idx] = this.life[idx]! - dt
      if (this.life[idx]! <= 0) {
        this.recycle(i, idx)
        continue
      }

      // Typewriter effect
      this.visibleChars[idx] = Math.min(
        this.visibleChars[idx]! + dt * CHARS_PER_SECOND,
        this.fullText[idx]!.length,
      )
      this.textObjects[idx]!.text = this.fullText[idx]!.substring(
        0,
        Math.floor(this.visibleChars[idx]!),
      )

      // Fade out during last FADE_DURATION seconds
      const remaining = this.life[idx]!
      if (remaining < FADE_DURATION) {
        this.containers[idx]!.alpha = remaining / FADE_DURATION
      }

      // Track NPC position
      this.containers[idx]!.position.set(
        Position.x[eid]!,
        Position.y[eid]! + BUBBLE_OFFSET_Y,
      )
    }
  }

  private recycle(activeIndex: number, poolIndex: number): void {
    this.containers[poolIndex]!.visible = false

    const last = this.activeList.length - 1
    this.activeList[activeIndex] = this.activeList[last]!
    this.activeList.length = last
    this.freeList.push(poolIndex)
  }

  destroy(): void {
    for (const container of this.containers) {
      container.destroy({ children: true })
    }
    this.activeList.length = 0
    this.freeList.length = 0
  }
}
