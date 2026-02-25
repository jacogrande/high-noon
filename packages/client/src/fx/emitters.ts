/**
 * Particle emitter presets.
 *
 * Pure functions that call pool.emit() with randomized parameters.
 * Uses Math.random() — client-only visual presentation, not deterministic sim.
 */

import type { ParticlePool } from './ParticlePool'

/** Random float in [min, max) */
function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/** Random integer in [min, max] inclusive */
function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1))
}

/**
 * Muzzle flash — yellow spray in fire direction.
 * Caller provides the barrel-tip (x, y) directly — no internal offset applied.
 */
export function emitMuzzleFlash(
  pool: ParticlePool,
  x: number,
  y: number,
  aimAngle: number,
): void {
  const cos = Math.cos(aimAngle)
  const sin = Math.sin(aimAngle)
  // Perpendicular axis for positional spread
  const perpX = -sin
  const perpY = cos
  const count = randInt(3, 5)
  for (let i = 0; i < count; i++) {
    const spread = rand(-0.6, 0.6) // ±~35°
    const angle = aimAngle + spread
    const speed = rand(80, 160)
    const perpOffset = rand(-5, 5)
    pool.emit({
      x: x + perpX * perpOffset + cos * rand(0, 4),
      y: y + perpY * perpOffset + sin * rand(0, 4),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(0.1, 0.18),
      startScale: rand(4, 7),
      endScale: 0,
      startAlpha: 1,
      endAlpha: 0,
      tint: 0xffcc44,
    })
  }
}

/**
 * Shot tracer - short-lived streak to preserve firearm readability with hitscan.
 */
export function emitShotTracer(
  pool: ParticlePool,
  x: number,
  y: number,
  aimAngle: number,
): void {
  const count = randInt(2, 3)
  for (let i = 0; i < count; i++) {
    const speed = rand(420, 620)
    const spread = rand(-0.04, 0.04)
    const angle = aimAngle + spread
    pool.emit({
      x: x + Math.cos(aimAngle) * rand(0, 4),
      y: y + Math.sin(aimAngle) * rand(0, 4),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(0.04, 0.07),
      startScale: rand(1.4, 2.4),
      endScale: 0,
      startAlpha: 0.85,
      endAlpha: 0,
      tint: 0xffe9a6,
    })
  }
}

/**
 * Death burst — colored particles explode outward from enemy death position.
 * Count scales with tier: fodder 8-12, threat 15-20.
 */
export function emitDeathBurst(
  pool: ParticlePool,
  x: number,
  y: number,
  color: number,
  isThreat: boolean,
): void {
  const count = isThreat ? randInt(15, 20) : randInt(8, 12)
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2)
    const speed = rand(40, 120)
    pool.emit({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(0.3, 0.5),
      startScale: rand(1.5, 3),
      endScale: 0,
      startAlpha: 1,
      endAlpha: 0,
      tint: color,
    })
  }
}

/**
 * Wall impact — grey puff at bullet removal point.
 * Full circle spread (no wall normal info available).
 */
export function emitWallImpact(
  pool: ParticlePool,
  x: number,
  y: number,
): void {
  const count = randInt(4, 6)
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2)
    const speed = rand(20, 60)
    pool.emit({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(0.15, 0.25),
      startScale: rand(1, 2),
      endScale: 0,
      startAlpha: 0.8,
      endAlpha: 0,
      tint: 0x888888,
    })
  }
}

/**
 * Entity impact — small colored burst on bullet-enemy hit.
 * Triggered when an enemy takes damage.
 */
export function emitEntityImpact(
  pool: ParticlePool,
  x: number,
  y: number,
  color: number,
): void {
  const count = randInt(3, 5)
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2)
    const speed = rand(30, 80)
    pool.emit({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(0.1, 0.15),
      startScale: rand(2, 4),
      endScale: 0,
      startAlpha: 1,
      endAlpha: 0,
      tint: color,
    })
  }
}

/**
 * Death pulse — expanding ring of purple particles from Last Rites zone.
 */
export function emitDeathPulse(
  pool: ParticlePool,
  x: number,
  y: number,
  radius: number,
): void {
  const count = randInt(16, 24)
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rand(-0.1, 0.1)
    const speed = rand(40, 80)
    const r = radius * rand(0.8, 1.0)
    pool.emit({
      x: x + Math.cos(angle) * r,
      y: y + Math.sin(angle) * r,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(0.3, 0.5),
      startScale: rand(2, 4),
      endScale: 0,
      startAlpha: 0.8,
      endAlpha: 0,
      tint: 0x8833cc,
    })
  }
}

/**
 * Explosion — ring burst expanding outward from detonation point.
 */
