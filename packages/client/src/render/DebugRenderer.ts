/**
 * DebugRenderer - Draw debug shapes and overlay
 *
 * Provides simple shape drawing for debugging and placeholder graphics
 * before proper sprites are implemented.
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js'

/** Debug overlay statistics */
export interface DebugStats {
  fps: number
  tick: number
  entityCount: number
  // Player
  playerState: string
  playerX: number
  playerY: number
  playerVx: number
  playerVy: number
  // Health
  playerHP: number
  playerMaxHP: number
  // Enemies
  enemyCount: number
  enemyStates: string
  // Combat
  activeProjectiles: number
  // Camera
  cameraX: number
  cameraY: number
  cameraTrauma: number
  // Stage / Waves
  stageNumber: number
  stageStatus: string
  waveNumber: number
  waveStatus: string    // "active" | "delay" | "completed" | "none"
  fodderAlive: number
  threatAlive: number
  fodderBudgetLeft: number
  // Upgrades
  xp: number
  level: number
  pendingPts: number
  // Networking (multiplayer)
  netTelemetry?: string
}

/**
 * Debug rendering utilities
 */
export class DebugRenderer {
  private readonly container: Container
  private readonly overlayContainer: Container
  private readonly graphics: Graphics
  private readonly statsText: Text

  private visible = true

  constructor(uiLayer: Container) {
    // Container for debug shapes (drawn each frame)
    this.container = new Container()
    this.graphics = new Graphics()
    this.container.addChild(this.graphics)

    // Container for overlay UI
    this.overlayContainer = new Container()

    // Stats text
    const style = new TextStyle({
      fontFamily: 'monospace',
      fontSize: 14,
      fill: '#00ff00',
      stroke: { color: '#000000', width: 2 },
    })
    this.statsText = new Text({ text: '', style })
    this.statsText.x = 10
    this.statsText.y = 10
    this.overlayContainer.addChild(this.statsText)

    uiLayer.addChild(this.overlayContainer)
  }

  /**
   * Get the container for debug shapes
   * Add this to your entity layer if you want shapes to render with entities
   */
  getContainer(): Container {
    return this.container
  }

  /**
   * Toggle debug visibility
   */
  toggle(): void {
    this.visible = !this.visible
    this.overlayContainer.visible = this.visible
    this.container.visible = this.visible
  }

  /**
   * Set debug visibility
   */
  setVisible(visible: boolean): void {
    this.visible = visible
    this.overlayContainer.visible = visible
    this.container.visible = visible
  }

  /**
   * Clear all debug shapes (call at start of each frame)
   */
  clear(): void {
    this.graphics.clear()
  }

  /**
   * Draw a circle
   */
  circle(x: number, y: number, radius: number, color: number, alpha = 1): void {
    this.graphics.circle(x, y, radius)
    this.graphics.fill({ color, alpha })
  }

  /**
   * Draw a circle outline
   */
  circleOutline(
    x: number,
    y: number,
    radius: number,
    color: number,
    lineWidth = 1
  ): void {
    this.graphics.circle(x, y, radius)
    this.graphics.stroke({ color, width: lineWidth })
  }

  /**
   * Draw a filled rectangle
   */
  rect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
    alpha = 1
  ): void {
    this.graphics.rect(x, y, width, height)
    this.graphics.fill({ color, alpha })
  }

  /**
   * Draw a rectangle outline
   */
  rectOutline(
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
    lineWidth = 1
  ): void {
    this.graphics.rect(x, y, width, height)
    this.graphics.stroke({ color, width: lineWidth })
  }

  /**
   * Draw a line
   */
  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: number,
    lineWidth = 1
  ): void {
    this.graphics.moveTo(x1, y1)
    this.graphics.lineTo(x2, y2)
    this.graphics.stroke({ color, width: lineWidth })
  }

  /**
   * Update the debug stats overlay
   */
  updateStats(stats: DebugStats): void {
    this.statsText.text = [
      `FPS: ${stats.fps}        Tick: ${stats.tick}      Entities: ${stats.entityCount}`,
      '',
      `Player: ${stats.playerState}`,
      `HP: ${stats.playerHP}/${stats.playerMaxHP}    Enemies: ${stats.enemyCount}  ${stats.enemyStates}`,
      `Projectiles: ${stats.activeProjectiles}`,
      `Pos: ${stats.playerX.toFixed(1)}, ${stats.playerY.toFixed(1)}    Vel: ${stats.playerVx.toFixed(1)}, ${stats.playerVy.toFixed(1)}`,
      '',
      `Cam: ${stats.cameraX.toFixed(1)}, ${stats.cameraY.toFixed(1)}    Trauma: ${stats.cameraTrauma.toFixed(3)}`,
      '',
      `Stage: ${stats.stageNumber} ${stats.stageStatus}  Wave: ${stats.waveNumber}  ${stats.waveStatus}  Fodder: ${stats.fodderAlive} (${stats.fodderBudgetLeft} left)  Threats: ${stats.threatAlive}`,
      `XP: ${stats.xp}  Level: ${stats.level}  PendingPts: ${stats.pendingPts}`,
      stats.netTelemetry ?? '',
    ].join('\n')
  }

  /**
   * Clean up
   */
  destroy(): void {
    this.container.destroy({ children: true })
    this.overlayContainer.destroy({ children: true })
  }
}
