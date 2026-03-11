export interface SpatialResult {
  pan: number // -1.0 (left) to 1.0 (right)
  volume: number // 0.0 (silent) to 1.0 (full)
}

export interface SpatialAudioConfig {
  /** World units from listener at which sound is fully silent. */
  maxDistance: number
  /** World units of horizontal offset for full pan (-1 or +1). */
  panSpread: number
}

const DEFAULT_CONFIG: SpatialAudioConfig = {
  maxDistance: 800, // just under viewport diagonal (720×404 → diagonal ~826)
  panSpread: 360, // half-viewport width = full pan
}

const SILENT_CENTER: SpatialResult = { volume: 0, pan: 0 }

export function computeSpatial(
  listenerX: number,
  listenerY: number,
  sourceX: number,
  sourceY: number,
  config: SpatialAudioConfig = DEFAULT_CONFIG,
): SpatialResult {
  // Guard against NaN/Infinity from uninitialized Float32Array slots (bitECS)
  // or missing entity positions — a NaN pan would stall the Web Audio panner node.
  if (!Number.isFinite(listenerX) || !Number.isFinite(listenerY) ||
      !Number.isFinite(sourceX)   || !Number.isFinite(sourceY)) {
    return SILENT_CENTER
  }

  const dx = sourceX - listenerX
  const dy = sourceY - listenerY
  const distance = Math.sqrt(dx * dx + dy * dy)

  // Squared falloff (t²): at half-distance volume is 0.25, at quarter-distance ~0.56.
  // Concentrates audibility near the listener while aggressively silencing distant sounds.
  const t = config.maxDistance > 0
    ? Math.max(0, Math.min(1, 1 - distance / config.maxDistance))
    : 0

  return {
    volume: t * t,
    pan: config.panSpread > 0
      ? Math.max(-1, Math.min(1, dx / config.panSpread))
      : 0,
  }
}