export function emitExplosion(
  pool: ParticlePool,
  x: number,
  y: number,
  radius: number,
): void {
  const outerCount = randInt(16, 24)
  for (let i = 0; i < outerCount; i++) {
    const angle = (i / outerCount) * Math.PI * 2 + rand(-0.15, 0.15)
    const speed = (radius / 0.4) * rand(0.6, 1.0)
    pool.emit({
      x: x + Math.cos(angle) * rand(0, 6),
      y: y + Math.sin(angle) * rand(0, 6),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(0.3, 0.5),
      startScale: rand(3, 6),
      endScale: 0,
      startAlpha: 1,
      endAlpha: 0,
      tint: 0xff6622,
    })
  }

  const coreCount = randInt(4, 6)
  for (let i = 0; i < coreCount; i++) {
    const angle = rand(0, Math.PI * 2)
    const speed = rand(20, 50)
    pool.emit({
      x: x + rand(-3, 3),
      y: y + rand(-3, 3),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(0.15, 0.3),
      startScale: rand(4, 7),
      endScale: 0,
      startAlpha: 1,
      endAlpha: 0,
      tint: 0xffee88,
    })
  }
}

/**
 * Fuse sparks from a cooking dynamite state.
 * Intensity is expected in [0, 1].
 */
export function emitFuseSparks(
  pool: ParticlePool,
  x: number,
  y: number,
  intensity: number,
): void {
  const clamped = Math.max(0, Math.min(1, intensity))
  const count = clamped < 0.4 ? randInt(1, 2) : randInt(3, 5)
  for (let i = 0; i < count; i++) {
    const angle = rand(-Math.PI, 0)
    const speed = rand(40, 100) + clamped * 60
    pool.emit({
      x: x + rand(-6, 6),
      y: y - 8,
      vx: Math.cos(angle) * speed * rand(0.5, 1),
      vy: Math.sin(angle) * speed,
      life: rand(0.2, 0.4),
      startScale: rand(3, 5 + clamped * 3),
      endScale: 0,
      startAlpha: 1,
      endAlpha: 0,
      tint: clamped >= 0.75 ? 0xff2200 : 0xffaa22,
    })
  }
}

/**
 * Dynamite trail — 1-2 small sparks emitted while in flight.
 */
export function emitDynamiteTrail(
  pool: ParticlePool,
  x: number,
  y: number,
): void {
  const count = randInt(1, 2)
  for (let i = 0; i < count; i++) {
    pool.emit({
      x: x + rand(-2, 2),
      y: y + rand(-2, 2),
      vx: rand(-15, 15),
      vy: rand(5, 20),
      life: rand(0.1, 0.2),
      startScale: rand(1.5, 2.5),
      endScale: 0,
      startAlpha: 0.8,
      endAlpha: 0,
      tint: 0xff8822,
    })
  }
}

/**
 * Swing arc — fan of particles along melee swing direction.
 * Charged swings are larger and brighter.
 */
export function emitSwingArc(
  pool: ParticlePool,
  x: number,
  y: number,
  angle: number,
  arcHalf: number,
  reach: number,
  isCharged: boolean,
): void {
  const count = isCharged ? randInt(10, 14) : randInt(6, 8)
  const life = isCharged ? 0.3 : 0.2
  const tint = isCharged ? 0xff8822 : 0xcc8844
  const scale = isCharged ? rand(3, 5) : rand(2, 3.5)
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? (i / (count - 1)) * 2 - 1 : 0 // -1..1
    const a = angle + t * arcHalf + rand(-0.1, 0.1)
    const dist = reach * rand(0.4, 1.0)
    const speed = rand(30, 70)
    pool.emit({
      x: x + Math.cos(a) * dist * 0.3,
      y: y + Math.sin(a) * dist * 0.3,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: rand(life * 0.7, life),
      startScale: scale,
      endScale: 0,
      startAlpha: 1,
      endAlpha: 0,
      tint,
    })
  }
}

/**
 * Shell casing — 1 tiny brass particle ejected perpendicular to fire direction.
 * Arcs downward with gravity.
 */
export function emitShellCasing(
  pool: ParticlePool,
  x: number,
  y: number,
  aimAngle: number,
): void {
  // Eject perpendicular (right side) with upward bias
  const perpAngle = aimAngle + Math.PI / 2 + rand(-0.3, 0.3)
  const speed = rand(30, 60)
  pool.emit({
    x,
    y,
    vx: Math.cos(perpAngle) * speed,
    vy: Math.sin(perpAngle) * speed - rand(20, 40), // upward bias (Y-down in Pixi, so subtract = up)
    life: rand(0.4, 0.7),
    startScale: rand(1.5, 2),
    endScale: rand(1.2, 1.5),
    startAlpha: 1,
    endAlpha: 0.3,
    tint: 0xddaa44,
    ay: 300,
  })
}

/**
 * Wood splinters — burst of brown/tan particles on obstacle destruction.
 * For crate, barrel, low wall, fallen tree.
 */
export function emitWoodSplinters(
  pool: ParticlePool,
  x: number,
  y: number,
): void {
  const count = randInt(8, 14)
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2)
    const speed = rand(50, 140)
    pool.emit({
      x: x + rand(-4, 4),
      y: y + rand(-4, 4),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(0.3, 0.5),
      startScale: rand(2, 4),
      endScale: 0,
      startAlpha: 1,
      endAlpha: 0,
      tint: rand(0, 1) > 0.5 ? 0x8b6833 : 0xc4a265,
    })
  }
}

/**
 * Rock debris — heavier grey particles on boulder destruction.
 */
