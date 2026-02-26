/**
 * Procedural SFX Generator
 *
 * Synthesizes 28 audio files (24 SFX + 4 ambient loops) using pure math
 * (sine, sawtooth, noise, envelopes, filters) into Float32Array PCM at 48kHz
 * mono. Writes WAV to temp files, converts to OGG via ffmpeg.
 *
 * Run: bun run tools/generateSfx.ts
 */

import { mkdirSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const SAMPLE_RATE = 48000
const OUTPUT_DIR = join(import.meta.dir, '..', 'packages', 'client', 'public', 'assets', 'sfx')

// ============================================================================
// Synthesis helpers
// ============================================================================

function sine(freq: number, t: number): number {
  return Math.sin(2 * Math.PI * freq * t)
}

function sawtooth(freq: number, t: number): number {
  const phase = (freq * t) % 1
  return 2 * phase - 1
}

function whiteNoise(): number {
  return Math.random() * 2 - 1
}

function createBuffer(durationMs: number): Float32Array {
  return new Float32Array(Math.ceil((durationMs / 1000) * SAMPLE_RATE))
}

function applyEnvelope(samples: Float32Array, attackMs: number, decayMs: number): Float32Array {
  const attackSamples = Math.ceil((attackMs / 1000) * SAMPLE_RATE)
  const decaySamples = Math.ceil((decayMs / 1000) * SAMPLE_RATE)
  const decayStart = samples.length - decaySamples

  for (let i = 0; i < samples.length; i++) {
    let gain = 1
    if (i < attackSamples) {
      gain = i / attackSamples
    }
    if (i >= decayStart && decaySamples > 0) {
      const t = (i - decayStart) / decaySamples
      gain *= Math.exp(-3 * t)
    }
    samples[i]! *= gain
  }
  return samples
}

function bandpass(samples: Float32Array, loHz: number, hiHz: number): Float32Array {
  // Simple biquad bandpass filter
  const centerFreq = Math.sqrt(loHz * hiHz)
  const Q = centerFreq / (hiHz - loHz)
  const w0 = 2 * Math.PI * centerFreq / SAMPLE_RATE
  const alpha = Math.sin(w0) / (2 * Q)
  const cosw0 = Math.cos(w0)

  const b0 = alpha
  const b1 = 0
  const b2 = -alpha
  const a0 = 1 + alpha
  const a1 = -2 * cosw0
  const a2 = 1 - alpha

  const out = new Float32Array(samples.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i]!
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
    out[i] = y
    x2 = x1; x1 = x
    y2 = y1; y1 = y
  }
  return out
}

function highpass(samples: Float32Array, cutoffHz: number): Float32Array {
  const w0 = 2 * Math.PI * cutoffHz / SAMPLE_RATE
  const alpha = Math.sin(w0) / (2 * 0.707)
  const cosw0 = Math.cos(w0)

  const b0 = (1 + cosw0) / 2
  const b1 = -(1 + cosw0)
  const b2 = (1 + cosw0) / 2
  const a0 = 1 + alpha
  const a1 = -2 * cosw0
  const a2 = 1 - alpha

  const out = new Float32Array(samples.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i]!
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
    out[i] = y
    x2 = x1; x1 = x
    y2 = y1; y1 = y
  }
  return out
}

function mix(a: Float32Array, b: Float32Array, bGain: number = 1): Float32Array {
  const len = Math.max(a.length, b.length)
  const out = new Float32Array(len)
  for (let i = 0; i < len; i++) {
    out[i] = (i < a.length ? a[i]! : 0) + (i < b.length ? b[i]! : 0) * bGain
  }
  return out
}

function simpleReverb(samples: Float32Array, delayMs: number, feedback: number): Float32Array {
  const delaySamples = Math.ceil((delayMs / 1000) * SAMPLE_RATE)
  const out = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    out[i] = samples[i]!
    if (i >= delaySamples) {
      out[i]! += out[i - delaySamples]! * feedback
    }
  }
  return out
}

function normalize(samples: Float32Array, peak: number = 0.9): Float32Array {
  let max = 0
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]!)
    if (abs > max) max = abs
  }
  if (max > 0) {
    const scale = peak / max
    for (let i = 0; i < samples.length; i++) {
      samples[i]! *= scale
    }
  }
  return samples
}

