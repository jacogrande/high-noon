const CONSENT_KEY = 'hn_analytics_consent'

export type ConsentState = 'granted' | 'denied' | 'unset'

export function getConsent(): ConsentState {
  const value = localStorage.getItem(CONSENT_KEY)
  if (value === 'granted') return 'granted'
  if (value === 'denied') return 'denied'
  return 'unset'
}

export function setConsent(state: 'granted' | 'denied'): void {
  localStorage.setItem(CONSENT_KEY, state)
}
