import { addComponent, addEntity, hasComponent, removeComponent, removeEntity } from 'bitecs'
import {
  Bullet,
  BULLET_RADIUS,
  Collider,
  CollisionLayer,
  Cylinder,
  Dead,
  Enemy,
  EnemyAI,
  EnemyTier,
  EnemyType,
  Health,
  Invincible,
  MeleeWeapon,
  NO_OWNER,
  NO_TARGET,
  PLAYER_HP,
  PLAYER_IFRAME_DURATION,
  PLAYER_RADIUS,
  Position,
  ZPosition,
  Showdown,
  Speed,
  Velocity,
  Weapon,
  Roll,
  SWARMER_RADIUS,
  GRUNT_RADIUS,
  SHOOTER_RADIUS,
  CHARGER_RADIUS,
  Player,
  PlayerState,
  type BulletSnapshot,
  type CharacterId,
  type EnemySnapshot,
  type GameWorld,
  type PlayerSnapshot,
  type WorldSnapshot,
} from '@high-noon/shared'
import type { PredictedEntityTracker } from './PredictedEntityTracker'
import type { ILocalIdentityBinding, ILocalIdentityState, ISimStateSource } from './SceneRuntimeContracts'

/** Enemy radius lookup by EnemyType value */
const ENEMY_RADIUS: Record<number, number> = {
  [EnemyType.SWARMER]: SWARMER_RADIUS,
  [EnemyType.GRUNT]: GRUNT_RADIUS,
  [EnemyType.SHOOTER]: SHOOTER_RADIUS,
  [EnemyType.CHARGER]: CHARGER_RADIUS,
}

/** Enemy tier lookup by EnemyType value */
const ENEMY_TIER: Record<number, number> = {
  [EnemyType.SWARMER]: EnemyTier.FODDER,
  [EnemyType.GRUNT]: EnemyTier.FODDER,
  [EnemyType.SHOOTER]: EnemyTier.THREAT,
  [EnemyType.CHARGER]: EnemyTier.THREAT,
}

export interface SnapshotIngestContext extends ISimStateSource, ILocalIdentityState, ILocalIdentityBinding {
  tracker: PredictedEntityTracker
  playerEntities: Map<number, number>
  bulletEntities: Map<number, number>
  enemyEntities: Map<number, number>
  localCharacterId: CharacterId
  resolveRttMs: () => number
}

export interface SnapshotIngestStats {
  matchedPredictedBullets: number
  timedOutPredictedBullets: number
}

export class SnapshotIngestor {
  applyEntityLifecycle(snapshot: WorldSnapshot, ctx: SnapshotIngestContext, predictionTick: number): SnapshotIngestStats {
    this.applyPlayers(snapshot.players, ctx)
    const matchedPredictedBullets = this.applyBullets(snapshot.bullets, ctx)
    this.applyEnemies(snapshot.enemies, ctx)
    const timedOutPredictedBullets = ctx.tracker.cleanupPredictedBullets(ctx.world, predictionTick)
    return { matchedPredictedBullets, timedOutPredictedBullets }
  }

