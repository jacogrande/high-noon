import { describe, expect, test, beforeEach } from 'bun:test'
import { createGameWorld, setWorldTilemap, type GameWorld } from '../world'
import { createTestArena } from '../content/maps/testArena'
import { spawnPlayer } from '../prefabs'
import { groundCrackSystem } from './groundCrackSystem'
import { Position, Health } from '../components'

describe('groundCrackSystem', () => {
  let world: GameWorld
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 800, 600)
  })

  test('player inside crack zone gets 0.8 speed multiplier', () => {
    world.groundCracks.push({ x: 800, y: 600, radius: 30 })

    groundCrackSystem(world, 1 / 60)

    expect(world.floorSpeedMul.get(playerEid)).toBe(0.8)
  })

  test('player outside crack zone gets no speed multiplier', () => {
    world.groundCracks.push({ x: 500, y: 500, radius: 30 })

    groundCrackSystem(world, 1 / 60)

    expect(world.floorSpeedMul.has(playerEid)).toBe(false)
  })

  test('multiple overlapping cracks apply minimum multiplier (only one slow)', () => {
    world.groundCracks.push({ x: 800, y: 600, radius: 30 })
    world.groundCracks.push({ x: 805, y: 605, radius: 30 })

    groundCrackSystem(world, 1 / 60)

    // Should be 0.8 (not compounded)
    expect(world.floorSpeedMul.get(playerEid)).toBe(0.8)
  })

  test('composes with existing speed multiplier via Math.min', () => {
    // Simulate hazardTile having already set a 0.5 multiplier
    world.floorSpeedMul.set(playerEid, 0.5)
    world.groundCracks.push({ x: 800, y: 600, radius: 30 })

    groundCrackSystem(world, 1 / 60)

    // Should keep 0.5 (lower than crack's 0.8)
    expect(world.floorSpeedMul.get(playerEid)).toBe(0.5)
  })

  test('no cracks means no work done', () => {
    groundCrackSystem(world, 1 / 60)
    expect(world.floorSpeedMul.has(playerEid)).toBe(false)
  })

  test('player exactly at crack edge (distance === radius) gets slow multiplier', () => {
    // Position player exactly 30px away from crack center
    world.groundCracks.push({ x: 830, y: 600, radius: 30 })
    // Player at (800, 600) is 30px away — exactly at the edge

    groundCrackSystem(world, 1 / 60)

    // Check uses <=, so edge should be included
    expect(world.floorSpeedMul.get(playerEid)).toBe(0.8)
  })
})
