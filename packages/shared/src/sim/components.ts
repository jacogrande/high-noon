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
  /** Whether roll button was held last tick (for re-press detection) */
  rollButtonWasDown: new Uint8Array(MAX_ENTITIES),
  /** Whether shoot button was held last tick (for click vs hold detection) */
  shootWasDown: new Uint8Array(MAX_ENTITIES),
  /** Whether ability button was held last tick (for re-press detection) */
  abilityWasDown: new Uint8Array(MAX_ENTITIES),
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

/** Roll/dodge state */
export const Roll = {
  /** Total roll duration in seconds */
  duration: new Float32Array(MAX_ENTITIES),
  /** Time elapsed in current roll */
  elapsed: new Float32Array(MAX_ENTITIES),
  /** Portion of roll with i-frames (0.5 = first 50%) */
  iframeRatio: new Float32Array(MAX_ENTITIES),
  /** Speed multiplier during roll */
  speedMultiplier: new Float32Array(MAX_ENTITIES),
  /** Locked roll direction X (normalized) */
  directionX: new Float32Array(MAX_ENTITIES),
  /** Locked roll direction Y (normalized) */
  directionY: new Float32Array(MAX_ENTITIES),
  /** World X at roll start (for Rockslide shockwave) */
  startX: new Float32Array(MAX_ENTITIES),
  /** World Y at roll start (for Rockslide shockwave) */
  startY: new Float32Array(MAX_ENTITIES),
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
  /** Remaining lifetime in seconds (failsafe despawn) */
  lifetime: new Float32Array(MAX_ENTITIES),
  /** Maximum travel distance in pixels */
  range: new Float32Array(MAX_ENTITIES),
  /** Distance traveled so far in pixels */
  distanceTraveled: new Float32Array(MAX_ENTITIES),
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
  /** Bullet range in pixels */
  range: new Float32Array(MAX_ENTITIES),
}

/**
 * Tag component for invincible entities (during roll i-frames)
 * Note: Array is required for bitECS query compatibility, even though values aren't read
 */
export const Invincible = {
  _tag: new Uint8Array(MAX_ENTITIES),
}

/**
 * Health for damageable entities.
 * Damage i-frames (brief invulnerability after hit) are separate from
 * the Invincible tag component (used for roll i-frames, full invulnerability).
 */
export const Health = {
  current: new Float32Array(MAX_ENTITIES),
  max: new Float32Array(MAX_ENTITIES),
  /** Remaining i-frame time in seconds (0 = vulnerable) */
  iframes: new Float32Array(MAX_ENTITIES),
  /** How long i-frames last when triggered */
  iframeDuration: new Float32Array(MAX_ENTITIES),
}

/**
 * Tag component for dead entities.
 * Players are tagged Dead instead of removed so rendering can continue.
 * Non-player entities are removed outright in healthSystem.
 */
export const Dead = {
  _tag: new Uint8Array(MAX_ENTITIES),
}

// ============================================================================
// Cylinder Components
// ============================================================================

/** Revolver cylinder state (ammo, reload, fire cooldown) */
export const Cylinder = {
  /** Current loaded rounds */
  rounds: new Uint8Array(MAX_ENTITIES),
  /** Maximum cylinder capacity */
  maxRounds: new Uint8Array(MAX_ENTITIES),
  /** Whether currently reloading (0/1) */
  reloading: new Uint8Array(MAX_ENTITIES),
  /** Elapsed reload time in seconds */
  reloadTimer: new Float32Array(MAX_ENTITIES),
  /** Total reload duration in seconds */
  reloadTime: new Float32Array(MAX_ENTITIES),
  /** Whether next shot is the first after a reload (0/1, for Steady Hand) */
  firstShotAfterReload: new Uint8Array(MAX_ENTITIES),
  /** Minimum time between shots in seconds (fire rate limiter) */
  fireCooldown: new Float32Array(MAX_ENTITIES),
}

// ============================================================================
// Showdown Components
// ============================================================================

/** Showdown ability state */
export const Showdown = {
  /** Whether Showdown is active (0/1) */
  active: new Uint8Array(MAX_ENTITIES),
  /** Entity ID of marked target (NO_TARGET when inactive) */
  targetEid: new Uint16Array(MAX_ENTITIES),
  /** Remaining duration in seconds */
  duration: new Float32Array(MAX_ENTITIES),
  /** Remaining cooldown in seconds */
  cooldown: new Float32Array(MAX_ENTITIES),
}

// ============================================================================
// Melee Components (Prospector)
// ============================================================================

