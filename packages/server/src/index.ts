import { Server } from 'colyseus'
import { GameRoom } from './rooms/GameRoom'

const PORT = Number(process.env.PORT) || 2567

async function main() {
  const server = new Server()
  server.define('game', GameRoom)
  await server.listen(PORT)
  console.log(`[Server] High Noon listening on ws://localhost:${PORT}`)
}

main().catch((err) => {
  console.error('[Server] Fatal error:', err)
  process.exit(1)
})
