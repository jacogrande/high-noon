/**
 * Per-client HUD data sent from server at 10Hz.
 */
export interface HudData {
  hp: number
  maxHp: number
  cylinderRounds: number
  cylinderMax: number
  isReloading: boolean
  reloadProgress: number
  showdownActive: boolean
  showdownCooldown: number
  showdownCooldownMax: number
  showdownTimeLeft: number
  showdownDurationMax: number
}
