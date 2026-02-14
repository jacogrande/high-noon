import { defineQuery, hasComponent } from 'bitecs'
import {
  Dead,
  Enemy,
  Player,
  Position,
  getItemDef,
  type GameWorld,
  type InteractablesData,
} from '@high-noon/shared'
import type { MinimapMarker, MinimapState } from '../types'

const playerQuery = defineQuery([Player, Position])
const enemyQuery = defineQuery([Enemy, Position])

const MAX_ENEMY_MARKERS = 64
const MAX_ITEM_MARKERS = 32

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function pushMarker(
  markers: MinimapMarker[],
  mapWidth: number,
  mapHeight: number,
  kind: MinimapMarker['kind'],
  x: number,
  y: number,
  rarity?: string,
): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return
  const marker: MinimapMarker = {
    kind,
    x: clamp(x, 0, mapWidth),
    y: clamp(y, 0, mapHeight),
  }
  if (rarity !== undefined) {
    marker.rarity = rarity
  }
  markers.push(marker)
}

function getMapSize(world: GameWorld): { mapWidth: number; mapHeight: number } | null {
  const map = world.tilemap
  if (!map) return null
  const mapWidth = map.width * map.tileSize
  const mapHeight = map.height * map.tileSize
  if (!Number.isFinite(mapWidth) || !Number.isFinite(mapHeight) || mapWidth <= 0 || mapHeight <= 0) {
    return null
  }
  return { mapWidth, mapHeight }
}

export function buildSingleplayerMinimapState(world: GameWorld, selfEid: number | null): MinimapState | null {
  const mapSize = getMapSize(world)
  if (!mapSize) return null

  const { mapWidth, mapHeight } = mapSize
  const markers: MinimapMarker[] = []

  if (selfEid !== null && !hasComponent(world, Dead, selfEid)) {
    pushMarker(markers, mapWidth, mapHeight, 'self', Position.x[selfEid]!, Position.y[selfEid]!)
  }

  for (const eid of playerQuery(world)) {
    if (eid === selfEid || hasComponent(world, Dead, eid)) continue
    pushMarker(markers, mapWidth, mapHeight, 'ally', Position.x[eid]!, Position.y[eid]!)
  }

  let enemyMarkers = 0
  for (const eid of enemyQuery(world)) {
    if (enemyMarkers >= MAX_ENEMY_MARKERS) break
    if (hasComponent(world, Dead, eid)) continue
    pushMarker(markers, mapWidth, mapHeight, 'enemy', Position.x[eid]!, Position.y[eid]!)
    enemyMarkers++
  }

  for (const eid of world.npcEntities) {
    if (!hasComponent(world, Position, eid)) continue
    pushMarker(markers, mapWidth, mapHeight, 'npc', Position.x[eid]!, Position.y[eid]!)
  }

  const salesman = world.salesman
  if (salesman && salesman.active) {
    pushMarker(markers, mapWidth, mapHeight, 'salesman', salesman.x, salesman.y)
  }

  for (let i = 0; i < world.stashes.length; i++) {
    const stash = world.stashes[i]!
    if (stash.opened) continue
    pushMarker(markers, mapWidth, mapHeight, 'stash', stash.x, stash.y)
  }

  let itemMarkers = 0
  for (let i = 0; i < world.itemPickups.length; i++) {
    if (itemMarkers >= MAX_ITEM_MARKERS) break
    const pickup = world.itemPickups[i]!
    if (pickup.collected) continue
    pushMarker(
      markers,
      mapWidth,
      mapHeight,
      'item',
      pickup.x,
      pickup.y,
      getItemDef(pickup.itemId)?.rarity ?? 'brass',
    )
    itemMarkers++
  }

  return { mapWidth, mapHeight, markers }
}

export function buildMultiplayerMinimapState(
  world: GameWorld,
  selfEid: number | null,
  playerEids: Iterable<number>,
  enemyEids: Iterable<number>,
  interactables: InteractablesData | null,
): MinimapState | null {
  const mapSize = getMapSize(world)
  if (!mapSize) return null

  const { mapWidth, mapHeight } = mapSize
  const markers: MinimapMarker[] = []

  if (
    selfEid !== null &&
    selfEid >= 0 &&
    hasComponent(world, Player, selfEid) &&
    !hasComponent(world, Dead, selfEid)
  ) {
    pushMarker(markers, mapWidth, mapHeight, 'self', Position.x[selfEid]!, Position.y[selfEid]!)
  }

  for (const eid of playerEids) {
    if (eid === selfEid || eid < 0) continue
    if (!hasComponent(world, Player, eid) || hasComponent(world, Dead, eid)) continue
    pushMarker(markers, mapWidth, mapHeight, 'ally', Position.x[eid]!, Position.y[eid]!)
  }

  let enemyMarkers = 0
  for (const eid of enemyEids) {
    if (enemyMarkers >= MAX_ENEMY_MARKERS) break
    if (eid < 0) continue
    if (!hasComponent(world, Enemy, eid) || hasComponent(world, Dead, eid)) continue
    pushMarker(markers, mapWidth, mapHeight, 'enemy', Position.x[eid]!, Position.y[eid]!)
    enemyMarkers++
  }

  for (const eid of world.npcEntities) {
    if (!hasComponent(world, Position, eid)) continue
    pushMarker(markers, mapWidth, mapHeight, 'npc', Position.x[eid]!, Position.y[eid]!)
  }

  const salesman = interactables?.salesman
  if (salesman && salesman.active) {
    pushMarker(markers, mapWidth, mapHeight, 'salesman', salesman.x, salesman.y)
  }

  const stashes = interactables?.stashes ?? []
  for (let i = 0; i < stashes.length; i++) {
    const stash = stashes[i]!
    if (stash.opened) continue
    pushMarker(markers, mapWidth, mapHeight, 'stash', stash.x, stash.y)
  }

  const itemPickups = interactables?.itemPickups ?? []
  for (let i = 0; i < itemPickups.length && i < MAX_ITEM_MARKERS; i++) {
    const pickup = itemPickups[i]!
    pushMarker(markers, mapWidth, mapHeight, 'item', pickup.x, pickup.y, pickup.rarity)
  }

  return { mapWidth, mapHeight, markers }
}
