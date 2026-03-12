/**
 * DebugOverlayRenderer — world-space debug visualization layers.
 *
 * Draws entity collision radii, AI detection ranges, AI state labels,
 * spawn zone boundaries, and playable bounds. Each layer toggles
 * independently via hotkeys. Stripped from production via __DEV__.
 */

import { defineQuery, hasComponent } from 'bitecs'
import { Graphics, Text, TextStyle, Container } from 'pixi.js'
import type { GameWorld } from '@high-noon/shared'
import {
  Position,
  Collider,
  Enemy,
  EnemyAI,
  AIState,
  Detection,
  Player,
  Bullet,
  NO_TARGET,
} from '@high-noon/shared'

// bitECS queries at module scope
const colliderQuery = defineQuery([Position, Collider])
const aiQuery = defineQuery([Enemy, EnemyAI, Detection, Position])

/** Which debug overlay layers are currently active */
export interface DebugOverlayState {
  colliders: boolean
  aiRanges: boolean
  spawnZones: boolean
}

export class DebugOverlayRenderer {
  private readonly graphics: Graphics
  private readonly textContainer: Container
  private readonly state: DebugOverlayState = {
    colliders: false,
    aiRanges: false,
    spawnZones: false,
  }
  private playableBounds: {
    minX: number
    minY: number
    maxX: number
    maxY: number
  } | null = null

  // Pool of text labels for AI state display
  private readonly aiLabels: Text[] = []
  private aiLabelIndex = 0

  private static readonly AI_STATE_LABELS: Record<number, string> = {
    [AIState.IDLE]: 'IDLE',
    [AIState.CHASE]: 'CHASE',
    [AIState.TELEGRAPH]: 'TELG',
    [AIState.ATTACK]: 'ATK',
    [AIState.RECOVERY]: 'REC',
    [AIState.STUNNED]: 'STUN',
    [AIState.FLEE]: 'FLEE',
  }

  private static readonly AI_STATE_COLORS: Record<number, number> = {
    [AIState.IDLE]: 0x888888,
    [AIState.CHASE]: 0xff8800,
    [AIState.TELEGRAPH]: 0xff0000,
    [AIState.ATTACK]: 0xff0000,
    [AIState.RECOVERY]: 0x4488ff,
    [AIState.STUNNED]: 0xffff00,
    [AIState.FLEE]: 0x00ffff,
  }

  private static readonly LABEL_STYLE = new TextStyle({
    fontFamily: 'monospace',
    fontSize: 8,
    fill: '#ffffff',
    stroke: { color: '#000000', width: 1 },
  })

  constructor(worldLayer: Container) {
    this.graphics = new Graphics()
    this.graphics.visible = false
    worldLayer.addChild(this.graphics)

    this.textContainer = new Container()
    this.textContainer.visible = false
    worldLayer.addChild(this.textContainer)
  }

  // ── Toggle methods ──────────────────────────────────────────────────

  toggleColliders(): void {
    this.state.colliders = !this.state.colliders
  }

  toggleAIRanges(): void {
    this.state.aiRanges = !this.state.aiRanges
  }

  toggleSpawnZones(): void {
    this.state.spawnZones = !this.state.spawnZones
  }

  getState(): Readonly<DebugOverlayState> {
    return this.state
  }

  // ── Bounds setter ───────────────────────────────────────────────────

  setPlayableBounds(bounds: {
    minX: number
    minY: number
    maxX: number
    maxY: number
  }): void {
    this.playableBounds = bounds
  }

  // ── Top-level render ────────────────────────────────────────────────

  render(world: GameWorld, alpha: number): void {
    const anyActive =
      this.state.colliders || this.state.aiRanges || this.state.spawnZones
    this.graphics.visible = anyActive
    this.textContainer.visible = this.state.aiRanges

    if (!anyActive) return

    this.graphics.clear()
    this.aiLabelIndex = 0

    this.renderColliders(world, alpha)
    this.renderAIRanges(world, alpha)
    this.renderSpawnZones()

    // Hide unused pooled text labels
    for (let i = this.aiLabelIndex; i < this.aiLabels.length; i++) {
      this.aiLabels[i]!.visible = false
    }
  }

  // ── Collider overlay ────────────────────────────────────────────────

