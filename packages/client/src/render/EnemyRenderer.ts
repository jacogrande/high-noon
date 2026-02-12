/**
 * Enemy Renderer
 *
 * Renders enemy entities as colored circles or animated sprites based on type.
 * Tracks enemy creation and removal to sync sprites with the ECS world.
 * Shows AI state visuals: telegraph flash, recovery dim, threat outline.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '@high-noon/shared'
import {
  Enemy, EnemyType, EnemyTier, Position, Velocity, Collider, EnemyAI, AIState,
  AttackConfig, Health, NO_TARGET,
} from '@high-noon/shared'
import { SpriteRegistry } from './SpriteRegistry'
import type { DebugRenderer } from './DebugRenderer'
import { AssetLoader } from '../assets/AssetLoader'
import {
  angleToDirection,
  getEnemyAnimationFrame,
  type Direction,
  type EnemyAnimationState,
} from '../assets/animations'

/** Flash interval during telegraph state (in sim ticks) */
const TELEGRAPH_FLASH_TICKS = 3
/** Alpha applied during recovery state */
const RECOVERY_ALPHA = 0.6
/** Duration of damage flash in seconds */
const DAMAGE_FLASH_DURATION = 0.1
/** Duration of death effect for circle enemies in seconds */
const DEATH_EFFECT_DURATION = 0.15
/** Duration of death animation for sprite enemies (3 frames at 8fps) */
const SPRITE_DEATH_DURATION = 3 / 8
/** Duration of spawn effect in seconds */
const SPAWN_EFFECT_DURATION = 0.5
/** Sprite scale for goblin enemies */
const GOBLIN_SPRITE_SCALE = 2
/** Default enemy health bar dimensions (world-space px) */
const ENEMY_BAR_MIN_WIDTH = 20
const ENEMY_BAR_HEIGHT = 4
/** Boomstick keeps a larger health bar for readability */
const BOSS_BAR_WIDTH = 44
const BOSS_BAR_HEIGHT = 6
/** Vertical offset above smaller enemies */
const ENEMY_BAR_Y_PADDING = 10
/** Vertical offset above Boomstick origin */
const BOSS_BAR_Y_OFFSET = 30
/** Synthetic SpriteRegistry ID offsets for enemy health bar graphics */
const ENEMY_BAR_BG_ID_OFFSET = 20000
const ENEMY_BAR_FILL_ID_OFFSET = 30000

/** Colors per enemy type (rendering data, client-only) */
const ENEMY_COLORS: Record<number, number> = {
  [EnemyType.SWARMER]: 0xffaaaa,          // pale pink
  [EnemyType.GRUNT]: 0xff6633,            // red-orange
  [EnemyType.SHOOTER]: 0xaa44dd,          // purple
  [EnemyType.CHARGER]: 0xaa1111,          // dark red
  [EnemyType.BOOMSTICK]: 0xffcc33,       // showman gold
  [EnemyType.GOBLIN_BARBARIAN]: 0x44aa44, // forest green
  [EnemyType.GOBLIN_ROGUE]: 0x66cc66,     // light green
}

/** Enemy type → sprite sheet ID (only for sprite-based enemies) */
const ENEMY_SPRITE_ID: Partial<Record<number, string>> = {
  [EnemyType.GOBLIN_BARBARIAN]: 'goblin_barbarian',
  [EnemyType.GOBLIN_ROGUE]: 'goblin_rogue',
}

function isSpriteEnemy(type: number): boolean {
  return ENEMY_SPRITE_ID[type] !== undefined
}

function getEnemyBarBgId(eid: number): number {
  return ENEMY_BAR_BG_ID_OFFSET + eid
}

function getEnemyBarFillId(eid: number): number {
  return ENEMY_BAR_FILL_ID_OFFSET + eid
}

function getEnemyBarWidth(type: number, radius: number): number {
  if (type === EnemyType.BOOMSTICK) return BOSS_BAR_WIDTH
  return Math.max(ENEMY_BAR_MIN_WIDTH, radius * 2 + 6)
}

