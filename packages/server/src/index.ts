import { Server, matchMaker } from 'colyseus'
import { GameRoom } from './rooms/GameRoom'

const PORT = Number(process.env.PORT) || 2567
const SHUTDOWN_COUNTDOWN_MS = 10_000

async function main() {
  const server = new Server()
  server.define('game', GameRoom).filterBy(['roomCode'])
  await server.listen(PORT)
  console.log(`[Server] High Noon listening on ws://localhost:${PORT}`)

  const shutdown = async (signal: string) => {
    console.log(`[Server] ${signal} received, initiating graceful shutdown`)
    try {
      const rooms = await matchMaker.query({})
      for (const roomListing of rooms) {
        try {
          await matchMaker.remoteRoomCall(roomListing.roomId, 'broadcastShutdown', ['maintenance', SHUTDOWN_COUNTDOWN_MS])
        } catch (err) {
          console.warn(`[Server] Failed to notify room ${roomListing.roomId}:`, err)
        }
      }
    } catch (err) {
      console.warn('[Server] Failed to query rooms for shutdown:', err)
    }

    // Wait for countdown + buffer to ensure messages are sent
    setTimeout(() => {
      server.gracefullyShutdown(true)
    }, SHUTDOWN_COUNTDOWN_MS + 2_000)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((err) => {
  console.error('[Server] Fatal error:', err)
  process.exit(1)
})
