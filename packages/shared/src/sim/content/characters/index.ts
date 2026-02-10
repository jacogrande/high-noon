export * from './types'
export { SHERIFF } from './sheriff'
export { UNDERTAKER } from './undertaker'
export { PROSPECTOR } from './prospector'

import type { CharacterId, CharacterDef } from './types'
import { SHERIFF } from './sheriff'
import { UNDERTAKER } from './undertaker'
import { PROSPECTOR } from './prospector'

const CHARACTER_DEFS: Record<CharacterId, CharacterDef> = {
  sheriff: SHERIFF,
  undertaker: UNDERTAKER,
  prospector: PROSPECTOR,
}

export function getCharacterDef(id: CharacterId): CharacterDef {
  return CHARACTER_DEFS[id]
}
