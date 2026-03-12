import GameAnalytics from 'gameanalytics'
import { getConsent, setConsent } from './consent'

let initialized = false

export function initAnalytics(): boolean {
  if (initialized) return true

  const consent = getConsent()
  if (consent !== 'granted') return false

  const gameKey = import.meta.env.VITE_GA_GAME_KEY
  const secretKey = import.meta.env.VITE_GA_SECRET_KEY
  if (!gameKey || !secretKey) {
    console.warn('[Analytics] Missing GA keys, skipping init')
    return false
  }

  GameAnalytics.configureBuild('0.1.0')
  GameAnalytics.initialize(gameKey, secretKey)
  initialized = true
  return true
}

export function isAnalyticsReady(): boolean {
  return initialized
}

export function setAnalyticsEnabled(enabled: boolean): void {
  setConsent(enabled ? 'granted' : 'denied')
  if (initialized) {
    GameAnalytics.setEnabledEventSubmission(enabled)
  } else if (enabled) {
    initAnalytics()
  }
}
