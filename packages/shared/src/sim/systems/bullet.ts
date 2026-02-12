/**
 * Bullet System
 *
 * Tracks bullet distance traveled and handles despawning.
 * Bullets despawn when they exceed their range or lifetime.
 */

import { defineQuery } from 'bitecs'
import type { GameWorld } from '../world'
import { Bullet, Position, Velocity } from '../components'
import { removeBullet } from '../prefabs'

// Query for all bullet entities
const bulletQuery = defineQuery([Bullet, Position, Velocity])

/**
 * Bullet system - tracks distance and handles despawning
 *
 * @param world - The game world
 * @param dt - Delta time in seconds
 */
export function bulletSystem(world: GameWorld, dt: number): void {
  const bullets = bulletQuery(world)
  const localOnly = world.simulationScope === 'local-player' && world.localPlayerEid >= 0
  const localOwner = world.localPlayerEid

  for (const eid of bullets) {
    if (localOnly && Bullet.ownerId[eid] !== localOwner) continue

    // Apply per-bullet acceleration/drag before movement.
    const accel = Bullet.accel[eid]!
    const drag = Bullet.drag[eid]!
    // Calculate distance traveled this tick
    let vx = Velocity.x[eid]!
    let vy = Velocity.y[eid]!
    const speed = Math.sqrt(vx * vx + vy * vy)
    let nextSpeed = speed

    if (speed > 0 && (accel !== 0 || drag !== 0)) {
      nextSpeed = speed + accel * dt
      if (drag > 0) {
        nextSpeed = nextSpeed * Math.max(0, 1 - drag * dt)
      }
      nextSpeed = Math.max(0, nextSpeed)

      const scale = speed > 0 ? nextSpeed / speed : 1
      vx *= scale
      vy *= scale
      Velocity.x[eid] = vx
      Velocity.y[eid] = vy
    }

    const distanceThisTick = nextSpeed * dt

    // Accumulate distance
    // Note: Non-null assertion safe because entities come from query with Bullet component
    Bullet.distanceTraveled[eid] = Bullet.distanceTraveled[eid]! + distanceThisTick

    // Decrement lifetime
    Bullet.lifetime[eid] = Bullet.lifetime[eid]! - dt

    // Check despawn conditions
    const distanceTraveled = Bullet.distanceTraveled[eid]!
    const range = Bullet.range[eid]!
    const lifetime = Bullet.lifetime[eid]!

    if (distanceTraveled >= range || lifetime <= 0) {
      removeBullet(world, eid)
    }
  }
}
