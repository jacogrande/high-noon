import { describe, expect, test, beforeEach } from 'bun:test'
import { addComponent } from 'bitecs'
import { createGameWorld, setWorldTilemap, type GameWorld } from '../world'
import { createTestArena } from '../content/maps/testArena'
import { spawnPlayer } from '../prefabs'
import { bossShockwaveSystem } from './bossShockwaveSystem'
import { Position, Health, Dead, Invincible } from '../components'

describe('bossShockwaveSystem', () => {
  let world: GameWorld
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 800, 600)
  })

  test('shockwave expands over time (currentRadius increases by speed * dt)', () => {
    world.bossShockwaves.push({
      x: 800,
      y: 600,
      currentRadius: 0,
      maxRadius: 300,
      speed: 200,
      ringWidth: 40,
      damage: 10,
      hitEntities: new Set(),
    })

    const initialRadius = world.bossShockwaves[0]!.currentRadius
    bossShockwaveSystem(world, 1 / 60)
    const afterRadius = world.bossShockwaves[0]!.currentRadius

    // Should expand by speed * dt = 200 * (1/60) = 3.333...
    expect(afterRadius).toBeCloseTo(initialRadius + 200 / 60, 2)
  })

  test('player inside ring band takes damage', () => {
    // Player at (800, 600), shockwave centered at (800, 600)
    // Ring at radius 50, width 40 -> inner = 30, outer = 70
    // Player is at distance 0, which is NOT in [30, 70], so move them
    Position.x[playerEid] = 850 // Distance = 50, which is in [30, 70]
    Position.y[playerEid] = 600

    const initialHP = Health.current[playerEid]!

    world.bossShockwaves.push({
      x: 800,
      y: 600,
      currentRadius: 50,
      maxRadius: 300,
      speed: 200,
      ringWidth: 40,
      damage: 15,
      hitEntities: new Set(),
    })

    bossShockwaveSystem(world, 1 / 60)

    expect(Health.current[playerEid]).toBe(initialHP - 15)
  })

  test('player outside ring band takes no damage', () => {
    // Player at (800, 600), shockwave centered at (800, 600)
    // Ring at radius 50, width 40 -> inner = 30, outer = 70
    // Player at distance 0 is outside [30, 70]
    const initialHP = Health.current[playerEid]!

    world.bossShockwaves.push({
      x: 800,
      y: 600,
      currentRadius: 50,
      maxRadius: 300,
      speed: 200,
      ringWidth: 40,
      damage: 15,
      hitEntities: new Set(),
    })

    bossShockwaveSystem(world, 1 / 60)

    expect(Health.current[playerEid]).toBe(initialHP)
  })

  test('player far outside ring band takes no damage', () => {
    // Player at (900, 700), shockwave centered at (800, 600)
    // Distance = sqrt(100^2 + 100^2) = ~141.42
    // Ring at radius 50, width 40 -> outer = 70
    // Player is beyond outer radius
    Position.x[playerEid] = 900
    Position.y[playerEid] = 700

    const initialHP = Health.current[playerEid]!

    world.bossShockwaves.push({
      x: 800,
      y: 600,
      currentRadius: 50,
      maxRadius: 300,
      speed: 200,
      ringWidth: 40,
      damage: 15,
      hitEntities: new Set(),
    })

    bossShockwaveSystem(world, 1 / 60)

    expect(Health.current[playerEid]).toBe(initialHP)
  })

  test('i-frames protect player from shockwave damage', () => {
    Position.x[playerEid] = 850 // Distance = 50
    Position.y[playerEid] = 600

    Health.iframes[playerEid] = 0.5 // Player has i-frames
    const initialHP = Health.current[playerEid]!

    world.bossShockwaves.push({
      x: 800,
      y: 600,
      currentRadius: 50,
      maxRadius: 300,
      speed: 200,
      ringWidth: 40,
      damage: 15,
      hitEntities: new Set(),
    })

    bossShockwaveSystem(world, 1 / 60)

    expect(Health.current[playerEid]).toBe(initialHP) // No damage
  })

  test('Invincible component protects player', () => {
    Position.x[playerEid] = 850 // Distance = 50
    Position.y[playerEid] = 600

    addComponent(world, Invincible, playerEid)
    const initialHP = Health.current[playerEid]!

    world.bossShockwaves.push({
      x: 800,
      y: 600,
      currentRadius: 50,
      maxRadius: 300,
      speed: 200,
      ringWidth: 40,
      damage: 15,
      hitEntities: new Set(),
    })

    bossShockwaveSystem(world, 1 / 60)

    expect(Health.current[playerEid]).toBe(initialHP) // No damage
  })

  test('once-per-player hit tracking prevents re-damage on second tick', () => {
    Position.x[playerEid] = 850 // Distance = 50
    Position.y[playerEid] = 600

    const initialHP = Health.current[playerEid]!

    world.bossShockwaves.push({
      x: 800,
      y: 600,
      currentRadius: 50,
      maxRadius: 300,
      speed: 200,
      ringWidth: 40,
      damage: 15,
      hitEntities: new Set(),
    })

    // First tick: player gets hit
    bossShockwaveSystem(world, 1 / 60)
    const hpAfterFirstHit = Health.current[playerEid]!
    expect(hpAfterFirstHit).toBe(initialHP - 15)

    // Reset i-frames so they don't block the second tick
    Health.iframes[playerEid] = 0

    // Shockwave expands but player is still in band
    // currentRadius was 50, now 50 + 200/60 = ~53.33
    // Ring band: inner = 53.33 - 20 = 33.33, outer = 53.33 + 20 = 73.33
    // Player still at distance 50, still in band

    // Second tick: player should NOT be damaged again
    bossShockwaveSystem(world, 1 / 60)
    expect(Health.current[playerEid]).toBe(hpAfterFirstHit) // No additional damage
  })

  test('shockwave removed when currentRadius exceeds maxRadius', () => {
    world.bossShockwaves.push({
      x: 800,
      y: 600,
      currentRadius: 295,
      maxRadius: 300,
      speed: 200,
      ringWidth: 40,
      damage: 15,
      hitEntities: new Set(),
    })

    expect(world.bossShockwaves.length).toBe(1)

    // After tick: 295 + 200/60 = ~298.33 (not removed yet)
    bossShockwaveSystem(world, 1 / 60)
    expect(world.bossShockwaves.length).toBe(1)

    // After another tick: ~301.67 (exceeds maxRadius, removed)
    bossShockwaveSystem(world, 1 / 60)
    expect(world.bossShockwaves.length).toBe(0)
  })

  test('early exit when no shockwaves (fast no-op)', () => {
    const initialHP = Health.current[playerEid]!

    // No shockwaves in world
    bossShockwaveSystem(world, 1 / 60)

    // Should be a complete no-op
    expect(Health.current[playerEid]).toBe(initialHP)
    expect(world.bossShockwaves.length).toBe(0)
  })

  test('multiple simultaneous shockwaves track hits independently', () => {
    // Player positioned to be hit by first shockwave's ring
    Position.x[playerEid] = 850
    Position.y[playerEid] = 600

    const initialHP = Health.current[playerEid]!

    // First shockwave: player is in ring (distance 50, ring at 50 ± 20)
    world.bossShockwaves.push({
      x: 800,
      y: 600,
      currentRadius: 50,
      maxRadius: 300,
      speed: 200,
      ringWidth: 40,
      damage: 10,
      hitEntities: new Set(),
    })

    // Second shockwave: different position, player NOT in ring
    world.bossShockwaves.push({
      x: 700,
      y: 500,
      currentRadius: 50,
      maxRadius: 300,
      speed: 200,
      ringWidth: 40,
      damage: 20,
      hitEntities: new Set(),
    })

    bossShockwaveSystem(world, 1 / 60)

    // Player should only be hit by first shockwave
    expect(Health.current[playerEid]).toBe(initialHP - 10)

    // Each shockwave tracks hits independently
    expect(world.bossShockwaves[0]!.hitEntities.has(playerEid)).toBe(true)
    expect(world.bossShockwaves[1]!.hitEntities.has(playerEid)).toBe(false)
  })

  test('dead players are not damaged', () => {
    Position.x[playerEid] = 850 // Distance = 50
    Position.y[playerEid] = 600

    addComponent(world, Dead, playerEid)
    const initialHP = Health.current[playerEid]!

    world.bossShockwaves.push({
      x: 800,
      y: 600,
      currentRadius: 50,
      maxRadius: 300,
      speed: 200,
      ringWidth: 40,
      damage: 15,
      hitEntities: new Set(),
    })

    bossShockwaveSystem(world, 1 / 60)

    expect(Health.current[playerEid]).toBe(initialHP) // No damage
  })

  test('player at inner radius boundary gets hit', () => {
    // Shockwave expands BEFORE hit check: radius 50 + 200/60 ≈ 53.33
    // After expansion: inner = 33.33, outer = 73.33
    // Place player at distance 35 (inside ring band after expansion)
    Position.x[playerEid] = 835
    Position.y[playerEid] = 600
    Health.iframes[playerEid] = 0 // Clear any i-frames from previous tests

    const initialHP = Health.current[playerEid]!

    world.bossShockwaves.push({
      x: 800,
      y: 600,
      currentRadius: 50,
      maxRadius: 300,
      speed: 200,
      ringWidth: 40,
      damage: 15,
      hitEntities: new Set(),
    })

    bossShockwaveSystem(world, 1 / 60)

    expect(Health.current[playerEid]).toBe(initialHP - 15)
  })

  test('player at outer radius boundary gets hit', () => {
    // Shockwave expands BEFORE hit check: radius 50 + 200/60 ≈ 53.33
    // After expansion: inner = 33.33, outer = 73.33
    // Place player at distance 72 (just inside outer boundary after expansion)
    Position.x[playerEid] = 872
    Position.y[playerEid] = 600

    const initialHP = Health.current[playerEid]!

    world.bossShockwaves.push({
      x: 800,
      y: 600,
      currentRadius: 50,
      maxRadius: 300,
      speed: 200,
      ringWidth: 40,
      damage: 15,
      hitEntities: new Set(),
    })

    bossShockwaveSystem(world, 1 / 60)

    expect(Health.current[playerEid]).toBe(initialHP - 15)
  })

  test('player just inside inner radius is not hit', () => {
    // Ring at radius 50, width 40 -> inner = 30, outer = 70
    // Place player at distance 29 (just inside inner boundary)
    Position.x[playerEid] = 829
    Position.y[playerEid] = 600

    const initialHP = Health.current[playerEid]!

    world.bossShockwaves.push({
      x: 800,
      y: 600,
      currentRadius: 50,
      maxRadius: 300,
      speed: 200,
      ringWidth: 40,
      damage: 15,
      hitEntities: new Set(),
    })

    bossShockwaveSystem(world, 1 / 60)

    expect(Health.current[playerEid]).toBe(initialHP) // No damage
  })

  test('player just outside outer radius is not hit', () => {
    // Shockwave expands BEFORE hit check: radius 50 + 200/60 ≈ 53.33
    // After expansion: inner = 33.33, outer = 73.33
    // Place player at distance 75 (outside outer boundary after expansion)
    Position.x[playerEid] = 875
    Position.y[playerEid] = 600
    Health.iframes[playerEid] = 0 // Clear any i-frames from previous tests

    const initialHP = Health.current[playerEid]!

    world.bossShockwaves.push({
      x: 800,
      y: 600,
      currentRadius: 50,
      maxRadius: 300,
      speed: 200,
      ringWidth: 40,
      damage: 15,
      hitEntities: new Set(),
    })

    bossShockwaveSystem(world, 1 / 60)

    expect(Health.current[playerEid]).toBe(initialHP) // No damage
  })

  test('shockwave with narrow ring width has precise hit detection', () => {
    // Very narrow ring: radius 100, width 10 -> inner = 95, outer = 105
    Position.x[playerEid] = 900 // Distance = 100
    Position.y[playerEid] = 600

    const initialHP = Health.current[playerEid]!

    world.bossShockwaves.push({
      x: 800,
      y: 600,
      currentRadius: 100,
      maxRadius: 300,
      speed: 200,
      ringWidth: 10,
      damage: 25,
      hitEntities: new Set(),
    })

    bossShockwaveSystem(world, 1 / 60)

    expect(Health.current[playerEid]).toBe(initialHP - 25)
  })

  test('shockwave at spawn (currentRadius = 0) hits player at center', () => {
    // Shockwave just spawned, radius = 0, width = 40 -> inner = 0, outer = 20
    // Player at center (distance 0) should be in ring
    Position.x[playerEid] = 800
    Position.y[playerEid] = 600

    const initialHP = Health.current[playerEid]!

    world.bossShockwaves.push({
      x: 800,
      y: 600,
      currentRadius: 0,
      maxRadius: 300,
      speed: 200,
      ringWidth: 40,
      damage: 15,
      hitEntities: new Set(),
    })

    bossShockwaveSystem(world, 1 / 60)

    // At radius 0, inner = max(0, -20) = 0, outer = 20
    // Player at distance 0 is in [0, 20]
    expect(Health.current[playerEid]).toBe(initialHP - 15)
  })

  test('lastPlayerHitDir is set when player is hit by shockwave', () => {
    // Player at (850, 600), shockwave at (800, 600)
    // Hit direction should be (1, 0) pointing away from center
    Position.x[playerEid] = 850
    Position.y[playerEid] = 600

    world.bossShockwaves.push({
      x: 800,
      y: 600,
      currentRadius: 50,
      maxRadius: 300,
      speed: 200,
      ringWidth: 40,
      damage: 15,
      hitEntities: new Set(),
    })

    bossShockwaveSystem(world, 1 / 60)

    const hitDir = world.lastPlayerHitDir.get(playerEid)
    expect(hitDir).toBeDefined()
    expect(hitDir!.x).toBeCloseTo(1, 2)
    expect(hitDir!.y).toBeCloseTo(0, 2)
  })

  test('i-frames are set after taking shockwave damage', () => {
    Position.x[playerEid] = 850
    Position.y[playerEid] = 600

    Health.iframes[playerEid] = 0 // No i-frames initially

    world.bossShockwaves.push({
      x: 800,
      y: 600,
      currentRadius: 50,
      maxRadius: 300,
      speed: 200,
      ringWidth: 40,
      damage: 15,
      hitEntities: new Set(),
    })

    bossShockwaveSystem(world, 1 / 60)

    // applyDamage should set i-frames
    expect(Health.iframes[playerEid]!).toBeGreaterThan(0)
  })
})