function getEnemyBarHeight(type: number): number {
  return type === EnemyType.BOOMSTICK ? BOSS_BAR_HEIGHT : ENEMY_BAR_HEIGHT
}

function getEnemyBarYOffset(type: number, radius: number): number {
  if (type === EnemyType.BOOMSTICK) return BOSS_BAR_Y_OFFSET
  if (isSpriteEnemy(type)) return radius * GOBLIN_SPRITE_SCALE + ENEMY_BAR_Y_PADDING
  return radius + ENEMY_BAR_Y_PADDING
}

/** Green -> red health gradient for enemy health bars */
function getHealthBarColor(ratio: number): number {
  const t = Math.max(0, Math.min(1, ratio))
  const r = Math.floor(255 * (1 - t))
  const g = Math.floor(210 * t)
  const b = 40
  return (r << 16) | (g << 8) | b
}

/** Death effect data for ephemeral scale-down + fade */
interface DeathEffect {
  eid: number
  timer: number
  duration: number
  isSpriteEnemy: boolean
  spriteId: string
  direction: Direction
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
 * Enemy renderer - manages enemy visual representation
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
  /** Lowest HP for which we've emitted a damage number. Prevents duplicates
   *  when server confirms optimistic prediction damage. */
  private readonly hpWatermark = new Map<number, number>()
  private readonly damageFlashTimer = new Map<number, number>()
  private readonly spawnTimer = new Map<number, number>()
  private readonly lastDirection = new Map<number, Direction>()
  /** Tracks enemy IDs that currently have enemy health bar sprites */
  private readonly healthBars = new Set<number>()
  private readonly healthBarWidths = new Map<number, number>()
  private readonly healthBarYOffsets = new Map<number, number>()
  private readonly deathEffects: DeathEffect[] = []
  /** Reused result object (mutated every sync() call) — consumer must read immediately */
  private readonly syncResult: EnemySyncResult = { deathTrauma: 0, deaths: [], hits: [] }
  /** Entity ID of the Showdown-marked target (set by GameScene each tick) */
  showdownTargetEid: number = NO_TARGET
  /** Active Last Rites zone for enemy tinting (set by scene controller each tick). */
  lastRitesZone: { x: number; y: number; radius: number } | null = null

  constructor(registry: SpriteRegistry, debug?: DebugRenderer) {
    this.registry = registry
    this.debug = debug
  }