export function emitRockDebris(
  pool: ParticlePool,
  x: number,
  y: number,
): void {
  const count = randInt(10, 16)
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2)
    const speed = rand(40, 100)
    pool.emit({
      x: x + rand(-6, 6),
      y: y + rand(-6, 6),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(0.35, 0.55),
      startScale: rand(2.5, 5),
      endScale: 0,
      startAlpha: 1,
      endAlpha: 0,
      tint: rand(0, 1) > 0.5 ? 0x777777 : 0x555555,
      ay: 120,
    })
  }
}

/**
 * Obstacle hit — small chip particles per bullet hit (non-destroying).
 */
export function emitObstacleHit(
  pool: ParticlePool,
  x: number,
  y: number,
  isWood: boolean,
): void {
  const count = randInt(2, 4)
  const tint = isWood ? 0x8b6833 : 0x888888
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2)
    const speed = rand(30, 70)
    pool.emit({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(0.1, 0.2),
      startScale: rand(1, 2.5),
      endScale: 0,
      startAlpha: 0.9,
      endAlpha: 0,
      tint,
    })
  }
}

/**
 * Movement dust — 1-2 small sandy particles kicked up at feet.
 */
export function emitMovementDust(
  pool: ParticlePool,
  x: number,
  y: number,
): void {
  const count = randInt(1, 2)
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2)
    const speed = rand(8, 20)
    pool.emit({
      x: x + rand(-4, 4),
      y: y + rand(-2, 2),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(0.2, 0.35),
      startScale: rand(1.5, 2.5),
      endScale: rand(3, 5),
      startAlpha: 0.4,
      endAlpha: 0,
      tint: 0xccaa77,
    })
  }
}

/**
 * Roll dust — larger puff of 6-10 particles on dodge roll start.
 */
export function emitRollDust(
  pool: ParticlePool,
  x: number,
  y: number,
): void {
  const count = randInt(6, 10)
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2)
    const speed = rand(20, 50)
    pool.emit({
      x: x + rand(-3, 3),
      y: y + rand(-3, 3),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(0.3, 0.5),
      startScale: rand(2, 4),
      endScale: rand(5, 8),
      startAlpha: 0.5,
      endAlpha: 0,
      tint: 0xccaa77,
    })
  }
}

/**
 * Directional impact — colored particles sprayed in bullet travel direction.
 * Falls back to omnidirectional if no direction provided.
 */
export function emitDirectionalImpact(
  pool: ParticlePool,
  x: number,
  y: number,
  color: number,
  dirX: number,
  dirY: number,
): void {
  const hasDir = dirX !== 0 || dirY !== 0
  const baseAngle = hasDir ? Math.atan2(dirY, dirX) : 0
  const count = randInt(3, 5)
  for (let i = 0; i < count; i++) {
    const angle = hasDir
      ? baseAngle + rand(-0.8, 0.8) // ~90° cone along bullet travel
      : rand(0, Math.PI * 2)
    const speed = rand(30, 80)
    pool.emit({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(0.1, 0.15),
      startScale: rand(2, 4),
      endScale: 0,
      startAlpha: 1,
      endAlpha: 0,
      tint: color,
    })
  }
}

/**
 * Poison splash — green venom particles on rattlesnake bite impact.
 */
export function emitPoisonSplash(
  pool: ParticlePool,
  x: number,
  y: number,
): void {
  const count = randInt(6, 10)
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2)
    const speed = rand(30, 70)
    pool.emit({
      x: x + rand(-3, 3),
      y: y + rand(-3, 3),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(0.25, 0.45),
      startScale: rand(2, 4),
      endScale: rand(4, 6),
      startAlpha: 0.8,
      endAlpha: 0,
      tint: rand(0, 1) > 0.5 ? 0x88cc44 : 0x66aa22,
    })
  }
}

/**
 * Vulture dive trail — 1-2 brown dust particles emitted during dive.
 */
export function emitVultureDiveTrail(
  pool: ParticlePool,
  x: number,
  y: number,
): void {
  const count = randInt(1, 2)
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2)
    const speed = rand(10, 25)
    pool.emit({
      x: x + rand(-4, 4),
      y: y + rand(-4, 4),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(0.15, 0.3),
      startScale: rand(2, 3),
      endScale: rand(4, 6),
      startAlpha: 0.5,
      endAlpha: 0,
      tint: 0x554433,
    })
  }
}

/**
 * Level-up sparkle — gold particles with upward bias from player position.
 */
export function emitLevelUpSparkle(
  pool: ParticlePool,
  x: number,
  y: number,
): void {
  const count = randInt(12, 16)
  for (let i = 0; i < count; i++) {
    const angle = rand(-Math.PI, 0) // upward half-circle (negative Y is up)
    const speed = rand(30, 90)
    pool.emit({
      x: x + rand(-8, 8),
      y,
      vx: Math.cos(angle) * speed * rand(0.3, 1),
      vy: Math.sin(angle) * speed, // mostly upward
      life: rand(0.5, 0.8),
      startScale: rand(1.5, 2.5),
      endScale: 0,
      startAlpha: 1,
      endAlpha: 0,
      tint: 0xffd700,
    })
  }
}
