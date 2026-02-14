import { describe, expect, test } from 'bun:test'
import { addComponent } from 'bitecs'
import {
  Dead,
  DEFAULT_RUN_STAGES,
  NPC_TYPE,
  createGameWorld,
  generateArena,
  setWorldTilemap,
  spawnNpc,
  spawnPlayer,
  spawnSwarmer,
  type InteractablesData,
} from '@high-noon/shared'
import { buildMultiplayerMinimapState, buildSingleplayerMinimapState } from './minimap'

function createWorldWithMap(seed = 123) {
  const world = createGameWorld(seed)
  const map = generateArena(DEFAULT_RUN_STAGES[0]!.mapConfig, seed, 0)
  setWorldTilemap(world, map)
  return { world, map }
}

describe('minimap helpers', () => {
  test('singleplayer minimap includes expected marker types and clamps coordinates', () => {
    const { world, map } = createWorldWithMap(321)
    const mapWidth = map.width * map.tileSize
    const mapHeight = map.height * map.tileSize

    const selfEid = spawnPlayer(world, 120, 110, 0)
    spawnPlayer(world, 220, 210, 1)
    const enemyEid = spawnSwarmer(world, 300, 250)
    const deadEnemyEid = spawnSwarmer(world, 320, 250)
    addComponent(world, Dead, deadEnemyEid)
    spawnNpc(world, NPC_TYPE.COWBOY, 180, 140)

    world.salesman = { x: 80, y: 90, stageIndex: 0, camp: false, active: true }
    world.stashes = [
      { id: 0, x: mapWidth + 400, y: -200, stageIndex: 0, opened: false },
      { id: 1, x: 140, y: 160, stageIndex: 0, opened: true },
    ]
    world.itemPickups = [
      { id: 1, itemId: 0, x: 260, y: 260, lifetime: 10, collected: false },
      { id: 2, itemId: 1, x: 300, y: 300, lifetime: 10, collected: true },
    ]

    const minimap = buildSingleplayerMinimapState(world, selfEid)
    expect(minimap).not.toBeNull()
    if (!minimap) return

    const counts = minimap.markers.reduce<Record<string, number>>((acc, marker) => {
      acc[marker.kind] = (acc[marker.kind] ?? 0) + 1
      return acc
    }, {})
    expect(counts.self).toBe(1)
    expect(counts.ally).toBe(1)
    expect(counts.enemy).toBe(1)
    expect(counts.npc).toBe(1)
    expect(counts.salesman).toBe(1)
    expect(counts.stash).toBe(1)
    expect(counts.item).toBe(1)

    for (const marker of minimap.markers) {
      expect(marker.x).toBeGreaterThanOrEqual(0)
      expect(marker.x).toBeLessThanOrEqual(mapWidth)
      expect(marker.y).toBeGreaterThanOrEqual(0)
      expect(marker.y).toBeLessThanOrEqual(mapHeight)
    }

    const enemyMarkers = minimap.markers.filter(marker => marker.kind === 'enemy')
    expect(enemyMarkers).toHaveLength(1)
    expect(enemyEid).toBeGreaterThanOrEqual(0)
  })

  test('multiplayer minimap uses networked interactable payload data', () => {
    const { world } = createWorldWithMap(654)

    const selfEid = spawnPlayer(world, 100, 100, 0)
    const allyEid = spawnPlayer(world, 200, 200, 1)
    const enemyEid = spawnSwarmer(world, 280, 190)
    spawnNpc(world, NPC_TYPE.TOWNSFOLK, 220, 140)

    const interactables: InteractablesData = {
      salesman: { x: 72, y: 88, stageIndex: 0, camp: false, active: true, shovelPrice: 18 },
      stashes: [
        { id: 1, x: 180, y: 180, stageIndex: 0, opened: false },
        { id: 2, x: 220, y: 220, stageIndex: 0, opened: true },
      ],
      itemPickups: [
        { id: 11, itemId: 1, x: 260, y: 260, rarity: 'silver' },
      ],
    }

    const minimap = buildMultiplayerMinimapState(
      world,
      selfEid,
      [selfEid, allyEid],
      [enemyEid],
      interactables,
    )
    expect(minimap).not.toBeNull()
    if (!minimap) return

    const kinds = new Set(minimap.markers.map(marker => marker.kind))
    expect(kinds.has('self')).toBe(true)
    expect(kinds.has('ally')).toBe(true)
    expect(kinds.has('enemy')).toBe(true)
    expect(kinds.has('npc')).toBe(true)
    expect(kinds.has('salesman')).toBe(true)
    expect(kinds.has('stash')).toBe(true)
    expect(kinds.has('item')).toBe(true)
    expect(minimap.markers.filter(marker => marker.kind === 'stash')).toHaveLength(1)
  })

  test('enemy markers are capped for performance stability', () => {
    const { world } = createWorldWithMap(987)
    const selfEid = spawnPlayer(world, 100, 100, 0)

    const enemyEids: number[] = []
    for (let i = 0; i < 90; i++) {
      enemyEids.push(spawnSwarmer(world, 140 + i * 2, 160 + i * 2))
    }

    const minimap = buildMultiplayerMinimapState(world, selfEid, [selfEid], enemyEids, null)
    expect(minimap).not.toBeNull()
    if (!minimap) return

    expect(minimap.markers.filter(marker => marker.kind === 'enemy').length).toBeLessThanOrEqual(64)
  })
})
