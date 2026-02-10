import { describe, expect, test, beforeEach } from 'bun:test'
import { addComponent } from 'bitecs'
import { createGameWorld, type GameWorld } from '../world'
import { spawnPlayer } from '../prefabs'
import { applyNodeEffect } from './nodeEffects'
import { PROSPECTOR } from './characters/prospector'
import { Health, MeleeWeapon, Roll, Position } from '../components'

function createProspectorWorld(): GameWorld {
  return createGameWorld(42, PROSPECTOR)
}

describe('Brace (hook effect)', () => {
  let world: GameWorld
  let playerEid: number

  beforeEach(() => {
    world = createProspectorWorld()
    playerEid = spawnPlayer(world, 100, 100)
    applyNodeEffect(world, 'brace')
  })

  test('reduces damage by 30% while charging', () => {
    MeleeWeapon.charging[playerEid] = 1
    const oldHP = Health.current[playerEid]!

    // Simulate taking 10 damage (oldHP → oldHP - 10)
    Health.current[playerEid] = oldHP - 10
    world.hooks.fireHealthChanged(world, playerEid, oldHP, oldHP - 10)

    // Brace reduces damage: 10 * 0.7 = 7, so HP = oldHP - 7
    expect(Health.current[playerEid]).toBe(oldHP - 7)
  })

  test('does not reduce damage when not charging', () => {
    MeleeWeapon.charging[playerEid] = 0
    const oldHP = Health.current[playerEid]!

    Health.current[playerEid] = oldHP - 10
    world.hooks.fireHealthChanged(world, playerEid, oldHP, oldHP - 10)

    // No reduction — HP stays at oldHP - 10
    expect(Health.current[playerEid]).toBe(oldHP - 10)
  })

  test('does not affect healing', () => {
    MeleeWeapon.charging[playerEid] = 1
    Health.current[playerEid] = 5
    const oldHP = 5
    const newHP = 8

    Health.current[playerEid] = newHP
    world.hooks.fireHealthChanged(world, playerEid, oldHP, newHP)

    // Healing is unaffected
    expect(Health.current[playerEid]).toBe(8)
  })
})

describe('Rockslide (hook effect)', () => {
  let world: GameWorld
  let playerEid: number

  beforeEach(() => {
    world = createProspectorWorld()
    playerEid = spawnPlayer(world, 100, 100)
    applyNodeEffect(world, 'rockslide')
  })

  test('spawns shockwave at roll START position, not current position', () => {
    // Record roll start position
    Roll.startX[playerEid] = 100
    Roll.startY[playerEid] = 100

    // Player moves to a different position during roll
    Position.x[playerEid] = 250
    Position.y[playerEid] = 250

    // Fire roll end hook (roll has ended, player is at 250,250)
    world.hooks.fireRollEnd(world, playerEid)

    expect(world.rockslideShockwaves).toHaveLength(1)
    // Shockwave should be at the start position (100, 100)
    expect(world.rockslideShockwaves[0]!.x).toBe(100)
    expect(world.rockslideShockwaves[0]!.y).toBe(100)
  })

  test('shockwave has correct damage and slow parameters', () => {
    Roll.startX[playerEid] = 100
    Roll.startY[playerEid] = 100
    world.hooks.fireRollEnd(world, playerEid)

    const shock = world.rockslideShockwaves[0]!
    expect(shock.damage).toBe(5)
    expect(shock.radius).toBe(80)
    expect(shock.slow).toBe(0.75)
    expect(shock.slowDuration).toBe(1.5)
    expect(shock.processed).toBe(false)
  })
})
