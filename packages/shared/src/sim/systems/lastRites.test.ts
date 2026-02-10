import { describe, expect, test, beforeEach } from 'bun:test'
import { addComponent, addEntity, defineQuery } from 'bitecs'
import { createGameWorld, type GameWorld } from '../world'
import { getCharacterDef } from '../content/characters'
import { spawnPlayer } from '../prefabs'
import { lastRitesSystem } from './lastRites'
import { Button, createInputState, type InputState } from '../../net/input'
import {
  Player,
  Showdown,
  Position,
  Velocity,
  Speed,
  Enemy,
  Health,
  Dead,
  Collider,
  EnemyAI,
  Detection,
  AttackConfig,
  Steering,
} from '../components'
import { createSpatialHash, rebuildSpatialHash } from '../SpatialHash'

// Query for all entities with Position + Collider (for spatial hash)
const hashQuery = defineQuery([Position, Collider])

/** Spawn a minimal enemy at (x, y) with given HP */
function spawnTestEnemy(world: GameWorld, x: number, y: number, hp = 10): number {
  const eid = addEntity(world)
  addComponent(world, Position, eid)
  addComponent(world, Velocity, eid)
  addComponent(world, Speed, eid)
  addComponent(world, Collider, eid)
  addComponent(world, Health, eid)
  addComponent(world, Enemy, eid)
  addComponent(world, EnemyAI, eid)
  addComponent(world, Detection, eid)
  addComponent(world, AttackConfig, eid)
  addComponent(world, Steering, eid)
  Position.x[eid] = x
  Position.y[eid] = y
  Health.current[eid] = hp
  Health.max[eid] = hp
  Collider.radius[eid] = 8 // Required for spatial hash
  return eid
}

function abilityInput(cursorX = 0, cursorY = 0): InputState {
  const input = createInputState()
  input.buttons |= Button.ABILITY
  input.cursorWorldX = cursorX
  input.cursorWorldY = cursorY
  return input
}

/** Set per-entity input on world.playerInputs */
function setInput(world: GameWorld, eid: number, input: InputState): void {
  world.playerInputs.set(eid, input)
}

/** Rebuild spatial hash from all Position + Collider entities */
function rebuildHash(world: GameWorld): void {
  if (!world.spatialHash) return
  const eids = hashQuery(world)
  rebuildSpatialHash(world.spatialHash, eids, Position.x, Position.y)
}

