import { describe, expect, test } from 'bun:test'
import { createSpatialHash, rebuildSpatialHash, forEachInRadius, type SpatialHash } from './SpatialHash'
import { Position } from './components'
import { addEntity, addComponent } from 'bitecs'
import { createGameWorld } from './world'

/** Helper: create a hash, add entities at given positions, rebuild, return hash + eids */
function setupHash(
  positions: Array<{ x: number; y: number }>,
  arenaWidth = 320,
  arenaHeight = 320,
  cellSize = 32
): { hash: SpatialHash; eids: number[] } {
  const world = createGameWorld()
  const eids: number[] = []

  for (const pos of positions) {
    const eid = addEntity(world)
    addComponent(world, Position, eid)
    Position.x[eid] = pos.x
    Position.y[eid] = pos.y
    eids.push(eid)
  }

  const hash = createSpatialHash(arenaWidth, arenaHeight, cellSize)
  rebuildSpatialHash(hash, eids, Position.x, Position.y)
  return { hash, eids }
}

/** Collect all eids returned by forEachInRadius */
function queryRadius(hash: SpatialHash, x: number, y: number, radius: number): number[] {
  const results: number[] = []
  forEachInRadius(hash, x, y, radius, (eid) => results.push(eid))
  return results
}

describe('SpatialHash', () => {
  describe('createSpatialHash', () => {
    test('creates with correct grid dimensions', () => {
      const hash = createSpatialHash(320, 320, 32)
      expect(hash.width).toBe(10)
      expect(hash.height).toBe(10)
      expect(hash.numCells).toBe(100)
      expect(hash.cellSize).toBe(32)
    })

    test('rounds up for non-divisible arena sizes', () => {
      const hash = createSpatialHash(100, 100, 32)
      expect(hash.width).toBe(4) // ceil(100/32) = 4
      expect(hash.height).toBe(4)
    })
  })

  describe('rebuildSpatialHash + forEachInRadius', () => {
    test('finds nearby entity', () => {
      const { hash, eids } = setupHash([
        { x: 50, y: 50 },
        { x: 55, y: 55 },
      ])

      const results = queryRadius(hash, 50, 50, 20)
      expect(results).toContain(eids[0])
      expect(results).toContain(eids[1])
    })

    test('excludes distant entity', () => {
      const { hash, eids } = setupHash([
        { x: 50, y: 50 },
        { x: 250, y: 250 },
      ])

      const results = queryRadius(hash, 50, 50, 20)
      expect(results).toContain(eids[0])
      expect(results).not.toContain(eids[1])
    })

    test('handles entities at grid origin (0,0)', () => {
      const { hash, eids } = setupHash([{ x: 0, y: 0 }])

      const results = queryRadius(hash, 0, 0, 10)
      expect(results).toContain(eids[0])
    })

    test('handles entities outside arena (clamped to edge cells)', () => {
      const { hash, eids } = setupHash([
        { x: -50, y: -50 },
        { x: 500, y: 500 },
      ], 320, 320, 32)

      // Negative coords clamped to cell (0,0)
      const results1 = queryRadius(hash, 0, 0, 10)
      expect(results1).toContain(eids[0])

      // Over-arena coords clamped to last cell
      const results2 = queryRadius(hash, 319, 319, 10)
      expect(results2).toContain(eids[1])
    })

    test('deterministic iteration order', () => {
      // Rebuild the same hash twice with identical input and assert exact same order
      const { hash, eids } = setupHash([
        { x: 100, y: 100 },
        { x: 105, y: 105 },
        { x: 110, y: 110 },
      ])

      const results1 = queryRadius(hash, 100, 100, 50)

      // Rebuild with same eids in same order
      rebuildSpatialHash(hash, eids, Position.x, Position.y)
      const results2 = queryRadius(hash, 100, 100, 50)

      expect(results1).toEqual(results2)
      expect(results1).toHaveLength(3)
    })

    test('empty hash returns no results', () => {
      const hash = createSpatialHash(320, 320, 32)
      rebuildSpatialHash(hash, [], Position.x, Position.y)

      const results = queryRadius(hash, 100, 100, 50)
      expect(results).toHaveLength(0)
    })

    test('entities in different cells found with large radius', () => {
      const { hash, eids } = setupHash([
        { x: 16, y: 16 },   // cell (0,0)
        { x: 48, y: 16 },   // cell (1,0)
        { x: 16, y: 48 },   // cell (0,1)
        { x: 48, y: 48 },   // cell (1,1)
      ])

      // Large radius centered between all four should find them all
      const results = queryRadius(hash, 32, 32, 40)
      expect(results).toHaveLength(4)
      for (const eid of eids) {
        expect(results).toContain(eid)
      }
    })

    test('query at grid edge does not go out of bounds', () => {
      const { hash, eids } = setupHash([{ x: 310, y: 310 }], 320, 320, 32)

      // Query near the edge with a radius that would extend past the grid
      const results = queryRadius(hash, 315, 315, 50)
      expect(results).toContain(eids[0])
    })
  })
})