function raisedCosineWindow(samples: Float32Array, windowMs: number): Float32Array {
  const windowSamples = Math.ceil((windowMs / 1000) * SAMPLE_RATE)
  for (let i = 0; i < Math.min(windowSamples, samples.length); i++) {
    const t = i / windowSamples
    samples[i]! *= 0.5 * (1 - Math.cos(Math.PI * t))
  }
  for (let i = 0; i < Math.min(windowSamples, samples.length); i++) {
    const idx = samples.length - 1 - i
    const t = i / windowSamples
    samples[idx]! *= 0.5 * (1 - Math.cos(Math.PI * t))
  }
  return samples
}

// ============================================================================
// WAV writer + OGG converter
// ============================================================================

function writeWav(path: string, samples: Float32Array): void {
  const numSamples = samples.length
  const bytesPerSample = 2
  const dataSize = numSamples * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  // RIFF header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')

  // fmt chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)           // chunk size
  view.setUint16(20, 1, true)            // PCM
  view.setUint16(22, 1, true)            // mono
  view.setUint32(24, SAMPLE_RATE, true)  // sample rate
  view.setUint32(28, SAMPLE_RATE * bytesPerSample, true) // byte rate
  view.setUint16(32, bytesPerSample, true) // block align
  view.setUint16(34, 16, true)           // bits per sample

  // data chunk
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
  }

  Bun.write(path, new Uint8Array(buffer))
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

async function convertToOgg(wavPath: string, oggPath: string): Promise<void> {
  const proc = Bun.spawn(['ffmpeg', '-y', '-i', wavPath, '-c:a', 'libvorbis', '-q:a', '3', oggPath], {
    stdout: 'ignore',
    stderr: 'ignore',
  })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(`ffmpeg failed with exit code ${exitCode} for ${wavPath}`)
  }
}

// ============================================================================
// Sound recipes
// ============================================================================

function generateFire(): Float32Array {
  // Noise burst (30ms, bandpass 800-4kHz) + low thump (80Hz sine, 20ms)
  const noise = createBuffer(80)
  for (let i = 0; i < noise.length; i++) {
    const t = i / SAMPLE_RATE
    noise[i] = t < 0.03 ? whiteNoise() : 0
  }
  const filtered = bandpass(noise, 800, 4000)
  applyEnvelope(filtered, 1, 50)

  const thump = createBuffer(80)
  for (let i = 0; i < thump.length; i++) {
    const t = i / SAMPLE_RATE
    thump[i] = t < 0.02 ? sine(80, t) : 0
  }
  applyEnvelope(thump, 0.5, 15)

  return normalize(mix(filtered, thump, 0.8))
}

function generateHit(): Float32Array {
  // Short click impulse + filtered noise tail (2kHz highpass)
  const buf = createBuffer(60)
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE
    buf[i] = t < 0.003 ? 1.0 : whiteNoise() * 0.4
  }
  const hp = highpass(buf, 2000)
  return normalize(applyEnvelope(hp, 0.5, 40))
}

function generateEnemyDie(): Float32Array {
  // Descending sine chirp 400→100Hz + noise burst
  const buf = createBuffer(200)
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE
    const freq = 400 - 300 * (t / 0.2)
    buf[i] = sine(freq, t) * 0.7 + whiteNoise() * 0.3
  }
  return normalize(applyEnvelope(buf, 2, 150))
}

function generatePlayerHit(): Float32Array {
  // Low thump (60Hz, 80ms) + crunch noise (bandpass 1-3kHz)
  const thump = createBuffer(120)
  for (let i = 0; i < thump.length; i++) {
    const t = i / SAMPLE_RATE
    thump[i] = sine(60, t)
  }
  applyEnvelope(thump, 1, 80)

  const noise = createBuffer(120)
  for (let i = 0; i < noise.length; i++) {
    noise[i] = whiteNoise()
  }
  const crunch = bandpass(noise, 1000, 3000)
  applyEnvelope(crunch, 2, 80)

  return normalize(mix(thump, crunch, 0.5))
}

