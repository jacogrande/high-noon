import { describe, expect, test } from 'bun:test'
import { HitStop } from '../../engine/HitStop'
import { GameplayEventProcessor } from './GameplayEventProcessor'
import type { GameplayEvent } from './GameplayEvents'

describe('GameplayEventProcessor', () => {
  test('player-hit triggers trauma, sound, simulation hit-stop, and render pause', () => {
    const traumas: number[] = []
    const kicks: Array<{ x: number; y: number; s: number }> = []
    const sounds: string[] = []
    const simHitStop = new HitStop()
    const renderPause = new HitStop()

    const processor = new GameplayEventProcessor({
      camera: {
        addTrauma: (v: number) => { traumas.push(v) },
        applyKick: (x: number, y: number, s: number) => { kicks.push({ x, y, s }) },
      } as never,
      sound: {
        play: (id: string) => { sounds.push(id) },
      } as never,
      particles: {} as never,
      floatingText: {} as never,
      playerRenderer: {} as never,
      hitStop: simHitStop,
      renderPause,
    })

    const events: GameplayEvent[] = [{
      type: 'player-hit',
      trauma: 0.2,
      simHitStopSeconds: 0.05,
      renderPauseSeconds: 0.03,
      kickX: 1,
      kickY: 0,
      kickStrength: 4,
    }]
    processor.processAll(events)

    expect(traumas).toEqual([0.2])
    expect(sounds).toEqual(['player_hit'])
    expect(kicks).toEqual([{ x: 1, y: 0, s: 4 }])
    expect(simHitStop.isFrozen).toBe(true)
    expect(renderPause.isFrozen).toBe(true)
  })

  test('last rites and dynamite cues trigger shared particles/sounds', () => {
    const traumas: number[] = []
    const sounds: string[] = []
    const emissions: number[] = []

    const processor = new GameplayEventProcessor({
      camera: {
        addTrauma: (v: number) => { traumas.push(v) },
        applyKick: () => {},
      } as never,
      sound: {
        play: (id: string) => { sounds.push(id) },
      } as never,
      particles: {
        emit: () => { emissions.push(1) },
      } as never,
      floatingText: {} as never,
      playerRenderer: {} as never,
    })

    const events: GameplayEvent[] = [
      { type: 'last-rites-activate' },
      { type: 'last-rites-pulse', x: 0, y: 0, radius: 60 },
      { type: 'last-rites-expire' },
      { type: 'dynamite-fuse-sparks', x: 20, y: 30, intensity: 0.8 },
      { type: 'dynamite-detonation', x: 100, y: 200, radius: 48 },
    ]
    processor.processAll(events)

    expect(sounds).toEqual([
      'showdown_activate',
      'enemy_die',
      'showdown_expire',
      'enemy_die',
    ])
    expect(traumas).toEqual([0.3])
    expect(emissions.length).toBeGreaterThan(0)
  })
})
