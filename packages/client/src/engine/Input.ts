/**
 * Input - Keyboard and mouse input handling
 *
 * Collects input state each frame and converts to InputState
 * for the simulation.
 */

import { Button, createInputState, type InputState } from '@high-noon/shared'

/**
 * Input manager for keyboard and mouse
 */
export class Input {
  private keys = new Set<string>()
  private mouseX = 0
  private mouseY = 0
  private mouseDown = false
  private mouseRightDown = false
  /** One-tick edge buffer for action inputs that may be tapped between fixed ticks. */
  private transientButtons = 0

  /** Reference position for aim calculation (usually player position) */
  private refX = 0
  private refY = 0

  /** Camera state for screen→world conversion */
  private cameraX = 0
  private cameraY = 0
  private halfScreenW = 0
  private halfScreenH = 0
  private invZoom = 1

  constructor() {
    this.setupListeners()
  }

  private setupListeners(): void {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mouseup', this.onMouseUp)
    window.addEventListener('contextmenu', this.onContextMenu)
  }

  private onContextMenu = (e: Event): void => {
    e.preventDefault()
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    // Ignore repeat events
    if (e.repeat) return
    this.keys.add(e.code)

    // Preserve short taps between fixed-tick polls.
    switch (e.code) {
      case 'ShiftLeft':
      case 'ShiftRight':
        this.transientButtons |= Button.ROLL
        break
      case 'Space':
        this.transientButtons |= Button.JUMP
        break
      case 'KeyR':
        this.transientButtons |= Button.RELOAD
        break
      case 'KeyQ':
        this.transientButtons |= Button.ABILITY
        break
      case 'KeyE':
        this.transientButtons |= Button.INTERACT
        break
    }
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code)
  }

  private onMouseMove = (e: MouseEvent): void => {
    this.mouseX = e.clientX
    this.mouseY = e.clientY
  }

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0) {
      this.mouseDown = true
      this.transientButtons |= Button.SHOOT
    } else if (e.button === 2) {
      this.mouseRightDown = true
      this.transientButtons |= Button.ABILITY
    }
  }

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) {
      this.mouseDown = false
    } else if (e.button === 2) {
      this.mouseRightDown = false
    }
  }

  /**
   * Set reference position for aim angle calculation (player world position)
   */
  setReferencePosition(x: number, y: number): void {
    this.refX = x
    this.refY = y
  }

  /**
   * Set camera state for screen→world coordinate conversion.
   * When camera is at (0,0) and zoom is 1, behavior is identical to pre-camera code.
   */
  setCamera(cameraX: number, cameraY: number, screenW: number, screenH: number, zoom = 1): void {
    this.cameraX = cameraX
    this.cameraY = cameraY
    this.halfScreenW = screenW / 2
    this.halfScreenH = screenH / 2
    this.invZoom = 1 / zoom
  }

  private screenToWorldX(screenX: number): number {
    return (screenX - this.halfScreenW) * this.invZoom + this.cameraX
  }

  private screenToWorldY(screenY: number): number {
    return (screenY - this.halfScreenH) * this.invZoom + this.cameraY
  }

  /**
   * Get mouse position in world coordinates
   */
  getWorldMousePosition(): { x: number; y: number } {
    return {
      x: this.screenToWorldX(this.mouseX),
      y: this.screenToWorldY(this.mouseY),
    }
  }

  /**
   * Check if a key is currently pressed
   */
  isKeyDown(code: string): boolean {
    return this.keys.has(code)
  }

  /**
   * Check if mouse button is pressed
   */
  isMouseDown(): boolean {
    return this.mouseDown
  }

  /**
   * Get current mouse position
   */
  getMousePosition(): { x: number; y: number } {
    return { x: this.mouseX, y: this.mouseY }
  }

  /**
   * Build InputState from current input
   */
  getInputState(): InputState {
    const input = createInputState()
    const transientButtons = this.transientButtons

    // Movement buttons
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) {
      input.buttons |= Button.MOVE_UP
    }
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) {
      input.buttons |= Button.MOVE_DOWN
    }
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) {
      input.buttons |= Button.MOVE_LEFT
    }
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) {
      input.buttons |= Button.MOVE_RIGHT
    }

    // Action buttons
    if ((transientButtons & Button.ROLL) !== 0 || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) {
      input.buttons |= Button.ROLL
    }
    if ((transientButtons & Button.JUMP) !== 0 || this.keys.has('Space')) {
      input.buttons |= Button.JUMP
    }
    if ((transientButtons & Button.SHOOT) !== 0 || this.mouseDown) {
      input.buttons |= Button.SHOOT
    }

    // Debug buttons
    if (this.keys.has('KeyK')) {
      input.buttons |= Button.DEBUG_SPAWN
    }

    // Reload
    if ((transientButtons & Button.RELOAD) !== 0 || this.keys.has('KeyR')) {
      input.buttons |= Button.RELOAD
    }

    // Ability (Showdown)
    if ((transientButtons & Button.ABILITY) !== 0 || this.mouseRightDown || this.keys.has('KeyQ')) {
      input.buttons |= Button.ABILITY
    }

    // Interact
    if ((transientButtons & Button.INTERACT) !== 0 || this.keys.has('KeyE')) {
      input.buttons |= Button.INTERACT
    }

    // Convert mouse screen position to world space, then calculate aim angle
    const dx = this.screenToWorldX(this.mouseX) - this.refX
    const dy = this.screenToWorldY(this.mouseY) - this.refY
    input.aimAngle = Math.atan2(dy, dx)

    // Calculate normalized movement vector
    let moveX = 0
    let moveY = 0

    if (input.buttons & Button.MOVE_LEFT) moveX -= 1
    if (input.buttons & Button.MOVE_RIGHT) moveX += 1
    if (input.buttons & Button.MOVE_UP) moveY -= 1
    if (input.buttons & Button.MOVE_DOWN) moveY += 1

    // Normalize diagonal movement
    if (moveX !== 0 && moveY !== 0) {
      const len = Math.sqrt(moveX * moveX + moveY * moveY)
      moveX /= len
      moveY /= len
    }

    input.moveX = moveX
    input.moveY = moveY

    // Cursor world position (for Showdown targeting)
    input.cursorWorldX = this.screenToWorldX(this.mouseX)
    input.cursorWorldY = this.screenToWorldY(this.mouseY)

    // One-shot consumption: hold-state is still sourced from keys/mouse booleans.
    this.transientButtons = 0

    return input
  }

  /**
   * Clean up event listeners
   */
  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('mousedown', this.onMouseDown)
    window.removeEventListener('mouseup', this.onMouseUp)
    window.removeEventListener('contextmenu', this.onContextMenu)
  }
}
