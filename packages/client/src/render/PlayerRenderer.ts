/**
 * Player Renderer
 *
 * Renders player entities using a Container hierarchy per player:
 *   container (sortableChildren)
 *     ├── bodySprite (zIndex: 0) — animated character sprite
 *     └── weaponPivot (zIndex: ±1) — rotates to aimAngle
 *           └── weaponSprite — weapon texture, anchor at grip
 *
 * Visual feedback for different states:
 * - Normal: Full opacity
 * - Rolling (i-frames): Semi-transparent
 * - Hurt: Red damage flash
 * - Death: One-shot death animation
 */

import { defineQuery, hasComponent } from 'bitecs'
import { Container, Sprite } from 'pixi.js'
import type { GameWorld } from '@high-noon/shared'
import {
  Player,
  Position,
  Collider,
  PlayerState,
  PlayerStateType,
  Invincible,
  Health,
  Dead,
  REVOLVER_SPRITE,
} from '@high-noon/shared'
import {
  AssetLoader,
  angleToDirection,
  getAnimationFrame,
  ANIMATION_SPEEDS,
  ANIMATION_FRAME_COUNTS,
  type AnimationState,
} from '../assets'

/** Alpha values */
const ALPHA_NORMAL = 1.0
const ALPHA_INVINCIBLE = 0.5

/** Current weapon visual data */
const WEAPON = REVOLVER_SPRITE
const KICK_DECAY = 0.85
const KICK_EPSILON = 0.1

/** Player body sprite scale */
const BODY_SCALE = 2
const WEAPON_SCALE = BODY_SCALE * WEAPON.scale

/** Per-player visual state */
interface PlayerVisuals {
  container: Container
  bodySprite: Sprite
  weaponPivot: Container
  weaponSprite: Sprite
  kickOffset: number
  deathStartTime: number | null
}

// Define query for player entities with rendering components
const playerRenderQuery = defineQuery([Player, Position, Collider])
const playerPositionQuery = defineQuery([Player, Position])

/**
 * Player renderer - manages player visual representation
 */
export class PlayerRenderer {
  private readonly entityLayer: Container
  private readonly players = new Map<number, PlayerVisuals>()
  private playerEntity: number | null = null

  /** Set to identify the local player for visual differentiation. */
  localPlayerEid: number | null = null

  /** Monotonic tick for local player animation (avoids snapshot tick jitter). */
  localPlayerTick = 0

  constructor(entityLayer: Container) {
    this.entityLayer = entityLayer
  }

  /**
   * Sync sprites with player entities.
   * Creates Container hierarchy for new players, removes for despawned ones.
   */
  sync(world: GameWorld): void {
    const entities = playerRenderQuery(world)
    const activeEntities = new Set<number>()

    for (const eid of entities) {
      activeEntities.add(eid)

      if (!this.players.has(eid)) {
        // Build container hierarchy
        const container = new Container()
        container.sortableChildren = true

        // Body sprite — character animation
        const bodyTexture = AssetLoader.getPlayerTexture('idle', 'E', 0)
        const bodySprite = new Sprite(bodyTexture)
        bodySprite.anchor.set(0.5, 0.5)
        bodySprite.scale.set(BODY_SCALE)
        bodySprite.zIndex = 0
        container.addChild(bodySprite)

        // Weapon pivot — positioned at grip offset, rotates to aimAngle
        const weaponPivot = new Container()
        weaponPivot.position.set(WEAPON.gripOffset.x, WEAPON.gripOffset.y)
        weaponPivot.zIndex = 1 // in front by default

        // Weapon sprite — anchor at left-center (grip point)
        const weaponTexture = AssetLoader.getWeaponTexture(WEAPON.sprite)
        const weaponSprite = new Sprite(weaponTexture)
        weaponSprite.anchor.set(0, 0.5)
        weaponSprite.scale.set(WEAPON_SCALE)
        weaponPivot.addChild(weaponSprite)

        container.addChild(weaponPivot)
        this.entityLayer.addChild(container)

        this.players.set(eid, {
          container,
          bodySprite,
          weaponPivot,
          weaponSprite,
          kickOffset: 0,
          deathStartTime: null,
        })
        if (this.playerEntity === null) {
          this.playerEntity = eid
        }
      }
    }

    // Remove visuals for entities that no longer exist
    for (const [eid, visuals] of this.players) {
      if (!activeEntities.has(eid)) {
        this.entityLayer.removeChild(visuals.container)
        visuals.container.destroy({ children: true })
        this.players.delete(eid)
        if (eid === this.playerEntity) {
          this.playerEntity = null
        }
      }
    }
  }

