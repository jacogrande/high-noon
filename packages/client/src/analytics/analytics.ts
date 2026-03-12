import GameAnalytics from 'gameanalytics'
import { getConsent, setConsent } from './consent'

let sdkInitialized = false
let submissionEnabled = false

export function initAnalytics(): boolean {
  if (sdkInitialized && submissionEnabled) return true

  const consent = getConsent()
  if (consent !== 'granted') return false

  const gameKey = import.meta.env.VITE_GA_GAME_KEY
  const secretKey = import.meta.env.VITE_GA_SECRET_KEY
  if (!gameKey || !secretKey) {
    console.warn('[Analytics] Missing GA keys, skipping init')
    return false
  }

  if (!sdkInitialized) {
    try {
      GameAnalytics.configureBuild('0.1.0')
      GameAnalytics.initialize(gameKey, secretKey)
      sdkInitialized = true
    } catch (err) {
      console.warn('[Analytics] SDK initialization failed:', err)
      return false
    }
  }
  GameAnalytics.setEnabledEventSubmission(true)
  submissionEnabled = true
  return true
}

export function isAnalyticsReady(): boolean {
  return sdkInitialized && submissionEnabled
}

export function setAnalyticsEnabled(enabled: boolean): void {
  setConsent(enabled ? 'granted' : 'denied')
  if (sdkInitialized) {
    GameAnalytics.setEnabledEventSubmission(enabled)
    submissionEnabled = enabled
  } else if (enabled) {
    initAnalytics()
  }
}
