import './instrument' // MUST be first import
import * as Sentry from '@sentry/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

// Sentry's ErrorInfo uses componentStack: string|null, React 19 uses string|undefined — normalize
const rawHandler = Sentry.reactErrorHandler()
const sentryHandler = (error: unknown, errorInfo: { componentStack?: string | undefined }) => {
  rawHandler(error, { ...errorInfo, componentStack: errorInfo.componentStack ?? null })
}

createRoot(rootElement, {
  onUncaughtError: sentryHandler,
  onCaughtError: sentryHandler,
  onRecoverableError: sentryHandler,
}).render(
  <StrictMode>
    <App />
  </StrictMode>
)