function generateLevelUp(): Float32Array {
  // Ascending arpeggio: C5→E5→G5 sines, 80ms each, overlapping
  const buf = createBuffer(300)
  const notes = [523.25, 659.25, 783.99] // C5, E5, G5
  const noteMs = 80
  const noteSamples = Math.ceil((noteMs / 1000) * SAMPLE_RATE)
  for (let n = 0; n < notes.length; n++) {
    const startSample = n * noteSamples
    for (let i = 0; i < noteSamples * 1.5 && startSample + i < buf.length; i++) {
      const t = i / SAMPLE_RATE
      const env = Math.exp(-3 * t / (noteMs / 1000))
      buf[startSample + i]! += sine(notes[n]!, t) * env * 0.5
    }
  }
  return normalize(buf)
}

function generateUpgradeSelect(): Float32Array {
  // Bright click + resonant ring (800Hz, 100ms decay)
  const buf = createBuffer(120)
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE
    const click = t < 0.003 ? 0.8 : 0
    const ring = sine(800, t) * Math.exp(-8 * t)
    buf[i] = click + ring * 0.6
  }
  return normalize(buf)
}

function generateWaveStart(): Float32Array {
  // Low horn: 150Hz sawtooth + harmonics, slow attack
  const buf = createBuffer(400)
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE
    buf[i] = sawtooth(150, t) * 0.5 + sine(300, t) * 0.25 + sine(450, t) * 0.12
  }
  return normalize(applyEnvelope(buf, 100, 200))
}

function generateReloadStart(): Float32Array {
  // Two metallic clicks (2kHz, 3ms each, 60ms apart)
  const buf = createBuffer(80)
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE
    const inClick1 = t < 0.003
    const inClick2 = t >= 0.06 && t < 0.063
    if (inClick1 || inClick2) {
      buf[i] = sine(2000, t) * 0.8 + sine(5000, t) * 0.3
    }
  }
  return normalize(buf)
}

function generateReloadComplete(): Float32Array {
  // Cylinder snap: impulse + metallic ring (1.2kHz)
  const buf = createBuffer(60)
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE
    const impulse = t < 0.002 ? 1.0 : 0
    const ring = sine(1200, t) * Math.exp(-12 * t)
    buf[i] = impulse + ring * 0.5
  }
  return normalize(buf)
}

function generateDryFire(): Float32Array {
  // Muted click: short bandpassed noise at 1.5kHz
  const noise = createBuffer(30)
  for (let i = 0; i < noise.length; i++) {
    noise[i] = whiteNoise()
  }
  const filtered = bandpass(noise, 1200, 1800)
  return normalize(applyEnvelope(filtered, 0.5, 20))
}

function generateShowdownActivate(): Float32Array {
  // Dramatic sting: 110Hz + 165Hz (fifth), slow attack
  const buf = createBuffer(400)
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE
    buf[i] = sine(110, t) * 0.5 + sine(165, t) * 0.4 + sawtooth(110, t) * 0.15
  }
  return normalize(applyEnvelope(buf, 80, 250))
}

function generateShowdownKill(): Float32Array {
  // Quick descending impact: noise + 200→80Hz chirp
  const buf = createBuffer(120)
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE
    const freq = 200 - 120 * (t / 0.12)
    buf[i] = sine(freq, t) * 0.6 + whiteNoise() * 0.3
  }
  return normalize(applyEnvelope(buf, 1, 80))
}

function generateShowdownExpire(): Float32Array {
  // Fading whistle: 600Hz sine with vibrato, exp decay
  const buf = createBuffer(500)
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE
    const vibrato = 6 * sine(5, t)
    buf[i] = sine(600 + vibrato, t)
  }
  return normalize(applyEnvelope(buf, 10, 400))
}

function generateFootstep(): Float32Array {
  // Very short filtered noise burst (200-800Hz bandpass)
  const noise = createBuffer(25)
  for (let i = 0; i < noise.length; i++) {
    noise[i] = whiteNoise()
  }
  const filtered = bandpass(noise, 200, 800)
  return normalize(applyEnvelope(filtered, 0.5, 18))
}

function generateRoll(): Float32Array {
  // Whoosh: noise sweep (300-2kHz), fast attack + medium decay
  const buf = createBuffer(150)
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE
    buf[i] = whiteNoise()
  }
  // Sweep bandpass by generating with different center frequencies
  const lo = bandpass(buf, 300, 800)
  const hi = bandpass(buf, 1000, 2000)
  const out = createBuffer(150)
  for (let i = 0; i < out.length; i++) {
    const t = i / out.length
    // Sweep from lo to hi
    out[i] = lo[i]! * (1 - t) + hi[i]! * t
  }
  return normalize(applyEnvelope(out, 5, 120))
}

