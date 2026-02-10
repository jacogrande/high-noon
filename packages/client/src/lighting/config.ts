/**
 * Lighting tuning constants.
 */

export const LIGHTMAP_CONFIG = {
  scale: 0.5,
  ambientColor: 0xdddddd,
  poolSize: 32,
  maxPoolSize: 64,
  softCircleSize: 128,
} as const

export const LAVA_LIGHT_CONFIG = {
  color: 0xff6622,
  radius: 64,
  intensity: 0.25,
  pulseSpeed: 3.0,
  pulseAmount: 0.15,
} as const

export const MUZZLE_FLASH_LIGHT_CONFIG = {
  color: 0xffeecc,
  radius: 60,
  intensity: 0.6,
  ttl: 0.08,
} as const
