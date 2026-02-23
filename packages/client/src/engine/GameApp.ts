/**
 * GameApp - PixiJS Application wrapper
 *
 * Manages the PixiJS application lifecycle and render layers.
 * Renders the game world at a low internal resolution, then upscales with
 * nearest-neighbor filtering for a pixel-art aesthetic.
 */

import { Application, Container, RenderTexture, Sprite, TextureStyle } from 'pixi.js'

/**
 * Internal (low-res) render resolution.
 * With WORLD_SCALE = 0.5, the visible world area is
 * INTERNAL_WIDTH/WORLD_SCALE × INTERNAL_HEIGHT/WORLD_SCALE = 720×404 world units.
 */
export const INTERNAL_WIDTH = 360
export const INTERNAL_HEIGHT = 202

/**
 * World-to-RT scale factor. Sprites authored at 16px rendered at 2× in world
 * space appear at their native art pixel size (1 art pixel = 1 RT pixel).
 */
export const WORLD_SCALE = 0.5

/** Render layer names in z-order (back to front) */
export type LayerName = 'background' | 'tiles' | 'entities' | 'fx' | 'ui'

/**
 * GameApp wraps PixiJS Application with game-specific setup
 */
export class GameApp {
  readonly app: Application
  readonly layers: Record<LayerName, Container>
  private readonly worldContainer: Container
  private readonly lowResRoot: Container
  private readonly lowResRT: RenderTexture
  readonly lowResSprite: Sprite
  /** Base position of lowResSprite before sub-pixel camera offset. */
  private baseX = 0
  private baseY = 0

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
    this.worldContainer.scale.set(WORLD_SCALE)
    this.worldContainer.addChild(this.layers.background)
    this.worldContainer.addChild(this.layers.tiles)
    this.worldContainer.addChild(this.layers.entities)
    this.worldContainer.addChild(this.layers.fx)

    // Root container for low-res rendering: worldContainer + screen-space overlays (e.g. lightmap)
    this.lowResRoot = new Container()
    this.lowResRoot.addChild(this.worldContainer)

    // Low-res RenderTexture for pixel-art upscaling.
    // +1px padding so sub-pixel camera offset never reveals an unrendered edge.
    this.lowResRT = RenderTexture.create({
      width: INTERNAL_WIDTH + 1,
      height: INTERNAL_HEIGHT + 1,
      scaleMode: 'nearest',
    })
    this.lowResSprite = new Sprite(this.lowResRT)
    this.lowResSprite.eventMode = 'none'

    // Stage: lowResSprite (pixel-art world) + ui (native-res screen-space)
    app.stage.addChild(this.lowResSprite)
    app.stage.addChild(this.layers.ui)

    // Scale lowResSprite to fill canvas
    this.resize()
  }

  /**
   * Create and initialize a new GameApp
   */
  static async create(container: HTMLElement): Promise<GameApp> {
    // Set global nearest-neighbor filtering before any textures are created
    TextureStyle.defaultOptions.scaleMode = 'nearest'

    const app = new Application()

    await app.init({
      background: '#1a1a2e',
      resizeTo: container,
      antialias: false,
      resolution: 1,
      roundPixels: true,
    })

    container.appendChild(app.canvas)
    app.canvas.style.imageRendering = 'pixelated'

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

  /** Get the low-res root for adding screen-space overlays (e.g. lightmap) */
  get overlay(): Container {
    return this.lowResRoot
  }

  /** Render the world + overlays into the low-res RenderTexture. Call each render frame. */
  renderWorld(): void {
    this.app.renderer.render({
      container: this.lowResRoot,
      target: this.lowResRT,
      clear: true,
    })
  }

  /** Scale the low-res sprite to fill the canvas (uniform scale, centered). */
  resize(): void {
    const scaleX = this.app.screen.width / INTERNAL_WIDTH
    const scaleY = this.app.screen.height / INTERNAL_HEIGHT
    const scale = Math.max(scaleX, scaleY)
    this.lowResSprite.scale.set(scale)
    this.baseX = (this.app.screen.width - INTERNAL_WIDTH * scale) / 2
    this.baseY = (this.app.screen.height - INTERNAL_HEIGHT * scale) / 2
    this.lowResSprite.x = this.baseX
    this.lowResSprite.y = this.baseY
  }

  /**
   * Apply sub-pixel camera offset for smooth scrolling.
   * @param fracX - Fractional camera remainder in RT pixels (0..1)
   * @param fracY - Fractional camera remainder in RT pixels (0..1)
   */
  applyCameraSubPixelOffset(fracX: number, fracY: number): void {
    const upscale = this.lowResSprite.scale.x
    this.lowResSprite.x = this.baseX - fracX * upscale
    this.lowResSprite.y = this.baseY - fracY * upscale
  }

  /** Destroy the application */
  destroy(): void {
    this.lowResRT.destroy(true)
    this.app.destroy(true, { children: true })
  }
}
