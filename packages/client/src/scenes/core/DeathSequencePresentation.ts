import { Graphics, Text, TextStyle, type Container } from 'pixi.js'
import type { DeathPresentationPolicy } from './PresentationPolicy'

export interface DeathViewport {
  width: number
  height: number
}

export type DeathSequencePhase = 'alive' | 'animating' | 'fading' | 'game-over'

export function getDeathSequencePhase(
  isDead: boolean,
  elapsedSeconds: number,
  policy: DeathPresentationPolicy,
): DeathSequencePhase {
  if (!policy.enabled || !isDead) return 'alive'
  if (elapsedSeconds <= policy.deathAnimDurationSeconds) return 'animating'
  if (elapsedSeconds <= policy.deathAnimDurationSeconds + policy.fadeDurationSeconds) return 'fading'
  return 'game-over'
}

export class DeathSequencePresentation {
  private readonly policy: DeathPresentationPolicy
  private readonly getViewport: () => DeathViewport
  private readonly fadeOverlay: Graphics
  private readonly gameOverText: Text
  private deathTime: number | null = null

  constructor(uiLayer: Container, getViewport: () => DeathViewport, policy: DeathPresentationPolicy) {
    this.policy = policy
    this.getViewport = getViewport

    this.fadeOverlay = new Graphics()
    this.fadeOverlay.rect(0, 0, 1, 1)
    this.fadeOverlay.fill(0x000000)
    this.fadeOverlay.alpha = 0
    this.fadeOverlay.visible = false
    uiLayer.addChild(this.fadeOverlay)

    this.gameOverText = new Text({
      text: this.policy.gameOverText,
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 72,
        fill: '#cc0000',
        stroke: { color: '#000000', width: 6 },
      }),
    })
    this.gameOverText.anchor.set(0.5)
    this.gameOverText.visible = false
    uiLayer.addChild(this.gameOverText)
  }

  update(isDead: boolean): void {
    if (!this.policy.enabled || !isDead) {
      this.reset()
      return
    }

    if (this.deathTime === null) {
      this.deathTime = performance.now()
    }

    const elapsed = (performance.now() - this.deathTime) / 1000
    const gameOverDelay = this.policy.deathAnimDurationSeconds + this.policy.fadeDurationSeconds
    const { width, height } = this.getViewport()
    const phase = getDeathSequencePhase(true, elapsed, this.policy)

    if (phase === 'fading' || phase === 'game-over') {
      this.fadeOverlay.visible = true
      this.fadeOverlay.scale.set(width, height)
      const fadeProgress = Math.min(
        (elapsed - this.policy.deathAnimDurationSeconds) / this.policy.fadeDurationSeconds,
        1,
      )
      this.fadeOverlay.alpha = fadeProgress
    }

    if (phase === 'game-over' && elapsed > gameOverDelay) {
      this.gameOverText.x = width / 2
      this.gameOverText.y = height / 2
      this.gameOverText.visible = true
    }
  }

  destroy(): void {
    this.fadeOverlay.destroy()
    this.gameOverText.destroy()
  }

  private reset(): void {
    this.deathTime = null
    this.fadeOverlay.alpha = 0
    this.fadeOverlay.visible = false
    this.gameOverText.visible = false
  }
}
