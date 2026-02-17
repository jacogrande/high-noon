/**
 * Headless bot client for soak testing.
 *
 * Connects to a game room via Colyseus client SDK, sends random inputs at 60Hz,
 * and tracks snapshot receipt. No simulation or rendering.
 */

import { Client, type Room } from 'colyseus.js'
import { createInputState, type NetworkInput, Button } from '@high-noon/shared'

export interface BotStats {
  connected: boolean
  snapshotsReceived: number
  inputsSent: number
  reconnects: number
  errors: string[]
  lastSnapshotTime: number
}

export class BotClient {
  private client: Client
  private room: Room | null = null
  private inputInterval: ReturnType<typeof setInterval> | null = null
  private inputSeq = 0
  private shootSeq = 0
  readonly stats: BotStats = {
    connected: false,
    snapshotsReceived: 0,
    inputsSent: 0,
    reconnects: 0,
    errors: [],
    lastSnapshotTime: 0,
  }

  constructor(private endpoint: string, private botId: string) {
    this.client = new Client(endpoint)
  }

  async connect(): Promise<void> {
    try {
      this.room = await this.client.joinOrCreate('game', { characterId: 'sheriff' })
      this.stats.connected = true

      this.room.onMessage('snapshot', () => {
        this.stats.snapshotsReceived++
        this.stats.lastSnapshotTime = Date.now()
      })

      this.room.onMessage('game-config', () => {
        // Ready the bot for match
        this.room?.send('set-ready', { ready: true })
      })

      this.room.onLeave(() => {
        this.stats.connected = false
        this.stopSendingInput()
      })

      this.startSendingInput()
    } catch (err) {
      this.stats.errors.push(`connect: ${err instanceof Error ? err.message : String(err)}`)
      throw err
    }
  }

  async reconnect(): Promise<void> {
    if (!this.room) return
    const token = this.room.reconnectionToken
    this.stopSendingInput()
    this.room = null
    this.stats.connected = false

    try {
      this.room = await this.client.reconnect(token)
      this.stats.connected = true
      this.stats.reconnects++
      this.room.send('request-game-config')
      this.startSendingInput()
    } catch (err) {
      this.stats.errors.push(`reconnect: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async disconnect(): Promise<void> {
    this.stopSendingInput()
    try {
      await this.room?.leave()
    } catch {
      // ignore
    }
    this.room = null
    this.stats.connected = false
  }

  /** Force-disconnect to simulate network drop (for reconnect testing). */
  simulateDisconnect(): void {
    this.stopSendingInput()
    // Leave without the consented flag
    try {
      this.room?.connection?.close()
    } catch {
      // ignore
    }
    this.stats.connected = false
  }

  private startSendingInput(): void {
    if (this.inputInterval) return
    this.inputInterval = setInterval(() => this.sendRandomInput(), 1000 / 60)
  }

  private stopSendingInput(): void {
    if (this.inputInterval) {
      clearInterval(this.inputInterval)
      this.inputInterval = null
    }
  }

  private sendRandomInput(): void {
    if (!this.room) return
    this.inputSeq++

    const base = createInputState()
    // Random movement
    base.moveX = Math.random() * 2 - 1
    base.moveY = Math.random() * 2 - 1
    base.aimAngle = Math.random() * Math.PI * 2 - Math.PI

    // Randomly shoot
    if (Math.random() < 0.05) {
      base.buttons |= Button.SHOOT
      this.shootSeq++
    }

    const input: NetworkInput = {
      ...base,
      seq: this.inputSeq,
      clientTick: this.inputSeq,
      clientTimeMs: performance.now(),
      estimatedServerTimeMs: 0,
      viewInterpDelayMs: 0,
      shootSeq: this.shootSeq,
    }

    try {
      this.room.send('input', input)
      this.stats.inputsSent++
    } catch {
      // ignore send errors
    }
  }
}
