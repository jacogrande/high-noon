/**
 * Enemy Renderer
 *
 * Renders enemy entities as colored circles based on their type.
 * Tracks enemy creation and removal to sync sprites with the ECS world.
 * Shows AI state visuals: telegraph flash, recovery dim, threat outline.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '@high-noon/shared'
import {
  Enemy, EnemyType, EnemyTier, Position, Collider, EnemyAI, AIState,
  AttackConfig, Health, NO_TARGET,
} from '@high-noon/shared'
import { SpriteRegistry } from './SpriteRegistry'
import type { DebugRenderer } from './DebugRenderer'

/** Flash interval during telegraph state (in sim ticks) */
const TELEGRAPH_FLASH_TICKS = 3
/** Alpha applied during recovery state */
const RECOVERY_ALPHA = 0.6
/** Duration of damage flash in seconds */
const DAMAGE_FLASH_DURATION = 0.1
/** Duration of death effect in seconds */
const DEATH_EFFECT_DURATION = 0.15

/** Colors per enemy type (rendering data, client-only) */
const ENEMY_COLORS: Record<number, number> = {
  [EnemyType.SWARMER]: 0xffaaaa,   // pale pink
  [EnemyType.GRUNT]: 0xff6633,     // red-orange
  [EnemyType.SHOOTER]: 0xaa44dd,   // purple
  [EnemyType.CHARGER]: 0xaa1111,   // dark red
}

/** Death effect data for ephemeral scale-down + fade */
interface DeathEffect {
  eid: number
  timer: number
  duration: number
}

/** Data returned from sync() for particle/camera consumers */
export interface EnemySyncResult {
  deathTrauma: number
  deaths: Array<{ x: number; y: number; color: number; isThreat: boolean }>
  hits: Array<{ x: number; y: number; color: number; amount: number }>
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
  private readonly enemyTypes = new Map<number, number>()
  private readonly lastColor = new Map<number, number>()
  private readonly lastAlpha = new Map<number, number>()
  private readonly currentEntities = new Set<number>()
  private readonly lastHP = new Map<number, number>()
  private readonly damageFlashTimer = new Map<number, number>()
  private readonly deathEffects: DeathEffect[] = []
  /** Reused result object (mutated every sync() call) — consumer must read immediately */
  private readonly syncResult: EnemySyncResult = { deathTrauma: 0, deaths: [], hits: [] }

  constructor(registry: SpriteRegistry, debug?: DebugRenderer) {
    this.registry = registry
    this.debug = debug
  }

  /**
   * Sync sprites with enemy entities.
   * Creates circles for new enemies, removes for dead ones.
   * Returns death trauma and per-death data for particles.
   */
  sync(world: GameWorld): EnemySyncResult {
    const result = this.syncResult
    result.deathTrauma = 0
    result.deaths.length = 0
    result.hits.length = 0

    const enemies = enemyRenderQuery(world)

    // Track which entities exist this frame
    const currentEntities = this.currentEntities
    currentEntities.clear()

    for (const eid of enemies) {
      currentEntities.add(eid)

      if (!this.enemyEntities.has(eid)) {
        // Create sprite for new enemy
        const type = Enemy.type[eid]!
        const color = ENEMY_COLORS[type] ?? 0xff0000
        const radius = Collider.radius[eid]!
        this.registry.createCircle(eid, radius, color)
        this.enemyEntities.add(eid)
        this.enemyTiers.set(eid, Enemy.tier[eid]!)
        this.enemyTypes.set(eid, type)
        this.lastHP.set(eid, Health.current[eid]!)
      } else {
        // Detect damage on existing enemies (HP decreased this tick)
        const currentHP = Health.current[eid]!
        const prevHP = this.lastHP.get(eid) ?? currentHP
        if (currentHP < prevHP) {
          this.damageFlashTimer.set(eid, DAMAGE_FLASH_DURATION)
          const cachedType = this.enemyTypes.get(eid)
          const color = cachedType !== undefined ? (ENEMY_COLORS[cachedType] ?? 0xff0000) : 0xff0000
          result.hits.push({ x: Position.x[eid]!, y: Position.y[eid]!, color, amount: prevHP - currentHP })
        }
        this.lastHP.set(eid, currentHP)
      }
    }

    // Remove sprites for dead/removed enemies → start death effect
    for (const eid of this.enemyEntities) {
      if (!currentEntities.has(eid)) {
        const tier = this.enemyTiers.get(eid)
        const isThreat = tier === EnemyTier.THREAT
        result.deathTrauma += isThreat ? 0.08 : 0.02

        // Read position from display object (ECS data may be recycled)
        const displayObj = this.registry.get(eid)
        const cachedType = this.enemyTypes.get(eid)
        const color = cachedType !== undefined ? (ENEMY_COLORS[cachedType] ?? 0xff0000) : 0xff0000
        if (displayObj) {
          result.deaths.push({ x: displayObj.x, y: displayObj.y, color, isThreat })
          const lastHP = this.lastHP.get(eid) ?? 0
          if (lastHP > 0) {
            result.hits.push({ x: displayObj.x, y: displayObj.y, color, amount: lastHP })
          }
        }

        // Start death effect instead of immediate removal
        this.deathEffects.push({ eid, timer: 0, duration: DEATH_EFFECT_DURATION })

        this.enemyEntities.delete(eid)
        this.enemyTiers.delete(eid)
        this.enemyTypes.delete(eid)
        this.lastColor.delete(eid)
        this.lastAlpha.delete(eid)
        this.lastHP.delete(eid)
        this.damageFlashTimer.delete(eid)
      }
    }

    return result
  }

