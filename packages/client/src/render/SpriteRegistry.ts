/**
 * SpriteRegistry - Manage entity display objects
 *
 * Maps entity IDs to PixiJS display objects for rendering.
 * Handles creation, updates, and cleanup of visual representations.
 */

import { Container, Graphics, Sprite, Texture } from 'pixi.js'

/** Shape types for proper redrawing */
type ShapeType = 'circle' | 'rect' | 'sprite' | 'custom'

/** Callback to redraw a custom Graphics shape with a new color */
export type CustomDrawFn = (g: Graphics, color: number) => void

/** Metadata stored with each sprite */
interface SpriteData {
  displayObject: Graphics | Container | Sprite
  shapeType?: ShapeType
  radius?: number
  width?: number
  height?: number
  customDraw?: CustomDrawFn
}

/** Display object types we support */
export type DisplayObject = Graphics | Container | Sprite

/**
 * Registry for entity display objects
 */
export class SpriteRegistry {
  private readonly sprites = new Map<number, SpriteData>()
  /** Secondary display objects keyed by "eid:tag" (e.g. health bar bg/fill) */
  private readonly aux = new Map<string, Graphics | Container | Sprite>()
  private readonly container: Container

  constructor(entityLayer: Container) {
    this.container = entityLayer
  }

  /** Get the parent container this registry adds sprites to. */
  getContainer(): Container {
    return this.container
  }

  /**
   * Check if an entity has a sprite
   */
  has(eid: number): boolean {
    return this.sprites.has(eid)
  }

  /**
   * Get sprite for an entity
   */
  get(eid: number): DisplayObject | undefined {
    return this.sprites.get(eid)?.displayObject
  }

  /**
   * Create a debug circle for an entity
   */
  createCircle(eid: number, radius: number, color: number): Graphics {
    // Remove existing if present
    this.remove(eid)

    const graphics = new Graphics()
    graphics.circle(0, 0, radius)
    graphics.fill({ color })

    this.sprites.set(eid, {
      displayObject: graphics,
      shapeType: 'circle',
      radius,
    })
    this.container.addChild(graphics)

    return graphics
  }

  /**
   * Create a debug rectangle for an entity
   */
  createRect(
    eid: number,
    width: number,
    height: number,
    color: number
  ): Graphics {
    // Remove existing if present
    this.remove(eid)

    const graphics = new Graphics()
    // Center the rectangle
    graphics.rect(-width / 2, -height / 2, width, height)
    graphics.fill({ color })

    this.sprites.set(eid, {
      displayObject: graphics,
      shapeType: 'rect',
      width,
      height,
    })
    this.container.addChild(graphics)

    return graphics
  }

  /**
   * Create a custom Graphics shape for an entity using a draw callback.
   * The callback is re-invoked by setColor() when the color changes.
   */
  createCustom(eid: number, color: number, draw: CustomDrawFn): Graphics {
    this.remove(eid)
    const graphics = new Graphics()
    draw(graphics, color)
    this.sprites.set(eid, {
      displayObject: graphics,
      shapeType: 'custom',
      customDraw: draw,
    })
    this.container.addChild(graphics)
    return graphics
  }

  /**
   * Create a sprite for an entity from a texture
   */
  createSprite(eid: number, texture: Texture): Sprite {
    // Remove existing if present
    this.remove(eid)

    const sprite = new Sprite(texture)
    // Center the anchor
    sprite.anchor.set(0.5, 0.5)

    this.sprites.set(eid, {
      displayObject: sprite,
      shapeType: 'sprite',
    })
    this.container.addChild(sprite)

    return sprite
  }

  /**
   * Get the underlying Sprite for an entity (if it is a sprite)
   */
  getSprite(eid: number): Sprite | undefined {
    const data = this.sprites.get(eid)
    if (data?.displayObject instanceof Sprite) {
      return data.displayObject
    }
    return undefined
  }

  /**
   * Update sprite texture
   */
  setTexture(eid: number, texture: Texture): void {
    const sprite = this.getSprite(eid)
    if (sprite) {
      sprite.texture = texture
    }
  }

