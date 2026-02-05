/**
 * Player Renderer
 *
 * Renders player entities as colored circles with interpolation.
 * Visual feedback for different states:
 * - Normal: Cyan
 * - Rolling (i-frames): White, semi-transparent
 * - Rolling (recovery): White, opaque
 *
 * Will be upgraded to sprite-based rendering in Phase 7.
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
} from '@high-noon/shared'
import { SpriteRegistry } from './SpriteRegistry'

/** Player colors for different states */
const PLAYER_COLOR_NORMAL = 0x00ffff // Cyan
const PLAYER_COLOR_ROLLING = 0xffffff // White during roll

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
        const radius = Collider.radius[eid]!
        this.registry.createCircle(eid, radius, PLAYER_COLOR_NORMAL)
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

      // Update visual based on player state
      const state = PlayerState.state[eid]!
      const isRolling = state === PlayerStateType.ROLLING
      const isInvincible = hasComponent(world, Invincible, eid)

      // Set color based on state
      if (isRolling) {
        this.registry.setColor(eid, PLAYER_COLOR_ROLLING)
      } else {
        this.registry.setColor(eid, PLAYER_COLOR_NORMAL)
      }

      // Set alpha based on invincibility
      if (isInvincible) {
        this.registry.setAlpha(eid, ALPHA_INVINCIBLE)
      } else {
        this.registry.setAlpha(eid, ALPHA_NORMAL)
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