  /**
   * Update enemy sprite positions with interpolation and AI state visuals
   */
  render(world: GameWorld, alpha: number, realDt: number): void {
    for (const eid of this.enemyEntities) {
      if (!hasComponent(world, Enemy, eid)) continue

      const prevX = Position.prevX[eid]!
      const prevY = Position.prevY[eid]!
      const currX = Position.x[eid]!
      const currY = Position.y[eid]!

      let renderX = prevX + (currX - prevX) * alpha
      let renderY = prevY + (currY - prevY) * alpha

      // AI state visuals
      const state = EnemyAI.state[eid]!
      const type = Enemy.type[eid]!
      const tier = Enemy.tier[eid]!
      const normalColor = ENEMY_COLORS[type] ?? 0xff0000

      let color = normalColor
      let a = 1.0

      // Damage flash timer (set by sync() on HP decrease)
      const flashTimer = this.damageFlashTimer.get(eid) ?? 0
      if (flashTimer > 0) {
        color = 0xff0000
        this.damageFlashTimer.set(eid, flashTimer - realDt)
      }

      // State-based visuals (telegraph flash overrides damage flash)
      if (state === AIState.TELEGRAPH) {
        color = Math.floor(world.tick / TELEGRAPH_FLASH_TICKS) % 2 === 0 ? 0xffffff : normalColor
      } else if (state === AIState.RECOVERY) {
        a = RECOVERY_ALPHA
      }

      // Charger telegraph vibration
      if (type === EnemyType.CHARGER && state === AIState.TELEGRAPH) {
        const jitter = 2
        renderX += Math.sin(world.tick * 1.5) * jitter
        renderY += Math.cos(world.tick * 2.1) * jitter
      }

      // Charger attack stretch
      if (type === EnemyType.CHARGER && state === AIState.ATTACK) {
        const aimX = AttackConfig.aimX[eid]!
        const aimY = AttackConfig.aimY[eid]!
        const angle = Math.atan2(aimY, aimX)
        this.registry.setRotation(eid, angle)
        this.registry.setScale(eid, 1.4, 0.7)
      } else {
        this.registry.setRotation(eid, 0)
        this.registry.setScale(eid, 1, 1)
      }

      this.registry.setPosition(eid, renderX, renderY)

      // Spawn ghost: multiply alpha during initialDelay (composes with state alpha)
      const delay = EnemyAI.initialDelay[eid]!
      if (delay > 0) {
        a *= Math.max(0.5, 1.0 - delay)
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

      // Shooter telegraph aim indicator
      if (type === EnemyType.SHOOTER && state === AIState.TELEGRAPH && this.debug) {
        const targetEid = EnemyAI.targetEid[eid]!
        if (targetEid !== NO_TARGET) {
          const tx = Position.x[targetEid]!
          const ty = Position.y[targetEid]!
          this.debug.line(renderX, renderY, tx, ty, 0xff0000, 1)
        }
      }
    }

    // Animate death effects
    for (let i = this.deathEffects.length - 1; i >= 0; i--) {
      const effect = this.deathEffects[i]!
      effect.timer += realDt
      const t = Math.min(effect.timer / effect.duration, 1)

      // Scale down and fade
      const scale = 1 - t
      const effectAlpha = 1 - t
      this.registry.setScale(effect.eid, scale, scale)
      this.registry.setAlpha(effect.eid, effectAlpha)

      if (t >= 1) {
        this.registry.remove(effect.eid)
        this.deathEffects.splice(i, 1)
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
    for (const effect of this.deathEffects) {
      this.registry.remove(effect.eid)
    }
    this.deathEffects.length = 0
    this.enemyEntities.clear()
    this.enemyTiers.clear()
    this.enemyTypes.clear()
    this.lastColor.clear()
    this.lastAlpha.clear()
    this.lastHP.clear()
    this.damageFlashTimer.clear()
    this.currentEntities.clear()
  }
}
