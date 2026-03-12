import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'
import { trackError } from './analytics/analyticsEvents'

// Global error handlers for analytics (Ticket 4.4)
let trackingError = false
window.addEventListener('error', (e) => {
  if (trackingError) return
  trackingError = true
  try {
    trackError('error', `${e.message} at ${e.filename}:${e.lineno}`)
  } catch {
    // never let analytics errors suppress subsequent error events
  } finally {
    trackingError = false
  }
})

window.addEventListener('unhandledrejection', (e) => {
  if (trackingError) return
  trackingError = true
  try {
    trackError('error', `Unhandled rejection: ${String(e.reason).slice(0, 256)}`)
  } catch {
    // never let analytics errors suppress subsequent error events
  } finally {
    trackingError = false
  }
})

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)
