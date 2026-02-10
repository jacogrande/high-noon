import { Schema, type, MapSchema } from '@colyseus/schema'
import type { CharacterId } from '@high-noon/shared'

export class PlayerMeta extends Schema {
  @type('string') name: string = ''
  @type('string') characterId: CharacterId = 'sheriff'
  @type('boolean') ready: boolean = false
}

export class GameRoomState extends Schema {
  @type('string') phase: string = 'lobby'
  @type({ map: PlayerMeta }) players = new MapSchema<PlayerMeta>()
  @type('uint32') serverTick: number = 0
}