function generateExplosion(): Float32Array {
  // Deep boom (40Hz, 100ms) + wideband noise (200ms) + crackle
  const boom = createBuffer(300)
  for (let i = 0; i < boom.length; i++) {
    const t = i / SAMPLE_RATE
    boom[i] = sine(40, t) * (t < 0.1 ? 1 : 0)
  }
  applyEnvelope(boom, 2, 80)

  const noise = createBuffer(300)
  for (let i = 0; i < noise.length; i++) {
    const t = i / SAMPLE_RATE
    noise[i] = whiteNoise() * (t < 0.2 ? 1 : Math.exp(-5 * (t - 0.2)))
  }
  const filtered = bandpass(noise, 100, 3000)

  // Crackle: random clicks
  const crackle = createBuffer(300)
  for (let i = 0; i < crackle.length; i++) {
    crackle[i] = Math.random() < 0.02 ? whiteNoise() * 0.5 : 0
  }

  return normalize(mix(mix(boom, filtered, 0.7), crackle, 0.3))
}

function generateBossIntro(): Float32Array {
  // Low drone: 80Hz sawtooth + 5th harmonic, tremolo at 4Hz
  const buf = createBuffer(700)
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE
    const tremolo = 0.5 + 0.5 * sine(4, t)
    buf[i] = (sawtooth(80, t) * 0.5 + sine(400, t) * 0.3) * tremolo
  }
  return normalize(applyEnvelope(buf, 150, 300))
}

function generateBossDeath(): Float32Array {
  // Death knell: descending tone cluster (200/150/100Hz) + reverb
  const buf = createBuffer(900)
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE
    const decay = Math.exp(-2 * t)
    buf[i] = (sine(200 - 50 * t, t) + sine(150 - 40 * t, t) + sine(100 - 30 * t, t)) * decay / 3
  }
  const reverbed = simpleReverb(buf, 80, 0.4)
  return normalize(applyEnvelope(reverbed, 20, 600))
}

function generatePlayerDeath(): Float32Array {
  // Two low thuds (60Hz) then descending tone 300→50Hz
  const buf = createBuffer(800)
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE
    // Thud 1 at 0-80ms
    if (t < 0.08) {
      buf[i] = sine(60, t) * 0.8
    }
    // Thud 2 at 150-230ms
    else if (t >= 0.15 && t < 0.23) {
      buf[i] = sine(60, t) * 0.6
    }
    // Descending tone from 300ms onwards
    else if (t >= 0.3) {
      const dt = t - 0.3
      const freq = 300 - 250 * (dt / 0.5)
      buf[i] = sine(Math.max(50, freq), t) * Math.exp(-2 * dt) * 0.5
    }
  }
  return normalize(applyEnvelope(buf, 2, 300))
}

function generateGoldPickup(): Float32Array {
  // Bright coin chime: 2kHz sine, fast decay, 2nd harmonic
  const buf = createBuffer(50)
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE
    buf[i] = sine(2000, t) * 0.6 + sine(4000, t) * 0.3
  }
  return normalize(applyEnvelope(buf, 0.5, 35))
}

function generateStageComplete(): Float32Array {
  // Triumphant horn: ascending 3rd (150→187Hz) + harmonics
  const buf = createBuffer(600)
  const halfLen = buf.length / 2
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE
    const freq = i < halfLen ? 150 : 187.5
    buf[i] = sawtooth(freq, t) * 0.4 + sine(freq * 2, t) * 0.3 + sine(freq * 3, t) * 0.15
  }
  return normalize(applyEnvelope(buf, 80, 300))
}

function generateWaveClear(): Float32Array {
  // Two-tone flourish: 300Hz→400Hz, 60ms each
  const buf = createBuffer(200)
  const noteSamples = Math.ceil(0.06 * SAMPLE_RATE)
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE
    if (i < noteSamples) {
      buf[i] = sine(300, t) * 0.7
    } else if (i < noteSamples * 2) {
      buf[i] = sine(400, t) * 0.7
    } else {
      buf[i] = sine(400, t) * Math.exp(-10 * (t - 0.12))
    }
  }
  return normalize(applyEnvelope(buf, 2, 100))
}

