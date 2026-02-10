import { describe, expect, test, beforeEach } from 'bun:test'
import { createGameWorld, type GameWorld, setWorldTilemap } from '../world'
import { spawnPlayer } from '../prefabs'
import { flowFieldSystem } from './flowField'
import { createTilemap, addLayer, setTile, TileType } from '../tilemap'
import { LAVA_PATHFIND_COST } from '../content/hazards'

const UNREACHABLE = 0xFFFF
const TILE = 32

function createOpenMap(width: number, height: number) {
  const map = createTilemap(width, height, TILE)
  addLayer(map, true)
  addLayer(map, false)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      setTile(map, 1, x, y, TileType.FLOOR)
    }
  }
  return map
}

function placePlayerAt(world: GameWorld, tx: number, ty: number): number {
  return spawnPlayer(world, tx * TILE + TILE / 2, ty * TILE + TILE / 2)
}

function distAt(world: GameWorld, tx: number, ty: number): number {
  const ff = world.flowField!
  return ff.dist[ty * ff.width + tx]!
}

function dirAt(world: GameWorld, tx: number, ty: number): { x: number; y: number } {
  const ff = world.flowField!
  const idx = ty * ff.width + tx
  return { x: ff.dirX[idx]!, y: ff.dirY[idx]! }
}

describe('flowFieldSystem', () => {
  let world: GameWorld

  beforeEach(() => {
    world = createGameWorld(42)
  })

  test('basic pathing points toward player and reaches all open tiles', () => {
    const map = createOpenMap(5, 5)
    setWorldTilemap(world, map)
    placePlayerAt(world, 2, 2)

    flowFieldSystem(world, 0)

    expect(distAt(world, 2, 2)).toBe(0)
    expect(dirAt(world, 3, 2)).toEqual({ x: -1, y: 0 })
    expect(dirAt(world, 2, 1)).toEqual({ x: 0, y: 1 })

    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        expect(distAt(world, x, y)).toBeLessThan(UNREACHABLE)
      }
    }
  })

  test('lava receives weighted distance cost and is avoided when possible', () => {
    const map = createOpenMap(7, 3)
    for (let x = 1; x <= 5; x++) {
      setTile(map, 1, x, 1, TileType.LAVA)
    }
    setWorldTilemap(world, map)
    placePlayerAt(world, 0, 1)

    flowFieldSystem(world, 0)

    const dist = distAt(world, 6, 1)
    const directLavaCost = 5 * LAVA_PATHFIND_COST + 1
    expect(dist).toBeLessThan(directLavaCost)
    expect(dirAt(world, 6, 1).y).not.toBe(0)
  })

  test('lava remains traversable when it is the only route', () => {
    const map = createTilemap(3, 1, TILE)
    addLayer(map, true)
    addLayer(map, false)
    setTile(map, 1, 0, 0, TileType.FLOOR)
    setTile(map, 1, 1, 0, TileType.LAVA)
    setTile(map, 1, 2, 0, TileType.FLOOR)
    setWorldTilemap(world, map)
    placePlayerAt(world, 0, 0)

    flowFieldSystem(world, 0)

    expect(distAt(world, 2, 0)).toBeLessThan(UNREACHABLE)
    expect(dirAt(world, 2, 0)).toEqual({ x: -1, y: 0 })
  })

  test('cost increments include lava edge cost', () => {
    const map = createTilemap(3, 1, TILE)
    addLayer(map, true)
    addLayer(map, false)
    setTile(map, 1, 0, 0, TileType.FLOOR)
    setTile(map, 1, 1, 0, TileType.LAVA)
    setTile(map, 1, 2, 0, TileType.FLOOR)
    setWorldTilemap(world, map)
    placePlayerAt(world, 0, 0)

    flowFieldSystem(world, 0)

    expect(distAt(world, 0, 0)).toBe(0)
    expect(distAt(world, 1, 0)).toBe(LAVA_PATHFIND_COST)
    expect(distAt(world, 2, 0)).toBe(LAVA_PATHFIND_COST + 1)
  })

  test('solid tiles remain unreachable', () => {
    const map = createOpenMap(3, 3)
    setTile(map, 0, 1, 1, TileType.WALL)
    setWorldTilemap(world, map)
    placePlayerAt(world, 0, 0)

    flowFieldSystem(world, 0)

    expect(distAt(world, 1, 1)).toBe(UNREACHABLE)
    expect(distAt(world, 2, 2)).toBeLessThan(UNREACHABLE)
  })
})
