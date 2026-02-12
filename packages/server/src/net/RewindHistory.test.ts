import { describe, expect, test } from 'bun:test'
import { addComponent } from 'bitecs'
import { createGameWorld, Position, Dead, spawnGrunt, spawnPlayer } from '@high-noon/shared'
import { RewindHistory } from './RewindHistory'

describe('RewindHistory', () => {
  test('records and retrieves player/enemy state by tick', () => {
    const world = createGameWorld(1)
    const player = spawnPlayer(world, 10, 20)
    const enemy = spawnGrunt(world, 30, 40)
    const history = new RewindHistory(16)

    world.tick = 10
    history.record(world)

    Position.x[player] = 11
    Position.y[player] = 22
    Position.x[enemy] = 33
    Position.y[enemy] = 44
    world.tick = 11
    history.record(world)

    expect(history.getPlayerAtTick(player, 10)).toEqual({ x: 10, y: 20 })
    expect(history.getPlayerAtTick(player, 11)).toEqual({ x: 11, y: 22 })

    const enemyAt11 = history.getEnemyStateAtTick(enemy, 11)
    expect(enemyAt11?.x).toBe(33)
    expect(enemyAt11?.y).toBe(44)
    expect(enemyAt11?.alive).toBe(true)
  })

  test('returns nearest frame at or before requested tick', () => {
    const world = createGameWorld(1)
    const player = spawnPlayer(world, 100, 100)
    const history = new RewindHistory(16)

    world.tick = 20
    history.record(world)
    Position.x[player] = 120
    world.tick = 21
    history.record(world)

    expect(history.getPlayerAtTick(player, 22)).toEqual({ x: 120, y: 100 })
    expect(history.getPlayerAtTick(player, 19)).toBeNull()
  })

  test('tracks enemy alive flag and evicts old frames', () => {
    const world = createGameWorld(1)
    const enemy = spawnGrunt(world, 50, 50)
    const history = new RewindHistory(2)

    world.tick = 1
    history.record(world)
    world.tick = 2
    history.record(world)
    addComponent(world, Dead, enemy)
    world.tick = 3
    history.record(world)

    expect(history.hasTick(1)).toBe(false)
    expect(history.hasTick(2)).toBe(true)
    expect(history.hasTick(3)).toBe(true)
    expect(history.getEnemyStateAtTick(enemy, 3)?.alive).toBe(false)
  })
})
