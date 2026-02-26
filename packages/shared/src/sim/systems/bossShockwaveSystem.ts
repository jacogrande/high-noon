/**
 * Boss Shockwave System
 *
 * Expands shockwave rings each tick and deals damage to players caught
 * in the ring band. Standard i-frames and dodge roll protect against it.
 * Runs after groundCrackSystem.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { Player, Position, Health, Dead, Downed, Invincible } from '../components'
import { applyDamage } from './applyDamage'

const playerQuery = defineQuery([Player, Position, Health])

export function bossShockwaveSystem(world: GameWorld, dt: number): void {
  const shockwaves = world.bossShockwaves
  if (shockwaves.length === 0) return

  const players = playerQuery(world)

  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const sw = shockwaves[i]!
    sw.currentRadius += sw.speed * dt

    // Check players against ring band
    const innerR = Math.max(0, sw.currentRadius - sw.ringWidth / 2)
    const outerR = sw.currentRadius + sw.ringWidth / 2
    const innerSq = innerR * innerR
    const outerSq = outerR * outerR

    for (const peid of players) {
      if (hasComponent(world, Dead, peid) || hasComponent(world, Downed, peid)) continue
      if (sw.hitEntities.has(peid)) continue
      if (Health.iframes[peid]! > 0) continue
      if (hasComponent(world, Invincible, peid)) continue

      const dx = Position.x[peid]! - sw.x
      const dy = Position.y[peid]! - sw.y
      const distSq = dx * dx + dy * dy

      if (distSq >= innerSq && distSq <= outerSq) {
        applyDamage(world, peid, {
          amount: sw.damage,
          setIframes: true,
        })
        sw.hitEntities.add(peid)

        // Store hit direction for camera kick
        const dist = Math.sqrt(distSq)
        const nx = dist > 0 ? dx / dist : 0
        const ny = dist > 0 ? dy / dist : 1
        world.lastPlayerHitDir.set(peid, { x: nx, y: ny })
      }
    }

    // Remove when fully expanded
    if (sw.currentRadius > sw.maxRadius) {
      shockwaves.splice(i, 1)
    }
  }
}
