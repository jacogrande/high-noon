import { describe, expect, test } from 'bun:test'
import * as Vec2 from './vec2'

describe('Vec2', () => {
  describe('create', () => {
    test('creates vector with given values', () => {
      const v = Vec2.create(3, 4)
      expect(v.x).toBe(3)
      expect(v.y).toBe(4)
    })

    test('defaults to zero', () => {
      const v = Vec2.create()
      expect(v.x).toBe(0)
      expect(v.y).toBe(0)
    })
  })

  describe('add', () => {
    test('adds two vectors', () => {
      const a = Vec2.create(1, 2)
      const b = Vec2.create(3, 4)
      const result = Vec2.add(a, b)
      expect(result.x).toBe(4)
      expect(result.y).toBe(6)
    })
  })

  describe('sub', () => {
    test('subtracts two vectors', () => {
      const a = Vec2.create(5, 7)
      const b = Vec2.create(2, 3)
      const result = Vec2.sub(a, b)
      expect(result.x).toBe(3)
      expect(result.y).toBe(4)
    })
  })

  describe('scale', () => {
    test('multiplies vector by scalar', () => {
      const v = Vec2.create(2, 3)
      const result = Vec2.scale(v, 2)
      expect(result.x).toBe(4)
      expect(result.y).toBe(6)
    })
  })

  describe('length', () => {
    test('calculates length of vector', () => {
      const v = Vec2.create(3, 4)
      expect(Vec2.length(v)).toBe(5)
    })

    test('returns 0 for zero vector', () => {
      expect(Vec2.length(Vec2.ZERO)).toBe(0)
    })
  })

  describe('lengthSq', () => {
    test('calculates squared length', () => {
      const v = Vec2.create(3, 4)
      expect(Vec2.lengthSq(v)).toBe(25)
    })
  })

  describe('normalize', () => {
    test('normalizes vector to unit length', () => {
      const v = Vec2.create(3, 4)
      const result = Vec2.normalize(v)
      expect(result.x).toBeCloseTo(0.6)
      expect(result.y).toBeCloseTo(0.8)
      expect(Vec2.length(result)).toBeCloseTo(1)
    })

    test('returns zero for zero vector', () => {
      const result = Vec2.normalize(Vec2.ZERO)
      expect(result).toBe(Vec2.ZERO)
    })
  })

  describe('dot', () => {
    test('calculates dot product', () => {
      const a = Vec2.create(1, 2)
      const b = Vec2.create(3, 4)
      expect(Vec2.dot(a, b)).toBe(11)
    })

    test('perpendicular vectors have zero dot product', () => {
      const a = Vec2.create(1, 0)
      const b = Vec2.create(0, 1)
      expect(Vec2.dot(a, b)).toBe(0)
    })
  })

  describe('lerp', () => {
    test('interpolates between vectors', () => {
      const a = Vec2.create(0, 0)
      const b = Vec2.create(10, 20)

      const mid = Vec2.lerp(a, b, 0.5)
      expect(mid.x).toBe(5)
      expect(mid.y).toBe(10)

      const start = Vec2.lerp(a, b, 0)
      expect(start.x).toBe(0)
      expect(start.y).toBe(0)

      const end = Vec2.lerp(a, b, 1)
      expect(end.x).toBe(10)
      expect(end.y).toBe(20)
    })
  })

  describe('angle', () => {
    test('returns angle in radians', () => {
      expect(Vec2.angle(Vec2.create(1, 0))).toBeCloseTo(0)
      expect(Vec2.angle(Vec2.create(0, 1))).toBeCloseTo(Math.PI / 2)
      expect(Vec2.angle(Vec2.create(-1, 0))).toBeCloseTo(Math.PI)
      expect(Vec2.angle(Vec2.create(0, -1))).toBeCloseTo(-Math.PI / 2)
    })
  })

  describe('fromAngle', () => {
    test('creates unit vector from angle', () => {
      const v0 = Vec2.fromAngle(0)
      expect(v0.x).toBeCloseTo(1)
      expect(v0.y).toBeCloseTo(0)

      const v90 = Vec2.fromAngle(Math.PI / 2)
      expect(v90.x).toBeCloseTo(0)
      expect(v90.y).toBeCloseTo(1)
    })
  })

  describe('distance', () => {
    test('calculates distance between points', () => {
      const a = Vec2.create(0, 0)
      const b = Vec2.create(3, 4)
      expect(Vec2.distance(a, b)).toBe(5)
    })
  })

  describe('distanceSq', () => {
    test('calculates squared distance', () => {
      const a = Vec2.create(0, 0)
      const b = Vec2.create(3, 4)
      expect(Vec2.distanceSq(a, b)).toBe(25)
    })
  })

  describe('rotate', () => {
    test('rotates vector by angle', () => {
      const v = Vec2.create(1, 0)
      const rotated = Vec2.rotate(v, Math.PI / 2)
      expect(rotated.x).toBeCloseTo(0)
      expect(rotated.y).toBeCloseTo(1)
    })
  })

  describe('negate', () => {
    test('negates vector', () => {
      const v = Vec2.create(3, -4)
      const result = Vec2.negate(v)
      expect(result.x).toBe(-3)
      expect(result.y).toBe(4)
    })
  })

  describe('perpendicular', () => {
    test('returns perpendicular vector', () => {
      const v = Vec2.create(1, 0)
      const perp = Vec2.perpendicular(v)
      expect(perp.x).toBeCloseTo(0)
      expect(perp.y).toBeCloseTo(1)
      expect(Vec2.dot(v, perp)).toBeCloseTo(0)
    })
  })

  describe('equals', () => {
    test('returns true for equal vectors', () => {
      const a = Vec2.create(1, 2)
      const b = Vec2.create(1, 2)
      expect(Vec2.equals(a, b)).toBe(true)
    })

    test('returns false for different vectors', () => {
      const a = Vec2.create(1, 2)
      const b = Vec2.create(1, 3)
      expect(Vec2.equals(a, b)).toBe(false)
    })

    test('uses epsilon for comparison', () => {
      const a = Vec2.create(1, 2)
      const b = Vec2.create(1.00001, 2.00001)
      expect(Vec2.equals(a, b, 0.0001)).toBe(true)
    })
  })
})
