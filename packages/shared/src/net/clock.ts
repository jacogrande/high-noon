/** Client → Server */
export interface PingMessage {
  clientTime: number // performance.now() on client
}

/** Server → Client */
export interface PongMessage {
  clientTime: number // Echoed from PingMessage
  serverTime: number // performance.now() on server
}
