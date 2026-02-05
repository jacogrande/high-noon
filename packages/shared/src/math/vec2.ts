/**
 * 2D Vector math utilities
 *
 * All functions are pure and return new objects to maintain immutability.
 * For hot paths, consider using mutable versions or inline math.
 */

export type Vec2 = {
  readonly x: number
  readonly y: number
}

/** Create a new Vec2 */
export function create(x = 0, y = 0): Vec2 {
  return { x, y }
}

/** Vec2 at origin */
export const ZERO: Vec2 = Object.freeze({ x: 0, y: 0 })

/** Add two vectors */
export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y }
}

/** Subtract b from a */
export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

/** Multiply vector by scalar */
export function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s }
}

/** Get the length (magnitude) of a vector */
export function length(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y)
}

/** Get the squared length (avoids sqrt, useful for comparisons) */
export function lengthSq(v: Vec2): number {
  return v.x * v.x + v.y * v.y
}

/** Normalize vector to unit length. Returns ZERO if input has zero length. */
export function normalize(v: Vec2): Vec2 {
  const len = length(v)
  if (len < 0.0000001) return ZERO
  return { x: v.x / len, y: v.y / len }
}

/** Dot product of two vectors */
export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y
}

/** Linear interpolation between two vectors */
export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  }
}

/** Get angle of vector in radians (from positive x-axis) */
export function angle(v: Vec2): number {
  return Math.atan2(v.y, v.x)
}

/** Create unit vector from angle in radians */
export function fromAngle(radians: number): Vec2 {
  return { x: Math.cos(radians), y: Math.sin(radians) }
}

/** Distance between two points */
export function distance(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

/** Squared distance between two points (avoids sqrt) */
export function distanceSq(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return dx * dx + dy * dy
}

/** Rotate vector by angle in radians */
export function rotate(v: Vec2, radians: number): Vec2 {
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return {
    x: v.x * cos - v.y * sin,
    y: v.x * sin + v.y * cos,
  }
}

/** Negate a vector */
export function negate(v: Vec2): Vec2 {
  return { x: -v.x, y: -v.y }
}

/** Get perpendicular vector (90 degrees counter-clockwise) */
export function perpendicular(v: Vec2): Vec2 {
  return { x: -v.y, y: v.x }
}

/** Check if two vectors are equal within epsilon */
export function equals(a: Vec2, b: Vec2, epsilon = 0.0001): boolean {
  return Math.abs(a.x - b.x) < epsilon && Math.abs(a.y - b.y) < epsilon
}
