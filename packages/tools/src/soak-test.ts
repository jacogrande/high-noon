/**
 * Soak test runner for multiplayer stability testing.
 *
 * Usage:
 *   bun run packages/tools/src/soak-test.ts [options]
 *
 * Options:
 *   --rooms=N          Number of rooms to create (default: 1)
 *   --botsPerRoom=M    Bots per room (default: 2)
 *   --duration=S       Test duration in seconds (default: 60)
 *   --disconnectRate=R Probability of random disconnect per bot per 10s (default: 0.1)
 *   --endpoint=URL     Server WebSocket URL (default: ws://localhost:2567)
 */

import { BotClient } from './bot-client'

interface SoakConfig {
  rooms: number
  botsPerRoom: number
  durationS: number
  disconnectRate: number
  endpoint: string
}

function parseArgs(): SoakConfig {
  const args = process.argv.slice(2)
  const config: SoakConfig = {
    rooms: 1,
    botsPerRoom: 2,
    durationS: 60,
    disconnectRate: 0.1,
    endpoint: 'ws://localhost:2567',
  }

  for (const arg of args) {
    const [key, value] = arg.split('=')
    switch (key) {
      case '--rooms': config.rooms = parseInt(value!, 10); break
      case '--botsPerRoom': config.botsPerRoom = parseInt(value!, 10); break
      case '--duration': config.durationS = parseInt(value!, 10); break
      case '--disconnectRate': config.disconnectRate = parseFloat(value!); break
      case '--endpoint': config.endpoint = value!; break
    }
  }

  return config
}

async function main() {
  const config = parseArgs()
  console.log('[SoakTest] Starting with config:', config)

  const allBots: BotClient[] = []

  // Create bots grouped by room
  for (let r = 0; r < config.rooms; r++) {
    for (let b = 0; b < config.botsPerRoom; b++) {
      const botId = `room${r}-bot${b}`
      allBots.push(new BotClient(config.endpoint, botId))
    }
  }

  // Connect all bots
  console.log(`[SoakTest] Connecting ${allBots.length} bots...`)
  const connectResults = await Promise.allSettled(
    allBots.map(bot => bot.connect())
  )

  let connectFailures = 0
  for (const result of connectResults) {
    if (result.status === 'rejected') {
      connectFailures++
      console.error('[SoakTest] Bot connect failed:', result.reason)
    }
  }
  console.log(`[SoakTest] ${allBots.length - connectFailures}/${allBots.length} bots connected`)

  if (connectFailures === allBots.length) {
    console.error('[SoakTest] All bots failed to connect, aborting')
    process.exit(1)
  }

  // Status ticker
  const statusInterval = setInterval(() => {
    const connected = allBots.filter(b => b.stats.connected).length
    const totalSnapshots = allBots.reduce((s, b) => s + b.stats.snapshotsReceived, 0)
    const totalInputs = allBots.reduce((s, b) => s + b.stats.inputsSent, 0)
    const totalReconnects = allBots.reduce((s, b) => s + b.stats.reconnects, 0)
    const totalErrors = allBots.reduce((s, b) => s + b.stats.errors.length, 0)

    console.log(JSON.stringify({
      event: 'soak-status',
      connected,
      total: allBots.length,
      snapshots: totalSnapshots,
      inputs: totalInputs,
      reconnects: totalReconnects,
      errors: totalErrors,
    }))
  }, 10_000)

  // Random disconnect injection
  const disconnectInterval = setInterval(() => {
    for (const bot of allBots) {
      if (!bot.stats.connected) continue
      if (Math.random() < config.disconnectRate) {
        console.log('[SoakTest] Injecting disconnect')
        bot.simulateDisconnect()
        // Schedule reconnect after a delay
        setTimeout(async () => {
          try {
            await bot.reconnect()
          } catch (err) {
            console.error('[SoakTest] Reconnect failed:', err)
          }
        }, 2000 + Math.random() * 3000)
      }
    }
  }, 10_000)

  // Run for specified duration
  await new Promise(resolve => setTimeout(resolve, config.durationS * 1000))

  clearInterval(statusInterval)
  clearInterval(disconnectInterval)

  // Disconnect all bots
  console.log('[SoakTest] Shutting down bots...')
  await Promise.allSettled(allBots.map(bot => bot.disconnect()))

  // Final report
  const totalErrors = allBots.reduce((s, b) => s + b.stats.errors.length, 0)
  const totalReconnects = allBots.reduce((s, b) => s + b.stats.reconnects, 0)
  const totalSnapshots = allBots.reduce((s, b) => s + b.stats.snapshotsReceived, 0)

  console.log('\n[SoakTest] === FINAL REPORT ===')
  console.log(`  Duration: ${config.durationS}s`)
  console.log(`  Bots: ${allBots.length}`)
  console.log(`  Total snapshots: ${totalSnapshots}`)
  console.log(`  Total reconnects: ${totalReconnects}`)
  console.log(`  Total errors: ${totalErrors}`)

  if (totalErrors > 0) {
    console.log('\n  Errors:')
    for (const bot of allBots) {
      for (const err of bot.stats.errors) {
        console.log(`    ${err}`)
      }
    }
  }

  const success = totalErrors === 0
  console.log(`\n  Result: ${success ? 'PASS' : 'FAIL'}`)
  process.exit(success ? 0 : 1)
}

main().catch((err) => {
  console.error('[SoakTest] Fatal error:', err)
  process.exit(1)
})