function generateUiClick(): Float32Array {
  // Short click: 1.5kHz sine, hard cutoff
  const buf = createBuffer(10)
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE
    buf[i] = sine(1500, t)
  }
  return normalize(applyEnvelope(buf, 0.2, 6))
}

function generateUiHover(): Float32Array {
  // Subtle tick: filtered impulse, very quiet
  const buf = createBuffer(5)
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE
    buf[i] = sine(2500, t) * 0.4
  }
  return normalize(applyEnvelope(buf, 0.1, 3))
}

// ============================================================================
// Ambient loop recipes
// ============================================================================

function generateAmbientDesert(): Float32Array {
  // Low wind noise (100-600Hz, 0.2Hz AM) + coyote howl at 3s + cricket chirps
  const dur = 8000
  const buf = createBuffer(dur)

  // Wind base
  const wind = createBuffer(dur)
  for (let i = 0; i < wind.length; i++) {
    wind[i] = whiteNoise()
  }
  const filteredWind = bandpass(wind, 100, 600)

  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE
    const am = 0.4 + 0.6 * (0.5 + 0.5 * sine(0.2, t))
    buf[i] = filteredWind[i]! * am * 0.4
  }

  // Coyote howl at ~3s (ascending then descending sine)
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE
    if (t >= 2.8 && t < 3.8) {
      const dt = t - 2.8
      const freq = dt < 0.5 ? 400 + 200 * (dt / 0.5) : 600 - 200 * ((dt - 0.5) / 0.5)
      const env = dt < 0.2 ? dt / 0.2 : Math.exp(-2 * (dt - 0.2))
      buf[i]! += sine(freq, t) * env * 0.15
    }
  }

  // Cricket chirps (periodic short bursts)
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE
    const chirpPhase = (t * 3) % 1 // 3 chirps per second
    if (chirpPhase < 0.05) {
      buf[i]! += sine(4500, t) * 0.03
    }
  }

  raisedCosineWindow(buf, 200)
  return normalize(buf, 0.7)
}

function generateAmbientBadlands(): Float32Array {
  // Heavier wind (80-800Hz) + whistling (800-1.2kHz sweep) + rattle at 5s
  const dur = 8000
  const buf = createBuffer(dur)

  const wind = createBuffer(dur)
  for (let i = 0; i < wind.length; i++) {
    wind[i] = whiteNoise()
  }
  const filteredWind = bandpass(wind, 80, 800)

  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE
    const am = 0.3 + 0.7 * (0.5 + 0.5 * sine(0.15, t))
    buf[i] = filteredWind[i]! * am * 0.5
  }

  // Whistling
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE
    const freq = 800 + 400 * sine(0.3, t)
    const env = 0.5 + 0.5 * sine(0.25, t)
    buf[i]! += sine(freq, t) * env * 0.08
  }

  // Rattle at 5s
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE
    if (t >= 4.8 && t < 5.3) {
      const dt = t - 4.8
      const rattleFreq = 12 // Hz, rattlesnake-like
      buf[i]! += whiteNoise() * (0.5 + 0.5 * sine(rattleFreq, dt)) * Math.exp(-3 * dt) * 0.12
    }
  }

  raisedCosineWindow(buf, 200)
  return normalize(buf, 0.7)
}

function generateAmbientCanyon(): Float32Array {
  // Brown noise + long delay echo (300ms, 0.5 feedback) + water drips
  const dur = 10000
  const buf = createBuffer(dur)

  // Brown noise (integrated white noise)
  let brown = 0
  const noise = createBuffer(dur)
  for (let i = 0; i < noise.length; i++) {
    brown += whiteNoise() * 0.02
    brown *= 0.998
    noise[i] = brown
  }

  for (let i = 0; i < buf.length; i++) {
    buf[i] = noise[i]! * 0.5
  }

  // Apply echo
  const echoed = simpleReverb(buf, 300, 0.5)
  for (let i = 0; i < buf.length; i++) {
    buf[i] = echoed[i]!
  }

  // Water drips (random short sine pings)
  const dripTimes = [1.2, 2.8, 4.5, 6.1, 7.5, 9.0]
  for (const dripTime of dripTimes) {
    for (let i = 0; i < buf.length; i++) {
      const t = i / SAMPLE_RATE
      if (t >= dripTime && t < dripTime + 0.03) {
        const dt = t - dripTime
        buf[i]! += sine(3000 + Math.random() * 1000, dt) * Math.exp(-40 * dt) * 0.15
      }
    }
  }

  raisedCosineWindow(buf, 200)
  return normalize(buf, 0.7)
}