/** Melee weapon state (pickaxe) */
export const MeleeWeapon = {
  /** Time until next swing allowed (seconds) */
  swingCooldown: new Float32Array(MAX_ENTITIES),
  /** Current charge time elapsed (0 = not charging) */
  chargeTimer: new Float32Array(MAX_ENTITIES),
  /** Whether currently charging (0/1) */
  charging: new Uint8Array(MAX_ENTITIES),
  /** Whether a swing happened this tick (0/1, for VFX trigger) */
  swungThisTick: new Uint8Array(MAX_ENTITIES),
  /** Whether swing was charged (0/1, for VFX) */
  wasChargedSwing: new Uint8Array(MAX_ENTITIES),
  /** Aim angle of the swing (for VFX arc direction) */
  swingAngle: new Float32Array(MAX_ENTITIES),
}

/** Knockback impulse (applied to enemies on melee hit or explosion) */
export const Knockback = {
  /** Knockback velocity X */
  vx: new Float32Array(MAX_ENTITIES),
  /** Knockback velocity Y */
  vy: new Float32Array(MAX_ENTITIES),
  /** Remaining knockback duration (seconds) */
  duration: new Float32Array(MAX_ENTITIES),
}

// ============================================================================
// Debuff Components
// ============================================================================

/** Movement speed debuff (slow) */
export const SlowDebuff = {
  /** Speed multiplier (0.8 = 20% slow) */
  multiplier: new Float32Array(MAX_ENTITIES),
  /** Remaining duration in seconds */
  duration: new Float32Array(MAX_ENTITIES),
}

// ============================================================================
// Enemy Components
// ============================================================================

/** AI state machine states */
export const AIState = {
  IDLE: 0, CHASE: 1, TELEGRAPH: 2, ATTACK: 3, RECOVERY: 4, STUNNED: 5, FLEE: 6,
} as const

/** Enemy type identifiers */
export const EnemyType = {
  SWARMER: 0, GRUNT: 1, SHOOTER: 2, CHARGER: 3,
} as const

/** Enemy tier (determines budget cost and threat level) */
export const EnemyTier = {
  FODDER: 0, THREAT: 1,
} as const

/** Marks entity as an enemy */
export const Enemy = {
  type: new Uint8Array(MAX_ENTITIES),
  tier: new Uint8Array(MAX_ENTITIES),
}

/** AI state machine data */
export const EnemyAI = {
  state: new Uint8Array(MAX_ENTITIES),
  stateTimer: new Float32Array(MAX_ENTITIES),
  targetEid: new Uint16Array(MAX_ENTITIES),
  initialDelay: new Float32Array(MAX_ENTITIES),
}

/** Detection ranges for AI */
export const Detection = {
  aggroRange: new Float32Array(MAX_ENTITIES),
  attackRange: new Float32Array(MAX_ENTITIES),
  losRequired: new Uint8Array(MAX_ENTITIES),
  /** LOS check stagger bucket (0-4), assigned at spawn for determinism */
  staggerOffset: new Uint8Array(MAX_ENTITIES),
}

/** Attack configuration */
export const AttackConfig = {
  telegraphDuration: new Float32Array(MAX_ENTITIES),
  recoveryDuration: new Float32Array(MAX_ENTITIES),
  cooldown: new Float32Array(MAX_ENTITIES),
  cooldownRemaining: new Float32Array(MAX_ENTITIES),
  damage: new Uint8Array(MAX_ENTITIES),
  projectileSpeed: new Float32Array(MAX_ENTITIES),
  projectileCount: new Uint8Array(MAX_ENTITIES),
  spreadAngle: new Float32Array(MAX_ENTITIES),
  /** Locked aim direction X (set at TELEGRAPH entry for chargers) */
  aimX: new Float32Array(MAX_ENTITIES),
  /** Locked aim direction Y (set at TELEGRAPH entry for chargers) */
  aimY: new Float32Array(MAX_ENTITIES),
}

/** Steering behavior weights */
export const Steering = {
  seekWeight: new Float32Array(MAX_ENTITIES),
  separationWeight: new Float32Array(MAX_ENTITIES),
  preferredRange: new Float32Array(MAX_ENTITIES),
  separationRadius: new Float32Array(MAX_ENTITIES),
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
  Roll,
  Collider,
  StaticBody,
  Bullet,
  Weapon,
  Cylinder,
  Invincible,
  Showdown,
  Health,
  Dead,
  MeleeWeapon,
  Knockback,
  SlowDebuff,
  Enemy,
  EnemyAI,
  Detection,
  AttackConfig,
  Steering,
] as const
