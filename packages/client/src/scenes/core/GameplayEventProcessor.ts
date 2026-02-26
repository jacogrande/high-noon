import {
  emitDeathBurst,
  emitDeathPulse,
  emitDirectionalImpact,
  emitEntityImpact,
  emitExplosion,
  emitFuseSparks,
  emitLevelUpSparkle,
  emitMuzzleFlash,
  emitShellCasing,
  emitShotTracer,
  emitSwingArc,
  emitWallImpact,
  emitPoisonSplash,
  emitVultureDiveTrail,
  emitGroundCrackBurst,
  emitShadowTendrils,
  emitFireGeyser,
  emitSmokeSpiral,
  emitGoldenSunMotes,
  emitBrimstoneErupt,
  FloatingTextPool,
  ParticlePool,
  KillStreakTracker,
} from '../../fx'
import { SoundManager } from '../../audio/SoundManager'
import { Camera } from '../../engine/Camera'
import { HitStop } from '../../engine/HitStop'
import { TimeScale } from '../../engine/TimeScale'
import { PlayerRenderer } from '../../render/PlayerRenderer'
import type { DrawFlashOverlay } from '../../render/DrawFlashOverlay'
import type { GameplayEvent } from './GameplayEvents'

// Boss phase transition presentation
const PHASE_TRANSITION_TRAUMA: Record<number, number> = { 2: 0.4, 3: 0.6, 4: 0.5 }
const PHASE_TRANSITION_FREEZE: Record<number, number> = { 2: 0.12, 3: 0.15, 4: 0.3 }
const DEFAULT_PHASE_TRAUMA = 0.4
const DEFAULT_PHASE_FREEZE = 0.12
const PHASE_4_SLOWMO_SCALE = 0.2
const PHASE_4_SLOWMO_DURATION = 0.5

// Boss death presentation
const BOSS_DEATH_TRAUMA = 0.7
const BOSS_DEATH_FREEZE = 0.5
const BOSS_DEATH_SLOWMO_SCALE = 0.15
const BOSS_DEATH_SLOWMO_DURATION = 1.0

// Draw result presentation
const DRAW_PERFECT_FLASH_TINT = 0xFFD700
const DRAW_PERFECT_SLOWMO_SCALE = 0.3
const DRAW_PERFECT_SLOWMO_DURATION = 0.3
const DRAW_SLOW_FLASH_TINT = 0xFF4444
const DRAW_PANIC_TRAUMA = 0.3

export interface GameplayEventProcessorDeps {
  camera: Camera
  sound: SoundManager
  particles: ParticlePool
  floatingText: FloatingTextPool
  playerRenderer: PlayerRenderer
  hitStop?: HitStop
  renderPause?: HitStop
  spawnMuzzleLight?: (x: number, y: number) => void
  killStreakTracker?: KillStreakTracker
  timeScale?: TimeScale
  drawFlashOverlay?: DrawFlashOverlay
}

export class GameplayEventProcessor {
  private readonly camera: Camera
  private readonly sound: SoundManager
  private readonly particles: ParticlePool
  private readonly floatingText: FloatingTextPool
  private readonly playerRenderer: PlayerRenderer
  private readonly hitStop: HitStop | undefined
  private readonly renderPause: HitStop | undefined
  private readonly spawnMuzzleLight: ((x: number, y: number) => void) | undefined
  private readonly killStreakTracker: KillStreakTracker | undefined
  private readonly timeScale: TimeScale | undefined
  private readonly drawFlashOverlay: DrawFlashOverlay | undefined
  private pendingBossIntro: { bossName: string; taunt: string } | null = null

  constructor(deps: GameplayEventProcessorDeps) {
    this.camera = deps.camera
    this.sound = deps.sound
    this.particles = deps.particles
    this.floatingText = deps.floatingText
    this.playerRenderer = deps.playerRenderer
    this.hitStop = deps.hitStop
    this.renderPause = deps.renderPause
    this.spawnMuzzleLight = deps.spawnMuzzleLight
    this.killStreakTracker = deps.killStreakTracker
    this.timeScale = deps.timeScale
    this.drawFlashOverlay = deps.drawFlashOverlay
  }