  /**
   * Trigger weapon recoil for a player entity.
   */
  triggerRecoil(eid: number): void {
    const visuals = this.players.get(eid)
    if (visuals) {
      visuals.kickOffset = -WEAPON.kickDistance
    }
  }

  /**
   * Update player sprite positions with interpolation.
   * Also updates visual appearance based on player state.
   */
  render(world: GameWorld, alpha: number, realDt: number): void {
    const entities = playerPositionQuery(world)

    for (const eid of entities) {
      const visuals = this.players.get(eid)
      if (!visuals) continue

      const { container, bodySprite, weaponPivot, weaponSprite } = visuals

      // Interpolate between previous and current position
      const prevX = Position.prevX[eid]!
      const prevY = Position.prevY[eid]!
      const currX = Position.x[eid]!
      const currY = Position.y[eid]!

      const renderX = prevX + (currX - prevX) * alpha
      const renderY = prevY + (currY - prevY) * alpha

      container.position.set(renderX, renderY)

      // Determine animation state and direction
      const playerState = PlayerState.state[eid]!
      const aimAngle = Player.aimAngle[eid]!
      const isInvincible = hasComponent(world, Invincible, eid)
      const isDead = hasComponent(world, Dead, eid)

      const isHurt = !isDead && hasComponent(world, Health, eid) && Health.iframes[eid]! > 0
      let animState: AnimationState
      if (isDead) {
        animState = 'death'
      } else if (isHurt) {
        animState = 'hurt'
      } else if (playerState === PlayerStateType.ROLLING) {
        animState = 'roll'
      } else if (playerState === PlayerStateType.MOVING) {
        animState = 'walk'
      } else {
        animState = 'idle'
      }

      // Get 4-way direction from aim angle
      const direction = angleToDirection(aimAngle)
      const needsMirror = direction === 'W'

      // Get animation frame
      let frame: number
      if (isDead) {
        if (visuals.deathStartTime === null) {
          visuals.deathStartTime = performance.now()
        }
        const elapsedSec = (performance.now() - visuals.deathStartTime) / 1000
        const fps = ANIMATION_SPEEDS.death
        frame = Math.min(
          Math.floor(elapsedSec * fps),
          ANIMATION_FRAME_COUNTS.death - 1
        )
      } else if (isHurt) {
        const elapsed = Health.iframeDuration[eid]! - Health.iframes[eid]!
        const elapsedTicks = elapsed * 60
        const ticksPerFrame = 60 / ANIMATION_SPEEDS.hurt
        frame = Math.min(
          Math.floor(elapsedTicks / ticksPerFrame),
          ANIMATION_FRAME_COUNTS.hurt - 1
        )
      } else {
        const tick = this.localPlayerEid !== null && eid === this.localPlayerEid
          ? this.localPlayerTick
          : world.tick
        frame = getAnimationFrame(animState, tick)
      }

      // Update body sprite texture
      const texture = AssetLoader.getPlayerTexture(animState, direction, frame)
      bodySprite.texture = texture

      // Flip body sprite for west direction
      bodySprite.scale.x = needsMirror ? -BODY_SCALE : BODY_SCALE

      // --- Weapon rotation, flip, and depth ---
      weaponPivot.rotation = aimAngle

      // Flip weapon vertically when aiming left (|angle| > PI/2)
      const aimingLeft = Math.abs(aimAngle) > Math.PI / 2
      weaponSprite.scale.y = aimingLeft ? -WEAPON_SCALE : WEAPON_SCALE

      // Depth swap: weapon behind body when aiming up
      const aimingUp = aimAngle < -Math.PI / 4 && aimAngle > -3 * Math.PI / 4
      weaponPivot.zIndex = aimingUp ? -1 : 1

      // --- Weapon recoil (framerate-independent via realDt) ---
      if (Math.abs(visuals.kickOffset) > KICK_EPSILON) {
        visuals.kickOffset *= Math.pow(KICK_DECAY, realDt * 60)
      } else {
        visuals.kickOffset = 0
      }
      weaponSprite.x = visuals.kickOffset

      // Hide weapon during roll and death
      const hideWeapon = isDead || playerState === PlayerStateType.ROLLING
      weaponPivot.visible = !hideWeapon

      // --- Container-level visual effects ---
      // Alpha: invincibility
      if (!isDead && isInvincible) {
        container.alpha = ALPHA_INVINCIBLE
      } else {
        container.alpha = ALPHA_NORMAL
      }

      // Remote player tint (multiplayer) + damage flash
      const isRemote = this.localPlayerEid !== null && eid !== this.localPlayerEid && !isDead
      const baseTint = isRemote ? 0x88BBFF : 0xFFFFFF

      if (!isDead && hasComponent(world, Health, eid) && Health.iframes[eid]! > 0) {
        const flashTick = this.localPlayerEid !== null && eid === this.localPlayerEid
          ? this.localPlayerTick
          : world.tick
        const flash = Math.floor(flashTick / 3) % 2 === 0
        bodySprite.tint = flash ? 0xFF4444 : baseTint
        weaponSprite.tint = flash ? 0xFF4444 : baseTint
      } else {
        bodySprite.tint = baseTint
        weaponSprite.tint = baseTint
      }
    }
  }

