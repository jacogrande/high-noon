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
    const t = (i / (count - 1)) * 2 - 1 // -1..1
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
