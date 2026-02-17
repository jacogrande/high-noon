/**
 * PixiJS-based scrolling time-series graph for network metrics.
 *
 * Renders as a semi-transparent panel in the bottom-right of the UI layer.
 * Each registered series is a horizontal strip of vertical bars.
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js'

interface SeriesConfig {
  name: string
  color: number
  maxValue: number
  good: number
  warn: number
  critical: number
}

const SAMPLE_COUNT = 200
const SERIES_HEIGHT = 40
const SERIES_WIDTH = 200
const SERIES_GAP = 4
const LABEL_HEIGHT = 14
const PADDING = 8
const BG_ALPHA = 0.6
const BG_COLOR = 0x000000

const COLOR_GOOD = 0x44cc44
const COLOR_WARN = 0xcccc44
const COLOR_CRITICAL = 0xcc4444

const LABEL_STYLE = new TextStyle({
  fontSize: 10,
  fill: 0xcccccc,
  fontFamily: 'monospace',
})

export class NetGraph {
  private readonly container: Container
  private readonly gfx: Graphics
  private readonly series: Map<string, SeriesConfig> = new Map()
  private readonly seriesData: Map<string, number[]> = new Map()
  private readonly labels: Map<string, Text> = new Map()
  private readonly layer: Container

  constructor(layer: Container) {
    this.layer = layer
    this.container = new Container()
    this.container.visible = false
    this.gfx = new Graphics()
    this.container.addChild(this.gfx)
    layer.addChild(this.container)
  }

  addSeries(name: string, color: number, maxValue: number): void {
    this.series.set(name, {
      name,
      color,
      maxValue,
      good: maxValue * 0.5,
      warn: maxValue * 0.75,
      critical: maxValue * 0.9,
    })
    this.seriesData.set(name, [])
    const label = new Text({ text: name, style: LABEL_STYLE.clone() })
    this.labels.set(name, label)
    this.container.addChild(label)
  }

  setThresholds(name: string, good: number, warn: number, critical: number): void {
    const cfg = this.series.get(name)
    if (!cfg) return
    cfg.good = good
    cfg.warn = warn
    cfg.critical = critical
  }

  pushSample(name: string, value: number): void {
    const data = this.seriesData.get(name)
    if (!data) return
    data.push(value)
    if (data.length > SAMPLE_COUNT) data.shift()
  }

  render(): void {
    this.gfx.clear()
    const seriesCount = this.series.size
    if (seriesCount === 0) return

    const totalHeight = seriesCount * (SERIES_HEIGHT + LABEL_HEIGHT + SERIES_GAP) + PADDING * 2 - SERIES_GAP
    const totalWidth = SERIES_WIDTH + PADDING * 2

    // Background
    this.gfx.rect(0, 0, totalWidth, totalHeight)
    this.gfx.fill({ color: BG_COLOR, alpha: BG_ALPHA })

    let yOffset = PADDING
    for (const [name, cfg] of this.series) {
      const data = this.seriesData.get(name)!
      const label = this.labels.get(name)!

      // Position label
      const latestVal = data.length > 0 ? data[data.length - 1]! : 0
      label.text = `${name}: ${latestVal.toFixed(1)}`
      label.x = PADDING
      label.y = yOffset
      yOffset += LABEL_HEIGHT

      // Draw bars
      const barWidth = SERIES_WIDTH / SAMPLE_COUNT
      for (let i = 0; i < data.length; i++) {
        const val = data[i]!
        const ratio = Math.min(1, val / cfg.maxValue)
        const barHeight = ratio * SERIES_HEIGHT
        const x = PADDING + i * barWidth

        let color: number
        if (val <= cfg.good) color = COLOR_GOOD
        else if (val <= cfg.warn) color = COLOR_WARN
        else color = COLOR_CRITICAL

        this.gfx.rect(x, yOffset + SERIES_HEIGHT - barHeight, barWidth, barHeight)
        this.gfx.fill(color)
      }

      yOffset += SERIES_HEIGHT + SERIES_GAP
    }
  }

  show(): void {
    this.container.visible = true
  }

  hide(): void {
    this.container.visible = false
  }

  get visible(): boolean {
    return this.container.visible
  }

  /** Reposition to bottom-right of the given screen dimensions. */
  reposition(screenWidth: number, screenHeight: number): void {
    const totalWidth = SERIES_WIDTH + PADDING * 2
    const seriesCount = this.series.size
    const totalHeight = seriesCount * (SERIES_HEIGHT + LABEL_HEIGHT + SERIES_GAP) + PADDING * 2 - SERIES_GAP
    this.container.x = screenWidth - totalWidth - 10
    this.container.y = screenHeight - totalHeight - 10
  }

  destroy(): void {
    for (const label of this.labels.values()) {
      label.destroy()
    }
    this.labels.clear()
    this.gfx.destroy()
    this.layer.removeChild(this.container)
    this.container.destroy()
  }
}
