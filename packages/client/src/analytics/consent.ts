const CONSENT_KEY = 'hn_analytics_consent'

export type ConsentState = 'granted' | 'denied' | 'unset'

export function getConsent(): ConsentState {
  try {
    const value = localStorage.getItem(CONSENT_KEY)
    if (value === 'granted') return 'granted'
    if (value === 'denied') return 'denied'
  } catch {
    // localStorage unavailable (iframe sandbox, Safari private mode)
  }
  return 'unset'
}

export function setConsent(state: 'granted' | 'denied'): void {
  try {
    localStorage.setItem(CONSENT_KEY, state)
  } catch {
    // localStorage unavailable — consent won't persist but the session still works
  }
}
