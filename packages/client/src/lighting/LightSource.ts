import { LAVA_LIGHT_CONFIG, MUZZLE_FLASH_LIGHT_CONFIG } from './config'

export interface LightSource {
  x: number
  y: number
  color: number
  radius: number
  intensity: number
  /** Time-to-live in seconds. 0 means permanent. */
  ttl: number
  /** Initial ttl value for fade calculations. */
  maxTtl: number
  /** Sine-wave intensity modulation. */
  pulse: boolean
  /** Pulse phase in radians. */
  pulsePhase: number
}

function positionPhase(x: number, y: number): number {
  return ((x * 73856093 + y * 19349663) % 6283) / 1000
}

export function createLavaLight(worldX: number, worldY: number): LightSource {
  return {
    x: worldX,
    y: worldY,
    color: LAVA_LIGHT_CONFIG.color,
    radius: LAVA_LIGHT_CONFIG.radius,
    intensity: LAVA_LIGHT_CONFIG.intensity,
    ttl: 0,
    maxTtl: 0,
    pulse: true,
    pulsePhase: positionPhase(worldX, worldY),
  }
}

export function createMuzzleFlashLight(worldX: number, worldY: number): LightSource {
  return {
    x: worldX,
    y: worldY,
    color: MUZZLE_FLASH_LIGHT_CONFIG.color,
    radius: MUZZLE_FLASH_LIGHT_CONFIG.radius,
    intensity: MUZZLE_FLASH_LIGHT_CONFIG.intensity,
    ttl: MUZZLE_FLASH_LIGHT_CONFIG.ttl,
    maxTtl: MUZZLE_FLASH_LIGHT_CONFIG.ttl,
    pulse: false,
    pulsePhase: 0,
  }
}