  processAll(events: readonly GameplayEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'enemy-sync': {
          if (event.deathTrauma > 0) {
            this.camera.addTrauma(event.deathTrauma)
            this.sound.play('enemy_die')
          }
          for (const death of event.deaths) {
            emitDeathBurst(this.particles, death.x, death.y, death.color, death.isThreat)

            // Kill streak tracking
            if (this.killStreakTracker) {
              const now = performance.now() / 1000
              this.killStreakTracker.registerKill(now)
              this.camera.addTrauma(this.killStreakTracker.getTraumaBonus())
              if (this.killStreakTracker.shouldSlowMo() && this.timeScale) {
                this.timeScale.slowMo(0.3, 0.15)
              }
            }

            // Threat deaths get longer hit-stop
            if (death.isThreat) {
              this.hitStop?.freeze(0.06)
            }
          }

          // Impact freeze scaling: base 30ms + 2ms per damage, capped at 100ms
          if (event.hits.length > 0) {
            let totalDamage = 0
            for (const hit of event.hits) {
              totalDamage += hit.amount
            }
            const freezeDuration = Math.min(0.1, 0.03 + totalDamage * 0.002)
            this.hitStop?.freeze(freezeDuration)
          }

          for (const hit of event.hits) {
            emitDirectionalImpact(this.particles, hit.x, hit.y, hit.color, hit.dirX, hit.dirY)
            const textScale = this.killStreakTracker?.getTextScale() ?? 1
            this.floatingText.spawn(hit.x, hit.y, hit.amount, hit.color, textScale)
          }
          break
        }

        case 'bullet-removed': {
          for (const pos of event.positions) {
            emitWallImpact(this.particles, pos.x, pos.y)
          }
          break
        }

        case 'player-hit': {
          this.camera.addTrauma(event.trauma)
          if (event.simHitStopSeconds > 0) {
            this.hitStop?.freeze(event.simHitStopSeconds)
          }
          if (event.renderPauseSeconds > 0) {
            this.renderPause?.freeze(event.renderPauseSeconds)
          }
          if (event.kickStrength > 0 && (event.kickX !== 0 || event.kickY !== 0)) {
            this.camera.applyKick(event.kickX, event.kickY, event.kickStrength)
          }
          this.sound.play('player_hit')
          break
        }

        case 'player-fire': {
          this.camera.addTrauma(event.trauma)
          this.camera.applyKick(Math.cos(event.angle), Math.sin(event.angle), event.kickStrength)
          this.sound.play('fire')
          this.playerRenderer.triggerRecoil(event.eid)
          emitMuzzleFlash(this.particles, event.muzzleX, event.muzzleY, event.angle)
          emitShotTracer(this.particles, event.muzzleX, event.muzzleY, event.angle)
          emitShellCasing(this.particles, event.muzzleX, event.muzzleY, event.angle)
          this.spawnMuzzleLight?.(event.muzzleX, event.muzzleY)
          if (event.fireSlowdownMs && event.fireSlowdownMs > 0) {
            this.hitStop?.freeze(event.fireSlowdownMs / 1000)
          }
          break
        }

        case 'shot-confirmed': {
          if (event.hit) {
            emitEntityImpact(this.particles, event.x, event.y, 0xffd67a)
            this.sound.play('hit')
          } else {
            emitWallImpact(this.particles, event.x, event.y)
          }
          break
        }

        case 'player-melee-swing': {
          this.camera.addTrauma(event.trauma)
          this.camera.applyKick(Math.cos(event.angle), Math.sin(event.angle), event.kickStrength)
          this.sound.play('fire')
          this.playerRenderer.triggerRecoil(event.eid)
          emitSwingArc(
            this.particles,
            event.x,
            event.y,
            event.angle,
            event.arcHalf,
            event.reach,
            event.charged,
          )
          break
        }

        case 'reload-start':
          this.sound.play('reload_start')
          break

        case 'reload-complete':
          this.sound.play('reload_complete')
          break

        case 'dry-fire':
          this.sound.play('dry_fire')
          break

        case 'showdown-activate':
          this.sound.play('showdown_activate')
          break

        case 'showdown-kill':
          this.sound.play('showdown_kill')
          break

        case 'showdown-expire':
          this.sound.play('showdown_expire')
          break

        case 'last-rites-activate':
          this.sound.play('showdown_activate')
          break

        case 'last-rites-pulse':
          this.sound.play('enemy_die')
          emitDeathPulse(this.particles, event.x, event.y, event.radius)
          break

        case 'last-rites-expire':
          this.sound.play('showdown_expire')
          break

        case 'dynamite-detonation':
          this.camera.addTrauma(0.3)
          this.sound.play('enemy_die')
          emitExplosion(this.particles, event.x, event.y, event.radius)
          break

        case 'dynamite-fuse-sparks':
          emitFuseSparks(this.particles, event.x, event.y, event.intensity)
          break

        case 'level-up':
          this.sound.play('level_up')
          emitLevelUpSparkle(this.particles, event.x, event.y)
          break

        case 'boss-intro':
          this.camera.addTrauma(0.2)
          this.pendingBossIntro = { bossName: event.bossName, taunt: event.taunt }
          break

        case 'trap-detonation':
          this.camera.addTrauma(event.kind === 'tripwire' ? 0.25 : 0.15)
          this.sound.play('enemy_die')
          emitExplosion(this.particles, event.x, event.y, event.radius)
          break

        case 'boss-phase-transition':
          this.sound.play('showdown_activate')
          {
            const trauma = PHASE_TRANSITION_TRAUMA[event.newPhase] ?? DEFAULT_PHASE_TRAUMA
            const freeze = PHASE_TRANSITION_FREEZE[event.newPhase] ?? DEFAULT_PHASE_FREEZE
            this.camera.addTrauma(trauma)
            this.hitStop?.freeze(freeze)
            switch (event.newPhase) {
              case 2: // Ground crack
                emitGroundCrackBurst(this.particles, event.x, event.y)
                emitBrimstoneErupt(this.particles, event.x, event.y)
                break
              case 3: // Shadow tendrils + fire
                emitShadowTendrils(this.particles, event.x, event.y)
                emitFireGeyser(this.particles, event.x, event.y)
                emitDeathPulse(this.particles, event.x, event.y, 100)
                break
              case 4: // Smoke + slow-mo
                emitSmokeSpiral(this.particles, event.x, event.y)
                this.timeScale?.slowMo(PHASE_4_SLOWMO_SCALE, PHASE_4_SLOWMO_DURATION)
                break
              default:
                emitDeathPulse(this.particles, event.x, event.y, 80)
                break
            }
          }
          break

        case 'enemy-healed':
          for (const heal of event.heals) {
            this.floatingText.spawn(heal.x, heal.y, heal.amount, 0x44ddaa, 0.8)
          }
          break

        case 'rattlesnake-bite':
          for (const bite of event.bites) {
            emitPoisonSplash(this.particles, bite.x, bite.y)
          }
          break

        case 'vulture-dive-trail':
          for (const trail of event.trails) {
            emitVultureDiveTrail(this.particles, trail.x, trail.y)
          }
          break

        case 'draw-flash':
          this.drawFlashOverlay?.triggerFlash()
          this.camera.addTrauma(0.3)
          this.sound.play('showdown_activate')
          break

        case 'draw-result':
          this.drawFlashOverlay?.showResult(event.text, event.color)
          switch (event.timing) {
            case 'perfect':
              this.drawFlashOverlay?.triggerFlash(DRAW_PERFECT_FLASH_TINT)
              this.timeScale?.slowMo(DRAW_PERFECT_SLOWMO_SCALE, DRAW_PERFECT_SLOWMO_DURATION)
              break
            case 'slow':
              this.drawFlashOverlay?.triggerFlash(DRAW_SLOW_FLASH_TINT)
              break
            case 'panic':
              this.camera.addTrauma(DRAW_PANIC_TRAUMA)
              break
          }
          break

        case 'boss-death':
          this.camera.addTrauma(BOSS_DEATH_TRAUMA)
          this.hitStop?.freeze(BOSS_DEATH_FREEZE)
          this.timeScale?.slowMo(BOSS_DEATH_SLOWMO_SCALE, BOSS_DEATH_SLOWMO_DURATION)
          emitSmokeSpiral(this.particles, event.x, event.y)
          emitGoldenSunMotes(this.particles, event.x, event.y)
          this.sound.play('showdown_activate')
          break
      }
    }
  }

  consumePendingBossIntro(): { bossName: string; taunt: string } | null {
    const pending = this.pendingBossIntro
    this.pendingBossIntro = null
    return pending
  }
}
