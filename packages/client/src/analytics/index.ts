export { initAnalytics, isAnalyticsReady, setAnalyticsEnabled } from './analytics'
export { getConsent, setConsent, type ConsentState } from './consent'
export {
  trackRunStart,
  trackStageComplete,
  trackPlayerDeath,
  trackRunComplete,
  trackUpgradeChosen,
  trackBossEncounter,
  trackItemAcquired,
  trackError,
  trackMultiplayerMatch,
  trackMatchLatency,
  trackDisconnect,
} from './analyticsEvents'
