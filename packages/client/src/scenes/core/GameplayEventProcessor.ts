import { emitDeathBurst, emitEntityImpact, emitLevelUpSparkle, emitMuzzleFlash, emitWallImpact, FloatingTextPool, ParticlePool } from '../../fx'
import { SoundManager } from '../../audio/SoundManager'
import { Camera } from '../../engine/Camera'
import { HitStop } from '../../engine/HitStop'
import { PlayerRenderer } from '../../render/PlayerRenderer'
import type { GameplayEvent } from './GameplayEvents'

export interface GameplayEventProcessorDeps {
  camera: Camera
  sound: SoundManager
  particles: ParticlePool
  floatingText: FloatingTextPool
  playerRenderer: PlayerRenderer
  hitStop?: HitStop
  renderPause?: HitStop
}

export class GameplayEventProcessor {
  private readonly camera: Camera
  private readonly sound: SoundManager
  private readonly particles: ParticlePool
  private readonly floatingText: FloatingTextPool
  private readonly playerRenderer: PlayerRenderer
  private readonly hitStop: HitStop | undefined
  private readonly renderPause: HitStop | undefined

  constructor(deps: GameplayEventProcessorDeps) {
    this.camera = deps.camera
    this.sound = deps.sound
    this.particles = deps.particles
    this.floatingText = deps.floatingText
    this.playerRenderer = deps.playerRenderer
    this.hitStop = deps.hitStop
    this.renderPause = deps.renderPause
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
          }
          for (const hit of event.hits) {
            emitEntityImpact(this.particles, hit.x, hit.y, hit.color)
            this.floatingText.spawn(hit.x, hit.y, hit.amount, hit.color)
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

        case 'level-up':
          this.sound.play('level_up')
          emitLevelUpSparkle(this.particles, event.x, event.y)
          break
      }
    }
  }
}
