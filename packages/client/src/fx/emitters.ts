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
