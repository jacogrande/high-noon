import { beforeEach, describe, expect, test } from 'bun:test'
import { addComponent, addEntity, hasComponent } from 'bitecs'
import { createGameWorld, setWorldTilemap, type GameWorld } from '../world'
import { spawnPlayer } from '../prefabs'
import { playerInputSystem } from './playerInput'
import { jumpSystem } from './jump'
import { spatialHashSystem } from './spatialHash'
import { collisionSystem } from './collision'
import { createInputState, Button, type InputState } from '../../net/input'
import {
  Jump,
  ZPosition,
  PlayerState,
  PlayerStateType,
  Position,
  Velocity,
  Speed,
  Health,
  Enemy,
  Collider,
  EnemyAI,
  Detection,
  AttackConfig,
  Steering,
  Roll,
} from '../components'
import {
  JUMP_HEIGHT,
  JUMP_LANDING_DURATION,
  JUMP_STOMP_DAMAGE,
  JUMP_STOMP_RADIUS,
} from '../content/jump'
import { createTilemap, addLayer, setTile, TileType, isSolidAt } from '../tilemap'
import { TICK_S } from '../step'

function jumpInput(): InputState {
  const input = createInputState()
  input.buttons |= Button.JUMP
  return input
}

function emptyInput(): InputState {
  return createInputState()
}

function setInput(world: GameWorld, eid: number, input: InputState): void {
  world.playerInputs.set(eid, input)
}

function spawnTestEnemy(world: GameWorld, x: number, y: number, hp = 20): number {
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
  Collider.radius[eid] = 10
  return eid
}

function createHalfWallMap() {
  const map = createTilemap(6, 6, 32)
  addLayer(map, true)
  addLayer(map, false)

  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 6; x++) {
      setTile(map, 1, x, y, TileType.FLOOR)
    }
  }

  for (let x = 0; x < 6; x++) {
    setTile(map, 0, x, 0, TileType.WALL)
    setTile(map, 0, x, 5, TileType.WALL)
  }
  for (let y = 0; y < 6; y++) {
    setTile(map, 0, 0, y, TileType.WALL)
    setTile(map, 0, 5, y, TileType.WALL)
  }

  setTile(map, 0, 2, 2, TileType.HALF_WALL)
  return map
}

describe('jumpSystem', () => {
  let world: GameWorld
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    playerEid = spawnPlayer(world, 400, 300)
  })

  test('jump press transitions player into jumping state', () => {
    setInput(world, playerEid, jumpInput())
    playerInputSystem(world, TICK_S)

    expect(PlayerState.state[playerEid]).toBe(PlayerStateType.JUMPING)
    expect(hasComponent(world, Jump, playerEid)).toBe(true)
    expect(ZPosition.zVelocity[playerEid]!).toBeGreaterThan(0)
  })

  test('jump arc reaches near configured height then lands', () => {
    setInput(world, playerEid, jumpInput())
    playerInputSystem(world, TICK_S)

    let maxZ = 0
    for (let i = 0; i < 24; i++) {
      world.playerInputs.clear()
      setInput(world, playerEid, emptyInput())
      playerInputSystem(world, TICK_S)
      jumpSystem(world, TICK_S)
      maxZ = Math.max(maxZ, ZPosition.z[playerEid]!)
    }

    expect(maxZ).toBeGreaterThan(JUMP_HEIGHT * 0.8)
    expect(maxZ).toBeLessThan(JUMP_HEIGHT * 1.2)
    expect(PlayerState.state[playerEid]).toBe(PlayerStateType.LANDING)

    const landingFrames = Math.ceil(JUMP_LANDING_DURATION / TICK_S) + 1
    for (let i = 0; i < landingFrames; i++) {
      world.playerInputs.clear()
      setInput(world, playerEid, emptyInput())
      playerInputSystem(world, TICK_S)
      jumpSystem(world, TICK_S)
    }

    expect(hasComponent(world, Jump, playerEid)).toBe(false)
    expect(PlayerState.state[playerEid]).toBe(PlayerStateType.IDLE)
  })

  test('rolling is blocked while airborne', () => {
    setInput(world, playerEid, jumpInput())
    playerInputSystem(world, TICK_S)
    jumpSystem(world, TICK_S)

    const rollAttempt = createInputState()
    rollAttempt.buttons |= Button.ROLL
    world.playerInputs.clear()
    setInput(world, playerEid, rollAttempt)
    playerInputSystem(world, TICK_S)

    expect(hasComponent(world, Roll, playerEid)).toBe(false)
    expect(PlayerState.state[playerEid]).toBe(PlayerStateType.JUMPING)
  })

  test('landing stomp damages enemies in radius', () => {
    const map = createHalfWallMap()
    setWorldTilemap(world, map)
    Position.x[playerEid] = 3 * 32 + 16
    Position.y[playerEid] = 3 * 32 + 16

    const enemyEid = spawnTestEnemy(world, Position.x[playerEid]! + JUMP_STOMP_RADIUS - 4, Position.y[playerEid]!, 20)
    const startHp = Health.current[enemyEid]!

    setInput(world, playerEid, jumpInput())
    playerInputSystem(world, TICK_S)

    let landed = false
    for (let i = 0; i < 120; i++) {
      spatialHashSystem(world, TICK_S)
      world.playerInputs.clear()
      setInput(world, playerEid, emptyInput())
      playerInputSystem(world, TICK_S)
      jumpSystem(world, TICK_S)
      if (PlayerState.state[playerEid] === PlayerStateType.LANDING) {
        landed = true
        break
      }
    }

    expect(landed).toBe(true)
    expect(Health.current[enemyEid]).toBe(startHp - JUMP_STOMP_DAMAGE)
    expect(world.jumpStompThisTick).toBe(true)
  })

  test('half-wall collision is skipped while airborne but blocks while grounded', () => {
    const map = createHalfWallMap()
    setWorldTilemap(world, map)

    const hwX = 2 * 32 + 16
    const hwY = 2 * 32 + 16

    Position.x[playerEid] = hwX
    Position.y[playerEid] = hwY
    ZPosition.z[playerEid] = 8
    collisionSystem(world, TICK_S)
    expect(Position.x[playerEid]).toBe(hwX)
    expect(Position.y[playerEid]).toBe(hwY)

    ZPosition.z[playerEid] = 0
    collisionSystem(world, TICK_S)
    const moved = Position.x[playerEid] !== hwX || Position.y[playerEid] !== hwY
    expect(moved).toBe(true)
  })

  test('landing on half-wall pushes to nearest open tile', () => {
    const map = createHalfWallMap()
    setWorldTilemap(world, map)

    const hwX = 2 * 32 + 16
    const hwY = 2 * 32 + 16

    setInput(world, playerEid, jumpInput())
    playerInputSystem(world, TICK_S)

    Position.x[playerEid] = hwX
    Position.y[playerEid] = hwY
    ZPosition.z[playerEid] = 0.5
    ZPosition.zVelocity[playerEid] = -100

    jumpSystem(world, TICK_S)

    expect(PlayerState.state[playerEid]).toBe(PlayerStateType.LANDING)
    expect(isSolidAt(map, Position.x[playerEid]!, Position.y[playerEid]!)).toBe(false)
  })
})
