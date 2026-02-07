export type CharacterId = 'sheriff'

export type StatName =
  | 'fireRate' | 'bulletDamage' | 'bulletSpeed' | 'range'
  | 'speed' | 'maxHP' | 'iframeDuration'
  | 'rollDuration' | 'rollIframeRatio' | 'rollSpeedMultiplier'
  | 'cylinderSize' | 'reloadTime' | 'minFireInterval' | 'holdFireRate' | 'lastRoundMultiplier'
  | 'showdownDuration' | 'showdownCooldown' | 'showdownKillRefund'
  | 'showdownDamageMultiplier' | 'showdownSpeedBonus' | 'showdownMarkRange'

export interface StatMod {
  stat: StatName
  op: 'add' | 'mul'
  value: number
}

export interface SkillNodeDef {
  id: string
  name: string
  description: string
  tier: number
  implemented: boolean
  mods: StatMod[]
  effectId?: string
}

export interface SkillBranch {
  id: string
  name: string
  description: string
  nodes: SkillNodeDef[]
}

export interface CharacterDef {
  id: CharacterId
  name: string
  description: string
  baseStats: Record<StatName, number>
  branches: SkillBranch[]
}
