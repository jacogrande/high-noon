/**
 * Node Effect Hook System
 *
 * Provides event hooks for behavioral skill node effects (pierce, burst,
 * dodge-heal, etc.) that can't be expressed as pure stat mods.
 *
 * Two hook styles:
 * - **Transform hooks** return a modified result (onBulletHit)
 * - **Notify hooks** trigger side effects (onKill, onRollDodge, etc.)
 *
 * Hooks are registered when a skill node is taken and unregistered on reset.
 */

import type { GameWorld } from './world'

// ============================================================================
// Hook Result Types
// ============================================================================

/** Result from onBulletHit transform hook */
export interface BulletHitResult {
  /** Final damage to apply */
  damage: number
  /** Whether bullet should pierce (not be removed) */
  pierce: boolean
}

// ============================================================================
// Hook Handler Types
// ============================================================================

export type OnBulletHitHandler = (
  world: GameWorld,
  bulletEid: number,
  targetEid: number,
  damage: number,
) => BulletHitResult

export type OnKillHandler = (
  world: GameWorld,
  playerEid: number,
  victimEid: number,
) => void

export type OnRollDodgeHandler = (
  world: GameWorld,
  playerEid: number,
  dodgedBulletEid: number,
) => void

export type OnCylinderEmptyHandler = (
  world: GameWorld,
  playerEid: number,
) => void

export type OnHealthChangedHandler = (
  world: GameWorld,
  playerEid: number,
  oldHP: number,
  newHP: number,
) => void

export type OnShowdownActivateHandler = (
  world: GameWorld,
  playerEid: number,
) => void

// ============================================================================
// Hook Map (type-safe handler lookup)
// ============================================================================

export interface HookHandlerMap {
  onBulletHit: OnBulletHitHandler
  onKill: OnKillHandler
  onRollDodge: OnRollDodgeHandler
  onCylinderEmpty: OnCylinderEmptyHandler
  onHealthChanged: OnHealthChangedHandler
  onShowdownActivate: OnShowdownActivateHandler
}

export type HookId = keyof HookHandlerMap

// ============================================================================
// Hook Entry (handler + metadata)
// ============================================================================

interface HookEntry<H> {
  id: string
  handler: H
  priority: number
}

// ============================================================================
// HookRegistry
// ============================================================================

export class HookRegistry {
  private _onBulletHit: HookEntry<OnBulletHitHandler>[] = []
  private _onKill: HookEntry<OnKillHandler>[] = []
  private _onRollDodge: HookEntry<OnRollDodgeHandler>[] = []
  private _onCylinderEmpty: HookEntry<OnCylinderEmptyHandler>[] = []
  private _onHealthChanged: HookEntry<OnHealthChangedHandler>[] = []
  private _onShowdownActivate: HookEntry<OnShowdownActivateHandler>[] = []

  /** Register a handler for a hook event */
  register<K extends HookId>(
    hook: K,
    id: string,
    handler: HookHandlerMap[K],
    priority = 0,
  ): void {
    const entry = { id, handler, priority } as HookEntry<any>
    const list = this._getList(hook)
    list.push(entry)
    // Sort by priority (lower runs first)
    if (list.length > 1) {
      list.sort((a, b) => a.priority - b.priority)
    }
  }

  /** Unregister all handlers with a given id */
  unregister(id: string): void {
    this._onBulletHit = this._onBulletHit.filter(e => e.id !== id)
    this._onKill = this._onKill.filter(e => e.id !== id)
    this._onRollDodge = this._onRollDodge.filter(e => e.id !== id)
    this._onCylinderEmpty = this._onCylinderEmpty.filter(e => e.id !== id)
    this._onHealthChanged = this._onHealthChanged.filter(e => e.id !== id)
    this._onShowdownActivate = this._onShowdownActivate.filter(e => e.id !== id)
  }

  /** Remove all registered handlers */
  clear(): void {
    this._onBulletHit.length = 0
    this._onKill.length = 0
    this._onRollDodge.length = 0
    this._onCylinderEmpty.length = 0
    this._onHealthChanged.length = 0
    this._onShowdownActivate.length = 0
  }

  // --- Transform hooks (return modified result) ---

  /**
   * Fire onBulletHit — transform hook that chains through all handlers.
   * Returns default { damage, pierce: false } if no handlers registered.
   */
  fireBulletHit(
    world: GameWorld,
    bulletEid: number,
    targetEid: number,
    baseDamage: number,
  ): BulletHitResult {
    if (this._onBulletHit.length === 0) {
      return { damage: baseDamage, pierce: false }
    }
    let result: BulletHitResult = { damage: baseDamage, pierce: false }
    for (const entry of this._onBulletHit) {
      const hookResult = entry.handler(world, bulletEid, targetEid, result.damage)
      result = { damage: hookResult.damage, pierce: result.pierce || hookResult.pierce }
    }
    return result
  }

  // --- Notify hooks (side effects only) ---

  fireKill(world: GameWorld, playerEid: number, victimEid: number): void {
    for (const entry of this._onKill) {
      entry.handler(world, playerEid, victimEid)
    }
  }

  fireRollDodge(world: GameWorld, playerEid: number, dodgedBulletEid: number): void {
    for (const entry of this._onRollDodge) {
      entry.handler(world, playerEid, dodgedBulletEid)
    }
  }

  fireCylinderEmpty(world: GameWorld, playerEid: number): void {
    for (const entry of this._onCylinderEmpty) {
      entry.handler(world, playerEid)
    }
  }

  fireHealthChanged(world: GameWorld, playerEid: number, oldHP: number, newHP: number): void {
    for (const entry of this._onHealthChanged) {
      entry.handler(world, playerEid, oldHP, newHP)
    }
  }

  fireShowdownActivate(world: GameWorld, playerEid: number): void {
    for (const entry of this._onShowdownActivate) {
      entry.handler(world, playerEid)
    }
  }

  // --- Query helpers ---

  hasHandlers(hook: HookId): boolean {
    return this._getList(hook).length > 0
  }

  private _getList(hook: HookId): HookEntry<any>[] {
    switch (hook) {
      case 'onBulletHit': return this._onBulletHit
      case 'onKill': return this._onKill
      case 'onRollDodge': return this._onRollDodge
      case 'onCylinderEmpty': return this._onCylinderEmpty
      case 'onHealthChanged': return this._onHealthChanged
      case 'onShowdownActivate': return this._onShowdownActivate
    }
  }
}