  /**
   * Set sprite rotation
   */
  setRotation(eid: number, rotation: number): void {
    const data = this.sprites.get(eid)
    if (data) {
      data.displayObject.rotation = rotation
    }
  }

  /**
   * Update sprite position
   */
  setPosition(eid: number, x: number, y: number): void {
    const data = this.sprites.get(eid)
    if (data) {
      data.displayObject.x = x
      data.displayObject.y = y
    }
  }

  /**
   * Update sprite color (for Graphics objects)
   */
  setColor(eid: number, color: number): void {
    const data = this.sprites.get(eid)
    if (!data) return

    const sprite = data.displayObject
    if (!(sprite instanceof Graphics)) return

    sprite.clear()

    if (data.shapeType === 'custom' && data.customDraw) {
      data.customDraw(sprite, color)
      return
    }

    if (data.shapeType === 'circle' && data.radius !== undefined) {
      sprite.circle(0, 0, data.radius)
    } else if (
      data.shapeType === 'rect' &&
      data.width !== undefined &&
      data.height !== undefined
    ) {
      sprite.rect(-data.width / 2, -data.height / 2, data.width, data.height)
    }

    sprite.fill({ color })
  }

  /**
   * Set sprite tint color
   */
  setTint(eid: number, tint: number): void {
    const sprite = this.getSprite(eid)
    if (sprite) {
      sprite.tint = tint
    }
  }

  /**
   * Set sprite alpha/opacity
   */
  setAlpha(eid: number, alpha: number): void {
    const data = this.sprites.get(eid)
    if (data) {
      data.displayObject.alpha = alpha
    }
  }

  /**
   * Set sprite scale
   */
  setScale(eid: number, scaleX: number, scaleY: number): void {
    const data = this.sprites.get(eid)
    if (data) {
      data.displayObject.scale.set(scaleX, scaleY)
    }
  }

  // ── Auxiliary display objects (health bars, objective bars, etc.) ───

  /** Store a secondary display object for an entity under a named tag. */
  setAux(eid: number, tag: string, obj: Graphics | Container | Sprite): void {
    const key = `${eid}:${tag}`
    const prev = this.aux.get(key)
    if (prev) {
      this.container.removeChild(prev)
      prev.destroy()
    }
    this.aux.set(key, obj)
    this.container.addChild(obj)
  }

  /** Get a secondary display object by entity + tag. */
  getAux(eid: number, tag: string): (Graphics | Container | Sprite) | undefined {
    return this.aux.get(`${eid}:${tag}`)
  }

  /** Remove a specific auxiliary object. */
  removeAux(eid: number, tag: string): void {
    const key = `${eid}:${tag}`
    const obj = this.aux.get(key)
    if (obj) {
      this.container.removeChild(obj)
      obj.destroy()
      this.aux.delete(key)
    }
  }

  /** Remove all auxiliary objects for an entity. */
  removeAllAux(eid: number): void {
    const prefix = `${eid}:`
    for (const [key, obj] of this.aux) {
      if (key.startsWith(prefix)) {
        this.container.removeChild(obj)
        obj.destroy()
        this.aux.delete(key)
      }
    }
  }

  /**
   * Remove sprite for an entity (also removes all aux objects)
   */
  remove(eid: number): void {
    const data = this.sprites.get(eid)
    if (data) {
      this.container.removeChild(data.displayObject)
      data.displayObject.destroy()
      this.sprites.delete(eid)
    }
    this.removeAllAux(eid)
  }

  /**
   * Get all registered entity IDs
   */
  getEntityIds(): number[] {
    return Array.from(this.sprites.keys())
  }

  /**
   * Get sprite count
   */
  get count(): number {
    return this.sprites.size
  }

  /**
   * Clean up all sprites and aux objects
   */
  destroy(): void {
    for (const data of this.sprites.values()) {
      data.displayObject.destroy()
    }
    this.sprites.clear()
    for (const obj of this.aux.values()) {
      obj.destroy()
    }
    this.aux.clear()
  }
}
