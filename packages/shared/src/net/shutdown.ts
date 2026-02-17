export interface ServerShutdownMessage {
  reason: 'maintenance' | 'update' | 'error'
  countdownMs: number
}
