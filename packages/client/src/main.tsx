import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'
import { trackError } from './analytics/analyticsEvents'

// Global error handlers for analytics (Ticket 4.4)
window.addEventListener('error', (e) => {
  trackError('error', `${e.message} at ${e.filename}:${e.lineno}`)
})

window.addEventListener('unhandledrejection', (e) => {
  trackError('error', `Unhandled rejection: ${String(e.reason).slice(0, 200)}`)
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
