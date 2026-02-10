import { CanvasSource, Texture } from 'pixi.js'
import { LIGHTMAP_CONFIG } from './config'

export const SOFT_CIRCLE_RADIUS = LIGHTMAP_CONFIG.softCircleSize / 2

let cachedTexture: Texture | null = null

export function getSoftCircleTexture(): Texture {
  if (cachedTexture) return cachedTexture

  const size = LIGHTMAP_CONFIG.softCircleSize
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const ctx = canvas.getContext('2d')!
  const center = size / 2
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  const source = new CanvasSource({ resource: canvas })
  cachedTexture = new Texture({ source })
  return cachedTexture
}

export function destroySoftCircleTexture(): void {
  if (!cachedTexture) return
  cachedTexture.destroy(true)
  cachedTexture = null
}
