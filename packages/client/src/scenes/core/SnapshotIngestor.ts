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
  SWARMER_HP,
  GRUNT_RADIUS,
  GRUNT_HP,
  SHOOTER_RADIUS,
  SHOOTER_HP,
  CHARGER_RADIUS,
  CHARGER_HP,
  BOOMSTICK_RADIUS,
  BOOMSTICK_HP,
  GOBLIN_BARBARIAN_RADIUS,
  GOBLIN_BARBARIAN_HP,
  GOBLIN_ROGUE_RADIUS,
  GOBLIN_ROGUE_HP,
  Player,
  PlayerState,
  getCharacterDef,
  initUpgradeState,
  type BulletSnapshot,
  type CharacterId,
  type DynamiteSnapshot,
  type EnemySnapshot,
  type GameWorld,
  type LastRitesZoneSnapshot,
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
  [EnemyType.BOOMSTICK]: BOOMSTICK_RADIUS,
  [EnemyType.GOBLIN_BARBARIAN]: GOBLIN_BARBARIAN_RADIUS,
  [EnemyType.GOBLIN_ROGUE]: GOBLIN_ROGUE_RADIUS,
}

/** Enemy max HP lookup by EnemyType value */
const ENEMY_MAX_HP: Record<number, number> = {
  [EnemyType.SWARMER]: SWARMER_HP,
  [EnemyType.GRUNT]: GRUNT_HP,
  [EnemyType.SHOOTER]: SHOOTER_HP,
  [EnemyType.CHARGER]: CHARGER_HP,
  [EnemyType.BOOMSTICK]: BOOMSTICK_HP,
  [EnemyType.GOBLIN_BARBARIAN]: GOBLIN_BARBARIAN_HP,
  [EnemyType.GOBLIN_ROGUE]: GOBLIN_ROGUE_HP,
}

/** Enemy tier lookup by EnemyType value */
const ENEMY_TIER: Record<number, number> = {
  [EnemyType.SWARMER]: EnemyTier.FODDER,
  [EnemyType.GRUNT]: EnemyTier.FODDER,
  [EnemyType.SHOOTER]: EnemyTier.THREAT,
  [EnemyType.CHARGER]: EnemyTier.THREAT,
  [EnemyType.BOOMSTICK]: EnemyTier.THREAT,
  [EnemyType.GOBLIN_BARBARIAN]: EnemyTier.FODDER,
  [EnemyType.GOBLIN_ROGUE]: EnemyTier.FODDER,
}

export interface SnapshotIngestContext extends ISimStateSource, ILocalIdentityState, ILocalIdentityBinding {
  tracker: PredictedEntityTracker
  playerEntities: Map<number, number>
  bulletEntities: Map<number, number>
  enemyEntities: Map<number, number>
  localCharacterId: CharacterId
  resolveCharacterIdForServerEid: (serverEid: number) => CharacterId | undefined
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
    this.applyLastRitesZones(snapshot.lastRitesZones, ctx)
    this.applyDynamites(snapshot.dynamites, ctx)
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

        // All players get Showdown component (for remote showdown visibility)
        addComponent(ctx.world, Showdown, clientEid)
        Showdown.active[clientEid] = 0
        Showdown.targetEid[clientEid] = NO_TARGET
        Showdown.duration[clientEid] = 0
        Showdown.cooldown[clientEid] = 0

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
            MeleeWeapon.shootWasDown[clientEid] = 0
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