  private renderColliders(world: GameWorld, alpha: number): void {
    if (!this.state.colliders) return

    const entities = colliderQuery(world)
    for (const eid of entities) {
      const prevX = Position.prevX[eid]!
      const prevY = Position.prevY[eid]!
      const currX = Position.x[eid]!
      const currY = Position.y[eid]!
      const x = prevX + (currX - prevX) * alpha
      const y = prevY + (currY - prevY) * alpha
      const radius = Collider.radius[eid]!

      // Color by entity type
      let color = 0x00ff00 // default green
      if (hasComponent(world, Enemy, eid)) {
        color = 0xff4444 // red for enemies
      } else if (hasComponent(world, Bullet, eid)) {
        color = 0xffff00 // yellow for bullets
      } else if (hasComponent(world, Player, eid)) {
        color = 0x00ff00 // green for player
      }

      this.graphics
        .circle(x, y, radius)
        .stroke({ color, width: 1, alpha: 0.6 })
    }
  }

  // ── AI range + state overlay ────────────────────────────────────────

  private renderAIRanges(world: GameWorld, alpha: number): void {
    if (!this.state.aiRanges) return

    const enemies = aiQuery(world)
    for (const eid of enemies) {
      const prevX = Position.prevX[eid]!
      const prevY = Position.prevY[eid]!
      const currX = Position.x[eid]!
      const currY = Position.y[eid]!
      const x = prevX + (currX - prevX) * alpha
      const y = prevY + (currY - prevY) * alpha

      const aggroRange = Detection.aggroRange[eid]!
      const attackRange = Detection.attackRange[eid]!
      const aiState = EnemyAI.state[eid]!

      // Aggro range — blue circle
      this.graphics
        .circle(x, y, aggroRange)
        .stroke({ color: 0x4488ff, width: 1, alpha: 0.3 })

      // Attack range — orange circle
      this.graphics
        .circle(x, y, attackRange)
        .stroke({ color: 0xff8800, width: 1, alpha: 0.4 })

      // AI state label
      const stateColor =
        DebugOverlayRenderer.AI_STATE_COLORS[aiState] ?? 0xffffff
      const label = this.getOrCreateLabel()
      label.text = DebugOverlayRenderer.AI_STATE_LABELS[aiState] ?? '???'
      label.style.fill = stateColor
      label.x = x
      label.y = y - (Collider.radius[eid] ?? 8) - 12
      label.anchor.set(0.5, 1)
      label.visible = true

      // Target line
      const targetEid = EnemyAI.targetEid[eid]!
      if (targetEid !== NO_TARGET && hasComponent(world, Position, targetEid)) {
        const tx = Position.x[targetEid]!
        const ty = Position.y[targetEid]!
        this.graphics
          .moveTo(x, y)
          .lineTo(tx, ty)
          .stroke({ color: stateColor, width: 0.5, alpha: 0.3 })
      }
    }
  }

  // ── Text label pool ─────────────────────────────────────────────────

  private getOrCreateLabel(): Text {
    if (this.aiLabelIndex < this.aiLabels.length) {
      return this.aiLabels[this.aiLabelIndex++]!
    }
    const label = new Text({
      text: '',
      style: DebugOverlayRenderer.LABEL_STYLE.clone(),
    })
    this.textContainer.addChild(label)
    this.aiLabels.push(label)
    this.aiLabelIndex++
    return label
  }

  // ── Spawn zone / playable bounds overlay ────────────────────────────

  private renderSpawnZones(): void {
    if (!this.state.spawnZones || !this.playableBounds) return

    const { minX, minY, maxX, maxY } = this.playableBounds
    const w = maxX - minX
    const h = maxY - minY

    // Playable bounds — green rectangle
    this.graphics
      .rect(minX, minY, w, h)
      .stroke({ color: 0x00ff00, width: 1.5, alpha: 0.5 })

    // Spawn margin inset — matches waveSpawner.ts getSpawnBounds() (1.5 tiles)
    const SPAWN_MARGIN = 48
    this.graphics
      .rect(
        minX + SPAWN_MARGIN,
        minY + SPAWN_MARGIN,
        w - SPAWN_MARGIN * 2,
        h - SPAWN_MARGIN * 2,
      )
      .stroke({ color: 0xffff00, width: 1, alpha: 0.3 })

    // Arena center crosshair
    const cx = minX + w / 2
    const cy = minY + h / 2
    const crossSize = 10
    this.graphics
      .moveTo(cx - crossSize, cy)
      .lineTo(cx + crossSize, cy)
      .stroke({ color: 0x00ff00, width: 1, alpha: 0.5 })
    this.graphics
      .moveTo(cx, cy - crossSize)
      .lineTo(cx, cy + crossSize)
      .stroke({ color: 0x00ff00, width: 1, alpha: 0.5 })
  }

  // ── Cleanup ─────────────────────────────────────────────────────────

  destroy(): void {
    this.graphics.destroy()
    this.textContainer.destroy({ children: true })
  }
}
