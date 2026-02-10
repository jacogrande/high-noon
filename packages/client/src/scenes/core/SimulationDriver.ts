import { Position, TICK_S, stepWorld, type GameWorld, type InputState, type SystemRegistry } from '@high-noon/shared'

/**
 * Full-world simulation driver (singleplayer/server-style stepping).
 */
export class FullWorldSimulationDriver {
  private readonly world: GameWorld
  private readonly systems: SystemRegistry

  constructor(world: GameWorld, systems: SystemRegistry) {
    this.world = world
    this.systems = systems
  }

  step(input: InputState): void {
    stepWorld(this.world, this.systems, input)
  }
}

/**
 * Local-player scoped simulation driver for multiplayer prediction/replay.
 */
export class LocalPlayerSimulationDriver {
  private readonly world: GameWorld
  private readonly systems: SystemRegistry

  constructor(world: GameWorld, systems: SystemRegistry) {
    this.world = world
    this.systems = systems
  }

  step(localPlayerEid: number, input: InputState): void {
    this.withLocalScope(localPlayerEid, () => {
      this.world.playerInputs.set(localPlayerEid, input)
      stepWorld(this.world, this.systems)
    })
  }

  replay(localPlayerEid: number, inputs: readonly InputState[]): void {
    this.withLocalScope(localPlayerEid, () => {
      for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i]!
        Position.prevX[localPlayerEid] = Position.x[localPlayerEid]!
        Position.prevY[localPlayerEid] = Position.y[localPlayerEid]!
        this.world.playerInputs.set(localPlayerEid, input)
        for (const system of this.systems.getSystems()) {
          system(this.world, TICK_S)
        }
        this.world.playerInputs.clear()
      }
    })
  }

  runScoped(localPlayerEid: number, run: () => void): void {
    this.withLocalScope(localPlayerEid, run)
  }

  private withLocalScope(localPlayerEid: number, run: () => void): void {
    const prevScope = this.world.simulationScope
    const prevLocalEid = this.world.localPlayerEid
    this.world.simulationScope = 'local-player'
    this.world.localPlayerEid = localPlayerEid
    try {
      run()
    } finally {
      this.world.simulationScope = prevScope
      this.world.localPlayerEid = prevLocalEid
    }
  }
}