  private applyPlayers(players: PlayerSnapshot[], ctx: SnapshotIngestContext): void {
    const seen = new Set<number>()

    for (const p of players) {
      seen.add(p.eid)
      let clientEid = ctx.playerEntities.get(p.eid)

      if (clientEid === undefined) {
        // New player entity.
        clientEid = addEntity(ctx.world)
        addComponent(ctx.world, Position, clientEid)
        addComponent(ctx.world, Velocity, clientEid)
        addComponent(ctx.world, Player, clientEid)
        addComponent(ctx.world, PlayerState, clientEid)
        addComponent(ctx.world, ZPosition, clientEid)
        addComponent(ctx.world, Collider, clientEid)
        addComponent(ctx.world, Health, clientEid)

        Collider.radius[clientEid] = PLAYER_RADIUS
        Collider.layer[clientEid] = CollisionLayer.PLAYER
        Health.max[clientEid] = PLAYER_HP
        Health.iframes[clientEid] = 0
        Health.iframeDuration[clientEid] = PLAYER_IFRAME_DURATION

        Position.x[clientEid] = p.x
        Position.y[clientEid] = p.y
        Position.prevX[clientEid] = p.x
        Position.prevY[clientEid] = p.y
        ZPosition.z[clientEid] = p.z
        ZPosition.zVelocity[clientEid] = p.zVelocity

        ctx.playerEntities.set(p.eid, clientEid)

        // Identify local player.
        if (p.eid === ctx.myServerEid) {
          ctx.setMyClientEid(clientEid)
          ctx.setLocalPlayerRenderEid(clientEid)
          ctx.world.characterId = ctx.localCharacterId

          const us = ctx.world.upgradeState
          ctx.world.playerUpgradeStates.set(clientEid, us)
          ctx.world.playerCharacters.set(clientEid, ctx.localCharacterId)

          // Prediction requires Speed component.
          addComponent(ctx.world, Speed, clientEid)
          Speed.current[clientEid] = us.speed
          Speed.max[clientEid] = us.speed

          // Base weapon state exists for all characters.
          addComponent(ctx.world, Weapon, clientEid)
          Weapon.bulletSpeed[clientEid] = us.bulletSpeed
          Weapon.bulletDamage[clientEid] = us.bulletDamage
          Weapon.range[clientEid] = us.range
          Weapon.fireRate[clientEid] = us.fireRate
          Weapon.cooldown[clientEid] = 0

          if (ctx.localCharacterId === 'prospector') {
            addComponent(ctx.world, MeleeWeapon, clientEid)
            MeleeWeapon.swingCooldown[clientEid] = 0
            MeleeWeapon.chargeTimer[clientEid] = 0
            MeleeWeapon.charging[clientEid] = 0
            MeleeWeapon.swungThisTick[clientEid] = 0
            MeleeWeapon.wasChargedSwing[clientEid] = 0
            MeleeWeapon.swingAngle[clientEid] = 0
          } else {
            addComponent(ctx.world, Cylinder, clientEid)
            const cylinderSize = Math.max(0, Math.round(us.cylinderSize))
            Cylinder.rounds[clientEid] = cylinderSize
            Cylinder.maxRounds[clientEid] = cylinderSize
            Cylinder.reloadTime[clientEid] = us.reloadTime
            Cylinder.reloading[clientEid] = 0
            Cylinder.reloadTimer[clientEid] = 0
            Cylinder.fireCooldown[clientEid] = us.minFireInterval
            Cylinder.firstShotAfterReload[clientEid] = 0
          }

          // Shared ability state (Sheriff Showdown / Undertaker Last Rites / Prospector cooldown).
          addComponent(ctx.world, Showdown, clientEid)
          Showdown.active[clientEid] = 0
          Showdown.targetEid[clientEid] = NO_TARGET
          Showdown.duration[clientEid] = 0
          Showdown.cooldown[clientEid] = 0

          Health.max[clientEid] = us.maxHP
        }
      }

      // Write snapshot data (skip aim/state for local player — driven by prediction).
      if (clientEid !== ctx.myClientEid) {
        Player.aimAngle[clientEid] = p.aimAngle
        PlayerState.state[clientEid] = p.state
        ZPosition.z[clientEid] = p.z
        ZPosition.zVelocity[clientEid] = p.zVelocity
      }
      const prevHP = Health.current[clientEid]!
      Health.current[clientEid] = p.hp
      if (prevHP > 0 && p.hp < prevHP) {
        const duration = Health.iframeDuration[clientEid]!
        Health.iframes[clientEid] = duration > 0 ? duration : PLAYER_IFRAME_DURATION
      }

      const isDead = (p.flags & 1) !== 0
      if (isDead && !hasComponent(ctx.world, Dead, clientEid)) {
        addComponent(ctx.world, Dead, clientEid)
      } else if (!isDead && hasComponent(ctx.world, Dead, clientEid)) {
        removeComponent(ctx.world, Dead, clientEid)
      }

      const isInvincible = (p.flags & 2) !== 0
      if (isInvincible && !hasComponent(ctx.world, Invincible, clientEid)) {
        addComponent(ctx.world, Invincible, clientEid)
      } else if (!isInvincible && hasComponent(ctx.world, Invincible, clientEid)) {
        removeComponent(ctx.world, Invincible, clientEid)
      }
    }

    // Remove departed players.
    for (const [serverEid, clientEid] of ctx.playerEntities) {
      if (!seen.has(serverEid)) {
        removeEntity(ctx.world, clientEid)
        ctx.world.playerUpgradeStates.delete(clientEid)
        ctx.world.playerCharacters.delete(clientEid)
        ctx.playerEntities.delete(serverEid)
        if (serverEid === ctx.myServerEid) {
          ctx.setMyClientEid(-1)
          ctx.setLocalPlayerRenderEid(null)
          ctx.tracker.clearLocalTimelineBullets()
        }
      }
    }
  }

