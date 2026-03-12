import * as Sentry from '@sentry/react'

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || '',
  environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || 'development',
  release: import.meta.env.VITE_SENTRY_RELEASE || 'dev',
  enabled: !!import.meta.env.VITE_SENTRY_DSN,

  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
  ],

  // Sample rates — keep low to stay within free tier
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0, // no passive replay
  replaysOnErrorSampleRate: 1.0, // capture replay on every error
})