describe('lastRitesSystem', () => {
  let world: GameWorld
  let playerEid: number
  const dt = 1 / 60

  beforeEach(() => {
    // MUST pass undertaker CharacterDef so zone stats are non-zero
    world = createGameWorld(42, getCharacterDef('undertaker'))
    playerEid = spawnPlayer(world, 100, 100)
    world.spatialHash = createSpatialHash(800, 600, 32)
  })

  describe('activation', () => {
    test('places zone at cursor position', () => {
      setInput(world, playerEid, abilityInput(200, 150))
      lastRitesSystem(world, dt)

      expect(Showdown.active[playerEid]).toBe(1)
      expect(world.lastRites).not.toBeNull()
      expect(world.lastRites!.active).toBe(true)
      expect(world.lastRites!.x).toBe(200)
      expect(world.lastRites!.y).toBe(150)
      expect(world.lastRites!.radius).toBeGreaterThan(0)
      expect(world.lastRites!.timeRemaining).toBeGreaterThan(0)
      expect(world.lastRites!.chainCount).toBe(0)
      expect(world.lastRites!.pendingPulses.length).toBe(0)
    })

    test('clamps cursor to max placement range', () => {
      const us = world.upgradeState
      const maxRange = us.showdownMarkRange

      // Cursor far beyond range
      setInput(world, playerEid, abilityInput(100 + maxRange + 200, 100))
      lastRitesSystem(world, dt)

      expect(world.lastRites).not.toBeNull()
      expect(world.lastRites!.active).toBe(true)

      // Zone should be clamped to max range
      const dx = world.lastRites!.x - 100
      const dy = world.lastRites!.y - 100
      const dist = Math.sqrt(dx * dx + dy * dy)
      expect(dist).toBeCloseTo(maxRange, 1)
    })

    test('blocked by cooldown', () => {
      Showdown.cooldown[playerEid] = 5.0

      setInput(world, playerEid, abilityInput(200, 100))
      lastRitesSystem(world, dt)

      expect(Showdown.active[playerEid]).toBe(0)
      expect(world.lastRites).toBeNull()
    })

    test('blocked when already active', () => {
      // First activation
      setInput(world, playerEid, abilityInput(200, 100))
      lastRitesSystem(world, dt)

      const firstX = world.lastRites!.x
      const firstY = world.lastRites!.y

      // Try to activate again with different cursor
      setInput(world, playerEid, abilityInput(300, 200))
      lastRitesSystem(world, dt)

      // Zone position should not change
      expect(world.lastRites!.x).toBe(firstX)
      expect(world.lastRites!.y).toBe(firstY)
    })

    test('requires re-press (hold does not re-activate)', () => {
      // First press -- activates
      setInput(world, playerEid, abilityInput(200, 100))
      lastRitesSystem(world, dt)
      expect(Showdown.active[playerEid]).toBe(1)

      // Expire the zone manually
      Showdown.active[playerEid] = 0
      Showdown.duration[playerEid] = 0
      Showdown.cooldown[playerEid] = 0
      world.lastRites = null

      // Hold -- should NOT re-activate (wasDown = 1)
      setInput(world, playerEid, abilityInput(200, 100))
      lastRitesSystem(world, dt)
      expect(Showdown.active[playerEid]).toBe(0)
      expect(world.lastRites).toBeNull()
    })

    test('sets lastRitesActivatedThisTick flag', () => {
      setInput(world, playerEid, abilityInput(200, 100))
      lastRitesSystem(world, dt)

      expect(world.lastRitesActivatedThisTick).toBe(true)
    })

    test('does not set lastRitesActivatedThisTick when blocked by cooldown', () => {
      Showdown.cooldown[playerEid] = 5.0

      setInput(world, playerEid, abilityInput(200, 100))
      lastRitesSystem(world, dt)

      expect(world.lastRitesActivatedThisTick).toBe(false)
    })
  })

  describe('duration', () => {
    beforeEach(() => {
      // Activate zone
      setInput(world, playerEid, abilityInput(200, 100))
      lastRitesSystem(world, dt)
      // Clear input
      world.playerInputs.clear()
    })

    test('decrements timeRemaining while active', () => {
      const initialTime = world.lastRites!.timeRemaining

      lastRitesSystem(world, 0.5)

      expect(world.lastRites!.timeRemaining).toBeCloseTo(initialTime - 0.5)
    })

    test('syncs Showdown.duration with timeRemaining', () => {
      lastRitesSystem(world, 0.5)

      expect(Showdown.duration[playerEid]).toBeCloseTo(world.lastRites!.timeRemaining)
    })

    test('deactivates on expiry', () => {
      // Fast-forward to near expiry
      world.lastRites!.timeRemaining = 0.01

      lastRitesSystem(world, 0.02)

      expect(Showdown.active[playerEid]).toBe(0)
      expect(Showdown.duration[playerEid]).toBe(0)
      expect(world.lastRites!.active).toBe(false)
    })

    test('sets cooldown on expiry', () => {
      const us = world.upgradeState
      world.lastRites!.timeRemaining = 0.01

      lastRitesSystem(world, 0.02)

      expect(Showdown.cooldown[playerEid]).toBeCloseTo(us.showdownCooldown)
    })

    test('sets lastRitesExpiredThisTick on expiry', () => {
      world.lastRites!.timeRemaining = 0.01

      lastRitesSystem(world, 0.02)

      expect(world.lastRitesExpiredThisTick).toBe(true)
    })

    test('does not set lastRitesExpiredThisTick when still active', () => {
      world.lastRites!.timeRemaining = 3.0

      lastRitesSystem(world, dt)

      expect(world.lastRitesExpiredThisTick).toBe(false)
    })
  })

  describe('cooldown', () => {
    test('decrements each tick', () => {
      Showdown.cooldown[playerEid] = 5.0

      setInput(world, playerEid, createInputState())
      lastRitesSystem(world, 1.0)

      expect(Showdown.cooldown[playerEid]).toBeCloseTo(4.0)
    })

    test('does not go below 0', () => {
      Showdown.cooldown[playerEid] = 0.005

      setInput(world, playerEid, createInputState())
      lastRitesSystem(world, dt)

      expect(Showdown.cooldown[playerEid]).toBe(0)
    })
  })

  describe('death pulse processing', () => {
    beforeEach(() => {
      // Activate zone at (200, 100)
      setInput(world, playerEid, abilityInput(200, 100))
      lastRitesSystem(world, dt)
      world.playerInputs.clear()
    })

    test('damages enemies near pulse origin', () => {
      const us = world.upgradeState
      const enemy = spawnTestEnemy(world, 200, 120, 20) // Within pulse radius (100px)

      rebuildHash(world)

      // Manually queue a pulse
      world.lastRites!.pendingPulses.push({
        x: 200,
        y: 100,
        damage: us.pulseDamage,
      })

      lastRitesSystem(world, dt)

      expect(Health.current[enemy]).toBe(20 - us.pulseDamage)
    })

    test('does not damage enemies beyond pulse radius', () => {
      const enemy = spawnTestEnemy(world, 200, 250, 20) // Beyond pulse radius

      rebuildHash(world)

      world.lastRites!.pendingPulses.push({
        x: 200,
        y: 100,
        damage: 8,
      })

      lastRitesSystem(world, dt)

      expect(Health.current[enemy]).toBe(20) // Unchanged
    })

    test('chains on kill inside zone', () => {
      const us = world.upgradeState
      const enemy1 = spawnTestEnemy(world, 200, 120, 8) // Will be killed by pulse
      const enemy2 = spawnTestEnemy(world, 200, 210, 30) // Outside initial pulse, inside chain pulse range

      rebuildHash(world)

      world.lastRites!.pendingPulses.push({
        x: 200,
        y: 100,
        damage: us.pulseDamage,
      })

      lastRitesSystem(world, dt)

      expect(Health.current[enemy1]).toBe(0)
      expect(world.lastRites!.chainCount).toBe(1)
      // Chain pulse is processed in same tick, damaging enemy2
      expect(Health.current[enemy2]).toBe(30 - us.pulseDamage)
    })

    test('does not chain on kill outside zone', () => {
      const us = world.upgradeState
      // Enemy outside zone radius (150px default)
      const enemy = spawnTestEnemy(world, 200, 300, 8)

      rebuildHash(world)

      // Pulse far from zone center but close to enemy
      world.lastRites!.pendingPulses.push({
        x: 200,
        y: 280,
        damage: us.pulseDamage,
      })

      lastRitesSystem(world, dt)

      expect(Health.current[enemy]).toBe(0)
      expect(world.lastRites!.chainCount).toBe(0) // No chain
      expect(world.lastRites!.pendingPulses.length).toBe(0)
    })

    test('respects chain limit', () => {
      const us = world.upgradeState
      const chainLimit = us.chainLimit

      // Set chain count to limit
      world.lastRites!.chainCount = chainLimit

      const enemy = spawnTestEnemy(world, 200, 120, 8)
      rebuildHash(world)

      world.lastRites!.pendingPulses.push({
        x: 200,
        y: 100,
        damage: us.pulseDamage,
      })

      lastRitesSystem(world, dt)

      expect(Health.current[enemy]).toBe(0)
      expect(world.lastRites!.chainCount).toBe(chainLimit) // No increment
      expect(world.lastRites!.pendingPulses.length).toBe(0) // No new pulse
    })

    test('refunds cooldown per chain kill', () => {
      const us = world.upgradeState
      const enemy = spawnTestEnemy(world, 200, 150, 8)

      rebuildHash(world)

      // Set initial cooldown
      Showdown.cooldown[playerEid] = 10.0

      world.lastRites!.pendingPulses.push({
        x: 200,
        y: 100,
        damage: us.pulseDamage,
      })

      lastRitesSystem(world, dt)

      // One chain kill
      expect(world.lastRites!.chainCount).toBe(1)
      // 1 refund minus the dt decrement that happens at the start of the system
      expect(Showdown.cooldown[playerEid]).toBeCloseTo(10.0 - dt - us.showdownKillRefund)
    })

    test('sets lastRitesPulseThisTick when processing pulses', () => {
      const us = world.upgradeState
      spawnTestEnemy(world, 200, 120, 20)

      rebuildHash(world)

      world.lastRites!.pendingPulses.push({
        x: 200,
        y: 100,
        damage: us.pulseDamage,
      })

      lastRitesSystem(world, dt)

      expect(world.lastRitesPulseThisTick).toBe(true)
    })

    test('does not set lastRitesPulseThisTick when no pulses', () => {
      lastRitesSystem(world, dt)

      expect(world.lastRitesPulseThisTick).toBe(false)
    })

    test('does not damage dead enemies', () => {
      const us = world.upgradeState
      const enemy = spawnTestEnemy(world, 200, 120, 20)
      addComponent(world, Dead, enemy)

      rebuildHash(world)

      world.lastRites!.pendingPulses.push({
        x: 200,
        y: 100,
        damage: us.pulseDamage,
      })

      lastRitesSystem(world, dt)

      expect(Health.current[enemy]).toBe(20) // Unchanged
    })

    test('does not damage enemies with current HP <= 0', () => {
      const us = world.upgradeState
      const enemy = spawnTestEnemy(world, 200, 120, 0)

      rebuildHash(world)

      world.lastRites!.pendingPulses.push({
        x: 200,
        y: 100,
        damage: us.pulseDamage,
      })

      lastRitesSystem(world, dt)

      expect(Health.current[enemy]).toBe(0) // Still 0
    })
  })

  describe('consecrated ground', () => {
    beforeEach(() => {
      // Take the consecrated_ground node
      world.upgradeState.nodesTaken.add('consecrated_ground')

      // Activate zone at (200, 100)
      setInput(world, playerEid, abilityInput(200, 100))
      lastRitesSystem(world, dt)
      world.playerInputs.clear()
    })

    test('ticks DPS on enemies inside zone', () => {
      const enemy = spawnTestEnemy(world, 200, 120, 20) // Inside zone

      rebuildHash(world)

      lastRitesSystem(world, 1.0) // 1 second

      // 3 DPS * 1 second = 3 damage
      expect(Health.current[enemy]).toBe(17)
    })

    test('does not damage enemies outside zone', () => {
      const enemy = spawnTestEnemy(world, 500, 100, 20) // Far outside

      rebuildHash(world)

      lastRitesSystem(world, 1.0)

      expect(Health.current[enemy]).toBe(20) // Unchanged
    })

    test('does not tick when zone inactive', () => {
      const enemy = spawnTestEnemy(world, 200, 120, 20)

      rebuildHash(world)

      // Expire the zone
      world.lastRites!.timeRemaining = 0.01
      lastRitesSystem(world, 0.02)

      const hpAfterExpiry = Health.current[enemy]

      // Tick again while zone inactive
      lastRitesSystem(world, 1.0)

      expect(Health.current[enemy]).toBe(hpAfterExpiry) // No additional damage
    })

    test('does not damage dead enemies', () => {
      const enemy = spawnTestEnemy(world, 200, 120, 20)
      addComponent(world, Dead, enemy)

      rebuildHash(world)

      lastRitesSystem(world, 1.0)

      expect(Health.current[enemy]).toBe(20) // Unchanged
    })

    test('does not damage enemies with HP <= 0', () => {
      const enemy = spawnTestEnemy(world, 200, 120, 0)

      rebuildHash(world)

      lastRitesSystem(world, 1.0)

      expect(Health.current[enemy]).toBe(0) // Still 0
    })

    test('does not damage enemies with iframes > 0', () => {
      const enemy = spawnTestEnemy(world, 200, 120, 20)
      Health.iframes[enemy] = 0.5

      rebuildHash(world)

      lastRitesSystem(world, 1.0)

      expect(Health.current[enemy]).toBe(20) // Unchanged
    })

    test('does not tick without consecrated_ground node', () => {
      // Remove the node
      world.upgradeState.nodesTaken.delete('consecrated_ground')

      const enemy = spawnTestEnemy(world, 200, 120, 20)

      rebuildHash(world)

      lastRitesSystem(world, 1.0)

      expect(Health.current[enemy]).toBe(20) // No damage
    })
  })

  describe('overtime', () => {
    beforeEach(() => {
      // Take the undertakers_overtime node
      world.upgradeState.nodesTaken.add('undertakers_overtime')

      // Activate zone at (200, 100)
      setInput(world, playerEid, abilityInput(200, 100))
      lastRitesSystem(world, dt)
      world.playerInputs.clear()
    })

    test('allows infinite chains', () => {
      const us = world.upgradeState

      // Set chain count beyond default limit
      world.lastRites!.chainCount = 10

      const enemy1 = spawnTestEnemy(world, 200, 120, 8)
      const enemy2 = spawnTestEnemy(world, 200, 140, 20)
      rebuildHash(world)

      world.lastRites!.pendingPulses.push({
        x: 200,
        y: 100,
        damage: us.pulseDamage,
      })

      lastRitesSystem(world, dt)

      expect(Health.current[enemy1]).toBe(0)
      expect(world.lastRites!.chainCount).toBe(11) // Chain still happens
      // Chain pulse damages enemy2
      expect(Health.current[enemy2]).toBeLessThan(20)
    })

    test('adds +3 damage per chain', () => {
      const us = world.upgradeState

      // Create two enemies: first will die, second will take escalated damage but survive
      const enemy1 = spawnTestEnemy(world, 200, 150, 8) // Dies from base pulse
      const enemy2 = spawnTestEnemy(world, 200, 210, 30) // Outside initial pulse, takes escalated chain damage
      rebuildHash(world)

      world.lastRites!.pendingPulses.push({
        x: 200,
        y: 100,
        damage: us.pulseDamage,
      })

      lastRitesSystem(world, dt)

      expect(world.lastRites!.chainCount).toBe(1)
      expect(world.lastRites!.chainDamageBonus).toBe(3)
      // Enemy2 should take pulse damage + 3 (chain bonus)
      expect(Health.current[enemy2]).toBe(30 - (us.pulseDamage + 3))
    })

    test('fully refunds cooldown on 5+ chains at expiry', () => {
      world.lastRites!.chainCount = 5
      world.lastRites!.timeRemaining = 0.01

      lastRitesSystem(world, 0.02)

      expect(Showdown.cooldown[playerEid]).toBe(0) // Full refund
    })

    test('does not fully refund cooldown on <5 chains at expiry', () => {
      const us = world.upgradeState
      world.lastRites!.chainCount = 4
      world.lastRites!.timeRemaining = 0.01

      lastRitesSystem(world, 0.02)

      expect(Showdown.cooldown[playerEid]).toBeCloseTo(us.showdownCooldown) // Normal cooldown
    })

    test('does not fully refund without overtime node', () => {
      world.upgradeState.nodesTaken.delete('undertakers_overtime')

      world.lastRites!.chainCount = 5
      world.lastRites!.timeRemaining = 0.01

      lastRitesSystem(world, 0.02)

      const us = world.upgradeState
      expect(Showdown.cooldown[playerEid]).toBeCloseTo(us.showdownCooldown) // Normal cooldown
    })

    test('escalating damage applies to queued pulses', () => {
      const us = world.upgradeState

      // Create 3 enemies spaced to avoid overlap
      const enemy1 = spawnTestEnemy(world, 120, 100, 8) // Dies from initial pulse
      const enemy2 = spawnTestEnemy(world, 200, 100, 11) // Dies from first chain (+3 damage)
      const enemy3 = spawnTestEnemy(world, 280, 100, 30) // Takes second chain damage (+6 total) but survives
      rebuildHash(world)

      world.lastRites!.pendingPulses.push({
        x: 100,
        y: 100,
        damage: us.pulseDamage,
      })

      lastRitesSystem(world, dt)

      expect(world.lastRites!.chainCount).toBe(2) // Two chains happened
      expect(world.lastRites!.chainDamageBonus).toBe(6) // +3 per chain
      // Enemy3 should take base damage (8) + bonus (6) = 14
      expect(Health.current[enemy3]).toBe(30 - 14)
    })
  })

  describe('per-tick flag reset', () => {
    test('resets all flags at start of tick', () => {
      // Set flags manually
      world.lastRitesPulseThisTick = true
      world.lastRitesActivatedThisTick = true
      world.lastRitesExpiredThisTick = true

      lastRitesSystem(world, dt)

      // If no relevant events happen, flags should be false
      expect(world.lastRitesPulseThisTick).toBe(false)
      expect(world.lastRitesActivatedThisTick).toBe(false)
      expect(world.lastRitesExpiredThisTick).toBe(false)
    })

    test('clears overkillProcessed set', () => {
      world.overkillProcessed.add(123)

      lastRitesSystem(world, dt)

      expect(world.overkillProcessed.size).toBe(0)
    })
  })

  describe('no input', () => {
    test('does nothing without input state (no activation)', () => {
      // playerInputs is empty
      lastRitesSystem(world, dt)

      expect(Showdown.active[playerEid]).toBe(0)
      expect(world.lastRites).toBeNull()
    })

    test('still processes active zone without input', () => {
      // Activate zone
      setInput(world, playerEid, abilityInput(200, 100))
      lastRitesSystem(world, dt)

      const initialTime = world.lastRites!.timeRemaining

      // Clear input
      world.playerInputs.clear()

      // Tick without input
      lastRitesSystem(world, dt)

      // Duration should still decrement
      expect(world.lastRites!.timeRemaining).toBeCloseTo(initialTime - dt)
    })
  })

  describe('edge cases', () => {
    test('handles multiple chain kills in same pulse', () => {
      const us = world.upgradeState

      // Activate zone
      setInput(world, playerEid, abilityInput(200, 100))
      lastRitesSystem(world, dt)
      world.playerInputs.clear()

      // Two enemies close together, both killable by pulse, plus a third with high HP to survive
      const enemy1 = spawnTestEnemy(world, 200, 110, 8)
      const enemy2 = spawnTestEnemy(world, 200, 130, 8)
      const enemy3 = spawnTestEnemy(world, 200, 150, 50)

      rebuildHash(world)

      world.lastRites!.pendingPulses.push({
        x: 200,
        y: 100,
        damage: us.pulseDamage,
      })

      lastRitesSystem(world, dt)

      // Both should be killed
      expect(Health.current[enemy1]).toBe(0)
      expect(Health.current[enemy2]).toBe(0)

      // Both should generate chain pulses that process in same tick
      expect(world.lastRites!.chainCount).toBe(2)
      // Enemy3 is damaged by chain pulses
      expect(Health.current[enemy3]).toBeLessThan(50)
    })

    test('pulse processing is iterative within same tick', () => {
      const us = world.upgradeState

      setInput(world, playerEid, abilityInput(200, 100))
      lastRitesSystem(world, dt)
      world.playerInputs.clear()

      // Create a chain spaced at 90px apart (within pulse radius of 100px)
      const enemy1 = spawnTestEnemy(world, 110, 100, 8)
      const enemy2 = spawnTestEnemy(world, 200, 100, 8)
      const enemy3 = spawnTestEnemy(world, 290, 100, 8)
      rebuildHash(world)

      // Queue initial pulse
      world.lastRites!.pendingPulses.push({
        x: 100,
        y: 100,
        damage: us.pulseDamage,
      })

      lastRitesSystem(world, dt)

      // All processing happens in one tick
      expect(Health.current[enemy1]).toBe(0) // Killed by initial pulse
      expect(Health.current[enemy2]).toBe(0) // Killed by first chain
      expect(Health.current[enemy3]).toBe(0) // Killed by second chain
      // Chain limit reached (3)
      expect(world.lastRites!.chainCount).toBe(3)
    })

    test('zone placement at exact max range', () => {
      const us = world.upgradeState
      const maxRange = us.showdownMarkRange

      setInput(world, playerEid, abilityInput(100 + maxRange, 100))
      lastRitesSystem(world, dt)

      expect(world.lastRites).not.toBeNull()
      const dx = world.lastRites!.x - 100
      const dy = world.lastRites!.y - 100
      const dist = Math.sqrt(dx * dx + dy * dy)
      expect(dist).toBeCloseTo(maxRange, 1)
    })

    test('zone placement within max range', () => {
      setInput(world, playerEid, abilityInput(150, 150))
      lastRitesSystem(world, dt)

      expect(world.lastRites).not.toBeNull()
      expect(world.lastRites!.x).toBe(150)
      expect(world.lastRites!.y).toBe(150)
    })
  })
})