  private applyBullets(bullets: BulletSnapshot[], ctx: SnapshotIngestContext): number {
    const seen = new Set<number>()
    let matchedPredictedBullets = 0

    for (const b of bullets) {
      seen.add(b.eid)
      const ownerClientEid = this.resolveOwnerClientEid(b.ownerEid, ctx)
      const ownerResolved = b.ownerEid === NO_OWNER || ownerClientEid !== NO_OWNER
      let clientEid = ctx.bulletEntities.get(b.eid)

      if (clientEid === undefined) {
        const matched = b.layer === CollisionLayer.PLAYER_BULLET
          ? ctx.tracker.findMatchingPredictedBullet(ctx.world, b, ctx.resolveRttMs())
          : -1

        if (matched >= 0) {
          clientEid = matched
          matchedPredictedBullets++
          ctx.tracker.adoptMatchedPredictedBullet(clientEid)
        } else {
          clientEid = addEntity(ctx.world)
          addComponent(ctx.world, Position, clientEid)
          addComponent(ctx.world, Velocity, clientEid)
          addComponent(ctx.world, Bullet, clientEid)
          addComponent(ctx.world, Collider, clientEid)

          Collider.radius[clientEid] = BULLET_RADIUS
          Collider.layer[clientEid] = b.layer
          Bullet.ownerId[clientEid] = ownerResolved ? ownerClientEid : NO_OWNER
          ctx.tracker.setBulletLocalTimeline(
            clientEid,
            ownerResolved && ctx.myClientEid >= 0 && ownerClientEid === ctx.myClientEid,
          )

          Position.x[clientEid] = b.x
          Position.y[clientEid] = b.y
          Position.prevX[clientEid] = b.x
          Position.prevY[clientEid] = b.y
        }

        ctx.bulletEntities.set(b.eid, clientEid)
        ctx.tracker.markServerBullet(clientEid)
      }

      Collider.layer[clientEid] = b.layer
      if (ownerResolved) {
        Bullet.ownerId[clientEid] = ownerClientEid
        ctx.tracker.setBulletLocalTimeline(
          clientEid,
          ctx.myClientEid >= 0 && ownerClientEid === ctx.myClientEid,
        )
      }

      // Write velocity (used for rotation in BulletRenderer).
      Velocity.x[clientEid] = b.vx
      Velocity.y[clientEid] = b.vy
    }

    // Remove departed bullets (skip predicted bullets — they have their own cleanup).
    for (const [serverEid, clientEid] of ctx.bulletEntities) {
      if (!seen.has(serverEid)) {
        removeEntity(ctx.world, clientEid)
        ctx.tracker.unmarkServerBullet(clientEid)
        ctx.bulletEntities.delete(serverEid)
      }
    }

    return matchedPredictedBullets
  }

  private applyEnemies(enemies: EnemySnapshot[], ctx: SnapshotIngestContext): void {
    const seen = new Set<number>()

    for (const e of enemies) {
      seen.add(e.eid)
      let clientEid = ctx.enemyEntities.get(e.eid)

      if (clientEid === undefined) {
        clientEid = addEntity(ctx.world)
        addComponent(ctx.world, Position, clientEid)
        addComponent(ctx.world, Velocity, clientEid)
        addComponent(ctx.world, Collider, clientEid)
        addComponent(ctx.world, Health, clientEid)
        addComponent(ctx.world, Enemy, clientEid)
        addComponent(ctx.world, EnemyAI, clientEid)

        Enemy.type[clientEid] = e.type
        Enemy.tier[clientEid] = ENEMY_TIER[e.type] ?? EnemyTier.FODDER
        Collider.radius[clientEid] = ENEMY_RADIUS[e.type] ?? 10
        Collider.layer[clientEid] = CollisionLayer.ENEMY

        Position.x[clientEid] = e.x
        Position.y[clientEid] = e.y
        Position.prevX[clientEid] = e.x
        Position.prevY[clientEid] = e.y

        ctx.enemyEntities.set(e.eid, clientEid)
      }

      Health.current[clientEid] = e.hp
      EnemyAI.state[clientEid] = e.aiState
    }

    for (const [serverEid, clientEid] of ctx.enemyEntities) {
      if (!seen.has(serverEid)) {
        removeEntity(ctx.world, clientEid)
        ctx.enemyEntities.delete(serverEid)
      }
    }
  }

  private resolveOwnerClientEid(ownerServerEid: number, ctx: SnapshotIngestContext): number {
    if (ownerServerEid === NO_OWNER) return NO_OWNER
    if (ownerServerEid === ctx.myServerEid && ctx.myClientEid >= 0) return ctx.myClientEid
    const playerOwner = ctx.playerEntities.get(ownerServerEid)
    if (playerOwner !== undefined) return playerOwner
    const enemyOwner = ctx.enemyEntities.get(ownerServerEid)
    if (enemyOwner !== undefined) return enemyOwner
    return NO_OWNER
  }
}
