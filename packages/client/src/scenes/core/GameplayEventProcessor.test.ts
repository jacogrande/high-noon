import { describe, expect, test } from 'bun:test'
import { HitStop } from '../../engine/HitStop'
import { TimeScale } from '../../engine/TimeScale'
import { GameplayEventProcessor } from './GameplayEventProcessor'
import type { GameplayEvent } from './GameplayEvents'

function createTestProcessor(overrides?: {
  hitStop?: HitStop
  timeScale?: TimeScale
  drawFlashOverlay?: { triggerFlash: (c?: number) => void; showResult: (t: string, c: number) => void }
}) {
  const traumas: number[] = []
  const sounds: string[] = []
  const emissions: number[] = []
  const hitStop = overrides?.hitStop ?? new HitStop()
  const timeScale = overrides?.timeScale ?? new TimeScale()
  const flashCalls: Array<{ color?: number }> = []
  const resultCalls: Array<{ text: string; color: number }> = []
  const drawFlash = overrides?.drawFlashOverlay ?? {
    triggerFlash: (c?: number) => { flashCalls.push({ color: c }) },
    showResult: (t: string, c: number) => { resultCalls.push({ text: t, color: c }) },
  }

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
    hitStop,
    timeScale,
    drawFlashOverlay: drawFlash as never,
  })

  return { processor, traumas, sounds, emissions, hitStop, timeScale, flashCalls, resultCalls }
}

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
      'explosion',
    ])
    expect(traumas).toEqual([0.3])
    expect(emissions.length).toBeGreaterThan(0)
  })

  test('melee swing triggers kick, recoil, and swing particles', () => {
    const traumas: number[] = []
    const kicks: Array<{ x: number; y: number; s: number }> = []
    const sounds: string[] = []
    const recoils: number[] = []
    const emissions: number[] = []

    const processor = new GameplayEventProcessor({
      camera: {
        addTrauma: (v: number) => { traumas.push(v) },
        applyKick: (x: number, y: number, s: number) => { kicks.push({ x, y, s }) },
      } as never,
      sound: {
        play: (id: string) => { sounds.push(id) },
      } as never,
      particles: {
        emit: () => { emissions.push(1) },
      } as never,
      floatingText: {} as never,
      playerRenderer: {
        triggerRecoil: (eid: number) => { recoils.push(eid) },
      } as never,
    })

    processor.processAll([{
      type: 'player-melee-swing',
      eid: 7,
      x: 100,
      y: 120,
      angle: Math.PI / 2,
      arcHalf: Math.PI / 6,
      reach: 64,
      charged: false,
      trauma: 0.1,
      kickStrength: 3,
    }])

    expect(traumas).toEqual([0.1])
    expect(kicks.length).toBe(1)
    expect(sounds).toEqual(['roll'])
    expect(recoils).toEqual([7])
    expect(emissions.length).toBeGreaterThan(0)
  })

  test('boss-intro stores pending overlay payload', () => {
    const traumas: number[] = []

    const processor = new GameplayEventProcessor({
      camera: {
        addTrauma: (v: number) => { traumas.push(v) },
        applyKick: () => {},
      } as never,
      sound: {
        play: () => {},
      } as never,
      particles: {} as never,
      floatingText: {} as never,
      playerRenderer: {} as never,
    })

    processor.processAll([{
      type: 'boss-intro',
      bossName: 'Mad Dog',
      taunt: 'No law out here.',
      x: 100,
      y: 200,
    }])

    expect(traumas).toEqual([0.2])
    expect(processor.consumePendingBossIntro()).toEqual({
      bossName: 'Mad Dog',
      taunt: 'No law out here.',
    })
    expect(processor.consumePendingBossIntro()).toBeNull()
  })

  test('boss-phase-transition to phase 2 uses ground crack particles', () => {
    const { processor, traumas, sounds, emissions, hitStop } = createTestProcessor()

    processor.processAll([{
      type: 'boss-phase-transition',
      x: 100, y: 200,
      newPhase: 2,
    }])

    expect(traumas).toEqual([0.4])
    expect(sounds).toContain('showdown_activate')
    expect(emissions.length).toBeGreaterThan(0)
    expect(hitStop.isFrozen).toBe(true)
  })

  test('boss-phase-transition to phase 3 uses shadow tendrils + fire geyser', () => {
    const { processor, traumas, sounds, emissions, hitStop } = createTestProcessor()

    processor.processAll([{
      type: 'boss-phase-transition',
      x: 100, y: 200,
      newPhase: 3,
    }])

    expect(traumas).toEqual([0.6])
    expect(sounds).toContain('showdown_activate')
    // Shadow tendrils (20-24) + fire geyser (10-14) + death pulse (16-24) = lots of particles
    expect(emissions.length).toBeGreaterThan(30)
    expect(hitStop.isFrozen).toBe(true)
  })

  test('boss-phase-transition to phase 4 triggers slow-mo', () => {
    const { processor, traumas, sounds, hitStop, timeScale } = createTestProcessor()

    processor.processAll([{
      type: 'boss-phase-transition',
      x: 100, y: 200,
      newPhase: 4,
    }])

    expect(traumas).toEqual([0.5])
    expect(sounds).toContain('showdown_activate')
    expect(hitStop.isFrozen).toBe(true)
    expect(timeScale.current).toBeLessThan(1) // slow-mo active
  })

  test('boss-death triggers heavy trauma, hit-stop, slow-mo', () => {
    const { processor, traumas, sounds, hitStop, timeScale, emissions } = createTestProcessor()

    processor.processAll([{
      type: 'boss-death',
      x: 400, y: 300,
    }])

    expect(traumas).toEqual([0.7])
    expect(hitStop.isFrozen).toBe(true)
    expect(timeScale.current).toBeLessThan(1)
    expect(sounds).toContain('boss_death')
    expect(emissions.length).toBeGreaterThan(0)
  })

  test('draw-result perfect triggers gold flash + slow-mo', () => {
    const { processor, flashCalls, timeScale } = createTestProcessor()

    processor.processAll([{
      type: 'draw-result',
      text: 'PERFECT',
      color: 0xFFD700,
      timing: 'perfect',
    }])

    expect(flashCalls.length).toBe(1)
    expect(flashCalls[0]!.color).toBe(0xFFD700)
    expect(timeScale.current).toBeLessThan(1)
  })

  test('draw-result panic triggers trauma, no flash', () => {
    const { processor, traumas, flashCalls } = createTestProcessor()

    processor.processAll([{
      type: 'draw-result',
      text: 'TOO EARLY',
      color: 0xFF4444,
      timing: 'panic',
    }])

    expect(traumas).toEqual([0.3])
    expect(flashCalls.length).toBe(0) // panic = no flash
  })

  test('spatial audio: player-fire passes pan and volumeScale', () => {
    const playArgs: Array<{ name: string; pan?: number; volumeScale?: number }> = []

    const processor = new GameplayEventProcessor({
      camera: { addTrauma: () => {}, applyKick: () => {} } as never,
      sound: {
        play: (id: string, opts?: { pan?: number; volumeScale?: number }) => {
          playArgs.push({ name: id, pan: opts?.pan, volumeScale: opts?.volumeScale })
        },
      } as never,
      particles: { emit: () => {} } as never,
      floatingText: {} as never,
      playerRenderer: { triggerRecoil: () => {} } as never,
    })

    processor.setListenerPosition(0, 0)
    processor.processAll([{
      type: 'player-fire',
      eid: 1,
      angle: 0,
      muzzleX: 400,
      muzzleY: 0,
      trauma: 0,
      kickStrength: 0,
    }])

    expect(playArgs[0]!.name).toBe('fire')
    // listener at (0,0), muzzle at (400,0): pan = 400/360 → clamped to 1.0
    expect(playArgs[0]!.pan).toBeCloseTo(1.0)
    // distance 400, t = 1 - 400/800 = 0.5, volume = 0.5² = 0.25
    expect(playArgs[0]!.volumeScale).toBeCloseTo(0.25, 2)
  })

  test('spatial audio: boss sounds have volume floor', () => {
    const playArgs: Array<{ name: string; volumeScale?: number }> = []

    const processor = new GameplayEventProcessor({
      camera: { addTrauma: () => {}, applyKick: () => {} } as never,
      sound: {
        play: (id: string, opts?: { volumeScale?: number }) => {
          playArgs.push({ name: id, volumeScale: opts?.volumeScale })
        },
      } as never,
      particles: {} as never,
      floatingText: {} as never,
      playerRenderer: {} as never,
    })

    // Listener far from boss — would normally be silent
    processor.setListenerPosition(0, 0)
    processor.processAll([{
      type: 'boss-intro',
      bossName: 'Test Boss',
      taunt: 'Test',
      x: 2000,
      y: 0,
    }])

    expect(playArgs[0]!.name).toBe('boss_intro')
    expect(playArgs[0]!.volumeScale).toBeGreaterThanOrEqual(0.3) // volume floor
  })
})
