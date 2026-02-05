/**
 * ECS Components
 *
 * Components are data stores indexed by entity ID using Structure of Arrays (SoA).
 * All game state lives in these arrays for cache-friendly iteration.
 */

/** Maximum entities supported */
export const MAX_ENTITIES = 10000

// ============================================================================
// Core Components
// ============================================================================

/** Position in world space (pixels) */
export const Position = {
  x: new Float32Array(MAX_ENTITIES),
  y: new Float32Array(MAX_ENTITIES),
  /** Previous x for interpolation */
  prevX: new Float32Array(MAX_ENTITIES),
  /** Previous y for interpolation */
  prevY: new Float32Array(MAX_ENTITIES),
}

/** Velocity in pixels per second */
export const Velocity = {
  x: new Float32Array(MAX_ENTITIES),
  y: new Float32Array(MAX_ENTITIES),
}

// ============================================================================
// Player Components
// ============================================================================

/** Marks entity as a player */
export const Player = {
  /** Player slot ID (0-7 for multiplayer) */
  id: new Uint8Array(MAX_ENTITIES),
  /** Current aim angle in radians */
  aimAngle: new Float32Array(MAX_ENTITIES),
}

/** Player state enum values */
export const PlayerStateType = {
  IDLE: 0,
  MOVING: 1,
  ROLLING: 2,
} as const

/** Current state of the player */
export const PlayerState = {
  state: new Uint8Array(MAX_ENTITIES),
}

/** Movement speed */
export const Speed = {
  /** Current speed (may be modified by roll, etc.) */
  current: new Float32Array(MAX_ENTITIES),
  /** Base maximum speed */
  max: new Float32Array(MAX_ENTITIES),
}

// ============================================================================
// Physics Components
// ============================================================================

/** Circle collider for physics */
export const Collider = {
  /** Collision radius in pixels */
  radius: new Float32Array(MAX_ENTITIES),
  /** Collision layer bitmask */
  layer: new Uint8Array(MAX_ENTITIES),
}

/**
 * Tag component for entities that don't move (walls, obstacles)
 * Note: Array is required for bitECS query compatibility, even though values aren't read
 */
export const StaticBody = {
  _tag: new Uint8Array(MAX_ENTITIES),
}

// ============================================================================
// Combat Components
// ============================================================================

/** Bullet projectile data */
export const Bullet = {
  /** Entity ID of owner (for friendly fire prevention) */
  ownerId: new Uint16Array(MAX_ENTITIES),
  /** Damage dealt on hit */
  damage: new Uint8Array(MAX_ENTITIES),
  /** Remaining lifetime in seconds */
  lifetime: new Float32Array(MAX_ENTITIES),
}

/** Weapon data */
export const Weapon = {
  /** Shots per second */
  fireRate: new Float32Array(MAX_ENTITIES),
  /** Bullet speed in pixels per second */
  bulletSpeed: new Float32Array(MAX_ENTITIES),
  /** Damage per bullet */
  bulletDamage: new Uint8Array(MAX_ENTITIES),
  /** Time until can fire again (seconds) */
  cooldown: new Float32Array(MAX_ENTITIES),
}

/**
 * Tag component for invincible entities (during roll i-frames)
 * Note: Array is required for bitECS query compatibility, even though values aren't read
 */
export const Invincible = {
  _tag: new Uint8Array(MAX_ENTITIES),
}

// ============================================================================
// Component Registration
// ============================================================================

/**
 * All components for registration with bitECS
 * Order matters for consistent serialization
 */
export const AllComponents = [
  Position,
  Velocity,
  Player,
  PlayerState,
  Speed,
  Collider,
  StaticBody,
  Bullet,
  Weapon,
  Invincible,
] as const