function generateAmbientHellfire(): Float32Array {
  // Deep rumble (30-80Hz) + fire crackle (random noise bursts) + gusts
  const dur = 8000
  const buf = createBuffer(dur)

  // Rumble
  const rumble = createBuffer(dur)
  for (let i = 0; i < rumble.length; i++) {
    rumble[i] = whiteNoise()
  }
  const filteredRumble = bandpass(rumble, 30, 80)

  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE
    buf[i] = filteredRumble[i]! * 0.6
  }

  // Fire crackle
  for (let i = 0; i < buf.length; i++) {
    if (Math.random() < 0.005) {
      // Random noise burst
      const burstLen = Math.floor(SAMPLE_RATE * 0.005)
      for (let j = 0; j < burstLen && i + j < buf.length; j++) {
        buf[i + j]! += whiteNoise() * 0.2 * Math.exp(-j / (burstLen * 0.3))
      }
    }
  }

  // Gusts
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE
    const gustEnv = Math.max(0, sine(0.4, t)) * Math.max(0, sine(0.17, t + 0.5))
    buf[i]! += whiteNoise() * gustEnv * 0.15
  }

  raisedCosineWindow(buf, 200)
  return normalize(buf, 0.7)
}

// ============================================================================
// Generation pipeline
// ============================================================================

interface SoundRecipe {
  name: string
  generate: () => Float32Array
}

const RECIPES: SoundRecipe[] = [
  // Existing 13 (regenerated with new synthesis)
  { name: 'fire', generate: generateFire },
  { name: 'hit', generate: generateHit },
  { name: 'enemy_die', generate: generateEnemyDie },
  { name: 'player_hit', generate: generatePlayerHit },
  { name: 'level_up', generate: generateLevelUp },
  { name: 'upgrade_select', generate: generateUpgradeSelect },
  { name: 'wave_start', generate: generateWaveStart },
  { name: 'reload_start', generate: generateReloadStart },
  { name: 'reload_complete', generate: generateReloadComplete },
  { name: 'dry_fire', generate: generateDryFire },
  { name: 'showdown_activate', generate: generateShowdownActivate },
  { name: 'showdown_kill', generate: generateShowdownKill },
  { name: 'showdown_expire', generate: generateShowdownExpire },
  // New 15 SFX
  { name: 'footstep', generate: generateFootstep },
  { name: 'roll', generate: generateRoll },
  { name: 'explosion', generate: generateExplosion },
  { name: 'boss_intro', generate: generateBossIntro },
  { name: 'boss_death', generate: generateBossDeath },
  { name: 'player_death', generate: generatePlayerDeath },
  { name: 'gold_pickup', generate: generateGoldPickup },
  { name: 'stage_complete', generate: generateStageComplete },
  { name: 'wave_clear', generate: generateWaveClear },
  { name: 'ui_click', generate: generateUiClick },
  { name: 'ui_hover', generate: generateUiHover },
  // Ambient loops
  { name: 'ambient_desert', generate: generateAmbientDesert },
  { name: 'ambient_badlands', generate: generateAmbientBadlands },
  { name: 'ambient_canyon', generate: generateAmbientCanyon },
  { name: 'ambient_hellfire', generate: generateAmbientHellfire },
]

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const tmpDir = join(tmpdir(), 'high-noon-sfx')
  mkdirSync(tmpDir, { recursive: true })

  console.log(`Generating ${RECIPES.length} sounds...`)

  for (const recipe of RECIPES) {
    const samples = recipe.generate()
    const wavPath = join(tmpDir, `${recipe.name}.wav`)
    const oggPath = join(OUTPUT_DIR, `${recipe.name}.ogg`)

    try {
      writeWav(wavPath, samples)
      await convertToOgg(wavPath, oggPath)
    } finally {
      try { unlinkSync(wavPath) } catch {}
    }

    const sizeKB = (Bun.file(oggPath).size / 1024).toFixed(1)
    console.log(`  ${recipe.name}.ogg (${sizeKB} KB)`)
  }

  console.log(`\nDone! ${RECIPES.length} OGG files written to ${OUTPUT_DIR}`)
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})
