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
  trackError('error', `${e.message} at ${e.filename}:${e.lineno}`)
  trackingError = false
})

window.addEventListener('unhandledrejection', (e) => {
  if (trackingError) return
  trackingError = true
  trackError('error', `Unhandled rejection: ${String(e.reason).slice(0, 256)}`)
  trackingError = false
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
