export interface BulletSpawnMessage {
  /** Monotonic server-assigned bullet network id. */
  bulletId: number
  /** Authoritative server simulation tick when this state was emitted. */
  tick: number
  /** Authoritative server-time timestamp (performance.now domain). */
  serverTime: number
  /** Authoritative server owner entity id (player/enemy), or NO_OWNER. */
  ownerServerEid: number
  /** Authoritative bullet position and velocity. */
  x: number
  y: number
  vx: number
  vy: number
  /** Collision layer determines who the projectile can hit. */
  layer: number
  /**
   * Optional lag-compensated originating shot tick for local timeline adoption
   * diagnostics and future interpolation tuning.
   */
  shotTick?: number
}

export interface BulletDespawnMessage {
  /** Server-assigned bullet network id. */
  bulletId: number
  /** Authoritative server simulation tick when despawn was observed. */
  tick: number
}