          Health.max[clientEid] = us.maxHP
        }
      }

      const resolvedCharacterId = p.eid === ctx.myServerEid
        ? ctx.localCharacterId
        : (ctx.resolveCharacterIdForServerEid(p.eid) ?? ctx.world.playerCharacters.get(clientEid) ?? 'sheriff')
      ctx.world.playerCharacters.set(clientEid, resolvedCharacterId)

      // Ensure remote players have a base upgrade state (used by DynamiteRenderer for fuse timing)
      if (p.eid !== ctx.myServerEid && !ctx.world.playerUpgradeStates.has(clientEid)) {
        ctx.world.playerUpgradeStates.set(clientEid, initUpgradeState(getCharacterDef(resolvedCharacterId)))
      }

      // Write snapshot data (skip aim/state for local player — driven by prediction).
      if (clientEid !== ctx.myClientEid) {
        Player.aimAngle[clientEid] = p.aimAngle
        PlayerState.state[clientEid] = p.state
        ZPosition.z[clientEid] = p.z
        ZPosition.zVelocity[clientEid] = p.zVelocity

        // Apply showdown state for remote players
        Showdown.active[clientEid] = p.showdownActive
        if (p.showdownActive && p.showdownTargetEid !== NO_TARGET) {
          // Resolve server enemy EID → client enemy EID
          const clientTarget = ctx.enemyEntities.get(p.showdownTargetEid)
          Showdown.targetEid[clientEid] = clientTarget ?? NO_TARGET
        } else {
          Showdown.targetEid[clientEid] = NO_TARGET
        }
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
        EnemyAI.targetEid[clientEid] = NO_TARGET
        Enemy.tier[clientEid] = ENEMY_TIER[e.type] ?? EnemyTier.FODDER
        Collider.radius[clientEid] = ENEMY_RADIUS[e.type] ?? 10
        Collider.layer[clientEid] = CollisionLayer.ENEMY
        Health.max[clientEid] = ENEMY_MAX_HP[e.type] ?? Math.max(1, e.hp)
        Health.iframes[clientEid] = 0
        Health.iframeDuration[clientEid] = 0

        Position.x[clientEid] = e.x
        Position.y[clientEid] = e.y
        Position.prevX[clientEid] = e.x
        Position.prevY[clientEid] = e.y

        ctx.enemyEntities.set(e.eid, clientEid)
      }

      Health.current[clientEid] = e.hp
      // Keep max HP sane for render/UI ratio even if entity was created earlier.
      if (Health.max[clientEid]! <= 0) {
        Health.max[clientEid] = ENEMY_MAX_HP[e.type] ?? Math.max(1, e.hp)
      }
      EnemyAI.state[clientEid] = e.aiState
      if (e.targetEid === NO_TARGET) {
        EnemyAI.targetEid[clientEid] = NO_TARGET
      } else if (e.targetEid === ctx.myServerEid && ctx.myClientEid >= 0) {
        EnemyAI.targetEid[clientEid] = ctx.myClientEid
      } else {
        EnemyAI.targetEid[clientEid] = ctx.playerEntities.get(e.targetEid) ?? NO_TARGET
      }
    }

    for (const [serverEid, clientEid] of ctx.enemyEntities) {
      if (!seen.has(serverEid)) {
        removeEntity(ctx.world, clientEid)
        ctx.enemyEntities.delete(serverEid)
      }
    }
  }

  private applyLastRitesZones(zones: LastRitesZoneSnapshot[], ctx: SnapshotIngestContext): void {
    // Remove remote zones (preserve local player's zone which is driven by prediction)
    for (const [ownerEid] of ctx.world.lastRitesZones) {
      if (ownerEid !== ctx.myClientEid) {
        ctx.world.lastRitesZones.delete(ownerEid)
      }
    }

    // Repopulate from snapshot
    for (const z of zones) {
      // Skip local player's zone — driven by prediction
      if (z.ownerEid === ctx.myServerEid) continue

      const clientOwner = ctx.playerEntities.get(z.ownerEid) ?? z.ownerEid
      ctx.world.lastRitesZones.set(clientOwner, {
        ownerEid: clientOwner,
        active: true,
        x: z.x,
        y: z.y,
        radius: z.radius,
        timeRemaining: 0,
        chainCount: 0,
        chainDamageBonus: 0,
        pendingPulses: [],
        consecratedAccum: new Map(),
      })
    }
  }

  private applyDynamites(dynamites: DynamiteSnapshot[], ctx: SnapshotIngestContext): void {
    // Keep local player's dynamites (prediction), replace everything else
    const localDynamites = ctx.world.dynamites.filter(d =>
      ctx.myClientEid >= 0 && d.ownerId === ctx.myClientEid,
    )

    // Add remote dynamites from snapshot
    for (const d of dynamites) {
      // Skip local player's dynamites — driven by prediction
      if (d.ownerEid === ctx.myServerEid) continue

      const clientOwner = this.resolveOwnerClientEid(d.ownerEid, ctx)
      localDynamites.push({
        x: d.x,
        y: d.y,
        fuseRemaining: d.fuseRemaining,
        damage: 0,
        radius: d.radius,
        knockback: 0,
        ownerId: clientOwner,
      })
    }

    ctx.world.dynamites = localDynamites
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
