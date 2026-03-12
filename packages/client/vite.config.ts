import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { resolve } from 'path'

export default defineConfig({
  root: __dirname,
  publicDir: 'public',
  plugins: [
    react(),
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: process.env.VITE_SENTRY_RELEASE },
      sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
      disable: !process.env.SENTRY_AUTH_TOKEN, // skip in local builds
    }),
  ],
  server: {
    port: 3000,
    open: true,
  },
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
  },
  build: {
    outDir: 'dist',
    sourcemap: 'hidden',
  },
  resolve: {
    alias: {
      '@high-noon/shared': resolve(__dirname, '../shared/src'),
    },
  },
})