  /**
   * Get the world-space barrel tip position for a player entity.
   * Returns null if the player has no visuals or weapon is hidden.
   */
  getBarrelTipPosition(eid: number): { x: number; y: number } | null {
    const visuals = this.players.get(eid)
    if (!visuals || !visuals.weaponPivot.visible) return null

    const aimAngle = Player.aimAngle[eid]!
    const cos = Math.cos(aimAngle)
    const sin = Math.sin(aimAngle)

    const btx = WEAPON.barrelTip.x
    const bty = WEAPON.barrelTip.y

    // When aiming left, the weapon flips vertically so Y is negated
    const aimingLeft = Math.abs(aimAngle) > Math.PI / 2
    const localY = aimingLeft ? -bty : bty

    // Rotate barrel tip by aimAngle, then translate by player position + grip offset
    const worldX = visuals.container.x + WEAPON.gripOffset.x + cos * btx - sin * localY
    const worldY = visuals.container.y + WEAPON.gripOffset.y + sin * btx + cos * localY

    return { x: worldX, y: worldY }
  }

  /**
   * Get the local player entity ID.
   * Prefers localPlayerEid (set explicitly in multiplayer), falls back to
   * playerEntity (first entity created, used in single-player).
   */
  getPlayerEntity(): number | null {
    return this.localPlayerEid ?? this.playerEntity
  }

  /**
   * Get the current player screen position (for input reference)
   */
  getPlayerScreenPosition(
    world: GameWorld,
    alpha: number
  ): { x: number; y: number } | null {
    if (this.playerEntity === null) return null

    const eid = this.playerEntity
    const prevX = Position.prevX[eid]!
    const prevY = Position.prevY[eid]!
    const currX = Position.x[eid]!
    const currY = Position.y[eid]!

    return {
      x: prevX + (currX - prevX) * alpha,
      y: prevY + (currY - prevY) * alpha,
    }
  }

  /**
   * Clean up all player visuals
   */
  destroy(): void {
    for (const visuals of this.players.values()) {
      this.entityLayer.removeChild(visuals.container)
      visuals.container.destroy({ children: true })
    }
    this.players.clear()
    this.playerEntity = null
  }
}