  /**
   * Sync sprites with enemy entities.
   * Creates circles/sprites for new enemies, removes for dead ones.
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

        if (isSpriteEnemy(type)) {
          const spriteId = ENEMY_SPRITE_ID[type]!
          const texture = AssetLoader.getEnemyTexture(spriteId, 'idle', 'S', 0)
          this.registry.createSprite(eid, texture)
          this.registry.setScale(eid, GOBLIN_SPRITE_SCALE, GOBLIN_SPRITE_SCALE)
          this.lastDirection.set(eid, 'S')
        } else {
          const radius = Collider.radius[eid]!
          this.registry.createCircle(eid, radius, color)
        }

        const radius = Collider.radius[eid]!
        const barWidth = getEnemyBarWidth(type, radius)
        const barHeight = getEnemyBarHeight(type)
        const barYOffset = getEnemyBarYOffset(type, radius)
        const bgId = getEnemyBarBgId(eid)
        const fillId = getEnemyBarFillId(eid)
        this.registry.createRect(bgId, barWidth, barHeight, 0x111111)
        this.registry.createRect(fillId, barWidth, barHeight, getHealthBarColor(1))
        this.healthBars.add(eid)
        this.healthBarWidths.set(eid, barWidth)
        this.healthBarYOffsets.set(eid, barYOffset)

        this.enemyEntities.add(eid)
        this.enemyTiers.set(eid, Enemy.tier[eid]!)
        this.enemyTypes.set(eid, type)
        const spawnHP = Health.current[eid]!
        this.lastHP.set(eid, spawnHP)
        this.hpWatermark.set(eid, spawnHP)
        this.spawnTimer.set(eid, SPAWN_EFFECT_DURATION)
      } else {
        // Watermark-based damage detection (multiplayer-safe).
        //
        // hpWatermark tracks the lowest HP we've already emitted a damage
        // number for.  We only emit when HP drops to a NEW all-time low,
        // preventing duplicates from the prediction → server-correction →
        // server-confirm cycle.
        //
        // IMPORTANT: we only evaluate when HP actually changed (gates out
        // redundant high-FPS render frames that would otherwise fool the
        // two-change watermark reset).
        //
        // If HP is above the watermark for two consecutive *HP changes*
        // (i.e. the server sustained its correction across two separate
        // snapshots), we reset the watermark so future real damage is shown.
        const currentHP = Health.current[eid]!
        const prevHP = this.lastHP.get(eid) ?? currentHP

        if (currentHP !== prevHP) {
          let watermark = this.hpWatermark.get(eid) ?? currentHP

          if (currentHP < watermark) {
            // New all-time low — genuine damage
            this.damageFlashTimer.set(eid, DAMAGE_FLASH_DURATION)
            const cachedType = this.enemyTypes.get(eid)
            const color = cachedType !== undefined ? (ENEMY_COLORS[cachedType] ?? 0xff0000) : 0xff0000
            result.hits.push({ x: Position.x[eid]!, y: Position.y[eid]!, color, amount: watermark - currentHP })
            this.hpWatermark.set(eid, currentHP)
          } else if (currentHP > watermark && prevHP > watermark) {
            // Two consecutive HP changes both above watermark — the server
            // has sustained its correction, so accept it.
            this.hpWatermark.set(eid, currentHP)
          }

          this.lastHP.set(eid, currentHP)
        }
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
          // Emit final damage for any unshown HP (killing blow)
          const watermark = this.hpWatermark.get(eid) ?? 0
          if (watermark > 0) {
            result.hits.push({ x: displayObj.x, y: displayObj.y, color, amount: watermark })
          }
          result.deaths.push({ x: displayObj.x, y: displayObj.y, color, isThreat })
        }

        const isSprite = cachedType !== undefined && isSpriteEnemy(cachedType)
        const spriteId = cachedType !== undefined ? (ENEMY_SPRITE_ID[cachedType] ?? '') : ''
        const dir = this.lastDirection.get(eid) ?? 'S'

        // Start death effect instead of immediate removal
        this.deathEffects.push({
          eid,
          timer: 0,
          duration: isSprite ? SPRITE_DEATH_DURATION : DEATH_EFFECT_DURATION,
          isSpriteEnemy: isSprite,
          spriteId,
          direction: dir,
        })

        this.enemyEntities.delete(eid)
        this.enemyTiers.delete(eid)
        this.enemyTypes.delete(eid)
        this.lastColor.delete(eid)
        this.lastAlpha.delete(eid)
        this.lastHP.delete(eid)
        this.hpWatermark.delete(eid)
        this.damageFlashTimer.delete(eid)
        this.spawnTimer.delete(eid)
        this.lastDirection.delete(eid)

        if (this.healthBars.has(eid)) {
          this.registry.remove(getEnemyBarBgId(eid))
          this.registry.remove(getEnemyBarFillId(eid))
          this.healthBars.delete(eid)
          this.healthBarWidths.delete(eid)
          this.healthBarYOffsets.delete(eid)
        }
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
      const isSprite = isSpriteEnemy(type)

      let color = normalColor
      let tint = 0xffffff
      let a = 1.0

      // Last Rites zone tint (enemies inside zone get purple tint).
      if (this.lastRitesZone) {
        const zdx = currX - this.lastRitesZone.x
        const zdy = currY - this.lastRitesZone.y
        if (zdx * zdx + zdy * zdy <= this.lastRitesZone.radius * this.lastRitesZone.radius) {
          color = 0x9944cc
        }
      }

      // Showdown target tint (persistent, overridden by damage flash / telegraph)
      if (eid === this.showdownTargetEid) {
        if (isSprite) {
          tint = 0xff4444
        } else {
          color = 0xff4444
        }
      }

      // Damage flash timer (set by sync() on HP decrease)
      const flashTimer = this.damageFlashTimer.get(eid) ?? 0
      if (flashTimer > 0) {
        if (isSprite) {
          tint = 0xff0000
        } else {
          color = 0xff0000
        }
        this.damageFlashTimer.set(eid, flashTimer - realDt)
      }

      // State-based visuals (telegraph flash overrides damage flash)
      if (state === AIState.TELEGRAPH) {
        const isWhite = Math.floor(world.tick / TELEGRAPH_FLASH_TICKS) % 2 === 0
        if (isSprite) {
          tint = isWhite ? 0xffffff : 0xff4444
        } else {
          color = isWhite ? 0xffffff : normalColor
        }
      } else if (state === AIState.RECOVERY) {
        a = RECOVERY_ALPHA
      }

      // Sprite-based enemy rendering
      if (isSprite) {
        const spriteId = ENEMY_SPRITE_ID[type]!
        const vx = Velocity.x[eid]!
        const vy = Velocity.y[eid]!

        // Determine facing direction
        let dir: Direction
        if (state === AIState.CHASE) {
          // Use velocity direction while chasing
          if (vx * vx + vy * vy > 1) {
            dir = angleToDirection(Math.atan2(vy, vx))
          } else {
            dir = this.lastDirection.get(eid) ?? 'S'
          }
        } else if (state === AIState.TELEGRAPH || state === AIState.ATTACK) {
          // Face toward target during telegraph/attack
          const targetEid = EnemyAI.targetEid[eid]!
          if (targetEid !== NO_TARGET) {
            const dx = Position.x[targetEid]! - currX
            const dy = Position.y[targetEid]! - currY
            dir = angleToDirection(Math.atan2(dy, dx))
          } else {
            dir = this.lastDirection.get(eid) ?? 'S'
          }
        } else {
          // Idle / recovery / stunned: keep last direction
          dir = this.lastDirection.get(eid) ?? 'S'
        }
        this.lastDirection.set(eid, dir)

        // Determine animation state
        let animState: EnemyAnimationState
        if (state === AIState.CHASE) {
          animState = 'walk'
        } else if (state === AIState.TELEGRAPH) {
          animState = 'attack' // hold frame 0
        } else if (state === AIState.ATTACK) {
          animState = 'attack'
        } else {
          animState = 'idle'
        }

        // Get frame
        let frame: number
        if (state === AIState.TELEGRAPH) {
          frame = 0 // hold first attack frame during telegraph
        } else {
          frame = getEnemyAnimationFrame(animState, world.tick)
        }

        // Update texture
        const texture = AssetLoader.getEnemyTexture(spriteId, animState, dir, frame)
        this.registry.setTexture(eid, texture)

        // Handle mirroring and scale
        let scaleX = GOBLIN_SPRITE_SCALE
        const scaleY = GOBLIN_SPRITE_SCALE
        if (dir === 'W') {
          scaleX = -GOBLIN_SPRITE_SCALE // flip horizontally
        }

        // Spawn effect: scale up + white flash over 0.5s
        const spawnRemaining = this.spawnTimer.get(eid) ?? 0
        if (spawnRemaining > 0) {
          const t = 1 - spawnRemaining / SPAWN_EFFECT_DURATION
          const ease = t * t
          this.registry.setScale(eid, scaleX * ease, scaleY * ease)
          if (t < 0.5) tint = 0xffffff
          this.spawnTimer.set(eid, spawnRemaining - realDt)
        } else {
          this.registry.setScale(eid, scaleX, scaleY)
        }

        this.registry.setPosition(eid, renderX, renderY)

        // Spawn ghost alpha during initialDelay
        const delay = EnemyAI.initialDelay[eid]!
        if (delay > 0) {
          a *= Math.max(0.5, 1.0 - delay)
        }

        // Update tint and alpha
        this.registry.setTint(eid, tint)
        if (a !== this.lastAlpha.get(eid)) {
          this.registry.setAlpha(eid, a)
          this.lastAlpha.set(eid, a)
        }

        this.updateEnemyHealthBar(eid, renderX, renderY, a)

        continue // skip circle rendering path
      }

      // Circle-based enemy rendering (swarmer, grunt, shooter, charger)

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

      // Spawn effect: scale up + white flash over 0.5s
      const spawnRemaining = this.spawnTimer.get(eid) ?? 0
      if (spawnRemaining > 0) {
        const t = 1 - spawnRemaining / SPAWN_EFFECT_DURATION // 0→1
        const scale = t * t // ease-in quadratic
        this.registry.setScale(eid, scale, scale)
        color = t < 0.5 ? 0xffffff : color
        this.spawnTimer.set(eid, spawnRemaining - realDt)
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

      this.updateEnemyHealthBar(eid, renderX, renderY, a)

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

      if (effect.isSpriteEnemy && effect.spriteId) {
        // Sprite death: play death animation frames with fade in last 20%
        const deathFrameCount = 3
        const frame = Math.min(Math.floor(t * deathFrameCount), deathFrameCount - 1)
        const texture = AssetLoader.getEnemyTexture(effect.spriteId, 'death', effect.direction, frame)
        this.registry.setTexture(effect.eid, texture)

        // Fade in the last 20% of the animation
        const fadeStart = 0.8
        const effectAlpha = t > fadeStart ? 1 - (t - fadeStart) / (1 - fadeStart) : 1
        this.registry.setAlpha(effect.eid, effectAlpha)
      } else {
        // Circle death: scale down and fade
        const scale = 1 - t
        const effectAlpha = 1 - t
        this.registry.setScale(effect.eid, scale, scale)
        this.registry.setAlpha(effect.eid, effectAlpha)
      }

      if (t >= 1) {
        this.registry.remove(effect.eid)
        this.deathEffects.splice(i, 1)
      }
    }
  }

  private updateEnemyHealthBar(eid: number, renderX: number, renderY: number, alpha: number): void {
    if (!this.healthBars.has(eid)) return

    const bgId = getEnemyBarBgId(eid)
    const fillId = getEnemyBarFillId(eid)
    const barWidth = this.healthBarWidths.get(eid) ?? ENEMY_BAR_MIN_WIDTH
    const yOffset = this.healthBarYOffsets.get(eid) ?? ENEMY_BAR_Y_PADDING

    const hp = Health.current[eid]!
    const maxHP = Math.max(1, Health.max[eid]!)
    const ratio = Math.max(0, Math.min(1, hp / maxHP))
    const barY = renderY - yOffset

    this.registry.setPosition(bgId, renderX, barY)
    this.registry.setAlpha(bgId, alpha * 0.9)

    const scaledWidth = barWidth * ratio
    const leftEdgeX = renderX - barWidth / 2
    const fillCenterX = leftEdgeX + scaledWidth / 2
    this.registry.setScale(fillId, ratio, 1)
    this.registry.setPosition(fillId, fillCenterX, barY)
    this.registry.setColor(fillId, getHealthBarColor(ratio))
    this.registry.setAlpha(fillId, alpha)
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
    this.hpWatermark.clear()
    this.damageFlashTimer.clear()
    this.spawnTimer.clear()
    this.lastDirection.clear()
    this.currentEntities.clear()

    for (const eid of this.healthBars) {
      this.registry.remove(getEnemyBarBgId(eid))
      this.registry.remove(getEnemyBarFillId(eid))
    }
    this.healthBars.clear()
    this.healthBarWidths.clear()
    this.healthBarYOffsets.clear()
  }
}
