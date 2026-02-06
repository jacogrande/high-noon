/**
 * Enemy Renderer
 *
 * Renders enemy entities as colored circles based on their type.
 * Tracks enemy creation and removal to sync sprites with the ECS world.
 * Shows AI state visuals: telegraph flash, recovery dim, threat outline.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '@high-noon/shared'
import { Enemy, EnemyType, EnemyTier, Position, Collider, EnemyAI, AIState } from '@high-noon/shared'
import { SpriteRegistry } from './SpriteRegistry'
import type { DebugRenderer } from './DebugRenderer'

/** Flash interval during telegraph state (in sim ticks) */
const TELEGRAPH_FLASH_TICKS = 3
/** Alpha applied during recovery state */
const RECOVERY_ALPHA = 0.6

/** Colors per enemy type (rendering data, client-only) */
const ENEMY_COLORS: Record<number, number> = {
  [EnemyType.SWARMER]: 0xffaaaa,   // pale pink
  [EnemyType.GRUNT]: 0xff6633,     // red-orange
  [EnemyType.SHOOTER]: 0xaa44dd,   // purple
  [EnemyType.CHARGER]: 0xaa1111,   // dark red
}

// Define query for enemy entities with rendering components
const enemyRenderQuery = defineQuery([Enemy, Position, Collider])

/**
 * Enemy renderer - manages enemy visual representation as colored circles
 */
export class EnemyRenderer {
  private readonly registry: SpriteRegistry
  private readonly debug: DebugRenderer | undefined
  private readonly enemyEntities = new Set<number>()
  private readonly enemyTiers = new Map<number, number>()
  private readonly lastColor = new Map<number, number>()
  private readonly lastAlpha = new Map<number, number>()
  private readonly currentEntities = new Set<number>()

  constructor(registry: SpriteRegistry, debug?: DebugRenderer) {
    this.registry = registry
    this.debug = debug
  }

  /**
   * Sync sprites with enemy entities.
   * Creates circles for new enemies, removes for dead ones.
   * Returns accumulated death trauma for camera shake.
   */
  sync(world: GameWorld): number {
    const enemies = enemyRenderQuery(world)
    let deathTrauma = 0

    // Track which entities exist this frame
    const currentEntities = this.currentEntities
    currentEntities.clear()

    for (const eid of enemies) {
      currentEntities.add(eid)

      // Create sprite if doesn't exist
      if (!this.enemyEntities.has(eid)) {
        const type = Enemy.type[eid]!
        const color = ENEMY_COLORS[type] ?? 0xff0000
        const radius = Collider.radius[eid]!
        this.registry.createCircle(eid, radius, color)
        this.enemyEntities.add(eid)
        this.enemyTiers.set(eid, Enemy.tier[eid]!)
      }
    }

    // Remove sprites for dead/removed enemies
    for (const eid of this.enemyEntities) {
      if (!currentEntities.has(eid)) {
        const tier = this.enemyTiers.get(eid)
        deathTrauma += tier === EnemyTier.THREAT ? 0.08 : 0.02
        this.registry.remove(eid)
        this.enemyEntities.delete(eid)
        this.enemyTiers.delete(eid)
        this.lastColor.delete(eid)
        this.lastAlpha.delete(eid)
      }
    }

    return deathTrauma
  }

  /**
   * Update enemy sprite positions with interpolation and AI state visuals
   */
  render(world: GameWorld, alpha: number): void {
    for (const eid of this.enemyEntities) {
      if (!hasComponent(world, Enemy, eid)) continue

      const prevX = Position.prevX[eid]!
      const prevY = Position.prevY[eid]!
      const currX = Position.x[eid]!
      const currY = Position.y[eid]!

      const renderX = prevX + (currX - prevX) * alpha
      const renderY = prevY + (currY - prevY) * alpha

      this.registry.setPosition(eid, renderX, renderY)

      // AI state visuals
      const state = EnemyAI.state[eid]!
      const type = Enemy.type[eid]!
      const tier = Enemy.tier[eid]!
      const normalColor = ENEMY_COLORS[type] ?? 0xff0000

      let color = normalColor
      let a = 1.0

      if (state === AIState.TELEGRAPH) {
        color = Math.floor(world.tick / TELEGRAPH_FLASH_TICKS) % 2 === 0 ? 0xffffff : normalColor
      } else if (state === AIState.RECOVERY) {
        a = RECOVERY_ALPHA
      }

      // Only update Graphics when value actually changes
      if (color !== this.lastColor.get(eid)) {
        this.registry.setColor(eid, color)
        this.lastColor.set(eid, color)
      }
      if (a !== this.lastAlpha.get(eid)) {
        this.registry.setAlpha(eid, a)
        this.lastAlpha.set(eid, a)
      }

      // Threat-tier outline ring
      if (tier === EnemyTier.THREAT && this.debug) {
        this.debug.circleOutline(renderX, renderY, Collider.radius[eid]! + 3, 0xffff00, 1.5)
      }
    }
  }

  /**
   * Get current enemy count
   */
  get count(): number {
    return this.enemyEntities.size
  }

  /**
   * Clean up all enemy sprites
   */
  destroy(): void {
    for (const eid of this.enemyEntities) {
      this.registry.remove(eid)
    }
    this.enemyEntities.clear()
    this.enemyTiers.clear()
    this.lastColor.clear()
    this.lastAlpha.clear()
    this.currentEntities.clear()
  }
}
