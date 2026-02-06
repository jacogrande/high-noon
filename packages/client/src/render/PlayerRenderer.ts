/**
 * Player Renderer
 *
 * Renders player entities as directional sprites with interpolation.
 * Visual feedback for different states:
 * - Normal: Full opacity
 * - Rolling (i-frames): Semi-transparent
 * - Rolling (recovery): Full opacity
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '@high-noon/shared'
import {
  Player,
  Position,
  Collider,
  PlayerState,
  PlayerStateType,
  Invincible,
  Health,
} from '@high-noon/shared'
import { SpriteRegistry } from './SpriteRegistry'
import {
  AssetLoader,
  angleToDirection8,
  getAnimationFrame,
  type AnimationState,
} from '../assets'

/** Alpha values */
const ALPHA_NORMAL = 1.0
const ALPHA_INVINCIBLE = 0.5 // Semi-transparent during i-frames

// Define query for player entities with rendering components
const playerRenderQuery = defineQuery([Player, Position, Collider])
const playerPositionQuery = defineQuery([Player, Position])

/**
 * Player renderer - manages player visual representation
 */
export class PlayerRenderer {
  private readonly registry: SpriteRegistry
  private playerEntity: number | null = null

  constructor(registry: SpriteRegistry) {
    this.registry = registry
  }

  /**
   * Sync sprites with player entities
   * Creates sprites for new players, removes for dead ones
   */
  sync(world: GameWorld): void {
    const players = playerRenderQuery(world)

    // Track which entities we've seen
    const activeEntities = new Set<number>()

    for (const eid of players) {
      activeEntities.add(eid)

      // Create sprite if doesn't exist
      if (!this.registry.has(eid)) {
        // Get initial texture (idle, facing east)
        const texture = AssetLoader.getPlayerTexture('idle', 'E', 0)
        this.registry.createSprite(eid, texture)
        this.playerEntity = eid
      }
    }

    // Remove sprites for entities that no longer exist
    for (const eid of this.registry.getEntityIds()) {
      // Only manage player entities (check if it was a player)
      if (!activeEntities.has(eid) && eid === this.playerEntity) {
        this.registry.remove(eid)
        this.playerEntity = null
      }
    }
  }

  /**
   * Update player sprite positions with interpolation
   * Also updates visual appearance based on player state
   *
   * @param world - The game world
   * @param alpha - Interpolation factor (0-1) between previous and current state
   */
  render(world: GameWorld, alpha: number): void {
    const players = playerPositionQuery(world)

    for (const eid of players) {
      // Interpolate between previous and current position
      // Note: Non-null assertions safe because entities come from query
      const prevX = Position.prevX[eid]!
      const prevY = Position.prevY[eid]!
      const currX = Position.x[eid]!
      const currY = Position.y[eid]!

      const renderX = prevX + (currX - prevX) * alpha
      const renderY = prevY + (currY - prevY) * alpha

      this.registry.setPosition(eid, renderX, renderY)

      // Determine animation state and direction
      const playerState = PlayerState.state[eid]!
      const aimAngle = Player.aimAngle[eid]!
      const isInvincible = hasComponent(world, Invincible, eid)

      // Map PlayerStateType to animation state
      let animState: AnimationState
      if (playerState === PlayerStateType.ROLLING) {
        animState = 'roll'
      } else if (playerState === PlayerStateType.MOVING) {
        animState = 'walk'
      } else {
        animState = 'idle'
      }

      // Get 8-way direction from aim angle
      const direction = angleToDirection8(aimAngle)

      // Get animation frame based on world tick
      const frame = getAnimationFrame(animState, world.tick)

      // Update sprite texture
      const texture = AssetLoader.getPlayerTexture(animState, direction, frame)
      this.registry.setTexture(eid, texture)

      // Set alpha based on invincibility
      if (isInvincible) {
        this.registry.setAlpha(eid, ALPHA_INVINCIBLE)
      } else {
        this.registry.setAlpha(eid, ALPHA_NORMAL)
      }

      // Damage flash: red flicker when damage i-frames active
      if (hasComponent(world, Health, eid) && Health.iframes[eid]! > 0) {
        const flash = Math.floor(world.tick / 3) % 2 === 0
        this.registry.setTint(eid, flash ? 0xFF4444 : 0xFFFFFF)
      } else {
        this.registry.setTint(eid, 0xFFFFFF)
      }
    }
  }

  /**
   * Get the current player entity ID
   */
  getPlayerEntity(): number | null {
    return this.playerEntity
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
}
