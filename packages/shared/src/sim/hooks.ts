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

export type OnRollEndHandler = (
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
  onRollEnd: OnRollEndHandler
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
  private _handlers: { [K in HookId]: HookEntry<HookHandlerMap[K]>[] } = {
    onBulletHit: [],
    onKill: [],
    onRollDodge: [],
    onCylinderEmpty: [],
    onHealthChanged: [],
    onShowdownActivate: [],
    onRollEnd: [],
  }

  /** Register a handler for a hook event */
  register<K extends HookId>(
    hook: K,
    id: string,
    handler: HookHandlerMap[K],
    priority = 0,
  ): void {
    const list = this._handlers[hook] as HookEntry<HookHandlerMap[K]>[]
    list.push({ id, handler, priority })
    if (list.length > 1) {
      list.sort((a, b) => a.priority - b.priority)
    }
  }

  /** Unregister all handlers with a given id */
  unregister(id: string): void {
    const h = this._handlers
    h.onBulletHit = h.onBulletHit.filter(e => e.id !== id)
    h.onKill = h.onKill.filter(e => e.id !== id)
    h.onRollDodge = h.onRollDodge.filter(e => e.id !== id)
    h.onCylinderEmpty = h.onCylinderEmpty.filter(e => e.id !== id)
    h.onHealthChanged = h.onHealthChanged.filter(e => e.id !== id)
    h.onShowdownActivate = h.onShowdownActivate.filter(e => e.id !== id)
    h.onRollEnd = h.onRollEnd.filter(e => e.id !== id)
  }

  /** Remove all registered handlers */
  clear(): void {
    for (const key of Object.keys(this._handlers) as HookId[]) {
      this._handlers[key].length = 0
    }
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
    const handlers = this._handlers.onBulletHit
    if (handlers.length === 0) {
      return { damage: baseDamage, pierce: false }
    }
    let result: BulletHitResult = { damage: baseDamage, pierce: false }
    for (const entry of handlers) {
      const hookResult = entry.handler(world, bulletEid, targetEid, result.damage)
      result = { damage: hookResult.damage, pierce: result.pierce || hookResult.pierce }
    }
    return result
  }

  // --- Notify hooks (side effects only) ---

  fireKill(world: GameWorld, playerEid: number, victimEid: number): void {
    for (const entry of this._handlers.onKill) {
      entry.handler(world, playerEid, victimEid)
    }
  }

  fireRollDodge(world: GameWorld, playerEid: number, dodgedBulletEid: number): void {
    for (const entry of this._handlers.onRollDodge) {
      entry.handler(world, playerEid, dodgedBulletEid)
    }
  }

  fireCylinderEmpty(world: GameWorld, playerEid: number): void {
    for (const entry of this._handlers.onCylinderEmpty) {
      entry.handler(world, playerEid)
    }
  }

  fireHealthChanged(world: GameWorld, playerEid: number, oldHP: number, newHP: number): void {
    for (const entry of this._handlers.onHealthChanged) {
      entry.handler(world, playerEid, oldHP, newHP)
    }
  }

  fireShowdownActivate(world: GameWorld, playerEid: number): void {
    for (const entry of this._handlers.onShowdownActivate) {
      entry.handler(world, playerEid)
    }
  }

  fireRollEnd(world: GameWorld, playerEid: number): void {
    for (const entry of this._handlers.onRollEnd) {
      entry.handler(world, playerEid)
    }
  }

  // --- Query helpers ---

  hasHandlers(hook: HookId): boolean {
    return this._handlers[hook].length > 0
  }
}
