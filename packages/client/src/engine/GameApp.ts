/**
 * GameApp - PixiJS Application wrapper
 *
 * Manages the PixiJS application lifecycle and render layers.
 */

import { Application, Container } from 'pixi.js'

/** Render layer names in z-order (back to front) */
export type LayerName = 'background' | 'tiles' | 'entities' | 'fx' | 'ui'

/**
 * GameApp wraps PixiJS Application with game-specific setup
 */
export class GameApp {
  readonly app: Application
  readonly layers: Record<LayerName, Container>
  private readonly worldContainer: Container

  private constructor(app: Application) {
    this.app = app

    // Create render layers in z-order
    this.layers = {
      background: new Container(),
      tiles: new Container(),
      entities: new Container(),
      fx: new Container(),
      ui: new Container(),
    }

    // World container holds all world-space layers (camera transforms this)
    this.worldContainer = new Container()
    this.worldContainer.addChild(this.layers.background)
    this.worldContainer.addChild(this.layers.tiles)
    this.worldContainer.addChild(this.layers.entities)
    this.worldContainer.addChild(this.layers.fx)

    // Stage: worldContainer (camera-affected) + ui (screen-space)
    app.stage.addChild(this.worldContainer)
    app.stage.addChild(this.layers.ui)
  }

  /**
   * Create and initialize a new GameApp
   */
  static async create(container: HTMLElement): Promise<GameApp> {
    const app = new Application()

    await app.init({
      background: '#1a1a2e',
      resizeTo: container,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })

    container.appendChild(app.canvas)

    return new GameApp(app)
  }

  /** Get screen width */
  get width(): number {
    return this.app.screen.width
  }

  /** Get screen height */
  get height(): number {
    return this.app.screen.height
  }

  /** Get the stage */
  get stage(): Container {
    return this.app.stage
  }

  /** Get the world container (camera transforms this) */
  get world(): Container {
    return this.worldContainer
  }

  /** Destroy the application */
  destroy(): void {
    this.app.destroy(true, { children: true })
  }
}
