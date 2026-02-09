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

    // Calculate distance traveled this tick
    const vx = Velocity.x[eid]!
    const vy = Velocity.y[eid]!
    const speed = Math.sqrt(vx * vx + vy * vy)
    const distanceThisTick = speed * dt

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
